# NEXT_ITERATION.md

> Always contains exactly one iteration — the next one to execute.
> Replace this file's content after each iteration completes.

---

## Current iteration

**Iteration 17 — Settings/Setup Scroll Fix**

## Goal

Fix the setup wizard scroll/ArrowDown bug where ArrowDown can make a list appear empty or break the display.

## Status

⏳ Planned

## Allowed files

- `src/ui/app.tsx`
- `src/ui/setup-wizard.tsx`

## Tasks

1. Investigate the setup wizard ArrowDown scroll bug
2. Fix the display when navigating theme/mode options
3. Verify typecheck and build pass

## Acceptance criteria

- [ ] ArrowDown does not break setup wizard display
- [ ] All theme/mode options are navigable
- [ ] `npm run typecheck` passes
- [ ] `npm run build` compiles successfully

