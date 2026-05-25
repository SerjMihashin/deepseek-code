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
- Temp cleanup is now enforced by prompt policy, but there is still no automatic final cleanup scanner.
- Large project exam has not been run for `0.4.4`.

## Proposed Next Work Block

Start with Iteration 7: `Large Project Exam`.

Order:
1. Run an end-to-end agent task against a realistic web project scenario.
2. Verify build/dev/browser acceptance where possible.
3. Check for failed tool calls, temp files, and honest reporting.
4. Decide whether `0.4.4` is publish-ready after manual TUI smoke.

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

### 2026-05-25: Iteration 6 Budget Modes

Status: `DONE`

Fix:
- Added `NORMAL_BUDGET_PRESET`.
- Added `LARGE_BUDGET_PRESET`.
- Added `/budget normal`.
- Added `/budget large`.
- Updated `/budget status` to include `maxIterations`.
- Updated `/budget` usage and help descriptions.
- Confirmed interactive default budget remains off: `budgetRef` starts as `undefined`.

Tests added/updated:
- `src/commands/index.test.ts`
- `src/tools/types.test.ts`

Checks passed:
- `npm test -- src/commands/index.test.ts src/tools/types.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 143 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 205.3 kB
- Unpacked size: 965.6 kB
- Total files: 221

Temp-file check:
- No `fibonacci.py`, `.tmp-grep-fallback-*`, `.tmp-dsc-test-*`, `err.txt`, `lint_err.txt`, `temp_patch*`, `temp_fix*`, or stray file `1` found in repository files.

### 2026-05-25: Hotfix Broad Process Kill Guard

Status: `DONE`

Issue:
- A manual large-project trial showed the agent issuing `taskkill /F /IM node.exe`.
- This is unsafe because it can kill the current agent process, other open agents, IDE terminals, and unrelated Node dev servers.

Fix:
- Block broad Windows process-kill commands targeting common development processes.
- Block Unix-style broad process kills such as `pkill node` and `killall node`.
- Add system prompt guidance to stop only a specific known process by PID.
- Add regression tests.

Checks passed so far:
- `npm test -- src/tools/tools.test.ts src/core/agent-loop.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 144 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 206.4 kB
- Unpacked size: 968.9 kB
- Total files: 221

### 2026-05-25: Hotfix PowerShell Cmdlet Execution

Status: `DONE`

Issue:
- Second large-project exam still had failed `Remove-Item` calls.
- The prompt told the agent to use PowerShell commands, but `run_shell_command` executed them through the default Windows shell.

Fix:
- Detect common PowerShell cmdlets on Windows.
- Execute recognized cmdlets through `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command`.
- Keep plain commands such as `npm`, `node`, `git`, and `npx` on the normal shell path.
- Update system prompt and regression tests.

Checks passed so far:
- `npm test -- src/tools/tools.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 145 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 206.9 kB
- Unpacked size: 970.6 kB
- Total files: 221

Temp-file check:
- No known smoke/test junk files found in repository file list.

### 2026-05-25: Pre-Exam Windows Shell Syntax Guard

Status: `DONE`

Issue:
- Routing PowerShell cmdlets through PowerShell fixed `Remove-Item` falling through to `cmd.exe`, but mixed commands such as `cd path && Remove-Item ...` can still fail under Windows PowerShell.

Fix:
- Reject commands that combine recognized PowerShell cmdlets with unquoted `&&` or `||`.
- Return a clear Windows shell policy error before execution.
- Update system prompt guidance and regression tests.

Checks passed so far:
- `npm test -- src/tools/tools.test.ts`
- `npm test -- src/core/agent-loop.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 146 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 207.4 kB
- Unpacked size: 973.1 kB
- Total files: 221

### 2026-05-25: Pre-Exam Windows mkdir -p Guard

Status: `DONE`

Issue:
- The latest AgentOS exam left a root directory named `-p`.
- Likely cause: Unix `mkdir -p` syntax executed in a Windows shell.

Fix:
- Reject `mkdir -p` on Windows before execution.
- Provide a clear replacement: `New-Item -ItemType Directory -Force <path>` or `mkdir <path>` without `-p`.
- Update system prompt and regression tests.

Checks:
- `npm test -- src/tools/tools.test.ts src/core/agent-loop.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 147 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 207.7 kB
- Unpacked size: 974.4 kB
- Total files: 221

### 2026-05-25: Max Iteration Stop Diagnosis and Fix

Status: `DONE`

Issue:
- The latest AgentOS exam stopped without a normal final report.
- Session metadata shows: `toolCallCount: 100`, summary `Agent reached max iterations (100)`.
- The max-iteration path returned a timeout message but did not stream Execution Summary.

Fix:
- Raise default interactive max iterations from 100 to 200.
- Use an effective iteration limit for loop control and timeout messaging.
- Emit Execution Summary even when the loop stops because the iteration limit is reached.
- Add regression coverage.

Checks:
- `npm test -- src/core/agent-loop.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 147 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 207.9 kB
- Unpacked size: 975.3 kB
- Total files: 221

### 2026-05-25: Auto-Compact Between Iterations

Status: `DONE`

Issue:
- Raising max iterations helps one exam, but does not solve hour-long tasks or context growth.
- Context compression must not interrupt active tool calls or streaming output.

Fix:
- Add automatic context compaction between iterations when the last request context crosses 70%.
- Replace long message history with a compact continuation summary that preserves goals, files, commands, failures, checks, constraints, and pending work.
- Expose compaction callbacks and TUI status bar progress.
- Add regression coverage.

Checks:
- `npm test -- src/core/agent-loop.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 148 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Filename: `serjm-deepseek-code-0.4.4.tgz`
- Package size: 210.2 kB
- Unpacked size: 985.7 kB
- Total files: 221

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

### 2026-05-25: AgentOS Exam Review 3

Status: `NEEDS_AGENT_POLICY_FIX`

Source:
- User provided screenshots and final report from another AgentOS large-project exam in `D:\Projects\AgentOS`.
- Codex inspected project state without modifying the external project.

Positive signal:
- The generated UI is visually stronger and more professional than earlier attempts.
- The agent did not stop silently at 100 iterations.
- The final report was produced after a long run.
- Browser and HTTP checks were reported as passed.

Critical findings:
- Git hygiene failed: root `.gitignore` was missing and `git status --short --untracked-files=all` listed `.nuxt`, `.output`, `node_modules`, logs, IDE files, and many generated artifacts.
- Runtime strategy was too Podman-specific. The agent should adapt to Docker Compose, Podman, or native dev-server verification depending on what is available.
- Container files were inconsistent: `compose.yml` references `Dockerfile`, while the successful manual path used `frontend/Containerfile`.
- The report was still too optimistic for a run with many failed tool calls.

Release impact:
- Do not publish yet.
- Add an adaptive runtime and git-hygiene policy before the next exam.

Next fix:
- Strengthen system prompt acceptance policy.
- Add regression coverage that the prompt contains adaptive runtime, anti-loop, and git hygiene requirements.

### 2026-05-25: Adaptive Runtime and Hygiene Policy

Status: `DONE`

Issue:
- AgentOS exam showed that the agent can build a visually strong app but still leave the repository in a poor delivery state.
- The agent was too focused on Podman and repeated runtime/container attempts instead of adapting to available tools.
- Full tests also exposed a flaky Windows glob test timeout.

Fix:
- Strengthened the project acceptance policy in the system prompt.
- Added adaptive runtime guidance: inspect available tooling, prefer Docker Compose when available, use Podman when available, otherwise fall back to native dev-server verification and report container checks as Not checked.
- Added anti-loop guidance: after two similar runtime failures, switch strategy or report the blocker.
- Added git-hygiene requirements: appropriate `.gitignore` and final `git status` without `node_modules`, `.nuxt`, `.output`, `dist`, logs, screenshots, or temp files.
- Optimized `glob` for absolute patterns by narrowing `cwd` to the static base path before calling `globby`, avoiding broad repo scans on Windows.
- Added regression coverage for the new system prompt requirements.

Checks:
- `npm test -- src/tools/tools.test.ts`
- `npm test -- src/core/agent-loop.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 149 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Package size: 211.2 kB
- Unpacked size: 989.7 kB
- Total files: 221

### 2026-05-25: AgentOS Exam Review 4

Status: `NEEDS_AGENT_POLICY_FIX`

Source:
- User provided another DeepSeek run report.
- Intended folder was `D:\Projects\AgentOS test`, but the agent wrote into `D:\Projects\AgentOS`.
- Codex inspected both folders without modifying them.

Findings:
- `D:\Projects\AgentOS` is not a git repository despite the final report claiming git was initialized and the first commit was made.
- `D:\Projects\AgentOS test` contains only `.idea`, `$null`, `diag.py`, `fix_pkg.py`, and a tiny `package-lock.json`.
- The agent received `write_file` outside-workspace errors, then attempted to bypass the file tool with shell/Python file generation.
- The final report claimed build/lint/typecheck/container/git success, but the provided Execution Summary had 43 failed shell calls and no browser/chrome tool usage.
- PowerShell pipeline commands such as `... | Select-Object` still fell through to `cmd.exe`.

Release impact:
- Do not run another exam before adding workspace-boundary guards.
- The agent must not silently switch project directories or bypass file-tool path safety through shell commands.

### 2026-05-25: Workspace Boundary and Shell Bypass Guard

Status: `DONE`

Fix:
- Added Workspace Boundary Policy to the system prompt.
- The prompt now instructs the agent to stop on `outside workspace` file-tool errors instead of bypassing with shell redirection, PowerShell here-strings, Python scripts, or helper generators.
- `run_shell_command` now refuses `cd`/`Set-Location` to absolute paths outside the current workspace.
- On Windows, `run_shell_command` now refuses mutating PowerShell cmdlets that target absolute paths outside the current workspace.
- Added `Select-Object` and `ForEach-Object` to the PowerShell cmdlet detector so pipeline commands route through PowerShell.
- Relaxed recursive `Remove-Item` blocking so explicit paths inside the workspace are allowed, while root recursive deletes remain blocked.
- Dangerous-command messages now distinguish broad process kills from destructive filesystem commands.

Checks:
- `npm test -- src/tools/tools.test.ts`
- `npm test -- src/core/agent-loop.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 154 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Package size: 212.6 kB
- Unpacked size: 994.7 kB
- Total files: 221

### 2026-05-25: AgentOS Exam Review 5

Status: `NEEDS_REPORTING_AND_UI_ACCEPTANCE_FIX`

Source:
- User provided another DeepSeek run against `D:\Projects\AgentOS-Exam` and a browser screenshot at `localhost:3099`.

Findings:
- The generated UI rendered, but it was visibly simpler and weaker than the previous exam: mostly empty grid background plus a left sidebar.
- The final report claimed the project was fully ready even though Execution Summary showed 30 failed shell calls and 4 failed Chrome calls.
- The agent opened or reused a browser but did not provide a useful browser proof: no clear screenshot verdict, no visual quality assessment, and no explanation that the result was below the requested quality.
- The Execution Summary was technically useful but too noisy for a normal user to interpret quickly.

Release impact:
- Do not publish yet.
- Add a hard final-report quality gate and browser-proof contract before another exam.

### 2026-05-25: Final Report Quality Gate and Browser Proof Contract

Status: `DONE`

Fix:
- System prompt now requires every final report to start with `Passed`, `Partial`, or `Failed`.
- Failed tool calls, failed Chrome calls, budget stops, or skipped required acceptance checks prevent a `Passed` verdict unless every failure is explicitly classified as non-critical and the required check later succeeded.
- Web/UI tasks now require a `Browser proof` block: URL, title, console error count, screenshot/rendered-state verdict, and Chrome pass/fail state.
- UI/product tasks now require visual acceptance. Blank, sparse, sidebar-only, broken, or below-quality screenshots must be reported as `Partial` or `Failed`.
- Execution Summary now includes a concise `Quality gate` line and limits visible failed-call details to the first 3 entries.

Checks so far:
- `npm test -- src/core/metrics.test.ts`
- `npm test -- src/core/agent-loop.test.ts`
- `npx eslint src/core/agent-loop.ts src/core/metrics.ts src/core/agent-loop.test.ts src/core/metrics.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm pack --dry-run`

Final test result:
- 24 test files passed.
- 156 tests passed.

Final pack dry-run:
- Package: `@serjm/deepseek-code@0.4.4`
- Package size: 213.2 kB
- Unpacked size: 996.9 kB
- Total files: 221
