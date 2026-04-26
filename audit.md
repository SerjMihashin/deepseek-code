# Audit — DeepSeek Code v0.2.0

> Аудит проекта. Обновлён: 2026-04-26.

---

## 📊 Оценка

| Аспект | Оценка | Комментарий |
|--------|--------|-------------|
| Архитектура | ⭐⭐⭐⭐☆ | Чистое разделение, AgentLoop вынесен из App |
| Инструменты | ⭐⭐⭐⭐⭐ | 7 инструментов, Chrome с 16 действиями, approval modes |
| UI/UX | ⭐⭐⭐⭐☆ | Красивый, но дребезг при вводе (Iteration 12) |
| Расширяемость | ⭐⭐⭐⭐☆ | MCP, Hooks, Extensions — есть, Hooks не интегрированы |
| Надёжность | ⭐⭐⭐☆☆ | +retry ✅, но fallback при пустых ответах остался |
| Документация | ⭐⭐⭐⭐⭐ | README, README.ru, SPEC, AGENTS, CONTRIBUTING |
| Тесты | ⭐☆☆☆☆ | Один тестовый файл (types.test.ts) |

---

## ✅ Что отлично

1. **Архитектура** — разделение на api/cli/config/core/tools/ui, AgentLoop вынесен
2. **Система инструментов** — гибкая, с ApprovalRequirement, Open AI-конвертация, 4 режима (plan/default/auto-edit/yolo)
3. **UI на Ink/React** — ASCII-логотип, FadeIn, wizards, Reasoning View, Tool Call View, Approval диалоги
4. **i18n (3 языка)** и **Themes (6 тем)** — singletons с кастомной загрузкой
5. **DeepSeek streaming + reasoning** — поддержка reasoning_content через streaming
6. **Chrome с 16 действиями** — Browser tools: shot, eval, console, network, cookies, storage, quiz
7. **Слэш-команды** — /remember, /checkpoint, /sandbox, /review, /git, /loop, /mcp, /skills, /agents, /help
8. **Session Management** — saveSession, writeExecutionBundle, writeSessionHandoff, checkpoints
9. **Retry с exponential backoff + таймаут стрима 60s**
10. **Matrix Rain тема** — шедевр для вайба

---

## ⚠️ Проблемы (актуальные, v0.2.0)

| # | Проблема | Где | Серьёзность | Статус |
|---|----------|-----|-------------|--------|
| 1 | **Layout/читаемость** — текст идёт наверх, логи занимают экран, шейкинг | `app.tsx`, `results-panel.tsx`, `chat-view.tsx` | 🔴 Critical | **Iteration 12** |
| 2 | **Нет мигающего курсора** — даже в терминале есть | `input-bar.tsx` | 🔴 High | **Iteration 12** |
| 3 | **Лог инструментов занимает экран** — нет ограничения высоты, результаты на 2 строки | `results-panel.tsx`, `tool-call-view.tsx` | 🔴 High | **Iteration 12** |
| 4 | **Context % — накопительный, не текущий** — показывает сумму токенов за сессию / 128k, а не размер текущего окна | `metrics.ts`, `app.tsx` | 🟡 Medium | **Iteration 14** |
| 5 | **ResultsPanel без скролла** — при 8+ вызовах нет возможности прокрутить | `results-panel.tsx` | 🟡 Medium | **Iteration 14** |
| 6 | **Вставка картинок (Alt+V) не реализована** | `input-bar.tsx`, `app.tsx` | 🟡 Medium | **Iteration 15** |
| 7 | **Matrix тема — жёлтый/красный ломают эстетику** — modeColors и warning/error не тема-зависимые | `themes.ts`, `status-bar.tsx` | 🟡 Medium | **Iteration 13** |
| 8 | **Sandbox падает на Windows** — пути C:\ не монтируются | `sandbox.ts:67` | 🔴 High | backlog |
| 9 | **Headless plan mode** — отклоняет все инструменты | `headless.ts:37` | 🟡 Medium | backlog |
| 10 | **LSP Manager: не используется** | `lsp.ts` | 🟢 Low | backlog |

---

## 🎯 Текущий план итераций (12–15)

### Iteration 12 — UI Core Fixes
- Ограничить высоту ResultsPanel (max 10 строк)
- Tool calls — результат инлайн, одна строка
- Мигающий курсор в InputBar
- React.memo с кастомным компаратором для ChatView

### Iteration 13 — Visual Polish
- Matrix тема: warning → lime-green, badges → тема-зависимые
- Извлечь FadeIn в shared компонент
- Fade-in для новых tool calls

### Iteration 14 — Context % Fix + Scroll
- Показывать токены ПОСЛЕДНЕГО запроса / 128k (не накопительные)
- Добавить скролл ResultsPanel (PageUp/PageDown)

### Iteration 15 — Image Paste (Alt+V)
- Читать изображение из буфера обмена (Windows/macOS/Linux)
- Передавать в API как multimodal content
- Предупреждение если модель не поддерживает vision

---

## 🗑️ Что можно убрать/упростить

1. **GitIntegration** — делегировать bash тулу
2. **Sandbox** — заменить на run_shell_command (Docker редко используется)
3. **HooksManager** — мало кто настраивает shell-хуки
4. **Scheduler** (`/loop`) — теряется при перезапуске
5. **ASCII-логотип** — вынести в `src/ui/logo.ts`
