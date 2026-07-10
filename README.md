<div align="center">
  <br/>
  <h1>DeepSeek Code</h1>
  <p><strong>A terminal AI coding agent for real repository work, powered by the DeepSeek API.</strong></p>

  <p>
    <a href="https://github.com/SerjMihashin/deepseek-code/blob/master/LICENSE">
      <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License"/>
    </a>
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/Node-%3E%3D20-green" alt="Node >= 20"/>
    <img src="https://img.shields.io/badge/DeepSeek-API-orange" alt="DeepSeek API"/>
    <img src="https://img.shields.io/badge/status-active_development-yellow" alt="Status"/>
  </p>

  <p>
    <b>English</b> · <a href="README.ru.md">Русский</a>
  </p>
  <br/>
</div>

DeepSeek Code (`dsc`) is an open-source CLI/TUI agent that helps you work inside an existing codebase: inspect files, plan changes, edit code, run checks, use Chrome for web flows, and produce an honest execution summary.

It is designed for developers who want an agent in the terminal, not a black-box cloud workspace. The project is actively evolving toward a stable, practical coding assistant for large repositories.

## Why Developers Use It

| Need | What DeepSeek Code provides |
|---|---|
| Work from the terminal | TUI with streaming output, tool activity, status, token/cost info, and keyboard navigation |
| Keep control | Plan, Default, Auto-Edit, and Turbo approval modes |
| Use real project context | Reads/searches repository files, edits focused ranges, runs build/test commands |
| Debug web projects | Chrome automation for pages, forms, console, network state, and screenshots |
| Avoid hidden failures | Execution Summary reports tool calls, changed files, failed commands, and verification gaps |
| Keep costs flexible | Uses your own DeepSeek API key instead of a fixed coding subscription |

## Install

```bash
npm install -g @serjm/deepseek-code
```

Run in a project:

```bash
dsc
```

One-shot and headless runs:

```bash
dsc -p "Find why tests are failing and propose a fix"
dsc --headless --json -p "Review this repository for risky changes"
npx @serjm/deepseek-code
```

Requires Node.js 20+ and a DeepSeek API key.

## What Is New In 0.5.0

- **Real subagents (`run_agent`).** The agent delegates self-contained subtasks to nested agents with their own fresh context, restricted tools and budget — big explorations no longer flood the main context, and verification passes are independent. Named agents live in `.deepseek-code/agents/*.md` (`/agents`).
- **Hooks that actually work.** `PreToolUse`/`PostToolUse` fire around every tool call, async execution, global + project `hooks.json`. A `blocking` PreToolUse hook can veto a tool call; an `addOutput` PostToolUse hook feeds its stdout back to the model — e.g. auto-lint after every edit (`/hooks`).
- **`@`-file mentions.** Type `@` for a live, gitignore-aware file picker; Tab/Enter inserts the path.
- **Windows desktop automation (`windows_ui`).** Any accessible desktop app (Explorer, Photoshop, ...) becomes a text tree of named elements via UI Automation — the agent inspects windows, clicks buttons/menus by name, fills fields and sends keys. No vision, no dependencies.
- **Subagent swarm**: several `run_agent` calls in one message run in parallel — wide codebase research at the wall-clock cost of the slowest branch.
- **Skills that run.** SKILL.md procedures are listed in the system prompt and `/skills <name>` executes them as tasks (previously they were parsed and ignored).
- **`/doctor`** — environment diagnostics (Node, shell, git, API key, Chrome, UIA) with a verdict; **completion bell** after runs longer than 20s.
- **Background-process control**: `read_pid`/`list_processes` on `run_shell_command` + `/ps` — read a dev server's logs without killing it.

Earlier (0.4.5–0.4.8): browser perception without vision (`observe`/`dom`, click/fill by visible text), inline coloured diffs, Matrix startup intro, project + global memory (`DEEPSEEK.md`, `/init`), manual compaction, `--continue` transcript restore.

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.

## Typical Workflow

```text
You: "Find why checkout fails after login and fix it"

DeepSeek Code:
  1. Searches the relevant files
  2. Reads the auth and checkout code
  3. Applies a focused patch
  4. Runs approved checks
  5. Reports what changed, what passed, what failed, and what was not checked
```

## Core Features

- **Agent loop**: plan, inspect, edit, verify, and continue.
- **Subagents**: delegate self-contained subtasks to nested agents with fresh context and restricted tools (`run_agent`); several subagents in one message run in parallel. Named agents: `.deepseek-code/agents/*.md` (`/agents new <name>`).
- **TUI**: live status, streaming response, tool activity with inline diffs, `@`-file mentions with autocomplete.
- **Approval modes**: read-only planning, manual confirmation, auto-edit, or trusted full automation.
- **Browser tools**: Chrome-based checks for rendered UI, console errors, forms, and network behavior — with text "perception" (`observe`/`dom`), no vision required.
- **Desktop automation (Windows)**: `windows_ui` exposes any accessible desktop app as a text tree via UI Automation — inspect windows, click buttons/menus by name, fill fields, send keys.
- **Hooks**: your shell commands on agent events (`.deepseek-code/hooks.json`) — block tool calls, auto-lint after edits with output fed back to the model.
- **Skills**: reusable procedures in `.deepseek-code/skills/<name>/SKILL.md`, applied by the agent or run via `/skills <name>`.
- **Memory**: project + global `DEEPSEEK.md` loaded into context; `#`/`##` quick-capture; `/init` scaffolding.
- **Session continuity**: `--continue` restores the transcript; background dev servers survive between checks (`/ps`).
- **Review mode**: use `/review` for bug, regression, and security-oriented code review.
- **Headless mode**: scriptable output via `--headless --json` (hooks and skills load there too).
- **Budget modes**: `/budget audit`, `/budget normal`, `/budget large`, `/budget off`.

## Useful Commands

| Command | Description |
|---|---|
| `/help` | Show commands and keyboard controls |
| `/setup` | Configure API key, language, model, and approval mode |
| `/doctor` | Diagnose environment: Node, shell, git, API key, Chrome, UIA |
| `/model` | Switch model or open the model picker |
| `/lang` | Switch response language |
| `/agents` | Named subagents; `/agents new <name>` scaffolds one |
| `/skills` | List/run skills; `/skills <name> [input]` executes one |
| `/hooks` | Show loaded lifecycle hooks |
| `/remember <text>` | Save project context |
| `/memory` | Show saved memories |
| `/review` | Run AI code review |
| `/checkpoint` / `/restore` | Save or restore git checkpoints |
| `/budget status\|off\|audit\|normal\|large` | Control loop limits explicitly |
| `/chrome` | Manage Chrome mode |
| `/browser-test` | Run browser checks |
| `/ps` | List/stop background processes (dev servers) |
| `/stats` | Show tokens, cost, and session statistics |
| `/changelog` | Read release notes inside the CLI |

Keyboard highlights:

- `PageUp` / `PageDown`: read chat history.
- `End`: jump back to the latest message.
- `Shift+Enter` / `Alt+Enter`: insert a newline.
- Mouse wheel is not captured in the TUI yet; this is intentional while terminal mouse support is being hardened.

## Configuration

Use environment variables:

```bash
export DEEPSEEK_API_KEY="sk-..."
export DEEPSEEK_MODEL="deepseek-chat"
```

Or create `.deepseek-code/settings.json` in your project:

```json
{
  "apiKey": "sk-...",
  "model": "deepseek-chat",
  "approvalMode": "default",
  "temperature": 0.7
}
```

## Safety Model

DeepSeek Code is built around explicit control:

- **Plan**: read-only analysis.
- **Default**: asks before edits and shell commands.
- **Auto-Edit**: edits files automatically; shell commands still need confirmation.
- **Turbo**: full automation for trusted local work.

The agent also uses path checks, dangerous command blocking, file size limits, `.deepseekignore`, checkpoints, optional sandboxing, Windows shell guidance, and honest final reporting.

## Project Status

DeepSeek Code is in active development. The current focus is stability for real development work: large repositories, transparent tool activity, reliable input, honest summaries, Windows-first ergonomics, and release-quality packaging.

Planned work includes deeper TUI hardening, safer mouse-wheel research, larger project exams, and stronger acceptance workflows for browser-based projects.

## Development

```bash
git clone https://github.com/SerjMihashin/deepseek-code.git
cd deepseek-code
npm install
npm run lint
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

## License

Apache-2.0 © 2026 Serj Mikhashin
