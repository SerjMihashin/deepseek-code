# Changelog

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
