# AGENT_MEMORY.md — DeepSeek Code Session Starter

> Attach this file + ITERATIONS.md at the start of a new session and write "начинай".
> Keep this file short. Update only the "Current Active Iteration" block after each iteration.

---

## Project

DeepSeek Code — open-source AI coding agent for the terminal.
TypeScript + Ink/React TUI + DeepSeek API + tool calling.
Entry: `src/cli/interactive.ts`. Main loop: `src/core/agent-loop.ts`.
Tools: read_file, write_file, edit_file, bash, glob, grep, chrome.

## Current Status

**Release Candidate (v0.2.0-RC)** — 2026-04-27

The project has completed a stabilization pass covering:
- **Build & run**: package.json paths fixed, `npm run dev` and `node dist/cli/index.js` both work
- **Lifecycle**: all exit paths return to Ready (finally block), no zombie spinner
- **Tool activity**: grouped display (read_file × 15), max 5 visible groups, compact summary
- **Execution Summary**: compact format (no ASCII art, grouped tool breakdown)
- **InputBar**: multiline (Shift+Enter), wrap, max 5 rows, internal scroll
- **Scroll**: PageUp/PageDown by 10, ArrowUp/Down by 1 (during processing), End to follow
- **Jitter fix**: blinking cursor removed, final setState batched, FadeIn removed
- **Markdown**: safe table rendering (CJK/emoji-aware), code block fallback for narrow terminals
- **Documentation**: README/README.ru updated with Known Issues and correct commands

## What Is Already Done

- Iterations 1–11 complete (see CHANGELOG.md)
- Iterations 12–16 complete (Trust Layer documentation + stabilization pass)
- Stabilization pass 2026-04-27: Ctrl+C, lifecycle, scroll, tool calls, InputBar, jitter, markdown
- Known Issues documented in README.md and README.ru.md
- GitHub repo cleaned: chrome-cli-tools/ removed

## What to Do Next

See `PLAN.md` for full roadmap. Next iteration:
**Iteration 17 — Tests: migrate to vitest + npm test**

## What NOT to Do

- Do not modify `package.json`, `package-lock.json`, build configs (except npm test script)
- Do not add new dependencies without explicit user request
- Do not claim "done" without running verification commands
- Do not run auto-format on the whole project
- Do not attempt major architectural refactoring (app.tsx split, etc.) without user request
