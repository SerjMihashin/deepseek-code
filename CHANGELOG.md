# Changelog

## 0.4.8 — Browser Perception (unreleased)

### Added
- **The browser tool can now "see" without vision.** Two perception actions give the agent a structured, text view of a page instead of a screenshot it cannot read:
  - `observe` — page summary: title, element counts (headings/links/buttons/inputs/images/forms), top headings, landmarks, and an explicit **empty/blank-page check** (catches "the UI did not render").
  - `dom` — a list of the visible interactive elements with their role/label and a ready-to-use selector.
- **Click/fill by visible text — no CSS selector needed.** `click`/`fill` accept `targetText` (+ optional `role`), with `near` to disambiguate duplicate controls (e.g. the `Select` button near `Site types`). Ported from the chrome-cli-tools approach.
- **Inline diff for edits.** `write_file` and `edit` now show a compact coloured `+`/`-` line diff right in the tool activity card, so you can see exactly what changed instead of just "wrote N bytes". Large changes are summarised.
- **Matrix theme startup intro.** With the `matrix` theme active, launch plays a one-time full-screen all-green digital-rain intro that pours down and drains away (press any key to skip), then hands off to a calm interface. The old always-on welcome rain (which jittered and disrupted typing) was removed — the rain is now only the intro.
- **`/cost`** — a focused view of the session's token usage and estimated cost (a slice of `/stats`).

### Changed
- **Slash-command cleanup.** Audited the command registry and trimmed it from 33 to 28 live commands with no loss of function:
  - Removed dead/underdeveloped commands: `/loop` (its scheduler was never wired to run the agent), `/followup` (canned regex suggestions), `/plan` (a one-line stub).
  - Turned redundant twins into real aliases (no longer clutter help/autocomplete): `/compress` → `/compact`, `/language` → `/lang`, `/capabilities` → `/tools` (the tools view absorbed the extra "additional capabilities" section).
  - `/sandbox` is now labelled "unavailable on Windows"; command descriptions have a single source of truth (removed the drift-prone parallel Russian description table).

### Fixed
- **The selected theme is now saved and restored.** `/theme <name>` and the theme picker persist the choice to config, and the saved theme is applied on the next launch (previously the theme reset every restart, and the Matrix intro never triggered because the theme wasn't active at first render).
- The DEEPSEEK logo now follows the active theme's accent colour (green in Matrix) instead of a hardcoded blue.

## 0.4.7 — Project & Global Memory, Manual Compaction

### Added
- **Memory loaded into context (project + global), like `CLAUDE.md` / `AGENTS.md`.** The agent now actually remembers notes across sessions. On every run dsc loads and injects a `## Memory` section built from:
  - **Global** `~/.deepseek-code/DEEPSEEK.md` — applies to every project.
  - **Project** `DEEPSEEK.md` / `DEEPSEEK.local.md`, walking up to the git root, plus `AGENTS.md` and `CLAUDE.md` for compatibility with repos already set up for Codex/Claude.
  - Saved `/remember` notes (which were previously written but never read back — now they are visible to the agent).
- **`#note` / `##note` quick-capture.** Type `#text` to append a note to project memory, `##text` for global memory. Not sent to the model — saved to the relevant `DEEPSEEK.md` so it loads into every future session.
- **`/init`** — scaffold a `DEEPSEEK.md` for the current project from detected facts (stack, package-manager, build/test/lint commands from `package.json`, top-level structure). Deterministic — no model call, no invented details; you fill in the conventions. `/init force` regenerates over an existing file.
- **`/compact`** — manually compact the chat history (alias `/compress`). Compaction now keeps the original task verbatim and the recent tail instead of collapsing to a lone summary.
- **Plan Mode now behaves like a planner.** In the read-only plan mode (Tab to cycle) the agent is instructed to investigate, then present one concrete step-by-step plan (files, commands, verification, risks) and stop — instead of trying blocked edits. Approve by switching to an execute mode.

### Fixed
- **Dependency installs and builds no longer time out at 120s.** `npm/pnpm/yarn/bun install` (and `run build`, framework builds) get a 600s default timeout, so a slow real-project install no longer fails and sends the agent thrashing (delete `node_modules`, reinstall, repeat). Explicit `timeout` still overrides.

### Changed
- **`--continue` / `-c` now restores the actual conversation.** The full transcript is persisted after each turn and reloaded on continue, so the next request keeps the prior context (previously only the session id was reused — history was lost).
- **Auto-compaction is OFF by default.** Compaction is now a manual action (`/compact`). A hard safety net still compacts automatically only when the context is about to overflow the model window (≥92%), so a single huge turn cannot fail with a context-length 400.
- **`/memory`** now shows the memory files loaded into context (with paths and which exist) plus saved `/remember` notes, instead of only listing the fact store.

## 0.4.6 — Real-Project Agent Hardening

Stabilization driven by running the agent on real, large Windows projects.

### Fixed
- **Windows shell is now consistent.** All commands run through one resolved shell — Windows PowerShell by default, with a cmd.exe fallback when PowerShell is unavailable (`DEEPSEEK_CODE_SHELL` overrides). This ends the "wrote PowerShell, ran under cmd.exe" failures that produced junk like a literal `$null` file, and the system prompt now states the exact active dialect so the agent stops brute-forcing command variants.
- **Image content no longer bricks the session.** The DeepSeek API accepts only text; a single `image_url` block in history made every later request fail with `400 unknown variant image_url`. All message content is now flattened to text before sending; image paste is a no-op with a notice; `read_file` returns metadata for binary images (and SVG source / extracted PDF text) instead of inlining base64.
- **Correct context window and pricing.** The context window is the real **1M tokens** for V4 models (was hardcoded 128k), so auto-compaction no longer fires ~8× too early; cost/token accounting verified against the official pricing page.
- **Auto-compaction keeps the original task and recent messages** instead of collapsing history to a lone summary (a driver of the agent "remembering" planned work as done).
- **Browser reuses a single tab** by default instead of opening a new tab per navigation; screenshots are saved for the user and clearly flagged as non-viewable by the model (verify via DOM/`eval`/console).

### Added
- **Background processes** for `run_shell_command` (`background`, `wait_for_port`, `stop_pid`): start a dev/preview server without hanging, wait for its port, then stop it (whole process tree). Orphans are killed on exit.
- **Verified-state ledger**: a tool-derived summary of what was actually done (files changed, ok/failed counts) is injected at follow-ups and after compaction, plus a rule that an iteration counts as done only if this run contains its tool calls — guarding against narrating un-done work.
- Honest-reporting rules: separate the final check result from earlier failed attempts; "could not run X" is reported as Not checked, not as a project defect.
- MCP: connected MCP tools are callable by the agent; shared-hub project_id auto-derived from cwd; dsc identity stamped on hub writes.

### Changed
- **Ctrl+C** now exits only on a double press (with a hint on the first) and never aborts the running agent — aborting was what dropped the process to the shell on Windows. To steer the agent mid-run, type a follow-up (it is queued into the active run).

### Known Issues
- The agent does not always reach for `background:true` on the first try for a dev server (it may run it blocking once and hit a timeout before recovering).
- This model has no vision: screenshots are saved for the user but verified by the agent via DOM/console, not visually.

## 0.4.5 — TUI Stabilization, Multimodal & Pipeline

### Added
- **Tool-call activity in history** — finished tool batches are committed to the scrollback as a readable per-call list (`✓`/`✗` + tool + file/command + duration), so you can see exactly what the agent did.
- **Crash guard** — stray runtime errors are recorded to `~/.deepseek-code/crash.log` instead of dropping you back to the shell mid-session.
- `read_file` now supports images (PNG, JPG, GIF, WEBP, SVG, BMP) — reads as binary, encodes to base64 data URL.
- `read_file` now supports Jupyter notebooks (`.ipynb`) — parses JSON, extracts code and markdown cells.
- `read_file` now supports PDF files — naive text extraction + base64 data URL as fallback.
- `dataUrlsToContentBlocks()` utility in API layer converts data: URLs to `ContentBlock[]` for multimodal messages.
- `npm run check` pipeline: lint → typecheck → build → test in one command.
- **Big Paste Preview** — dialog shown when pasting >500 chars, displaying char/line count with Enter to confirm or Esc to cancel.
- **Follow-up Queue Indicator** — StatusBar shows `[F:1]` badge when follow-up messages are queued during agent run, cleared on new message send.

### Changed
- **Chat history now renders through Ink `<Static>`** — finalized messages are printed once to the terminal scrollback. This eliminates the full-screen redraw flicker and enables native mouse-wheel scrolling. The in-app PageUp/PageDown windowing was removed in favor of the terminal's own scrollback.
- **Shell commands run asynchronously** — `run_shell_command` now uses `spawn` instead of blocking `execSync`, so long commands (installs, builds, tests) no longer freeze the UI and can be cancelled. Cancellation/timeout kills the whole process tree (`taskkill /t` on Windows, process-group on POSIX).
- Cancellation signal is now plumbed to every tool.
- `buildMessages()` in API layer now properly passes `ContentBlock[]` for multimodal messages (no longer casts to string).
- **Removed `deepseek-vl2`** — only `deepseek-v4-pro` and `deepseek-v4-flash` remain; images pass as base64 data URLs in text.

### Fixed
- **Screen flicker on long output is gone** — the live region is now height-bounded (wrap-aware) so Ink never falls back to clearing the whole terminal each frame, which was the cause of both the shaking and the broken scrollback.
- Default model set to `deepseek-v4-pro`; `DEEPSEEK_MODELS` updated to V4-Flash / V4-Pro.
- Removed false vision-model warning on image paste — DeepSeek V4 models receive images as text-embedded data URLs.

### Known Issues
- **Ctrl+C on Windows may still drop to the shell** instead of pausing the agent. Cancellation is now cooperative and the process no longer hard-crashes, but the clean pause-on-interrupt is still under investigation on Windows terminals.
- The new `<Static>` rendering has been validated primarily on **Windows Terminal**; appearance may differ on cmd.exe, the VS Code terminal, macOS, or Linux.
- Switching between `deepseek-v4-pro` and `deepseek-v4-flash` updates the configured model, but the practical difference in responses has not been independently verified.

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
- `mkdir -p` is now rejected on Windows to avoid creating a literal `-p` directory.
- Default interactive agent iteration limit increased from 100 to 200, and max-iteration stops now still emit Execution Summary.
- Added automatic context compaction between agent iterations when the last request approaches the context window limit, with compact progress shown in the TUI status bar.
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
