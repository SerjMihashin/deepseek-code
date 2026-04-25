# DeepSeek Code — Техническое задание

## Цель
Создать полноценного AI CLI-агента для разработки, аналогичного Qwen Code, Claude Code, OpenAI Codex CLI. Главное отличие от существующих обёрток над API — агент должен иметь **доступ к инструментам** (файловая система, терминал, поиск), а не просто генерировать текст.

## Ключевое отличие от текущей реализации
**Сейчас:** DeepSeek Code — обёртка, которая отправляет сообщение в DeepSeek API и выводит ответ. AI не видит проект, не может читать/писать файлы, запускать команды.

**Цель:** DeepSeek Code должен работать как Qwen Code — AI получает список инструментов, может их вызывать, видит результаты, итеративно решает задачу.

---

## 1. Система инструментов (Tool Calling)

### 1.1. Механизм
- При каждом запросе к DeepSeek API передавать список доступных инструментов (function calling)
- DeepSeek API возвращает либо текст, либо вызов инструмента с аргументами
- Клиент выполняет инструмент, возвращает результат в следующий запрос
- Цикл продолжается, пока AI не даст финальный ответ

### 1.2. Инструменты (аналогично Qwen Code)

| Инструмент | Описание | Требует подтверждения |
|-----------|----------|----------------------|
| `read_file` | Чтение файлов | Нет |
| `write_file` | Создание/перезапись файлов | Да |
| `edit` | Поиск и замена текста в файле | Да |
| `run_shell_command` | Выполнение команд в терминале | Да |
| `glob` | Поиск файлов по паттерну | Нет |
| `grep_search` | Поиск текста в файлах | Нет |
| `list_directory` | Список файлов в директории | Нет |
| `web_fetch` | Загрузка содержимого URL | Нет |
| `chrome` | Управление браузером Chrome (открытие, клики, fill, eval, скриншоты, консоль, network, и др.) | Да |

### 1.3. Режимы разрешений (уже есть)
- `plan` — только read-инструменты, AI предлагает план
- `default` — write/edit/bash требуют подтверждения
- `auto-edit` — write/edit на авто, bash с подтверждением
- `yolo` — все инструменты без подтверждения

---

## 2. Архитектура взаимодействия

```
User input → DeepSeek API (с инструментами)
                  ↓
          AI решает: ответить или вызвать инструмент?
                  ↓
           Вызов инструмента → выполнение → результат
                  ↓
          Результат → DeepSeek API (следующий запрос)
                  ↓
          Цикл пока AI не ответит текстом
                  ↓
          Вывод ответа пользователю
```

### 2.1. Поток сообщений
```
System: Ты AI-агент. У тебя есть инструменты: [read_file, write_file, ...]
User: прочитай файл src/index.ts и найди баг
AI: (вызов read_file)
System: Результат: содержимое файла...
AI: (вызов grep_search)
System: Результат: найдено в строке 42...
AI: (вызов edit)
System: Результат: изменения применены
AI: Готово! Я нашёл баг в строке 42 и исправил его.
```

---

## 3. Требования к реализации

### 3.1. API слой (`src/api/`)
- Поддержка streaming (уже есть)
- Поддержка function calling (tool use) — **новое**
- Обработка ответов с tool_calls
- Поддержка DeepSeek API (модель deepseek-chat, deepseek-reasoner)

### 3.2. Управление циклом (`src/core/`)
- `AgentLoop` — класс, управляющий циклом "запрос → инструмент → результат → запрос"
- Лимит на количество итераций (по умолчанию 25)
- Обработка ошибок инструментов
- Сбор контекста (история вызовов + результаты)

### 3.3. Инструменты (`src/tools/`)
- Каждый инструмент реализует интерфейс `Tool`
- У каждого инструмента есть: имя, описание, JSON Schema параметров, функция выполнения
- Реестр инструментов (уже есть в `registry.ts`)

### 3.4. UI (`src/ui/`)
- Отображение хода выполнения: "🔧 Использую read_file...", "✅ Готово"
- Возможность подтверждения/отмены вызова инструмента (зависит от режима)
- Индикация процесса (спиннер/прогресс)

### 3.5. Безопасность
- Подтверждение опасных операций (write, edit, bash) в режимах plan/default
- Approval dialog в TUI — модальное окно с y/N при каждом опасном вызове
- Лимит на размер записываемых файлов (1MB)
- Санитайзинг shell-команд: блокировка `rm -rf /`, `mkfs`, `dd if=/dev/zero`, fork bomb и др.
- Таймаут на выполнение команд
- Логирование всех вызовов инструментов

### 3.6. Контекст проекта (Context Awareness)
- System prompt содержит: CWD, имя проекта, версию, описание (из package.json)
- Top-level структура проекта (директории и файлы первого уровня)
- Информация об ОС (Windows/Linux/Mac)
- Инструкция: ALWAYS использовать абсолютные пути, не угадывать пути
- Использовать `list_directory` или `glob` для исследования проекта

### 3.7. UI/UX
- Tool messages (role: 'tool') не показываются в ChatView — только в ToolCallView
- Reasoning модели скрыт по умолчанию, показывается по нажатию `r`
- Approval dialog: модальное окно с именем инструмента, аргументами и y/N
- Compact mode для ToolCallView: иконка + имя + статус, без сырого вывода

---

## 4. Этапы реализации

### ✅ Этап 1: Базовый tool calling (Выполнен)
- [x] Добавить поддержку function calling в `DeepSeekAPI` (класс `src/api/index.ts`)
- [x] Создать `AgentLoop` в `src/core/agent-loop.ts`
- [x] Интегрировать существующие инструменты (Read, Write, Edit, Bash, Glob, Grep)
- [x] Обработка ответов с tool_calls от DeepSeek API

### ✅ Этап 2: UI для инструментов (Выполнен)
- [x] Отображение вызовов инструментов в TUI
- [x] Подтверждение/отмена через approval dialog (y/N)
- [x] Фильтрация tool messages из ChatView
- [x] Toggle reasoning (клавиша `r`)
- [x] Индикация прогресса

### ✅ Этап 3: Безопасность и контекст (Выполнен)
- [x] Approval dialog для default mode
- [x] Лимит write_file (1MB)
- [x] Санитайзинг bash (блокировка опасных команд)
- [x] Контекст проекта в system prompt (CWD, package.json, структура, ОС)
- [x] Удаление мёртвых зависимостей (zod, deepmerge, eventemitter3, react-reconciler)
- [x] Snake_case tool names (read_file, write_file, edit, run_shell_command, glob, grep_search, chrome)

### 🔄 Этап 4: Продвинутые возможности
- [ ] Plan mode — AI сначала составляет план (только read-инструменты), затем выполняет
- [ ] Обработка ошибок и повторные попытки (retry logic)
- [ ] Контекстное сжатие (чтобы не превысить лимит токенов)
- [ ] SEARCH/REPLACE блоки для edit tool + diff-вывод
- [ ] Тесты для core-компонентов

### Этап 5: Полировка
- [ ] SubAgent с доступом к инструментам
- [ ] Chrome headless mode CLI-флаг
- [ ] Оптимизация StatusBar (без polling)
- [ ] Pre-commit hooks

---

## 5. Технические детали

### 5.1. DeepSeek API Function Calling
DeepSeek API поддерживает function calling (совместимо с OpenAI API).
Формат запроса:
```json
{
  "model": "deepseek-chat",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read file contents",
        "parameters": {
          "type": "object",
          "properties": {
            "file_path": { "type": "string" }
          },
          "required": ["file_path"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

### 5.2. Формат ответа с tool_call
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_xxx",
        "type": "function",
        "function": {
          "name": "read_file",
          "arguments": "{\"file_path\": \"src/index.ts\"}"
        }
      }]
    }
  }]
}
```

### 5.3. Поток сообщений в цикле
```
messages = [system_prompt, ...history, user_message]
while iterations < MAX_ITERATIONS:
    response = api.chat(messages, tools)
    if response.tool_calls:
        for tool_call in response.tool_calls:
            result = execute_tool(tool_call)
            messages.append(assistant_message_with_tool_call)
            messages.append(tool_result_message)
    else:
        return response.content
```

---

## 6. Зависимости
- `@deepseek-ai/sdk` или OpenAI SDK (уже есть)
- Никаких новых зависимостей — всё через существующий API

---

## 7. Критерии готовности
- AI может прочитать файл, найти баг, исправить его и запустить тесты — всё в одном диалоге
- Пользователь видит какие инструменты вызываются и их результаты
- Режимы разрешений работают (подтверждение для опасных операций)
- Streaming ответов работает совместно с tool calling
- Headless режим для CI/CD
