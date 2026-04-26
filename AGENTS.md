# AGENTS.md — AI Agent Instructions

This file is read by AI coding agents (DeepSeek Code, Claude Code, Cursor, etc.)
to understand project context and conventions.

## Project Overview
DeepSeek Code CLI v0.2.0 — AI-powered terminal coding agent with tool-calling, browser automation, and TUI built on Ink/React.

## Important Conventions
1. All source code is in `src/` directory
2. TypeScript with strict mode, ES modules
3. Tests go in `src/` alongside source files (e.g., `src/tools/read.test.ts`)
4. Configuration files use JSON format
5. Memory system stores data in `~/.deepseek-code/`

## Build Commands
- `npm run build` — compile TypeScript to `dist/`
- `npm run watch` — watch mode (incremental rebuild)
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript type checking only (no emit)

## Run Commands
- `npm run dev` — run from source (tsx)
- `node dist/cli/index.js` — run compiled build
- `npx ts-node --esm src/cli/index.ts` — alternative dev run

## Test Commands
- `npx vitest run` — run all tests once
- `npx vitest` — watch mode
- Key test files: `src/core/agent-loop.test.ts`, `src/tools/tools.test.ts`, `src/tools/sanitize.test.ts`, `src/tools/approval.test.ts`

## Architecture Summary
The project is structured as a tool-using agent:
- `src/api/index.ts` — DeepSeek API client (streaming, tool calling, usage tracking)
- `src/core/agent-loop.ts` — main execution loop: prompt → stream → tool calls → loop
- `src/core/metrics.ts` — token counting, context window tracking
- `src/core/themes.ts` — 6 built-in themes (default/light/dracula/nord/solarized/matrix)
- `src/tools/` — 7 tools: read, write, edit, bash, glob, grep, chrome
- `src/ui/app.tsx` — Ink/React main app (1200+ lines), state management, slash commands
- `src/ui/chat-view.tsx` — message rendering with manual scroll (PageUp/PageDown)
- `src/ui/input-bar.tsx` — text input with command suggestions and history
- `src/ui/results-panel.tsx` — tool call log panel (below chat, above input)
- `src/ui/status-bar.tsx` — bottom bar: mode badge, spinner, ctx%, message count
- `src/config/` — settings loader, defaults (approval modes, model, API key)
- `src/cli/` — CLI entry point (Commander), headless mode

## Project Status
Active development (v0.2.0). UI overhaul in progress (iterations 12–15).
See DEEPSEEK.md for detailed architecture. See ITERATIONS.md for roadmap.
