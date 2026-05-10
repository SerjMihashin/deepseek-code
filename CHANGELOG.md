# Changelog

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
