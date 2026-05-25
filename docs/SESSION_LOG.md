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

### 2026-05-25: Hotfix Broad Process Kill Guard

Status: `DONE`

Reason:
- Manual large-project trial showed the agent ran `taskkill /F /IM node.exe`.
- That command can terminate the running `dsc` agent, other agent sessions, IDE terminals, and unrelated Node dev servers.

Done:
- Added dangerous-command patterns for broad `taskkill`, `Stop-Process -Name node`, `pkill node`, and `killall node` style commands.
- Added a clearer blocked-command error explaining to stop only a known specific PID/process.
- Added system prompt guidance forbidding broad process-kill commands.
- Added regression tests in `src/tools/tools.test.ts`.

Checks:
- `npm test -- src/tools/tools.test.ts src/core/agent-loop.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed.
- `npm pack --dry-run`: passed.

Next:
- Commit the hotfix.

### 2026-05-26: Session Handoff Prepared

Status: `DONE`

Reason:
- User asked to finish the current work session and start the next session from a clear file/checkpoint.

Done:
- Added `docs/NEXT_SESSION.md` with the current release state, completed stabilization blocks, explicit "do not do yet" constraints, and the recommended first steps for the next session.
- Updated stabilization memory so the next session starts with the quality-gate iteration already completed.

Next:
- Commit this handoff.
- Next session should start by reading `docs/NEXT_SESSION.md`, checking `git status --short`, and running the next clean Large Project Exam.

### 2026-05-25: Final Report Quality Gate and Browser Proof Contract

Status: `DONE`

Reason:
- The latest AgentOS exam produced a visibly weaker UI while the final report still claimed the project was complete.
- Execution Summary showed many failed tool calls and failed Chrome calls, but the user-facing report was too optimistic and hard to parse.
- For UI projects, HTTP 200/build success is not enough; the agent must prove rendered quality with browser evidence.

Done:
- Added a mandatory final-report quality verdict: `Passed`, `Partial`, or `Failed`.
- The system prompt now forbids `Passed` when failed tool calls, failed Chrome calls, budget stops, or skipped required checks are present unless every failure is explicitly non-critical and the required check later succeeded.
- Added a required `Browser proof` block for web/UI work: URL, page title, console error count, screenshot/rendered-state verdict, and Chrome pass/fail state.
- Added visual acceptance policy: blank, sparse, sidebar-only, broken, or below-quality UI must be reported as `Partial`/`Failed`, not complete.
- Execution Summary now includes a concise `Quality gate` line before the tool breakdown.
- Failed tool detail output was reduced from first 5 to first 3 entries to make the summary easier to read while preserving the total failed-call count.
- Added regression tests for the prompt contract, compact failed-call summary, and Chrome failure highlighting.

Checks:
- `npm test -- src/core/metrics.test.ts`: passed, 6 tests.
- `npm test -- src/core/agent-loop.test.ts`: passed, 22 tests.
- `npx eslint src/core/agent-loop.ts src/core/metrics.ts src/core/agent-loop.test.ts src/core/metrics.test.ts`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed, 24 files / 156 tests.
- `npm pack --dry-run`: passed, package size 213.2 kB, unpacked size 996.9 kB, 221 files.
- Temp-file check: no known smoke/test junk files found.

Next:
- Commit the iteration.
- Run the next AgentOS exam from a clean intended workspace.

### 2026-05-25: Pre-Exam Windows Shell Syntax Guard

Status: `DONE`

Reason:
- After PowerShell cmdlets were routed through PowerShell, one remaining risk was mixed syntax such as `cd path && Remove-Item ...`.
- Windows PowerShell 5 can reject `&&`, while `cmd.exe` cannot run `Remove-Item`.

Done:
- Added a guard for commands that combine recognized PowerShell cmdlets with unquoted `&&` or `||`.
- The shell tool now returns a clear Windows shell policy error instead of executing the incompatible command.
- Updated the system prompt to prefer separate tool calls or `Set-Location path; Remove-Item ...` with explicit checks.
- Added regression coverage for `cd ... && Remove-Item ...`.

Checks:
- `npm test -- src/tools/tools.test.ts`: passed, 31 tests.
- `npm test -- src/core/agent-loop.test.ts`: passed, 18 tests.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed, 24 files / 146 tests.
- `npm pack --dry-run`: passed, package size 207.4 kB, unpacked size 973.1 kB, 221 files.

Next:
- Commit the pre-exam guard if approved, then run the next large-project exam.

### 2026-05-25: Pre-Exam Windows mkdir -p Guard

Status: `DONE`

Reason:
- The latest AgentOS exam left a root directory named `-p`.
- This is consistent with running Unix syntax `mkdir -p ...` in a Windows shell.

Done:
- Added a Windows shell policy guard that rejects `mkdir -p` before execution.
- Error message explains that Windows can create a literal `-p` directory and suggests `New-Item -ItemType Directory -Force <path>` or `mkdir <path>` without `-p`.
- Updated the system prompt and changelog.
- Added regression coverage.

Checks:
- `npm test -- src/tools/tools.test.ts src/core/agent-loop.test.ts`: passed, 2 files / 50 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed, 24 files / 147 tests.
- `npm pack --dry-run`: passed after build, package size 207.7 kB, unpacked size 974.4 kB, 221 files.

Next:
- Commit the guard.

### 2026-05-25: Max Iteration Stop Diagnosis and Fix

Status: `DONE`

Reason:
- Latest AgentOS exam did not end with a normal final report.
- Saved session metadata confirmed the agent stopped because it reached `maxIterations` with `toolCallCount: 100`.
- Code review showed the max-iteration path finalized the session but did not stream Execution Summary.

Done:
- Increased the default interactive agent iteration limit from 100 to 200.
- Added an effective iteration-limit helper so the timeout message reports the actual active limit, including budget overrides.
- Max-iteration stops now finalize the session and emit Execution Summary.
- Added regression coverage that max-iteration stop streams Execution Summary.

Checks:
- `npm test -- src/core/agent-loop.test.ts`: passed, 18 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed, 24 files / 147 tests.
- `npm pack --dry-run`: passed, package size 207.9 kB, unpacked size 975.3 kB, 221 files.

Next:
- Commit the fix.

### 2026-05-25: Auto-Compact Between Iterations

Status: `DONE`

Reason:
- Static iteration limits are not enough for long-running coding tasks.
- Large tasks need context management that happens between iterations, not during tool execution or streaming.

Done:
- Added automatic context compaction in `AgentLoop`.
- Auto-compact triggers between iterations when the last request context reaches the configured threshold.
- Default threshold is 70% of the 128k context window, with safeguards against compacting tiny histories repeatedly.
- Compaction summarizes user goals, decisions, files, commands, failures, verification results, constraints, and pending work.
- TUI status bar now shows compact progress while compaction is running.
- Added regression coverage for auto-compact.

Checks:
- `npm test -- src/core/agent-loop.test.ts`: passed, 19 tests.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed, 24 files / 148 tests.
- `npm pack --dry-run`: passed, package size 210.2 kB, unpacked size 985.7 kB, 221 files.

Next:
- Commit the auto-compact iteration.

### 2026-05-25: Adaptive Runtime and Hygiene Policy

Status: `DONE`

Reason:
- Latest AgentOS exam produced a much better UI, but repository delivery quality was still not release-grade.
- `D:\Projects\AgentOS` had no root `.gitignore`, and git status exposed `.nuxt`, `.output`, `node_modules`, logs, IDE files, and generated artifacts.
- The agent over-focused on Podman/container attempts instead of adapting to Docker Compose, Podman, or native dev-server verification.
- Full `npm test` also exposed the Windows glob test timeout again.

Done:
- Added future desktop-app connector backlog to the stabilization TZ.
- Strengthened system prompt project acceptance policy:
  - runtime/container verification is adaptive and not Podman-only;
  - inspect available tools and project files before choosing Docker/Podman/native;
  - after two similar runtime failures, switch strategy or report the blocker;
  - require appropriate `.gitignore`;
  - require final git status without `node_modules`, `.nuxt`, `.output`, `dist`, logs, screenshots, or temp files;
  - require compose files to reference the correct Dockerfile/Containerfile.
- Added regression coverage for the new prompt requirements.
- Optimized `glob` absolute-pattern handling by narrowing `cwd` to the static base before calling `globby`.

Checks:
- `npm test -- src/tools/tools.test.ts`: passed, 32 tests.
- `npm test -- src/core/agent-loop.test.ts`: passed, 20 tests.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed, 24 files / 149 tests.
- `npm pack --dry-run`: passed, package size 211.2 kB, unpacked size 989.7 kB, 221 files.
- Temp-file check: no known smoke/test junk files found.

Next:
- Commit this iteration.
- Run the next AgentOS exam with a clean project folder and local 0.4.4 candidate.

### 2026-05-25: Workspace Boundary and Shell Bypass Guard

Status: `DONE`

Reason:
- User ran another AgentOS exam intending to use `D:\Projects\AgentOS test`.
- The agent switched to `D:\Projects\AgentOS` because the old prompt path was still present.
- `write_file` correctly rejected paths outside the workspace, but the agent then used shell/Python generation attempts to bypass the file-tool boundary.
- The final report claimed build/lint/typecheck/container/git success, but `D:\Projects\AgentOS` is not a git repository and `D:\Projects\AgentOS test` contains only junk/helper files.
- PowerShell pipeline cmdlets such as `Select-Object` still fell through to `cmd.exe`.

Done:
- Added Workspace Boundary Policy to `buildSystemPrompt`.
- The prompt now tells the agent to stop on outside-workspace file-tool errors instead of bypassing with shell redirection, PowerShell here-strings, Python scripts, or temporary generator scripts.
- Added shell guard rejecting `cd`/`Set-Location` to absolute paths outside the current workspace.
- Added Windows shell guard rejecting mutating PowerShell cmdlets against absolute paths outside the current workspace.
- Added `Select-Object` and `ForEach-Object` to PowerShell cmdlet routing.
- Refined recursive `Remove-Item` blocking: explicit workspace paths are allowed; root recursive deletes remain blocked.
- Improved dangerous-command error wording so broad process kills and destructive filesystem commands are not conflated.
- Added regression tests.

Checks:
- `npm test -- src/tools/tools.test.ts`: passed, 36 tests.
- `npm test -- src/core/agent-loop.test.ts`: passed, 21 tests.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed, 24 files / 154 tests.
- `npm pack --dry-run`: passed after build, package size 212.6 kB, unpacked size 994.7 kB, 221 files.
- Temp-file check: no known smoke/test junk files found.

Note:
- A parallel `npm pack --dry-run` run during build produced an invalid 5-file pack report because build was cleaning `dist` concurrently. This was a check-run ordering issue, not package state. Pack was rerun after build and passed with the expected 221 files.

Next:
- Commit this iteration.
- For the next exam, run the local built candidate from inside the intended clean project folder and avoid old absolute paths in the user prompt.

### 2026-05-25: Hotfix PowerShell Cmdlet Execution

Status: `DONE`

Reason:
- Second large-project exam still showed failed `Remove-Item` calls.
- Root cause: the agent was instructed to use PowerShell cmdlets, but `run_shell_command` executed commands through the default Windows shell, so cmdlets fell through to `cmd.exe`.

Done:
- Added detection for common PowerShell cmdlets in `run_shell_command`.
- On Windows, recognized cmdlets now execute via `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command`.
- Plain commands such as `npm`, `node`, `git`, and `npx` still run normally.
- Updated the system prompt to describe this behavior.
- Added regression coverage for `Write-Output`.

Checks:
- `npm test -- src/tools/tools.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed, 24 files / 145 tests.
- `npm pack --dry-run`: passed, package size 206.9 kB, unpacked size 970.6 kB, 221 files.
- Temp-file check: no known smoke/test junk files found.

Next:
- Commit the hotfix.
