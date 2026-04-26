<div align="center">
  <br/>
  <h1>🦊 DeepSeek Code</h1>
  <p><strong>AI-powered CLI agent for software development</strong></p>
  <p>Read code · Edit files · Run commands · Search · Automate browser</p>

  <p>
    <a href="https://github.com/SerjMikhashin/deepseek-code/blob/master/LICENSE">
      <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License"/>
    </a>
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build"/>
    <img src="https://img.shields.io/badge/status-alpha-yellow" alt="Status"/>
  </p>

  <p>
    <b>English</b> · <a href="README.ru.md">Русский</a>
  </p>

  <br/>
</div>

---

**DeepSeek Code** — open-source AI coding agent that runs in your terminal.  
It understands your project, reads and edits files, runs shell commands, searches code, and even automates Chrome — all through natural conversation.

Think of it as an AI pair programmer that lives in your terminal.

---

## ✨ Features

| | |
|---|---|
| 🧠 **AI Agent with Tools** | Reads files, writes code, runs commands, searches — the AI decides what to do |
| 🖥️ **Beautiful TUI** | Full terminal UI with chat, autocomplete, tool call chain, spinner animations |
| 🔒 **Approval Modes** | Plan → Default → Auto-Edit → YOLO — you choose the level of control |
| 🌐 **Chrome Automation** | Open pages, click, fill forms, take screenshots, read console — all from chat |
| 🧩 **MCP Protocol** | Connect external tool servers (filesystem, database, etc.) |
| 🧠 **Memory System** | `/remember` — AI remembers what you teach it across sessions |
| 📋 **Code Review** | `/review` — AI analyzes your code for bugs, vulnerabilities, performance |
| 🎨 **Themes** | 5 built-in themes (default, light, dracula, nord, solarized) + custom |
| 🌍 **i18n** | English, Русский, 中文 — switch with `/lang` |
| 📦 **Git Integration** | `/git commit`, `/git diff`, `/git status` — from within the chat |
| ⏰ **Scheduler** | `/loop 5m "check build"` — recurring tasks |
| 🏖️ **Sandbox** | `/sandbox` — isolated execution via Docker |
| 🤖 **Headless / CI/CD** | `--json` and `--headless` for pipelines and automation |

## 🚀 Quick Start

### Install

```bash
npm install -g deepseek-code
```

Or run directly:

```bash
npx deepseek-code
```

### First Launch

On first run, DeepSeek Code will guide you through setup:
1. Choose your language (English / Русский / 中文)
2. Enter your DeepSeek API key
3. Start coding!

> Get your API key at [platform.deepseek.com](https://platform.deepseek.com)

### Usage Examples

```bash
# Start interactive session
deepseek-code

# One-shot prompt with JSON output (for CI/CD)
dsc -p "Find all TypeScript type errors" --json

# Headless mode (no TUI, pipe-friendly)
dsc -p "Refactor this module" --headless

# Continue last session
dsc -c

# YOLO mode (auto-approve all actions)
dsc -y

# Set theme on startup
dsc --theme dracula

# Set language on startup
dsc --lang ru
```

## 🎮 How It Works

```
You: "Fix the bug in auth.ts"
        │
        ▼
┌─────────────────────────────────────┐
│  DeepSeek Code (AI Agent)           │
│                                     │
│  Step 1: read_file("auth.ts")       │
│  Step 2: grep_search("bug pattern") │
│  Step 3: edit("auth.ts")            │
│  Step 4: run_shell_command("npm t") │
│                                     │
│  "Bug fixed in auth.ts, tests pass" │
└─────────────────────────────────────┘
        │
        ▼
You: ✅ Bug fixed, tests pass
```

The AI sees your project structure, reads files, searches code, runs commands — and iterates until the task is done.

## ⌨️ Slash Commands

| Command | Description |
|---|---|
| `/help` | Show help |
| `/remember` | Save to AI memory |
| `/forget` | Remove from memory |
| `/memory` | List all memories |
| `/review` | AI code review |
| `/checkpoint` | Save state |
| `/restore` | Restore state |
| `/compress` | Compress context |
| `/git` | Git operations |
| `/loop` | Recurring tasks |
| `/sandbox` | Isolated execution |
| `/theme` | Switch themes |
| `/lang` | Switch language |
| `/mcp` | MCP servers |
| `/skills` | List skills |
| `/agents` | Subagents |
| `/stats` | Session stats |
| `/clear` | Clear chat |
| `/quit` | Exit |

## ⚙️ Configuration

Priority: environment variables → project config → user config → defaults

```bash
export DEEPSEEK_API_KEY="sk-..."
export DEEPSEEK_MODEL="deepseek-chat"
```

Or create `.deepseek-code/settings.json`:

```json
{
  "apiKey": "sk-...",
  "model": "deepseek-chat",
  "approvalMode": "default",
  "temperature": 0.7
}
```

## 📁 Project Structure

```
src/
  cli/       — Entry point, Commander CLI, headless mode
  core/      — Agent loop, memory, sessions, MCP, subagents, themes, i18n
  api/       — DeepSeek API client with function calling
  tools/     — 7 native tools: read, write, edit, bash, glob, grep, chrome
  ui/        — Ink/React components (chat, input, status bar, tool calls)
  config/    — Config loader and defaults
  utils/     — Logger, .deepseekignore
```

## 📚 Documentation

- [SPEC.md](SPEC.md) — Full technical specification
- [CHANGELOG.md](CHANGELOG.md) — Development history (in Russian)
- [CONTRIBUTING.md](CONTRIBUTING.md) — How to contribute
- [ITERATIONS.md](ITERATIONS.md) — Development iterations plan

## 🛡️ Safety

DeepSeek Code includes multiple safety layers:
- **Approval modes** — you choose how much autonomy the AI has
- **Command sanitization** — dangerous shell patterns are blocked
- **File size limits** — write_file capped at 1MB
- **Sandbox mode** — isolated execution via Docker

## 📄 License

Apache-2.0 © 2026 Serj Mikhashin

---

<p align="center">
  <sub>Built with ❤️ and TypeScript · Powered by <a href="https://deepseek.com">DeepSeek API</a></sub>
</p>
