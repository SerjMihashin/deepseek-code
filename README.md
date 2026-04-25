# DeepSeek Code

AI-powered CLI agent for software development, powered by DeepSeek API.

Open-source alternative to Qwen Code, Claude Code, OpenAI Codex CLI.

> 📖 Полный отчёт о разработке: [CHANGELOG.md](CHANGELOG.md) (русский)

## Features

### 🤖 AI Agent with Tool Calling (NEW)
DeepSeek Code now works as a **real AI agent** with tool access! Instead of a simple chat wrapper, the AI can:
- 📂 Read files (`read_file`)
- ✏️ Create and edit files (`write_file`, `edit`)
- 🖥️ Run shell commands (`run_shell_command`)
- 🔍 Search files by pattern (`glob`) and content (`grep_search`)
- 🌐 Fetch web pages (`web_fetch`)

The AI decides which tools to use and iteratively completes tasks: read → find → fix → verify.

### 🖥️ Interactive TUI
Full terminal UI powered by Ink (React for terminal): message history, autocomplete, hotkeys, tool call chain display with status icons (⏳ → 🔄 → ✅ / ❌).

### 🔒 Approval Modes
| Mode | Description |
|---|---|
| **Plan** | Read-only — AI shows what it would do |
| **Default** | Asks for confirmation on every action |
| **Auto-Edit** | Auto-approves file edits, asks for commands |
| **YOLO** | No confirmation needed |

Switch with: `Tab`

### 🧠 Memory System
- `/remember <text>` — save to memory
- `/forget <query>` — remove from memory
- `/memory` — list all memories
- Auto-save sessions

### 🔧 Tools (AI-invoked)
- **Read** — read files with offset/limit
- **Write** — create and write files
- **Edit** — search and replace text
- **Bash** — execute shell commands
- **Glob** — find files by pattern
- **Grep** — search file contents (ripgrep)
- **Chrome** — Google Chrome browser automation: open pages, click, fill forms, execute JavaScript, read console, capture network requests, take screenshots (NEW)

### 🔌 Advanced Integrations
- **MCP** (Model Context Protocol) — external tool servers
- **Subagents** — specialized AI agents with isolated context
- **Skills** — modular skills via SKILL.md files
- **Hooks** — Pre/Post handlers for tools
- **LSP** — Language Server Protocol

### 📋 Code Review
- `/review` — multi-step pipeline: linters + AI analysis
- Score 0–100
- Bug, vulnerability, and performance analysis

### 📦 Git Integration
- `/git commit`, `/git branch`, `/git diff`, `/git status`

### 🏖️ Sandbox
- `/sandbox <command>` — isolated execution via Docker
- Automatic fallback to direct execution if Docker unavailable

### ⏰ Scheduler
- `/loop 5m "check build"` — recurring tasks
- `/loop list` — list active tasks
- `/loop clear` — clear all tasks

### 🎨 Themes
- `/theme` — list themes
- `/theme <name>` — switch theme
- Built-in: default, light, dracula, nord, solarized
- Custom: `.deepseek-code/themes/*.json`

### 🌐 Localization
- `/lang` — list languages
- `/lang ru` — switch to Russian
- Supported: English, Русский, 中文

### 🧩 Extensions
- Plugin system via `.deepseek-code/extensions/<name>/package.json`

### 📄 Checkpoints
- `/checkpoint` — save state
- `/restore` — restore from checkpoint

### 🤖 Headless / CI/CD
- `--json` — JSON output with tool call statistics
- `--headless` — no TUI, pipe-friendly, with full tool calling support
- `dsc -p "task" --json` — one-shot prompt with JSON response

## Installation

# Single prompt, then exit
dsc -p "Explain this codebase"

# Prompt then continue interactively
dsc -i "Let's refactor this module"

# Use a specific model
dsc -m deepseek-reasoner

# YOLO mode (auto-approve all actions)
dsc -y

# Continue last session
dsc -c

# JSON mode for CI/CD
dsc -p "Find all bugs" --json

# Set theme on startup
dsc --theme dracula

# Set language on startup
dsc --lang ru
```

## Features

- **Interactive TUI** — Full terminal UI (Ink/React) with chat interface
- **Approval Modes** — Plan, Default, Auto-Edit, YOLO (switch with Tab)
- **File Operations** — Read, write, and edit files
- **Shell Commands** — Execute commands in your terminal
- **Code Search** — Glob and grep for files and content
- **Memory System** — `/remember`, `/forget`, `/memory`, session persistence
- **Checkpoints** — `/checkpoint`, `/restore` (git-based shadow patches)
- **MCP Protocol** — Connect external tool servers via Model Context Protocol
- **Subagents** — Specialized AI agents with isolated context
- **Skills** — Modular skills via SKILL.md files
- **Hooks** — Pre/Post tool hooks (auto-format, lint, etc.)
- **LSP Client** — Go-to-Definition, Find References, Hover
- **Code Review** — `/review` pipeline (linters + AI analysis, score 0–100)
- **Sandbox** — `/sandbox` isolated execution via Docker (with fallback)
- **Git Integration** — `/git commit`, `/git branch`, `/git diff`, `/git status`
- **Scheduler** — `/loop 5m "check build"` recurring tasks
- **Themes** — 5 built-in themes (default, light, dracula, nord, solarized) + custom
- **i18n** — English, Русский, 中文 (switch via `/lang` or `--lang`)
- **Extensions** — Plugin system via `.deepseek-code/extensions/<name>/package.json`
- **Headless / CI/CD** — `--json` and `--headless` flags for pipelines
- **Slash Commands** — `/help`, `/clear`, `/quit`, `/model`, `/plan`, `/compress`, `/stats`, `/followup`

## Slash Commands

| Command | Description |
|---|---|
| `/help`, `/?` | Show help |
| `/clear` | Clear chat |
| `/quit`, `/exit` | Exit |
| `/model <name>` | Switch model |
| `/plan` | Plan mode |
| `/remember <text>` | Save to memory |
| `/forget <query>` | Remove from memory |
| `/memory` | List memories |
| `/compress` | Compress context |
| `/checkpoint` | Create checkpoint |
| `/restore [id]` | Restore checkpoint |
| `/mcp` | MCP servers & tools |
| `/skills [name]` | Skills |
| `/agents` | Subagents |
| `/review` | Code review |
| `/sandbox <cmd>` | Isolated execution |
| `/git <cmd>` | Git operations |
| `/loop <interval> <task>` | Scheduler |
| `/theme [name]` | Themes |
| `/lang [code]` | Language |
| `/extensions` | Extensions |
| `/followup` | Suggestions |
| `/stats` | Session stats |

## Configuration

Configuration is loaded from (in order of priority):
1. Environment variables (`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`)
2. Project config: `.deepseek-code/settings.json`
3. User config: `~/.deepseek-code/settings.json`
4. Defaults

### Example settings.json

```json
{
  "apiKey": "sk-...",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "approvalMode": "default",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

## Project Structure

```
src/
  cli/          — Entry point, Commander CLI, headless mode
  core/         — Memory, sessions, checkpoints, MCP, subagents, skills,
                  hooks, LSP, themes, i18n, extensions, review, sandbox,
                  git integration, scheduler
  config/       — Config loader, defaults
  api/          — DeepSeek API client
  tools/        — Tools (Read, Write, Edit, Bash, Glob, Grep)
  ui/           — Ink/React components
  utils/        — Logger, .deepseekignore
```

## License

Apache-2.0
