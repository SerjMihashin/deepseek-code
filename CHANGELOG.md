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

---

## Итерация 5: Метрики и Execution Summary ✅

**Цель:** Пользователь видит статистику сессии: количество вызовов инструментов, затраченные токены, время выполнения.

### Что сделано:
- Создан `MetricsCollector` — централизованный сбор метрик выполнения
- Подсчёт количества вызовов инструментов (`toolCalls`)
- Подсчёт затраченных токенов (input / output / total) из ответа API
- Замер времени выполнения каждого инструмента (per-call duration)
- Общий таймер сессии (elapsed time)
- `getSummary()` — красивый вывод статистики в формате таблицы:

```
╭──────────────────────────────────────────────────╮
│            Execution Summary                     │
├──────────────────────────────────────────────────┤
│  Tool uses:       12                             │
│  Total:      156 320 tokens                      │
│  Input:      124 530 tokens                      │
│  Output:      31 790 tokens                      │
│  Time:       2m 15s                              │
╰──────────────────────────────────────────────────╯

Tool Call Breakdown:
  ✓ read_file              1 234ms
  ✓ grep_search              890ms
  ✓ run_shell_command      4 567ms
  ✓ edit                     321ms
```

- `getContextUsagePercent()` — расчёт процента использованного контекста (на основе 128k лимита)
- Интеграция в `AgentLoop`: метрики записываются при каждом tool call и при получении `usage` чанка из стрима
- API обновлён: `streamChat()` передаёт `stream_options: { include_usage: true }` и парсит финальный `usage` чанк
- Прогресс-бар в `StatusBar`: отображает процент использованного контекста рядом с `ProcessingDots`

### Файлы:
- `src/core/metrics.ts` — **создан** (класс MetricsCollector)
- `src/core/agent-loop.ts` — интеграция метрик в executeLoop
- `src/api/index.ts` — `stream_options: { include_usage: true }`, парсинг `chunk.usage`
- `src/ui/status-bar.tsx` — добавлен прогресс-бар контекста

---

---

## Итерация 6–10: Approval Modes, MCP, Hooks, LSP, Extensions, Memory ✅

> Итерации 6–10 завершены в рамках спринта v0.1.0 → v0.2.0. Ключевые вехи:

**Итерация 6 — Approval Modes:**
- 4 режима: `plan` / `default` / `auto-edit` / `yolo`
- Каждый инструмент декларирует `approvalRequirement` (always/auto-edit/never)
- `/plan` команда переключает режим
- UI: цветной badge в статус-баре

**Итерация 7 — MCP (Model Context Protocol):**
- `src/core/mcp.ts` — подключение MCP-серверов через stdio/SSE
- `/mcp` команда для управления серверами
- Динамическое добавление инструментов из MCP в реестр

**Итерация 8 — Hooks, Extensions, Skills:**
- `src/core/hooks.ts` — shell-хуки на события AgentLoop (AgentLoopStart, ToolCall, etc.)
- `src/core/extensions.ts` — загрузка JS-расширений из `~/.deepseek-code/extensions/`
- `src/core/skills.ts` — шаблонные команды из `~/.deepseek-code/skills/`
- `/hooks`, `/extensions`, `/skills` команды

**Итерация 9 — LSP, Sandbox, Git:**
- `src/core/lsp.ts` — Language Server Protocol клиент (диагностика, completion)
- `src/core/sandbox.ts` — выполнение кода в Docker (Linux/macOS; ограничено на Windows)
- `src/core/git.ts` — git-операции через API (`status`, `diff`, `log`, `commit`, `branch`)
- `/sandbox`, `/git` команды

**Итерация 10 — Sessions, Memory, Subagents, Matrix Rain:**
- `src/core/session.ts` — сохранение/восстановление сессий, handoff-файлы, бандлы
- `src/core/memory.ts` — семантическая память (substring-поиск, `/remember`, `/forget`)
- `src/core/subagent.ts` — запуск вложенных агентов (`/agents`)
- `src/ui/matrix-rain.tsx` — декоративный компонент с падающими символами
- Matrix тема в `src/core/themes.ts`
- Retry с exponential backoff + stream timeout 60s в `src/api/index.ts`

---

## Итерация 11: Аудит и Roadmap ✅

**Цель:** Зафиксировать текущее состояние, выявить проблемы, составить план.

### Что сделано:
- Полный аудит кода — 10 проблем задокументированы в `audit.md`
- `ITERATIONS.md` — план итераций 11–16 (впоследствии пересмотрен на 12–15)
- Определены приоритеты: UI layout → cursor → tool log → ctx% → image paste

### Файлы:
- `audit.md` — обновлён
- `ITERATIONS.md` — план итераций
