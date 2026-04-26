# DeepSeek Code — Iteration Plan

This file is the execution log and handoff anchor for autonomous work.

Rules:
- every finished iteration ends with a git commit;
- after each iteration, update this file first;
- do not mark an item complete unless it is actually verified in code;
- if work stops mid-iteration, leave the remaining items unchecked.

## Iteration 0 — Baseline Audit
Status: Completed

- [x] Review codebase structure and current tool registry
- [x] Compare documented features with actual runtime behavior
- [x] Verify baseline with `typecheck`, `build`, `lint`, and tests where possible
- [x] Identify browser-layer integration risks and mismatches
- [x] Produce a realistic plan for staged execution

Notes:
- `tsc` and `build` passed during audit.
- `eslint` was failing on unused imports/variables.
- Browser integration was documented as `chrome-cli-tools` driven, but actual runtime is native Puppeteer.
- Docs referenced tools that were not registered.

Commit:
- Pending replacement by first implementation commit if audit was not committed separately.

---

## Iteration 1 — Specification Reset
Status: Completed

Goal:
Make the specification and iteration files truthful, browser-first, and suitable for autonomous handoff.

- [x] Rewrite `SPEC.md` to define browser as first-class runtime
- [x] Rewrite `ITERATIONS.md` into an execution checklist and handoff log
- [x] Add commit hash for this iteration after commit is created

Files:
- `SPEC.md`
- `ITERATIONS.md`

Commit:
- `e79df04` — `docs: reset spec and iteration roadmap`

---

## Iteration 2 — Stabilization
Status: Completed

Goal:
Restore trust in the repository by fixing baseline defects and removing false claims.

- [x] Fix current `eslint` failures
- [x] Fix browser tool naming/UI mismatches
- [x] Fix browser status indicator so it reflects live runtime state
- [x] Fix browser event collection defects in `console` and `network`
- [x] Fix browser action defaults that cause wrong behavior
- [x] Align registered tools, system prompt, and docs
- [x] Verify `typecheck`, `build`, and `lint`
- [x] Run tests that are possible in the current environment and document any remaining gaps
- [x] Add commit hash for this iteration

Expected result:
- clean baseline;
- honest documentation;
- browser tool working more reliably inside current architecture.

Notes:
- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- direct `node --test src/tools/types.test.ts` is not a valid execution path in this ESM setup;
- compiled test path `node --test dist/tools/types.test.js` passes;
- sandboxed `node --test` still needs escalation in this environment because of `spawn EPERM`.

Commit:
- `963bb11` — `fix: stabilize browser runtime and docs`

---

## Iteration 3 — Browser Runtime Hardening
Status: Completed

Goal:
Make the browser layer feel native, reliable, and useful without explicit user prompting.

- [x] Introduce clearer browser runtime lifecycle boundaries
- [x] Add browser runtime status/events for UI consumption
- [x] Support stronger multi-step page/session reuse semantics
- [x] Improve screenshot and evidence reporting
- [x] Add optional headless browser mode for automation/CI
- [x] Decide the role of vendored `chrome-cli-tools/`:
- [x] Option A: compatibility/reference only, clearly documented
- [ ] Option B: real adapter/backend usage, if actually wired
- [x] Add commit hash for this iteration

Expected result:
- browser is not “extra functionality” but a core agent runtime.

Notes:
- browser runtime now exposes state via `chromeManager.getState()`;
- UI reacts to runtime state changes and shows headless mode as `Chrome:H`;
- screenshots default to `.deepseek-code/artifacts/browser/`;
- current architecture decision: vendored `chrome-cli-tools/` is reference/compatibility material, not the canonical agent runtime.

Commit:
- `d5b5060` — `feat: harden native browser runtime`

---

## Iteration 4 — Agent Browser Intelligence
Status: Completed

Goal:
Teach the agent to use the browser naturally when a task implies rendered UI or web validation.

- [x] Update system prompt guidance around browser-first validation when needed
- [x] Improve tool descriptions so the model better chooses browser actions
- [x] Tighten plan/default/yolo semantics around browser actions
- [x] Improve TUI messaging so browser actions are legible and concise
- [x] Document browser usage philosophy in user-facing docs
- [x] Add commit hash for this iteration

Expected result:
- user does not need to explicitly say “open browser” for relevant tasks.

Notes:
- the system prompt now explicitly tells the agent to use `chrome` without waiting for a literal “open browser” request when the task implies UI/browser validation;
- the `chrome` tool description now frames browser checks as the primary tool for localhost/UI/browser-debug tasks;
- `auto-edit` mode now auto-approves `chrome`, reducing friction for autonomous UI validation;
- user-facing docs now describe the browser layer as a native runtime rather than an add-on.

Commit:
- `b46afe4` — `feat: teach agent proactive browser usage`

---

## Iteration 5 — Workflow Quality
Status: Completed

Goal:
Adopt the strongest workflow ideas from Qwen Code, Claude Code, and Codex CLI while staying DeepSeek-first.

- [x] Strengthen handoff conventions and repo-local continuation state
- [x] Improve hooks/skills/subagent documentation and reliability
- [x] Improve review workflow to be findings-first and evidence-backed
- [x] Improve headless/CI reporting
- [x] Reduce architecture drift between docs and runtime
- [ ] Add commit hash for this iteration

Expected result:
- stronger operator trust and better continuity across sessions and agents.

Notes:
- sessions now store last prompt/response, approval mode, tool-call count, summary, and handoff path;
- autonomous runs write a `.handoff.md` file for continuation;
- headless results now expose `sessionId`, `handoffFile`, and tool-call summaries;
- subagent loading now depends on a real API config instead of an empty placeholder config;
- review core now normalizes and sorts findings by severity, with a reusable formatted report helper;
- verification for this iteration: `npm run typecheck`, `npm run lint`, `npm run build`, `node --test dist/tools/types.test.js`.

Commit:
- `61355b5` — `feat: improve handoff and workflow reporting`

---

## Iteration 6 — Unique Product Layer
Status: Partial (browser-qa skill pending)

Goal:
Add a differentiated workflow that makes DeepSeek Code more than a cheaper clone.

- [x] Define evidence bundle output for autonomous tasks
- [ ] Add browser-assisted QA recipes or skills
- [x] Add reproducible task-run summary output
- [x] Improve memory quality and project-specific persistence
- [x] Document unique value proposition in README and SPEC
- [ ] Add commit hash for this iteration

Expected result:
- a distinctive “coding + browser QA + evidence” CLI agent.

Notes:
- autonomous runs now produce both human-readable handoff markdown and machine-readable execution bundles;
- session persistence now captures approval mode, prompt/response summaries, tool-call count, and artifact paths;
- headless output is now suitable for chaining in CI and for another agent to resume from structured evidence.

Progress commit:
- `2a5157f` — `feat: add execution bundles for autonomous runs`

---

---

## Iteration 7 — UX Overhaul
Status: Completed

Goal:
Fix three blocking UX bugs identified by DeepSeek self-audit.

- [x] Fix setup wizard arrow-key flickering: extract Logo, LangStep, ApiKeyStep, ThemeStep,
      ModeStep to module level — they were inner arrow functions causing React to
      unmount/remount them (and reset FadeIn) on every App render
- [x] Fix reasoning visibility: swap ToolCallView/ReasoningView order so reasoning stays
      near the bottom; limit ToolCallView to last 3 items with "↑ N more" indicator
- [x] Limit ReasoningView to last 7 lines with truncation indicator
- [x] Verify typecheck, build, lint

Commit:
- `a4a30c7` — `fix: eliminate setup wizard flicker and improve reasoning visibility`

---

## Iteration 8 — API Stability
Status: Completed

Goal:
Make DeepSeek API calls resilient to transient failures.

- [x] Add withRetry() with exponential backoff (max 3 attempts, 30s cap) for 429/5xx/network errors
- [x] Wrap streamChat() and chat() API calls with withRetry()
- [x] Add per-chunk streaming timeout (60s) via AbortController — prevents hung streams
- [x] Replace hardcoded Russian fallback string with i18n.t('agentEmptyResponse')
- [x] Add agentEmptyResponse key to EN, RU, ZH locales
- [x] Verify typecheck, build, lint

Commit:
- `39e94c5` — `feat: add API retry, stream timeout, and localized error fallback`

---

## Iteration 9 — Platform & Core Fixes
Status: Completed

Goal:
Fix Windows-specific bugs, broken ExtensionManager, primitive ignore patterns, missing /help.

- [x] sandbox.ts: normalize Docker volume mount paths to forward slashes on Windows
- [x] extensions.ts: actually import and call extension main file via dynamic import()
- [x] ignore.ts: replace primitive pattern matching with minimatch (full .gitignore syntax)
- [x] app.tsx: implement /help slash command with categorized command list + keyboard hints
- [x] Install @types/minimatch as devDependency
- [x] Verify typecheck, build, lint

Commit:
- `5e5e5d1` — `fix: platform bugs, extension execution, glob patterns, /help command`

---

## Iteration 10 — Matrix Theme + Chat Scroll
Status: Completed

Goal:
Add Matrix aesthetic theme with animation; add chat history scrolling.

- [x] Add Matrix theme (#00ff41 green on black) to themes.ts and i18n (EN/RU/ZH)
- [x] Create MatrixRain component: animated katakana/digit columns, 120ms tick
- [x] Show MatrixRain in LangStep and ModeStep when matrix theme is active
- [x] Add chatScrollOffset state in App; handle PageUp/PageDown for scrolling
- [x] ChatView: scrollOffset prop, "↑ N earlier messages" indicator
- [x] Reset scroll offset to 0 when new message is sent
- [x] Verify typecheck, build, lint

Commit:
- `a6db3dc` — `feat: Matrix theme with animated rain and chat scroll via PageUp/PageDown`

---

## Handoff Notes

Current architectural truth:
- canonical browser runtime lives in `src/tools/chrome.ts` and `src/tools/chrome-manager.ts`;
- vendored `chrome-cli-tools/` exists, but is not yet the canonical runtime path;
- docs must not say otherwise until code proves it.

If another agent continues:
- start from the first incomplete iteration;
- verify repo state before marking anything done;
- keep commits small and iteration-scoped.
