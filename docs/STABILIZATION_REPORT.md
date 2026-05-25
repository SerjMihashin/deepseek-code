# DeepSeek Code Stabilization Report

Дата создания: 2026-05-24
Репозиторий: `D:\Projects\deepseek-code`
Ветка: `master`

## Verified Now

- Ветка `master` находится на 7 коммитов впереди `v0.4.3`.
- `package.json` все еще указывает версию `0.4.3`.
- Рабочее дерево перед созданием этих документов было чистым.
- Mouse reporting в `src` не найден: нет `ESC[?1000h`, `ESC[?1006h`, `mouse`, `Mouse`.
- Default interactive budget не включен: `budgetRef` в `src/ui/app.tsx` стартует как `undefined`.
- `INTERACTIVE_DEFAULT_BUDGET_PRESET` есть в `src/tools/types.ts`, но не подключен как default.
- `headless` режим использует `AUDIT_BUDGET_PRESET`.

## Commits After v0.4.3

```text
bf28e22 fix: show failed tool call details in execution summary
414f8ad test: increase glob timeout on Windows
237eabe fix: stabilize tui streaming and live follow-up input
01e41f8 fix: stabilize slash command input editing
d46bdaf feat: add interactive default budget preset
d0634f8 fix: enable interactive default budget
6c9e2f5 Revert "fix: enable interactive default budget"
```

## Ready for 0.4.4 Candidate

Можно брать:
- failed tool call details в Execution Summary;
- Windows glob timeout;
- TUI stream batching;
- live follow-up input;
- slash-command input editing fix;
- interactive budget preset как unused future preset;
- revert restrictive default budget.

Нельзя брать:
- raw mouse reporting;
- mouse wheel;
- line-based mouse scroll;
- default interactive budget;
- незавершенные TUI experiments.

## Current Risks

- TUI history has clearer follow/paused indicators, but real interactive scroll behavior still needs manual terminal smoke.
- Budget modes are incomplete: only `audit|small|status|off`.
- Temp cleanup is now enforced by prompt policy, but there is still no automatic final cleanup scanner.
- Large project exam has not been run for `0.4.4`.

## Proposed Next Work Block

Start with Iteration 6: `Budget Modes`.

Order:
1. Add `/budget normal`.
2. Add `/budget large`.
3. Keep default interactive budget off.
4. Update `/budget status` and help text.
5. Re-run lint, typecheck, build, tests, and pack dry-run.

## Verification Log

### 2026-05-24: Documentation Baseline

Status: `DONE`

Changed files:
- `docs/STABILIZATION_TZ.md`
- `docs/STABILIZATION_REPORT.md`
- `docs/SESSION_LOG.md`
- Codex memory file: `C:\Users\SerjMikhashin\.codex\memories\deepseek-code-stabilization.md`

Checks run:
- File creation/readback and `git status --short --untracked-files=all`.

Not checked:
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Next:
- Begin Iteration 1 release audit.

### 2026-05-25: Iteration 1 0.4.4 Release Audit

Status: `DONE`

Verification source:
- User ran the commands in PowerShell and provided the terminal output.
- Codex checked `git status --short --untracked-files=all` after the run.

Checks passed:
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`

Test result:
- 20 test files passed.
- 127 tests passed.
- 3 tests skipped.

Notes:
- Vitest output included expected Windows/git warnings from test fixtures, including LF/CRLF warnings and an intentional nonexistent command message.
- No release-blocking failure was shown in the provided output.
- Post-check `git status` shows only documentation files:
  - `docs/SESSION_LOG.md`
  - `docs/STABILIZATION_REPORT.md`
  - `docs/STABILIZATION_TZ.md`

Not checked yet:
- `npm pack --dry-run`
- Manual TUI smoke test
- Slash-command manual smoke test
- Live follow-up manual smoke test

Next:
- Begin Iteration 2: release notes and version update.

### 2026-05-25: Iteration 2 Release Notes and Version

Status: `DONE`

Changed files:
- `CHANGELOG.md`
- `package.json`
- `package-lock.json`

Changes:
- Added `CHANGELOG.md` section `0.4.4 — TUI Stability & Release Candidate`.
- Updated package version from `0.4.3` to `0.4.4`.
- Updated root package versions in `package-lock.json` to `0.4.4`.
- Did not change dependency `@humanwhocodes/retry@0.4.3`.

Checks passed:
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Test result:
- 20 test files passed.
- 130 tests passed.
- 0 skipped in this run.

Pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 200.9 kB
- Unpacked size: 947.2 kB
- Total files: 221

Notes:
- `npm pack --dry-run` only simulated packaging; no publish was performed.
- Test output included the known intentional nonexistent command message and LF/CRLF fixture warnings.
- Post-check `git status` shows modified release files and the three docs files only.

Not checked yet:
- Manual TUI launch smoke test.
- Slash-command manual smoke test.
- Live follow-up manual smoke test.

Next:
- Begin Iteration 3: abort and error reporting hardening.

### 2026-05-25: Iteration 2.5 Pre-release Smoke Verification

Status: `DONE`

Release blocker found:
- `node dist\cli\index.js --json` without a prompt unexpectedly started a headless agent run.
- Root cause: `program.parseAsync(args, { from: 'user' })` was used with full `process.argv`, so Commander treated `node` and the script path as query text.
- Side effect: the pre-fix smoke run created session artifacts under `C:\Users\SerjMikhashin\.deepseek-code\sessions\...`; no repository files were created by that run.

Fix:
- Changed CLI parsing to use node-style argv for full `process.argv`.
- Added an entrypoint guard so `src/cli/index.ts` can be imported safely in tests.
- Added `src/cli/index.test.ts` regression coverage for Commander parse source selection.

Changed files:
- `src/cli/index.ts`
- `src/cli/index.test.ts`
- `CHANGELOG.md`

Smoke checks passed after fix:
- `node dist\cli\index.js --version`: `0.4.4`
- `node dist\cli\index.js --help`: usage output shown.
- `node dist\cli\index.js --json`: no output, no agent run.
- `node dist\cli\index.js --headless`: no output, no agent run.

Checks passed after fix:
- `npm test -- src/cli/index.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Test result:
- 21 test files passed.
- 132 tests passed.

Pack dry-run after fix:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 201.2 kB
- Unpacked size: 948.1 kB
- Total files: 221

Not checked yet:
- Manual interactive TUI launch in a real terminal.
- Slash-command manual smoke test.
- Live follow-up manual smoke test.

### 2026-05-25: Iteration 2.6 Windows grep_search Fallback

Status: `DONE`

Reason:
- External smoke reported `rg` missing on Windows, which made `grep_search` fail.

Fix:
- Added a Node fallback in `src/tools/grep.ts` for cases where `rg` is unavailable.
- Fallback searches files recursively inside the workspace, skips common heavy directories, ignores binary/large files, supports simple glob filtering via `minimatch`, and limits output to 200 matches.
- Removed `rg`-dependent skip from `src/tools/tools.test.ts`.
- Added `src/tools/grep.test.ts` to simulate missing `rg`.

Checks passed so far:
- `npm test -- src/tools/grep.test.ts src/tools/tools.test.ts`
- `npm run typecheck`

Full verification:
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 22 test files passed.
- 133 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 202.1 kB
- Unpacked size: 952.7 kB
- Total files: 221

### 2026-05-25: Iteration 3 Abort and Error Reporting Hardening

Status: `DONE`

Fix:
- Added `StreamTimeoutError` in `src/api/index.ts`.
- Stream chunk timeout now rethrows `StreamTimeoutError` instead of surfacing as a generic `AbortError`.
- TUI error handling now hides only user-triggered cancellation tied to the current `AbortController` signal.
- Unexpected abort/timeout errors now produce visible user-facing messages.
- Error session bundles now include partial tool history when available.

Tests added/updated:
- `src/api/index.test.ts`
- `src/core/agent-loop.test.ts`

Checks passed so far:
- `npm test -- src/api/index.test.ts src/core/agent-loop.test.ts`
- `npm run typecheck`

Full verification:
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 23 test files passed.
- 135 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 202.7 kB
- Unpacked size: 955.9 kB
- Total files: 221

### 2026-05-25: Iteration 4 Windows Shell and Temp Cleanup Policy

Status: `DONE`

Fix:
- Added explicit Windows shell policy to the dynamic system prompt.
- Instructed the agent to prefer `read_file`, `grep_search`, and `glob` over shell reads/searches.
- Expanded temporary-file cleanup rules before final reports.
- Updated `run_shell_command` description with OS-compatible command guidance.
- Added a Windows runtime guard that rejects common Unix-only inspection commands such as `head` with a PowerShell replacement hint.

Tests added/updated:
- `src/core/agent-loop.test.ts`
- `src/tools/tools.test.ts`

Checks passed:
- `npm test -- src/core/agent-loop.test.ts src/tools/types.test.ts`
- `npm test -- src/tools/tools.test.ts src/core/agent-loop.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 23 test files passed.
- 137 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 204.2 kB
- Unpacked size: 961.5 kB
- Total files: 221

Temp-file check:
- No `fibonacci.py`, `.tmp-grep-fallback-*`, `.tmp-dsc-test-*`, `err.txt`, `lint_err.txt`, `temp_patch*`, `temp_fix*`, or stray file `1` found in repository files.

### 2026-05-25: Iteration 5 TUI Stability Stage 1

Status: `DONE`

Fix:
- Status bar now shows `VIEW:FOLLOW PageUp` in normal follow mode.
- Status bar now shows `VIEW:PAUSED PageDown/End` when history is paused/scrolled.
- Status bar now shows `VIEW:PAUSED +new End` when new messages arrive while paused.
- `/help` now explicitly says mouse wheel is not captured in TUI and directs users to PageUp/PageDown/End.
- Confirmed no raw mouse reporting escape sequences such as `1000h` or `1006h` are enabled in `src`.

Tests added/updated:
- `src/ui/status-bar.test.ts`
- `src/commands/index.test.ts`

Checks passed:
- `npm test -- src/ui/status-bar.test.ts src/commands/index.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 141 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 204.7 kB
- Unpacked size: 963.6 kB
- Total files: 221

Temp-file check:
- No `fibonacci.py`, `.tmp-grep-fallback-*`, `.tmp-dsc-test-*`, `err.txt`, `lint_err.txt`, `temp_patch*`, `temp_fix*`, or stray file `1` found in repository files.

### 2026-05-25: External DeepSeek Smoke Report Review

Status: `NEEDS_CLEANUP`

Source:
- User provided an external DeepSeek smoke-test report for `0.4.4`.
- Codex verified repository state after the report.

Useful signal:
- External smoke reported `--version`, `--help`, headless prompt, JSON mode, language/theme flags, turbo, continue, `/help`, `/budget status`, `/clear`, and `/changelog` as working.
- External smoke confirmed non-TTY TUI launch fails with Ink raw-mode error, which is expected outside a real interactive terminal.
- External smoke did not identify a functional release blocker.

Important caveats:
- This was not a complete real TUI smoke test. Streaming, Ctrl+C, scroll behavior, resize, InputBar editing, and live follow-up still require a real interactive terminal.
- The report included 2 failed shell calls, so the result cannot be described as "all commands succeeded".
- The report noted `rg` missing on Windows, which can break `grep_search` unless ripgrep is installed or a fallback is added.
- The report said it would delete the temporary file, but `git status` still shows `fibonacci.py` as untracked.

Verified after report:
- `git status --short --untracked-files=all` shows expected release/doc changes plus `fibonacci.py`.
- `fibonacci.py` contains only a simple temporary Fibonacci helper and is not part of the project.

Cleanup required before release:
- Remove `fibonacci.py` or explicitly keep it if the user wants it.

Release impact:
- No code release blocker was confirmed by this external report.
- Publication should wait until the temporary file is removed and, preferably, a real interactive TUI smoke is completed.
