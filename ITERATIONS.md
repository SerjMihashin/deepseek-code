# DeepSeek Code — План итераций

## ✅ Итерация 1: Function Calling в API
**Цель:** DeepSeek API может принимать и возвращать tool_calls. **Выполнено.**

- [x] Добавить поддержку `tools` параметра в `DeepSeekAPI.chat()` / `streamChat()`
- [x] Обработка ответа с `tool_calls` в streaming режиме
- [x] Типизация: `ChatCompletionTool`, `ToolCall`, `ToolResult`
- [x] Конвертация `ToolDefinition` → OpenAI `ChatCompletionTool` формат

**Файлы:** `src/api/index.ts`, `src/tools/types.ts`

---

## ✅ Итерация 2: AgentLoop
**Цель:** Цикл "запрос → вызов инструмента → результат → запрос" работает. **Выполнено.**

- [x] Создать `src/core/agent-loop.ts` — класс `AgentLoop`
- [x] Логика: отправить → получить ответ → если tool_call → выполнить → добавить результат → повторить
- [x] Лимит итераций (25), таймаут
- [x] Формирование system prompt с описанием инструментов
- [x] Интеграция с существующими инструментами из `src/tools/`
- [x] Интеграция в TUI (`src/ui/app.tsx`)
- [x] Интеграция в Headless/CI режим (`src/cli/headless.ts`)

**Файлы:** `src/core/agent-loop.ts`, `src/ui/app.tsx`, `src/cli/headless.ts`

---

## ✅ Итерация 3: UI для вызовов инструментов
**Цель:** Пользователь видит что делает AI и может подтверждать/отменять. **Выполнено (базово).**

- [x] Отображение в TUI: "🔧 read_file('src/index.ts')... ✅ Готово"
- [x] Индикация прогресса (статус-бар: "🔧 read_file...", "✅ read_file done")
- [x] Интеграция AgentLoop в `src/ui/app.tsx`
- [x] Chrome-специфичное отображение (иконки действий: 🌐 Open, 🖱 Click, 📸 Screenshot и т.д.)
- [x] Индикатор Chrome-сессии в статус-баре
- [ ] Подтверждение опасных операций (модалка/инлайн) — **TODO: полноценный approval dialog**

**Файлы:** `src/ui/app.tsx`, `src/ui/tool-call-view.tsx`, `src/ui/status-bar.tsx`

---

## ✅ Итерация 4: Chrome — встроенный браузерный инструмент
**Цель:** Chrome CLI Tools интегрирован как нативный инструмент DeepSeek Code. **Выполнено.**

- [x] Копирование chrome-cli-tools как подпроект
- [x] Puppeteer как зависимость
- [x] Создан `src/tools/chrome-manager.ts` — singleton-менеджер сессии Chrome
- [x] Создан `src/tools/chrome.ts` — нативный инструмент Chrome со всеми 14 командами (open, click, fill, eval, text, html, console, network, shot, nav, wait, scroll, locator, cookies, storage, quiz)
- [x] Добавлен в `getDefaultTools()` с `approval: 'always'`
- [x] Обновлён ToolCallView для Chrome-специфичного отображения
- [x] Статус-бар: индикатор подключения Chrome 🌐
- [x] `tsc` — 0 ошибок, `eslint` — 0 новых ошибок

**Файлы:** `src/tools/chrome.ts`, `src/tools/chrome-manager.ts`, `src/tools/registry.ts`, `chrome-cli-tools/`

---

## 🔄 Итерация 5: Plan Mode
**Цель:** AI сначала составляет план (только read-инструменты), затем выполняет.

- [ ] Режим `plan` — AI получает только read-инструменты на первой фазе
- [ ] После плана — подтверждение пользователя
- [ ] Вторая фаза — все инструменты

**Файлы:** `src/core/agent-loop.ts`, `src/tools/registry.ts`

---

## 🔄 Итерация 6: Полировка и CI/CD
**Цель:** Стабильная работа, headless режим, обработка ошибок.

- [x] Headless режим с tool calling
- [ ] Контекстное сжатие (чтобы не превысить лимит токенов)
- [ ] Логирование всех вызовов
- [ ] Обработка ошибок: таймауты, неверные аргументы, отказ инструмента
- [ ] Оптимизация system prompt

**Файлы:** `src/cli/headless.ts`, `src/core/agent-loop.ts`
