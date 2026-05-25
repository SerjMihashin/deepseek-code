# DeepSeek Code Session Log

Purpose: keep a concise durable record of successful stabilization iterations.

Rule: after each successful iteration, update this file with:
- iteration number and name;
- date;
- files changed;
- checks run and results;
- manual checks still needed;
- next iteration.

## Current Session

Date: 2026-05-24
Branch: `master`
Package: `@serjm/deepseek-code`
Published version: `0.4.3`
Target version: `0.4.4`

## Iteration Status

| Iteration | Name | Status | Notes |
|---|---|---|---|
| 0 | Documentation Baseline | DONE | Created current TZ, report, session log, and memory rule. |
| 1 | 0.4.4 Release Audit | DONE | lint/typecheck/build/tests passed from user-provided PowerShell output. |
| 2 | Release Notes and Version | DONE | Updated changelog/package files and pack dry-run passed. |
| 2.5 | Pre-release Smoke Verification | DONE | Fixed CLI argv parsing blocker found by smoke checks. |
| 3 | Abort and Error Reporting Hardening | DONE | Stream timeouts now surface as explicit errors and full verification passed. |
| 4 | Windows Shell and Temp Cleanup Policy | DONE | Added Windows shell policy, runtime Unix-command guard, and temp cleanup reporting rules. |
| 5 | TUI Stability Stage 1 | DONE | Added explicit follow/paused status and documented keyboard scroll without mouse capture. |
| 6 | Budget Modes | DONE | Added explicit normal/large modes and kept default off. |
| 7 | Large Project Exam | TODO | Run real acceptance exam before publish decision. |

## Entries

### 2026-05-24: Iteration 0 Documentation Baseline

Status: `IN_PROGRESS`
Final status: `DONE`

Done:
- Created new stabilization TZ instead of editing old `TZ_STABILIZATION.md`, because the old file is large and displays with broken encoding in the current shell.
- Created stabilization report.
- Created this session log.
- Added memory instruction to update this file after each successful iteration.

Checks:
- File creation/readback completed.
- `git status --short --untracked-files=all` shows the three new docs files.
- No code checks run; this was documentation setup only.

Next:
- Start Iteration 1: `0.4.4 Release Audit`.

### 2026-05-25: Iteration 1 0.4.4 Release Audit

Status: `DONE`

Done:
- Confirmed release candidate checks from user-provided PowerShell output.
- Confirmed post-check working tree has no generated temp/build/test junk; only docs files are untracked.

Checks:
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed.
- Test suite result: 20 files passed, 127 tests passed, 3 skipped.
- `git status --short --untracked-files=all`: only docs files are untracked.

Notes:
- Test output had non-blocking Windows/git fixture warnings and an intentional nonexistent command message.
- No code changes were made in this iteration.

Manual checks still needed:
- TUI launch smoke test.
- Slash-command smoke test.
- Live follow-up smoke test.

Next:
- Start Iteration 2: `Release Notes and Version`.

### 2026-05-25: Iteration 2 Release Notes and Version

Status: `DONE`

Done:
- Added `0.4.4` changelog section.
- Updated `package.json` version to `0.4.4`.
- Updated root package versions in `package-lock.json` to `0.4.4`.
- Verified `@humanwhocodes/retry@0.4.3` dependency entry remained unchanged.

Checks:
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed.
- `npm pack --dry-run`: passed.

Test result:
- 20 test files passed.
- 130 tests passed.
- 0 skipped in this run.

Pack dry-run:
- Produced simulated tarball name `serjm-deepseek-code-0.4.4.tgz`.
- Latest package size 201.2 kB, unpacked size 948.1 kB, total files 221.
- No npm publish was run.

Manual checks still needed:
- TUI launch smoke test.
- Slash-command smoke test.
- Live follow-up smoke test.

Next:
- Start Iteration 3: `Abort and Error Reporting Hardening`.

### 2026-05-25: Iteration 2.5 Pre-release Smoke Verification

Status: `DONE`

Done:
- Ran built CLI smoke checks.
- Found release blocker: `--json` without prompt incorrectly started an agent run because full `process.argv` was parsed as user argv.
- The pre-fix run created session artifacts under `C:\Users\SerjMikhashin\.deepseek-code\sessions\...`; no repository files were created by that run.
- Fixed CLI parsing in `src/cli/index.ts`.
- Added entrypoint guard for safe test imports.
- Added regression test in `src/cli/index.test.ts`.
- Updated changelog to mention the CLI argument parsing fix.

Smoke checks:
- `node dist\cli\index.js --version`: returned `0.4.4`.
- `node dist\cli\index.js --help`: printed usage.
- `node dist\cli\index.js --json`: exited with no output and no agent run after fix.
- `node dist\cli\index.js --headless`: exited with no output and no agent run after fix.

Checks:
- `npm test -- src/cli/index.test.ts`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed.
- `npm pack --dry-run`: passed.

Test result:
- 21 test files passed.
- 132 tests passed.

Manual checks still needed:
- TUI launch smoke test in a real interactive terminal.
- Slash-command smoke test.
- Live follow-up smoke test.

Next:
- Start Iteration 3: `Abort and Error Reporting Hardening`, or publish `0.4.4` after manual TUI smoke approval.

### 2026-05-25: External DeepSeek Smoke Report Review

Status: `NEEDS_CLEANUP`

Done:
- Reviewed user-provided DeepSeek smoke report.
- Verified actual repository state after the external run.
- Confirmed `fibonacci.py` remains as an untracked temp file despite the report saying it would be removed.

External smoke reported:
- `--version`, `--help`, headless prompt, JSON mode, language/theme flags, turbo, continue: OK.
- `/help`, `/budget status`, `/clear`, `/changelog`: OK according to report.
- Non-TTY TUI raw-mode failure: expected outside real terminal.

Notes:
- The external report still had 2 failed shell calls.
- Real interactive TUI behavior remains not fully checked.
- `rg` missing on Windows was reported as a medium issue for `grep_search`.

Cleanup needed:
- Remove or intentionally keep `fibonacci.py`.

Next:
- Clean up `fibonacci.py`.
- Then decide between manual TUI smoke and publishing `0.4.4`.

### 2026-05-25: Iteration 2.6 Windows grep_search Fallback

Status: `DONE`

Done:
- Removed smoke-test temp file `fibonacci.py` from the workspace.
- Added Node fallback for `grep_search` when `rg` is unavailable.
- Updated grep/tool tests so fallback behavior is covered.

Checks passed so far:
- `npm test -- src/tools/grep.test.ts src/tools/tools.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 22 test files passed.
- 133 tests passed.

Pack dry-run:
- Package `@serjm/deepseek-code@0.4.4`.
- Filename `serjm-deepseek-code-0.4.4.tgz`.
- Package size 202.1 kB, unpacked size 952.7 kB, total files 221.

Next:
- Continue hardening before publish; suggested next block is Iteration 3: `Abort and Error Reporting Hardening`.

### 2026-05-25: Iteration 3 Abort and Error Reporting Hardening

Status: `DONE`

Done:
- Added explicit `StreamTimeoutError` for stream chunk timeout.
- Changed TUI cancellation classification so only current user cancellation is hidden.
- Unexpected stream abort/timeout is now visible to the user.
- Error bundles include partial tool history when available.
- Added targeted API and AgentLoop tests.

Checks passed so far:
- `npm test -- src/api/index.test.ts src/core/agent-loop.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 23 test files passed.
- 135 tests passed.

Pack dry-run:
- Package `@serjm/deepseek-code@0.4.4`.
- Filename `serjm-deepseek-code-0.4.4.tgz`.
- Package size 202.7 kB, unpacked size 955.9 kB, total files 221.

Next:
- Start Iteration 4: `Windows Shell and Temp Cleanup Policy`.

### 2026-05-25: Iteration 4 Windows Shell and Temp Cleanup Policy

Status: `DONE`

Done:
- Committed previous stable block as `1138e17 chore: prepare 0.4.4 stability candidate`.
- Exported `buildSystemPrompt` for regression coverage.
- Added explicit Windows shell policy to the dynamic system prompt.
- Strengthened temp-file cleanup/reporting rules in the prompt.
- Updated `run_shell_command` tool description to prefer OS-compatible commands and repository tools for inspection.
- Added Windows runtime guard for common Unix-only commands such as `head`.
- Added/updated tests in `src/core/agent-loop.test.ts` and `src/tools/tools.test.ts`.

Checks:
- `npm test -- src/core/agent-loop.test.ts src/tools/types.test.ts`: passed.
- `npm test -- src/tools/tools.test.ts src/core/agent-loop.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed.
- `npm pack --dry-run`: passed.

Final test result:
- 23 test files passed.
- 137 tests passed.

Pack dry-run:
- Package `@serjm/deepseek-code@0.4.4`.
- Filename `serjm-deepseek-code-0.4.4.tgz`.
- Package size 204.2 kB, unpacked size 961.5 kB, total files 221.

Temp-file check:
- No known smoke/test junk files found in repository file list.

Next:
- Start Iteration 5: `TUI Stability Stage 1`.

### 2026-05-25: Iteration 5 TUI Stability Stage 1

Status: `DONE`

Done:
- Added status bar scroll mode labels:
  - `VIEW:FOLLOW PageUp`
  - `VIEW:PAUSED PageDown/End`
  - `VIEW:PAUSED +new End`
- Passed current scroll mode, scroll offset, and paused-new-message state into `StatusBar`.
- Added `/help` text that mouse wheel is not captured in TUI and users should use PageUp/PageDown/End.
- Confirmed no raw mouse reporting escape sequences are enabled in `src`.
- Added tests for scroll status labels and help text.

Checks:
- `npm test -- src/ui/status-bar.test.ts src/commands/index.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed.
- `npm pack --dry-run`: passed.

Final test result:
- 24 test files passed.
- 141 tests passed.

Pack dry-run:
- Package `@serjm/deepseek-code@0.4.4`.
- Filename `serjm-deepseek-code-0.4.4.tgz`.
- Package size 204.7 kB, unpacked size 963.6 kB, total files 221.

Temp-file check:
- No known smoke/test junk files found in repository file list.

Next:
- Start Iteration 6: `Budget Modes`.

### 2026-05-25: Iteration 6 Budget Modes

Status: `DONE`

Done:
- Added `NORMAL_BUDGET_PRESET`.
- Added `LARGE_BUDGET_PRESET`.
- Added `/budget normal`.
- Added `/budget large`.
- Updated `/budget status` to show `maxIterations`.
- Updated `/budget` help/usage text.
- Confirmed default interactive budget remains off via `budgetRef` initialized as `undefined`.
- Added tests for explicit budget modes and preset ordering.

Checks:
- `npm test -- src/commands/index.test.ts src/tools/types.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed.
- `npm pack --dry-run`: passed.

Final test result:
- 24 test files passed.
- 143 tests passed.

Pack dry-run:
- Package `@serjm/deepseek-code@0.4.4`.
- Filename `serjm-deepseek-code-0.4.4.tgz`.
- Package size 205.3 kB, unpacked size 965.6 kB, total files 221.

Temp-file check:
- No known smoke/test junk files found in repository file list.

Next:
- Start Iteration 7: `Large Project Exam`.
