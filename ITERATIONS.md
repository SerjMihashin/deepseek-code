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

## 🎯 Iteration 12 — Убрать дребезг UI

**Цель:** Устранить дёрганье интерфейса при вводе текста и дублирование сообщений.

**Статус:** ⏳ В плане

**Файлы:**
- `src/ui/app.tsx` — дебаунс reasoning, фикс дублирования, useInput оптимизация
- `src/ui/chat-view.tsx` — React.memo
- `src/ui/input-bar.tsx` — убрать дублирование useInput

**Задачи:**
1. `ChatView` обернуть в `React.memo`
2. `setReasoning` задебаунсить на 100ms
3. В `app.tsx` найти 2 места где пушится сообщение → оставить одно
4. В `useInput` сделать ранний `return` для лишних клавиш

**Проверка:**
- Напечатать 20+ символов — UI не дёргается
- Скролл не сбрасывается при вводе
- Сообщения не дублируются
- Reasoning стримится плавно

---

## 🧠 Iteration 13 — Семантическая память

**Цель:** Добавить векторный поиск в `/memory` через embeddings.

**Статус:** ⏳ В плане

**Файлы:**
- `src/api/index.ts` — метод `embed()`
- `src/core/memory.ts` — хранение векторов, hybrid search

**Задачи:**
1. Добавить `embed(text)` в API слой (DeepSeek text-embedding-002)
2. В `memory.ts` хранить `{ text, description, embedding: number[], tags, path }`
3. `searchMemories` — гибрид: точное совпадение + cosine similarity
4. `/memory` — semantic matches показывать жирным / с оценкой релевантности

---

## 📦 Iteration 14 — Настоящий `/compress`

**Цель:** Реальное сжатие контекста через DeepSeek API.

**Статус:** ⏳ В плане

**Файлы:**
- `src/ui/app.tsx` — handleSlashCommand('/compress')

**Задачи:**
1. Взять первые 50% сообщений (исключая последние 3-4)
2. Отправить в `api.chat()` с промптом summarization
3. Заменить на `{ role: 'system', content: 'Сжатый контекст: ...' }`
4. Показать: "~12KB → ~2KB (83%)"

---

## 🔗 Iteration 15 — Hooks в AgentLoop

**Цель:** Интегрировать систему хуков в жизненный цикл выполнения инструментов.

**Статус:** ⏳ В плане

**Файлы:**
- `src/core/agent-loop.ts` — вызов hooks в executeTool

**Задачи:**
1. Импортировать `hooksManager`
2. Перед `executeTool()`: `hooksManager.execute('PreToolExecution', ...)`
3. После результата: `hooksManager.execute('PostToolExecution', ...)`
4. Ошибки хуков логировать, не блокировать

---

## 🚪 Iteration 16 — Graceful exit + Headless plan fix

**Цель:** Безопасный выход + корректный plan mode в headless.

**Статус:** ⏳ В плане

**Файлы:**
- `src/cli/headless.ts` — plan mode для read-тулов
- `src/ui/app.tsx` — Ctrl+C → сохранить сессию
- `src/ui/input-bar.tsx` — onExit с сохранением

**Задачи:**
1. headless.ts: `plan` mode → `true` для read, `false` для write/edit/bash
2. app.tsx: `Ctrl+C` в простое → "Save session? (y/n)"
3. input-bar.tsx: `Ctrl+C` → onExit() с saveSession
