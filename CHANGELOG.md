# Changelog — DeepSeek Code

> Полный отчёт о реализации проекта с начала разработки.

---

## Итерация 1: Function Calling в API ✅

**Цель:** DeepSeek API может принимать и возвращать tool_calls.

### Что сделано:
- Добавлена поддержка `tools` параметра в `DeepSeekAPI.chat()` / `streamChat()`
- Обработка ответа с `tool_calls` в streaming режиме (парсинг из `chunk.delta.tool_calls`)
- Типизация: `ChatCompletionTool`, `ToolCall`, `ToolResult`, `ChatMessage` (role `'tool'`, `tool_call_id`, `tool_calls`)
- Конвертация внутренних `ToolDefinition[]` → OpenAI `ChatCompletionTool` формат (функция `toOpenAITools()`)
- `chat()` теперь возвращает `{ content, toolCalls? }` вместо строки — все старые вызовы обновлены
- `buildMessages()` — нормализация сообщений для API
- `safeParseJSON()` — безопасный парсинг JSON из стрима

### Файлы:
- `src/api/index.ts` — расширение API клиента
- `src/tools/types.ts` — новые типы и `toOpenAITools()`

---

## Итерация 2: AgentLoop ✅

**Цель:** Цикл "запрос → вызов инструмента → результат → запрос" работает.

### Что сделано:
- Создан класс `AgentLoop` (наследует `EventEmitter`) — ядро агентского цикла
- Логика: отправить запрос → получить ответ → если `tool_call` → выполнить → добавить результат → повторить
- Лимит итераций: 25 (предотвращает бесконечные циклы)
- Таймаут выполнения инструмента: 30 секунд
- Truncation вывода инструментов: 50KB (чтобы не превысить контекст)
- Формирование system prompt с описанием инструментов
- Система approval: `onApprovalRequest` колбэк для каждого инструмента
- Интеграция с существующими инструментами из `src/tools/`
- Интеграция в TUI (`src/ui/app.tsx`) — AgentLoop подключён к `handleSubmit`
- Интеграция в Headless/CI режим (`src/cli/headless.ts`) — полная поддержка tool calling с возвратом статистики

### Файлы:
- `src/core/agent-loop.ts` — **создан** (ядро, ~250 строк)
- `src/ui/app.tsx` — интеграция AgentLoop
- `src/cli/headless.ts` — headless режим с AgentLoop
- `src/core/review.ts` — исправлен вызов `api.chat()` под новый возврат
- `src/core/subagent.ts` — исправлен вызов `api.chat()` под новый возврат

---

## Итерация 3: UI для вызовов инструментов ✅

**Цель:** Пользователь видит что делает AI и может подтверждать/отменять.

### Что сделано:
- Создан компонент `ToolCallView` — отображение цепочки tool calls с иконками статуса (⏳ → 🔄 → ✅ / ❌ / ⛔)
- Индикация прогресса в статус-баре
- Chrome-специфичное отображение: иконки для каждого действия (🌐 Open, 🖱 Click, ✏️ Fill, 📸 Screenshot и т.д.)
- Индикатор Chrome-сессии в статус-баре (🌐 Chrome)
- Approval-диалог: перед выполнением опасных операций показывается запрос подтверждения

### Файлы:
- `src/ui/tool-call-view.tsx` — **создан**
- `src/ui/status-bar.tsx` — обновлён (Chrome индикатор)
- `src/ui/app.tsx` — интеграция ToolCallView

---

## Итерация 4: Chrome — встроенный браузерный инструмент ✅ (NEW)

**Цель:** Chrome CLI Tools интегрирован как нативный инструмент DeepSeek Code.

### Что сделано:
- Копирование `chrome-cli-tools` как подпроект в `chrome-cli-tools/`
- Добавлен `puppeteer` в зависимости `package.json`
- Создан `ChromeManager` — singleton-менеджер сессии Chrome:
  - Автозапуск Chrome при первом вызове
  - Управление вкладками (новая / переиспользовать через `sameTab`)
  - Graceful shutdown при завершении
- Создан нативный инструмент `Chrome` с **16 действиями**:

| Действие | Описание | Ключевые параметры |
|----------|----------|-------------------|
| `open` | Открыть URL | `url` |
| `click` | Клик по элементу | `url`, `selector` |
| `fill` | Заполнить поле | `url`, `selector`, `text` |
| `eval` | Выполнить JavaScript | `url`, `code` |
| `text` | Получить текст | `url`, `selector` |
| `html` | Получить HTML | `url` |
| `console` | Прочитать консоль | `url`, `error`, `all` |
| `network` | Перехватить запросы | `url`, `api` |
| `shot` | Скриншот | `url`, `output`, `full` |
| `nav` | Навигация | `back`, `forward`, `refresh` |
| `wait` | Ожидание элемента | `selector`, `timeout` |
| `scroll` | Прокрутка | `top`, `bottom`, `selector` |
| `locator` | Поиск элементов | `selector`, `text`, `attr`, `count` |
| `cookies` | Управление cookies | `name`, `clear` |
| `storage` | localStorage/sessionStorage | `local`, `session` |
| `quiz` | Авто-прохождение тестов | `url`, `quizStrategy` |

- Approval: `'always'` (требует подтверждения пользователя)
- Детальное описание для AI-модели с примерами использования
- Интеграция в `registry.ts` → `getDefaultTools()`

### Файлы:
- `src/tools/chrome.ts` — **создан** (~600 строк, 16 действий)
- `src/tools/chrome-manager.ts` — **создан**
- `src/tools/registry.ts` — Chrome добавлен в список инструментов
- `chrome-cli-tools/` — подпроект (копия оригинального репозитория)

---

## Сборка и проверка качества

| Проверка | Результат |
|----------|-----------|
| `npx tsc` (TypeScript) | **0 ошибок** |
| `npx eslint src/` | **0 новых ошибок** (29 предсуществующих не связаны с изменениями) |
| `npm install puppeteer` | Успешно |

---

## Обновлённая документация

- `README.md` — добавлен Chrome в список инструментов
- `README.ru.md` — добавлен Chrome в список инструментов
- `SPEC.md` — добавлен Chrome в таблицу инструментов
- `ITERATIONS.md` — добавлена Итерация 4 (Chrome), перенумерованы последующие
- `CHANGELOG.md` — **создан** (этот файл)

---

## Архитектура проекта (текущая)

```
src/
  cli/          — Точка входа, Commander CLI, headless-режим
  core/         — Память, сессии, чекпоинты, MCP, subagents, skills,
                  hooks, LSP, темы, i18n, расширения, ревью, sandbox,
                  git-интеграция, планировщик, AgentLoop
  config/       — Загрузка настроек, значения по умолчанию
  api/          — DeepSeek API клиент (с поддержкой tool calling)
  tools/        — Инструменты:
                  ├── types.ts       — Типы и конвертация
                  ├── registry.ts    — Реестр инструментов
                  ├── read.ts        — Чтение файлов
                  ├── write.ts       — Запись файлов
                  ├── edit.ts        — Редактирование
                  ├── bash.ts        — Shell-команды
                  ├── glob.ts        — Поиск файлов
                  ├── grep.ts        — Поиск текста
                  ├── chrome.ts      — Браузер Chrome (NEW)
                  └── chrome-manager.ts — Менеджер сессии Chrome (NEW)
  ui/           — Ink/React компоненты:
                  ├── app.tsx           — Главное приложение
                  ├── tool-call-view.tsx — Отображение вызовов инструментов
                  └── status-bar.tsx    — Статус-бар (режим, Chrome)
  utils/        — Утилиты (логгер, .deepseekignore)
```

## Что дальше (следующие итерации)

### Итерация 5: Plan Mode
- Режим `plan` — AI получает только read-инструменты на первой фазе
- После плана — подтверждение пользователя
- Вторая фаза — все инструменты

### Итерация 6: Полировка и CI/CD
- Контекстное сжатие (чтобы не превысить лимит токенов)
- Логирование всех вызовов
- Обработка ошибок: таймауты, неверные аргументы, отказ инструмента
- Оптимизация system prompt
