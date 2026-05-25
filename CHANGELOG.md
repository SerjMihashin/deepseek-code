# Changelog

## 0.4.4 — TUI Stability & Release Candidate

### Fixed
- Execution Summary now includes details for failed tool calls: tool name, label, and error.
- Increased Windows glob test timeout to reduce flaky failures on slower Windows runs.
- Fixed CLI argument parsing so `--json` or `--headless` without a prompt no longer treats `node` and the script path as an agent prompt.
- Added a Node fallback for `grep_search` when `rg` is not installed.
- Stream timeouts now surface as explicit errors instead of being hidden as user cancellations.
- Added Windows shell policy guidance and runtime rejection for common Unix-only inspection commands in Windows shells.
- PowerShell cmdlets such as `Remove-Item`, `Get-Content`, and `Select-String` now execute through PowerShell on Windows instead of falling through to `cmd.exe`.
- Commands that mix PowerShell cmdlets with `cmd`/Bash chaining operators such as `&&` are now rejected with a clear Windows shell policy error.
- Blocked broad process-kill commands such as `taskkill /F /IM node.exe` so the agent cannot terminate itself or unrelated Node-based sessions.
- TUI status bar now shows `VIEW:FOLLOW` or `VIEW:PAUSED` with keyboard scroll hints.
- `/help` now explicitly documents that mouse wheel input is not captured in the TUI.
- Added explicit `/budget normal` and `/budget large` modes while keeping the interactive default budget off.
- Stabilized streaming output by batching assistant chunks to reduce TUI rerenders.
- Stabilized slash-command editing, including `/model`, Backspace/Delete, Esc, and Ctrl+U behavior.
- Preserved live follow-up input while the agent is running, so user messages are queued into the active loop instead of being lost.

### Changed
- Added an interactive budget preset for future use, but it is not enabled by default.
- Reverted the restrictive default interactive budget because it stopped real large-project work too early.

### Known Issues
- Mouse wheel support is not enabled in the production TUI.
- History scrolling remains keyboard-first with PageUp, PageDown, and End.
- Large project acceptance testing is still required before publication.

## 0.4.3 — Project Mode & Browser Control

### Improvements
- Improved Chrome browser mode handling.
- `/chrome --headed` and `/chrome --headless` now switch the desired browser mode without launching Chrome.
- Browser checks remain headed by default and open visibly unless headless mode is explicitly selected.
- Browser test reports now show the actual browser mode.

### Agent Quality
- Added Execution Policy to reduce unnecessary reads, repeated tool calls, temporary files, and over-scoped work.
- Added Source of Truth Policy to prevent invented versions, release notes, features, links, dates, and metrics.
- Added Project Acceptance Policy for web/container projects: build alone is not enough; dev server, browser page, error overlay, console, container build, and git hygiene must be checked when relevant.
- Added Failed Tool Calls Policy: failed commands must be reported and classified as critical or non-critical.

## 0.4.2 — Update Visibility Improvements

### New Features
- Added startup update notice that checks npm for a newer version.
- Added 24-hour cooldown to avoid checking npm on every launch.
- Added `/changelog` modes:
  - `/changelog` shows the latest release notes.
  - `/changelog full` shows the full changelog.
  - `/changelog <version>` shows a specific version.

### Reliability
- Update checks run in the background and do not block CLI startup.
- Network/offline errors are handled silently during startup.
- Fixed changelog section parsing on Windows CRLF files.

## 0.4.1 — Update Visibility

### New Features
- Added `/changelog` command to show release notes inside the CLI.
- Added `/update-check` command to check the latest published npm version.

### Improvements
- Updated changelog notes now reflect that `/changelog` and `/update-check` are available.

## 0.4.0 — Stability & UX Release

### New Features
- **Task Budget Guard**: `/budget audit`, `/budget small`, `/budget status`, `/budget off`.
- **Git Files section in Execution Summary**: changed during run, new untracked, dirty before run.
- **Interactive `/lang` picker** with Русский, English, 中文.
- **Runtime language enforcement** based on selected locale.

### Improvements
- **Russian `/help`** output.
- **Honest reports**: tool results now include `changed`/`verified`/`changedFiles` metadata.
- **InputBar Home/End** navigation.
- **Alt+Enter** newline fallback for Windows terminals.
- **Improved multiline paste/cursor editing** stability.

### Notes
- `Shift+Enter` may be indistinguishable from `Enter` in some Windows terminals. Use `Alt+Enter` for a new line.
- `/changelog` and `/update-check` are now available in the CLI.
