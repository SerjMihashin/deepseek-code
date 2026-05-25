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

## What Is New In 0.4.4

- More stable TUI streaming with batched output and live follow-up input.
- Slash-command editing fixes for `/model`, Backspace/Delete, Esc, and Ctrl+U.
- Clear `VIEW:FOLLOW` / `VIEW:PAUSED` status for reading long sessions.
- Failed tool call details in Execution Summary.
- Explicit stream timeout errors instead of silent aborts.
- Windows-friendly `grep_search` fallback when `rg` is unavailable.
- Windows shell policy and guardrails for Unix-only commands such as `head`.
- Explicit `/budget normal` and `/budget large` modes; default interactive budget remains off.

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
- **TUI**: live status, streaming response, tool activity, scroll/follow indicators, and keyboard controls.
- **Approval modes**: read-only planning, manual confirmation, auto-edit, or trusted full automation.
- **Browser tools**: Chrome-based checks for rendered UI, console errors, forms, screenshots, and network behavior.
- **Session continuity**: continue previous work and save project facts with `/remember`.
- **Review mode**: use `/review` for bug, regression, and security-oriented code review.
- **Headless mode**: scriptable output via `--headless --json`.
- **Budget modes**: `/budget audit`, `/budget normal`, `/budget large`, `/budget off`.

## Useful Commands

| Command | Description |
|---|---|
| `/help` | Show commands and keyboard controls |
| `/setup` | Configure API key, language, model, and approval mode |
| `/model` | Switch model or open the model picker |
| `/lang` | Switch response language |
| `/remember <text>` | Save project context |
| `/memory` | Show saved memories |
| `/review` | Run AI code review |
| `/checkpoint` / `/restore` | Save or restore git checkpoints |
| `/budget status\|off\|audit\|normal\|large` | Control loop limits explicitly |
| `/chrome` | Manage Chrome mode |
| `/browser-test` | Run browser checks |
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
