# Итерации — DeepSeek Code

> Хронология разработки и план дальнейших итераций.
> Каждая итерация — законченный блок изменений с коммитом.

---

## ✅ Iteration 1–10 (завершены)

См. [CHANGELOG.md](./CHANGELOG.md) — полная история до v0.1.0.

Ключевые вехи:
- Function Calling в DeepSeek API
- 4 инструмента (read/write/edit/bash)
- Ink UI + ChatView
- i18n (3 языка)
- Setup Wizard
- AgentLoop вынесен из App
- Chrome integration (16 действий)
- Approval modes (plan/default/auto-edit/yolo)
- MCP, LSP, Hooks, Extensions
- Matrix Rain theme
- Retry + exponential backoff
- `/help` команда

---

## 🔴 Iteration 11 — Текущая (docs + roadmap)

**Цель:** Зафиксировать текущее состояние, выявить проблемы, составить план.

**Статус:** ✅ Завершено

**Что сделано:**
- Полный аудит кода (10 проблем)
- `audit.md` — обновлён с оценками и списком проблем
- `ITERATIONS.md` — план итераций 11–16
- Определены приоритеты: UI дребезг → память → compress → hooks → graceful exit

**Коммит:** `git add -A && git commit -m "docs: audit and roadmap reset for iterations 11-16"`

---

## 🎯 Iteration 12 — UI Core Fixes

**Цель:** Чистый, структурированный, читаемый интерфейс. Нет шейкинга. Мигающий курсор. Логи инструментов ограничены.

**Статус:** ⏳ В плане

**Файлы:**
- `src/ui/app.tsx` — переупорядочить JSX (approval выше ResultsPanel)
- `src/ui/results-panel.tsx` — ограничение высоты (10 строк), maxItems 3
- `src/ui/tool-call-view.tsx` — результат инлайн (60 символов), ошибки 100 символов
- `src/ui/input-bar.tsx` — мигающий курсор (state + useEffect 530ms)
- `src/ui/chat-view.tsx` — кастомный React.memo компаратор (anti-shake)

**Задачи:**
1. `ResultsPanel`: `height={10} overflowY='hidden'`, `maxItems={3}`
2. `ToolCallView`: результат → инлайн ` → текст...`, без отдельной строки
3. `InputBar`: `cursorVisible` state, интервал 530ms, `▋` после displayText
4. `ChatView`: `React.memo(fn, customComparator)` — только при смене длины или последнего сообщения
5. `app.tsx`: переместить `{pendingApproval && ...}` выше `<ResultsPanel />`

**Проверка:**
- Набрать 40+ символов — нет дёрганья экрана
- Вопрос с 6+ вызовами инструментов — панель не превышает 10 строк
- В простое — курсор мигает; во время обработки — курсор скрыт
- Результаты инструментов — одна строка

---

## 🎨 Iteration 13 — Visual Polish

**Цель:** Matrix тема полностью зелёная. Badges тема-зависимые. Micro-анимации для tool calls.

**Статус:** ⏳ В плане

**Файлы:**
- `src/core/themes.ts` — Matrix warning/error цвета
- `src/ui/status-bar.tsx` — modeColors внутрь компонента, через theme colors
- `src/ui/tool-call-view.tsx` — statusColors через themeManager
- `src/ui/reasoning-view.tsx` — убрать хардкод 'yellow'/'green'
- `src/ui/fade-in.tsx` — новый файл (извлечь из app.tsx)

**Задачи:**
1. `themes.ts`: Matrix `warning: '#88ff44'` (было '#ffff00'), `error: '#ff6666'`
2. `status-bar.tsx`: `modeColors` → `{ plan: colors.warning, default: colors.info, ... }`
3. `tool-call-view.tsx`: `statusColors` → `{ pending: colors.warning, running: colors.info, ... }`
4. `reasoning-view.tsx`: `'yellow'` → `colors.warning`, `'green'` → `colors.success`
5. Извлечь `FadeIn` из `app.tsx:31-39` → `src/ui/fade-in.tsx`
6. Обернуть каждый tool call в `<FadeIn>` (150ms задержка появления)

**Проверка:**
- `/theme matrix` → всё зелёных оттенков, нет жёлтых badges, нет жёлтого спиннера
- `/theme default` → [PLAN] badge по-прежнему жёлтый (themes.ts default warning)
- Новые tool calls плавно появляются, а не мгновенно

---

## 📊 Iteration 14 — Context % Fix + Scroll

**Цель:** Context % показывает актуальный размер окна. ResultsPanel прокручивается.

**Статус:** ⏳ В плане

**Файлы:**
- `src/core/metrics.ts` — `_lastInputTokens`, `getCurrentWindowPercent()`
- `src/ui/app.tsx` — переключить на новый метод, добавить `toolCallScrollOffset`
- `src/ui/status-bar.tsx` — добавить префикс `ctx:` к отображению
- `src/ui/results-panel.tsx` — добавить `scrollOffset` prop, slice toolCalls

**Задачи:**
1. `metrics.ts`: добавить `_lastInputTokens`, обновить `recordTokens()`, добавить `getCurrentWindowPercent()`
2. `app.tsx`: `getContextUsagePercent()` → `getCurrentWindowPercent()`
3. `status-bar.tsx`: `{contextPercent}%` → `ctx:{contextPercent}%`
4. `results-panel.tsx`: `scrollOffset` prop, visible slice (3 элемента)
5. `app.tsx`: `toolCallScrollOffset` state, PageUp/PageDown при `isProcessing`

**Проверка:**
- Запрос на 10k токенов → `ctx:8%`, а не 100%
- Во время длинного запуска с 8+ вызовами — PageUp показывает старые
- После завершения — PageUp/PageDown скроллит чат

---

## 🖼️ Iteration 15 — Image Paste (Alt+V)

**Цель:** Alt+V читает изображение из буфера обмена и прикрепляет к сообщению.

**Статус:** ⏳ В плане

**Файлы:**
- `src/utils/clipboard.ts` — новый файл, платформо-специфичное чтение
- `src/ui/input-bar.tsx` — обработчик Alt+V, `pendingImageLabel` state
- `src/ui/app.tsx` — `pendingImage` state, проверка модели
- `src/api/index.ts` — расширить `ChatMessage.content` до `string | ContentBlock[]`

**Задачи:**
1. `clipboard.ts`: Windows (PowerShell), macOS (osascript), Linux (xclip) → `Buffer | null`
2. `input-bar.tsx`: `key.meta && _input === 'v'` → читать буфер, показать `[image: NKB]`
3. `app.tsx`: если модель без vision → показать предупреждение; иначе сохранить в `pendingImage`
4. При submit: добавить `image_url` content block к сообщению
5. `api/index.ts`: `ContentBlock` тип, `ChatMessage.content: string | ContentBlock[]`

**Проверка:**
- Windows + изображение в буфере: Alt+V → `[image: 42KB]`, при отправке включает данные
- Модель без vision: чёткое предупреждение
- Буфер пустой: 2с подсказка `(no image in clipboard)`
