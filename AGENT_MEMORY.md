# AGENT_MEMORY.md — DeepSeek Code Session Starter

> Attach this file + ITERATIONS.md at the start of a new session and write "начинай".
> Keep this file short. Update only the "Current Active Iteration" block after each iteration.

---

## Project

DeepSeek Code — open-source AI coding agent for the terminal.
TypeScript + Ink/React TUI + DeepSeek API + tool calling.
Entry: `src/cli/interactive.ts`. Main loop: `src/core/agent-loop.ts`.
Tools: read_file, write_file, edit_file, bash, glob, grep, chrome.

## Current Goal

Implement **Trust Layer UX**: the user must always understand:
1. what the agent is doing right now;
2. whether it is working or done;
3. how many actions have been completed;
4. where to see details;
5. whether input is available;
6. what verifications passed;
7. what failed, if anything.

## UX Diagnosis (2026-04-26)

Technically the agent already has: tool calling, TUI, sessions, browser, memory, handoff, approval modes.
The user experience during execution is broken:

| Issue | Severity |
|-------|----------|
| tool calls spam screen (read_file × 34) | Critical |
| no stable Done/Ready lifecycle after final answer | Critical |
| autoscroll overrides user scroll position | High |
| screen shaking during streaming | High |
| InputBar cursor/wrap broken for long input | High |
| Settings/Setup scroll breaks on ArrowDown | Medium |
| ctx% shows session total, not active window | Medium |
| debug trace shown as primary UI | Medium |

## Current Active Iteration

**Iteration 15 — Compact Tool Activity**
Full spec in NEXT_ITERATION.md.

## What Is Already Done

- Iterations 1–13 complete (see CHANGELOG.md)
- Iteration 13 normal finish: PASSED (status resets to Ready after Execution Summary)
- Iteration 13 Ctrl+C during run: FAILED (app crashed) → fixed in hotfix 13.1
- Hotfix 13.1 — FAILED: removeAllListeners не помог, Ink с exitOnCtrlC:true сам вызывал exit()
- Hotfix 13.2 — Soft Cancel on Ctrl+C: APPLIED
  - Root cause: Ink exitOnCtrlC:true вызывал exit() при raw-mode 0x03 ДО любых SIGINT handlers
  - Fix A (interactive.ts): exitOnCtrlC:false в render(); условный onSIGINT — проверяет
    process.__agentSoftCancel, если есть — soft cancel, иначе process.exit(0)
  - Fix B (app.tsx): useEffect ставит/снимает process.__agentSoftCancel при isProcessing;
    useInput Ctrl+C явно вызывает exit() при not-processing (иначе exitOnCtrlC:false не выйдет)
- Trust Layer documented: ITERATIONS.md 12–22, SPEC.md, AGENTS.md, audit.md, NEXT_ITERATION.md

## What NOT to Do

- Do not modify `src/` files during documentation-only iterations
- Do not modify `package.json`, `package-lock.json`, build configs
- Do not add new dependencies without explicit user request
- Do not claim "done" without running verification commands
- Do not run auto-format on the whole project

## Memory Update Protocol

After each iteration completes:
1. Edit this file → update "Current Active Iteration" to next iteration number
2. Replace NEXT_ITERATION.md with the next iteration spec from ITERATIONS.md
3. Commit: `git add -A && git commit -m "docs/fix: iteration N complete"`
