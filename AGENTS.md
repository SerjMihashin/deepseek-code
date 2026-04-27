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
Active development (v0.2.0). Trust Layer UX in progress (iterations 13–22).
See DEEPSEEK.md for detailed architecture. See ITERATIONS.md for roadmap.
Current active iteration: see AGENT_MEMORY.md and NEXT_ITERATION.md.

---

## Coding Agent Rules

These rules apply to any AI agent (Claude Code, DeepSeek Code, Cursor, etc.) working on this project.

### 1. Work in small iterations

Each session must target one iteration from ITERATIONS.md.
Iterations are sized for 10–20 minutes. Do not combine multiple iterations in one session.
If an iteration is too large, split it further and update ITERATIONS.md.

### 2. Respect the allowed file list

Each iteration in ITERATIONS.md has an explicit "Allowed files" list.
Do not modify files outside that list. If a fix requires touching an unlisted file, stop and report the conflict instead of modifying it unilaterally.

Never modify during any session:
- `package.json`, `package-lock.json`
- Build configs (`tsconfig.json`, `eslint.config.js`, `vitest.config.ts`)
- Lock files, vendor directories

### 3. Update session memory after each iteration

After completing an iteration:
1. Update `AGENT_MEMORY.md` → change "Current Active Iteration" to the next iteration
2. Replace `NEXT_ITERATION.md` with the next iteration spec from `ITERATIONS.md`
3. Commit both updates together with the code changes

### 4. Report in structured format

Every session report must contain:

```
### Changed files
- path/to/file.ts: what changed and why

### Verification
- npm run typecheck: PASSED / FAILED
- npm run build: PASSED / FAILED
- Manual check X: YES / NO

### Failures
- what did not work and why

### Next
Iteration N — Name
```

### 5. Do not hide failures

If a command fails, report the exact error. Do not retry silently or omit failures.
Do not mark an iteration complete if verification commands were not run.

### 6. Distinguish Verified from Assumption

Use explicit labels in reports:
- **Verified** — a command was run and passed
- **Assumption** — not verified, only believed to be correct

Example:
```
- npm run typecheck: PASSED (Verified)
- TUI Ready state after response: YES (Assumption — not testable headlessly)
```

### 7. Trust Layer principle

Every code change must move the product toward clearer user understanding of agent state.
Before submitting a change, ask: does the user now better understand what the agent is doing?

The seven questions the user must always be able to answer:
1. What is the agent doing right now?
2. Is it working or done?
3. How many actions have been completed?
4. Where can I see details?
5. Can I type the next message?
6. What verifications passed?
7. What failed?
