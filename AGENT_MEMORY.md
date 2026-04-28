# AGENT_MEMORY.md — DeepSeek Code Session Starter

> Attach this file at the start of a new session and write "начинай".
> Keep this file short. Update the "Current Status" block after each session.

---

## Project

DeepSeek Code — open-source AI coding agent for the terminal.
TypeScript + Ink/React TUI + DeepSeek API + tool calling.
Entry: `src/cli/interactive.ts`. Main loop: `src/core/agent-loop.ts`.
Tools: read_file, write_file, edit, run_shell_command, glob, grep_search, chrome.

## Current Status

**Release Candidate (v0.2.0-RC)** — 2026-04-28

Production hardening pass in progress. All build checks passing:
- `npm run lint` ✓ (0 warnings)
- `npm run typecheck` ✓
- `npm run build` ✓
- `npm test` ✓ (60/60 tests)

## What Is Already Done

- Iterations 1–16 complete (see CHANGELOG.md)
- 7 tools fully working: read, write, edit, bash, glob, grep, chrome (16+ actions)
- Approval modes: plan / default / auto-edit / yolo
- Token tracking: MetricsCollector (input/output/total)
- Chrome: headed/headless, port management, sameTab reuse, domcontentloaded
- Slash commands: 29 commands registered
- i18n: en/ru/zh
- 6 themes + /theme interactive picker
- Hardening: networkidle2 → domcontentloaded, viewport fix, network/console capture fix

## Current Work (Iteration 17–21)

Production hardening — 5 iterations:
1. ✅ Hygiene: deleted audit.md, BROWSER_TEST_REPORT.md, NEXT_ITERATION.md; fixed ESLint
2. Token & Cost Display in status bar
3. De-hardcoding: /help auto-generated, command list from registry, remove fake /plan
4. i18n: hardcoded Russian strings → i18n keys
5. UI Bugs: Error Boundary, handleClear, ctx% fix, reasoning display

## What NOT to Do

- Do not modify `package.json`, `package-lock.json`, build configs without explicit request
- Do not add new dependencies without explicit user request
- Do not claim "done" without running verification commands
- Do not run auto-format on the whole project
