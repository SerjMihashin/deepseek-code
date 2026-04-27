# Iterations — DeepSeek Code

> Development history and iteration plan.
> Each iteration is a self-contained block of changes with a commit.
> Session rule: iterations are sized for 10–20 minutes of work.

---

## ✅ Iterations 1–11 (complete)

See [CHANGELOG.md](./CHANGELOG.md) for full history up to v0.2.0.

Key milestones:
- Function Calling in DeepSeek API
- 7 tools: read, write, edit, bash, glob, grep, chrome
- Ink/React TUI + ChatView, i18n (3 languages), 6 themes
- Setup Wizard, AgentLoop extracted from App
- Chrome integration (16 actions), Puppeteer
- Approval modes (plan / default / auto-edit / yolo)
- MCP, Hooks, Extensions, Memory, Sessions, Checkpoints
- Matrix Rain theme, Markdown rendering
- Retry + exponential backoff, streaming timeout
- Slash commands: /help, /remember, /checkpoint, /review, /git, /loop, /mcp, /agents
- Iteration 11: full code audit, SPEC reset, roadmap drafted

---

## ✅ Iteration 12 — Trust Layer Documentation Reset

**Goal:** Record the new UX diagnosis, rewrite the roadmap, create AGENT_MEMORY.md and NEXT_ITERATION.md.

**Status:** ✅ Complete (2026-04-27)

**Allowed files:**
- `ITERATIONS.md`, `AGENT_MEMORY.md`, `NEXT_ITERATION.md`
- `audit.md`, `SPEC.md`, `AGENTS.md`

**Forbidden:**
- Anything in `src/`, `package.json`, lock files, build configs

**Tasks:**
1. Rewrite ITERATIONS.md with iterations 12–22, full format per iteration
2. Create AGENT_MEMORY.md — short session-starter file
3. Create NEXT_ITERATION.md — always holds the nearest iteration
4. Add "UX Trust Audit — 2026-04-26" section to audit.md
5. Add Trust Layer principle to SPEC.md
6. Add coding agent rules to AGENTS.md

**Acceptance criteria:**
- [ ] ITERATIONS.md has iterations 12–22 with full format
- [ ] AGENT_MEMORY.md is created and sufficient to start a session
- [ ] NEXT_ITERATION.md is created with Iteration 13 spec
- [ ] audit.md has UX Trust Audit section
- [ ] SPEC.md has Trust Layer principle
- [ ] AGENTS.md has agent operation rules

**Manual checks:**
- Open AGENT_MEMORY.md — is it sufficient to start a new session without other files?
- Open NEXT_ITERATION.md — is it clear what to do?

**Commands:** not run (documentation iteration)

**Expected result:** A new Claude Code session can start with only AGENT_MEMORY.md + ITERATIONS.md and know what to do.

**Memory update after completion:**
- Active iteration → 13
- Replace NEXT_ITERATION.md with Iteration 13 spec

---

## 🎯 Iteration 13 — Stable Agent Lifecycle

**Goal:** After the final response, the TUI always returns to Ready. No Ctrl+C required.

**Status:** ⏳ Planned

**Allowed files:**
- `src/core/agent-loop.ts`
- `src/ui/app.tsx`
- `src/ui/status-bar.tsx`

**Forbidden:**
- `package.json`, `package-lock.json`
- `src/tools/` (unless explicitly justified)
- `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`

**Tasks:**
1. After final agent response: `isProcessing = false`, `isStreaming = false`
2. After Execution Summary: InputBar unblocked (cursor visible, input enabled)
3. Spinner stops immediately after last tool call or final text
4. Ctrl+C = soft cancel (stop + cleanup), not process exit
5. No jitter or state drift after final response is rendered

**Acceptance criteria:**
- [ ] After any agent response: spinner is stopped
- [ ] InputBar is enabled immediately after Execution Summary
- [ ] Ctrl+C cancels without exiting the process
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds

**Manual checks:**
- Send request → wait for response → TUI returns to Ready without any key press
- Send long request → Ctrl+C → agent stops, terminal stays open
- Type next message immediately after agent finishes — no blocked input

**Commands:**
```bash
npm run typecheck
npm run build
```

**Expected result:** TUI transitions to Ready automatically. User can immediately type the next message.

**Memory update after completion:**
- Active iteration → 14
- Replace NEXT_ITERATION.md with Iteration 14 spec

---

## ✅ Iteration 14 — Smart Autoscroll (merged into stabilization pass 2026-04-27)

**Goal:** When the user scrolls up, the agent must not reset the scroll position.

**Status:** ✅ Complete (2026-04-27, merged into stabilization pass)

**Changes made (as part of stabilization pass):**
- PageUp/PageDown scroll by 10 lines (half-screen)
- ArrowUp/ArrowDown scroll by 1 line, but only when InputBar is disabled (processing)
- End key resets scrollMode to 'follow' via raw stdin handler
- New message indicator "↓ N new — End to follow" in paused mode
- Scroll position preserved during processing when user scrolls up

**Verification:**
- npm run typecheck: PASSED (Verified)
- npm run build: PASSED (Verified)

---

## ✅ Iteration 15 — Compact Tool Activity (merged into stabilization pass 2026-04-27)

**Goal:** Remove read_file/read_file/read_file spam. Show compact grouped activity instead.

**Status:** ✅ Complete (2026-04-27, merged into stabilization pass)

**Changes made (as part of stabilization pass):**
- ToolCallView: `groupToolCalls()` groups by name → shows `read_file × 15`
- ResultsPanel: max 3 visible groups, compact summary line (total count + unique types)
- ResultsPanel height reduced from 10 to 6 rows
- Separator width capped at 60 chars

**Verification:**
- npm run typecheck: PASSED (Verified)
- npm run build: PASSED (Verified)

---

## ✅ Iteration 16 — InputBar Multiline Editor (merged into stabilization pass 2026-04-27)

**Goal:** Long input must work correctly: soft wrap, correct cursor position, max height, scroll.

**Status:** ✅ Complete (2026-04-27, merged into stabilization pass)

**Changes made (as part of stabilization pass):**
- Shift+Enter adds newline, Enter sends
- `wrap='wrap'` on Text component
- MAX_VISIBLE_ROWS = 5 with internal scroll (inputScrollOffset)
- Manual line wrapping calculation for cursor placement
- Cursor on last visible line
- "↑↓ scroll" indicator when content exceeds max height

**Verification:**
- npm run typecheck: PASSED (Verified)
- npm run build: PASSED (Verified)

---

## 🎯 Iteration 17 — Settings/Setup Scroll Fix

**Goal:** ArrowDown/PageDown in Settings/Setup must not break the display or empty the list.

**Status:** ⏳ Planned

**Allowed files:**
- `src/ui/setup-wizard.tsx`
- `src/ui/app.tsx`

**Forbidden:**
- `package.json`, `package-lock.json`
- `src/tools/`, `src/core/`, `src/api/`
- Build configs

**Tasks:**
1. `clamp(activeIndex, 0, items.length - 1)` — never go out of bounds
2. `clamp(scrollOffset, 0, max)` — never scroll past the end
3. Recalculate scrollOffset whenever activeIndex changes
4. Test with 2, 5, and 15+ item lists

**Acceptance criteria:**
- [ ] ArrowDown at end of list does not break display
- [ ] PageDown does not empty the list
- [ ] At least one item always visible
- [ ] `npm run typecheck` passes

**Manual checks:**
- Open /setup → press ArrowDown many times → list does not disappear
- PageDown → display remains correct

**Commands:**
```bash
npm run typecheck
npm run build
```

**Expected result:** Settings/Setup scrolls predictably. Nothing breaks.

**Memory update after completion:**
- Active iteration → 18
- Replace NEXT_ITERATION.md with Iteration 18 spec

---

## 🎯 Iteration 18 — Context Metrics Rewrite

**Goal:** Separate active context window from session total tokens. ctx% = current active context, not cumulative.

**Status:** ⏳ Planned

**Allowed files:**
- `src/core/metrics.ts`
- `src/ui/status-bar.tsx`
- `src/ui/app.tsx`

**Forbidden:**
- `package.json`, `package-lock.json`
- `src/tools/`, `src/api/`
- Build configs

**Tasks:**
1. `metrics.ts`: add `lastRequestInputTokens` (tokens of the last request)
2. `metrics.ts`: add `getCurrentWindowPercent()` = lastRequestInputTokens / modelContextWindow
3. `status-bar.tsx`: show `ctx:8%` (active window) and `session:42k` (cumulative) separately
4. Remove ambiguous combined metric

**Acceptance criteria:**
- [ ] After first 1000-token request: ctx% is not 100%
- [ ] ctx% reflects the current request, not the whole session
- [ ] `npm run typecheck` passes

**Manual checks:**
- Send a request → check ctx% in status bar
- Send a second request → ctx% should reflect only the second request

**Commands:**
```bash
npm run typecheck
npm run build
```

**Expected result:** ctx% is meaningful. User can see how much of the context window the current request uses.

**Memory update after completion:**
- Active iteration → 19
- Replace NEXT_ITERATION.md with Iteration 19 spec

---

## 🎯 Iteration 19 — Activity Timeline

**Goal:** Instead of a raw tool call log, show a human-readable activity timeline.

**Status:** ⏳ Planned

**Allowed files:**
- `src/ui/results-panel.tsx`
- `src/ui/chat-view.tsx`
- `src/ui/app.tsx`

**Forbidden:**
- `package.json`, `package-lock.json`
- `src/tools/`, `src/core/`, `src/api/`
- Build configs

**Tasks:**
1. Add Timeline component (steps, not raw tool calls)
2. Steps format: "Understood task → Reading UI → Found issue → Editing code → Verifying"
3. Map tool calls to readable steps:
   - `read_file` → "Reading file"
   - `bash` → "Running command"
   - `edit_file` → "Editing file"
   - `grep` → "Searching code"
4. Always highlight the latest step as active

**Acceptance criteria:**
- [ ] Instead of "read_file src/ui/app.tsx": shows "Reading app.tsx"
- [ ] Timeline shows agent progress
- [ ] `npm run typecheck` passes

**Manual checks:**
- Send request → watch Timeline → is it clear what the agent is doing?

**Commands:**
```bash
npm run typecheck
npm run build
```

**Expected result:** User sees a clear picture of agent activity without technical detail noise.

**Memory update after completion:**
- Active iteration → 20
- Replace NEXT_ITERATION.md with Iteration 20 spec

---

## 🎯 Iteration 20 — Evidence Ledger / Verification Report

**Goal:** After the agent finishes, show proof: what was changed, what was verified, what failed.

**Status:** ⏳ Planned

**Allowed files:**
- `src/ui/app.tsx`
- `src/ui/chat-view.tsx`
- `src/core/agent-loop.ts`

**Forbidden:**
- `package.json`, `package-lock.json`
- `src/tools/`, `src/api/`
- Build configs

**Tasks:**
1. After agent loop completes: collect Evidence Ledger
2. Contents:
   - Changed files (list with brief description)
   - Commands run (bash calls and exit status)
   - Verification results (what passed / failed)
   - Failures (what went wrong)
3. Render Evidence Ledger after Execution Summary
4. Keep it compact — not a full log dump

**Acceptance criteria:**
- [ ] After completion: which files were changed is visible
- [ ] bash commands and their outcome are listed
- [ ] Failures are surfaced, not hidden
- [ ] `npm run typecheck` passes

**Manual checks:**
- Ask agent to modify a file → check Evidence Ledger after completion
- Confirm failed actions are also visible

**Commands:**
```bash
npm run typecheck
npm run build
```

**Expected result:** User knows exactly what was done and verified. No need to read the full log.

**Memory update after completion:**
- Active iteration → 21
- Replace NEXT_ITERATION.md with Iteration 21 spec

---

## 🎯 Iteration 21 — Diff Preview UX

**Goal:** Code changes are shown clearly and grouped by file.

**Status:** ⏳ Planned

**Allowed files:**
- `src/ui/chat-view.tsx`
- `src/ui/app.tsx`

**Forbidden:**
- `package.json`, `package-lock.json`
- `src/tools/`, `src/core/`, `src/api/`
- Build configs

**Tasks:**
1. Color diff lines in agent output: additions green, deletions red
2. Group changes by file with a header
3. Show 3 context lines before/after each change
4. Collapse large diffs (show N lines with expand option)

**Acceptance criteria:**
- [ ] Added lines = green, deleted lines = red
- [ ] File name header before each diff block
- [ ] Large diffs collapsed by default
- [ ] `npm run typecheck` passes

**Manual checks:**
- Ask agent to make changes → check diff display
- Large diff → confirm it is collapsed

**Commands:**
```bash
npm run typecheck
npm run build
```

**Expected result:** Code changes are easy to read. Clear what changed and where.

**Memory update after completion:**
- Active iteration → 22
- Replace NEXT_ITERATION.md with Iteration 22 spec

---

## 🎯 Iteration 22 — Tests for TUI State

**Goal:** Add tests for lifecycle, scroll state, compact tool grouping, and metrics.

**Status:** ⏳ Planned

**Allowed files:**
- `src/core/agent-loop.test.ts`
- `src/tools/tools.test.ts`
- `src/tools/approval.test.ts`
- `src/tools/sanitize.test.ts`

**Forbidden:**
- `package.json`, `package-lock.json`
- Build configs
- `src/ui/` (unless adding testable hooks only)

**Tasks:**
1. Test: agent lifecycle — `isProcessing` becomes false after final response
2. Test: scroll state — `paused` mode is not reset by new messages
3. Test: compact tool grouping — 5 read_file calls → group count = 1, count = 5
4. Test: ctx% — lastRequestTokens / windowSize, not cumulative session tokens

**Acceptance criteria:**
- [ ] `npx vitest run` — 0 failures
- [ ] Lifecycle, scroll, grouping, metrics all covered
- [ ] `npm run typecheck` passes

**Manual checks:**
- `npx vitest run` → all tests pass

**Commands:**
```bash
npx vitest run
npm run typecheck
```

**Expected result:** Tests protect against regressions in key TUI behaviors.

**Memory update after completion:**
- Trust Layer complete (iterations 12–22)
- Update AGENT_MEMORY.md to reflect final state
