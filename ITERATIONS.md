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
Status: In Progress

Goal:
Make the specification and iteration files truthful, browser-first, and suitable for autonomous handoff.

- [x] Rewrite `SPEC.md` to define browser as first-class runtime
- [x] Rewrite `ITERATIONS.md` into an execution checklist and handoff log
- [ ] Add commit hash for this iteration after commit is created

Files:
- `SPEC.md`
- `ITERATIONS.md`

---

## Iteration 2 — Stabilization
Status: Planned

Goal:
Restore trust in the repository by fixing baseline defects and removing false claims.

- [ ] Fix current `eslint` failures
- [ ] Fix browser tool naming/UI mismatches
- [ ] Fix browser status indicator so it reflects live runtime state
- [ ] Fix browser event collection defects in `console` and `network`
- [ ] Fix browser action defaults that cause wrong behavior
- [ ] Align registered tools, system prompt, and docs
- [ ] Verify `typecheck`, `build`, and `lint`
- [ ] Run tests that are possible in the current environment and document any remaining gaps
- [ ] Add commit hash for this iteration

Expected result:
- clean baseline;
- honest documentation;
- browser tool working more reliably inside current architecture.

---

## Iteration 3 — Browser Runtime Hardening
Status: Planned

Goal:
Make the browser layer feel native, reliable, and useful without explicit user prompting.

- [ ] Introduce clearer browser runtime lifecycle boundaries
- [ ] Add browser runtime status/events for UI consumption
- [ ] Support stronger multi-step page/session reuse semantics
- [ ] Improve screenshot and evidence reporting
- [ ] Add optional headless browser mode for automation/CI
- [ ] Decide the role of vendored `chrome-cli-tools/`:
- [ ] Option A: compatibility/reference only, clearly documented
- [ ] Option B: real adapter/backend usage, if actually wired
- [ ] Add commit hash for this iteration

Expected result:
- browser is not “extra functionality” but a core agent runtime.

---

## Iteration 4 — Agent Browser Intelligence
Status: Planned

Goal:
Teach the agent to use the browser naturally when a task implies rendered UI or web validation.

- [ ] Update system prompt guidance around browser-first validation when needed
- [ ] Improve tool descriptions so the model better chooses browser actions
- [ ] Tighten plan/default/yolo semantics around browser actions
- [ ] Improve TUI messaging so browser actions are legible and concise
- [ ] Document browser usage philosophy in user-facing docs
- [ ] Add commit hash for this iteration

Expected result:
- user does not need to explicitly say “open browser” for relevant tasks.

---

## Iteration 5 — Workflow Quality
Status: Planned

Goal:
Adopt the strongest workflow ideas from Qwen Code, Claude Code, and Codex CLI while staying DeepSeek-first.

- [ ] Strengthen handoff conventions and repo-local continuation state
- [ ] Improve hooks/skills/subagent documentation and reliability
- [ ] Improve review workflow to be findings-first and evidence-backed
- [ ] Improve headless/CI reporting
- [ ] Reduce architecture drift between docs and runtime
- [ ] Add commit hash for this iteration

Expected result:
- stronger operator trust and better continuity across sessions and agents.

---

## Iteration 6 — Unique Product Layer
Status: Planned

Goal:
Add a differentiated workflow that makes DeepSeek Code more than a cheaper clone.

- [ ] Define evidence bundle output for autonomous tasks
- [ ] Add browser-assisted QA recipes or skills
- [ ] Add reproducible task-run summary output
- [ ] Improve memory quality and project-specific persistence
- [ ] Document unique value proposition in README and SPEC
- [ ] Add commit hash for this iteration

Expected result:
- a distinctive “coding + browser QA + evidence” CLI agent.

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
