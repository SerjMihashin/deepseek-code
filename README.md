<div align="center">
  <br/>
  <h1>🦊 DeepSeek Code</h1>
  <p><strong>Open-source AI coding agent for your terminal — cheaper than Copilot, more powerful than a shell</strong></p>

  <p>
    <a href="https://github.com/SerjMihashin/deepseek-code/blob/master/LICENSE">
      <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License"/>
    </a>
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build"/>
    <img src="https://img.shields.io/badge/DeepSeek-API-orange" alt="DeepSeek"/>
    <img src="https://img.shields.io/badge/status-alpha-yellow" alt="Status"/>
  </p>

  <p>
    <b>English</b> · <a href="README.ru.md">Русский</a>
  </p>
  <br/>
</div>

---

## Why DeepSeek Code?

| | DeepSeek Code | GitHub Copilot | Claude Code |
|---|---|---|---|
| **Cost** | ~$0.001/request | $10–19/month | $20+/month |
| **Runs in terminal** | ✅ | ❌ | ✅ |
| **File editing** | ✅ | ✅ | ✅ |
| **Browser automation** | ✅ | ❌ | ❌ |
| **Open source** | ✅ | ❌ | ❌ |
| **Self-hosted** | ✅ | ❌ | ❌ |

**DeepSeek API costs ~30× less than GPT-4** — run hundreds of coding sessions for the price of one Copilot month.

---

**DeepSeek Code** is an open-source AI coding agent that runs entirely in your terminal.  
It reads your project, edits files, runs commands, searches code, and even automates Chrome — all through natural conversation.

```
You: "Find the memory leak in server.ts and fix it"
  → read_file("server.ts")
  → grep_search("EventEmitter|listener|removeListener")
  → edit("server.ts")   ← shows diff, asks for approval
  → run_shell_command("npm test")
  ✅ "Fixed: EventEmitter listener was never removed in cleanup()"
```

---

## ✨ Features

| | |
|---|---|
| 🧠 **Autonomous Agent** | Reads files, writes code, runs commands, searches — plans and executes multi-step tasks |
| 🖥️ **Beautiful TUI** | Full terminal UI with streaming chat, tool call chain, spinner, syntax highlighting |
| 🔒 **4 Approval Modes** | Plan · Default · Auto-Edit · Turbo — you choose the level of AI autonomy |
| 🌐 **Browser Automation** | Open pages, click, fill forms, screenshot, read console — Chrome built right in |
| 🧩 **MCP Protocol** | Connect external tool servers (filesystem, database, custom tools) |
| 🧠 **Persistent Memory** | `/remember` — AI remembers project context across sessions |
| 📋 **AI Code Review** | `/review` — analyzes your code for bugs, vulnerabilities, performance issues |
| 🎨 **6 Themes** | Default dark · Light · Dracula · Nord · Solarized · Matrix |
| 🌍 **3 Languages** | English · Русский · 中文 |
| 📊 **Token Metrics** | Real-time cost tracking, context usage %, execution timing |
| ⏰ **Scheduler** | `/loop 5m "check build"` — recurring background tasks |
| 🤖 **CI/CD Mode** | `--headless --json` — pipe-friendly output for automation |

---

## 🚀 Quick Start

```bash
# Install globally
npm install -g deepseek-code

# Or run without installing
npx deepseek-code
```

On first run, the setup wizard guides you through:
1. Choose language (English / Русский / 中文)
2. Enter your [DeepSeek API key](https://platform.deepseek.com/api_keys) — free tier available
3. Choose approval mode
4. Start coding

```bash
deepseek-code          # interactive mode
dsc                    # short alias
dsc -p "Fix the bug"   # one-shot prompt
dsc --turbo            # auto-approve all actions (no confirmation)
dsc --headless --json  # CI/CD mode with JSON output
dsc -c                 # continue last session
```

---

## 🔒 Approval Modes

You stay in control. Choose how much autonomy the AI has:

| Mode | Behavior |
|---|---|
| **Plan** | Read-only — AI can search and analyze, no changes |
| **Default** | AI proposes changes, you approve each one |
| **Auto-Edit** | File edits auto-approved, shell commands need approval |
| **Turbo** | Fully autonomous — approves everything automatically |

Switch modes anytime with `Tab` — even while the agent is running.

---

## 🌐 Browser Automation

The browser is a first-class tool, not a plugin:

```
> Open github.com and take a screenshot of the trending repos
> Fill out the login form on my local app at localhost:3000
> Click "Submit" and check the network tab for the API response
> Read the browser console for any JavaScript errors
```

Supports: `open` · `click` · `fill` · `screenshot` · `eval` · `scroll` · `wait` · `network` · `console` · `cookies` · `storage` · and more.

---

## ⌨️ Commands

| Command | Description |
|---|---|
| `/help` | Show all commands |
| `/remember <text>` | Save to AI memory |
| `/forget` | Clear memories |
| `/memory` | List saved memories |
| `/review` | AI code review |
| `/checkpoint` | Save git checkpoint |
| `/restore` | Restore checkpoint |
| `/theme` | Switch UI theme |
| `/lang` | Switch language |
| `/git <cmd>` | Git operations |
| `/loop <interval> <task>` | Recurring tasks |
| `/sandbox` | Docker-isolated execution |
| `/mcp` | Manage MCP servers |
| `/stats` | Session statistics |
| `/clear` | Clear chat |

---

## ⚙️ Configuration

```bash
# Environment variables
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

---

## 📁 Architecture

```
src/
  cli/    — Entry point, Commander CLI, headless mode
  core/   — Agent loop, memory, sessions, MCP, i18n, metrics
  api/    — DeepSeek API client with streaming + function calling
  tools/  — read · write · edit · bash · glob · grep · chrome
  ui/     — Ink/React TUI (chat, input bar, status bar, tool cards)
  config/ — Config loader and defaults
```

---

## 🛡️ Safety

- **Approval modes** — choose how much the AI can do autonomously
- **Command sanitization** — dangerous shell patterns are blocked
- **File size limits** — writes capped at 1MB
- **Sandbox mode** — Docker-isolated execution via `/sandbox`
- **`.deepseekignore`** — exclude sensitive files from AI access

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/SerjMihashin/deepseek-code.git
cd deepseek-code
npm install
npm run dev
```

---

## 📄 License

Apache-2.0 © 2026 Serj Mikhashin

---

<p align="center">
  <sub>Built with ❤️ and TypeScript · Powered by <a href="https://deepseek.com">DeepSeek API</a></sub>
</p>
