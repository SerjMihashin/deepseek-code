# NEXT_ITERATION.md

> Always contains exactly one iteration — the next one to execute.
> Replace this file's content after each iteration completes.

---

## Current iteration

**Iteration 15 — Compact Tool Activity**

## Goal

Remove read_file/read_file/read_file spam. Show compact grouped activity instead.

## Allowed files

- `src/ui/results-panel.tsx`
- `src/ui/tool-call-view.tsx`
- `src/ui/app.tsx`

## Forbidden files

- `package.json`, `package-lock.json`
- `src/tools/`, `src/core/`, `src/api/`
- `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- `.md` files (unless updating documentation as part of iteration completion)

## Tasks

1. Group repeated tool calls by name:
   ```
   read_file × 34
   grep × 2
   latest: src/ui/results-panel.tsx
   ```
2. In normal view: show only the summary, not the full list
3. Add `/logs` command or Ctrl+L hotkey to open full debug trace
4. Show max 3 recent unique tool call types in main view

## Acceptance criteria

- [ ] 10+ read_file calls → shows "read_file × N", not a list
- [ ] Last call and its target are visible
- [ ] Full trace accessible via command or hotkey
- [ ] `npm run typecheck` passes
- [ ] `npm run build` compiles successfully

## Manual checks

1. Ask agent to read a large project → confirm tool calls are shown compactly
2. Confirm full trace is accessible

## Commands

```bash
npm run typecheck
npm run build
```

## Output format

Report at end of session:

```
## Iteration 15 complete

### Changed files
- src/ui/results-panel.tsx: <what changed>
- src/ui/tool-call-view.tsx: <what changed>
- src/ui/app.tsx: <what changed>

### Verification
- npm run typecheck: PASSED / FAILED
- npm run build: PASSED / FAILED
- Manual — tool calls grouped: YES / NO

### Failures
- <list anything that did not work>

### Next
Iteration 16 — InputBar Multiline Editor
```

## Memory update instructions

After completing this iteration:
1. Edit AGENT_MEMORY.md → "Current Active Iteration" = **Iteration 16 — InputBar Multiline Editor**
2. Replace NEXT_ITERATION.md content with Iteration 16 spec from ITERATIONS.md
3. Commit: `git add -A && git commit -m "fix: compact tool activity (iteration 15)"`
