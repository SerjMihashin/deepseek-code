<div align="center">
  <br/>
  <h1>DeepSeek Code</h1>
  <p><strong>Open-source AI coding agent for developers who want a fast terminal workflow without Copilot pricing.</strong></p>

  <p>
    <a href="https://github.com/SerjMihashin/deepseek-code/blob/master/LICENSE">
      <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License"/>
    </a>
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/DeepSeek-API-orange" alt="DeepSeek"/>
    <img src="https://img.shields.io/badge/status-alpha-yellow" alt="Status"/>
  </p>

  <p>
    <b>English</b> · <a href="README.ru.md">Русский</a>
  </p>
  <br/>
</div>

---

## The Short Version

DeepSeek Code is a terminal-first AI coding agent. It reads your project, edits files, runs commands, reviews code, remembers context, and can automate Chrome when a task needs a browser.

It is built for developers who want a practical local workflow:

- **Lower cost**: use DeepSeek API directly instead of a fixed monthly coding subscription.
- **Real project work**: inspect files, patch code, run tests, and continue from previous sessions.
- **Terminal-native**: no IDE lock-in, no heavy desktop app, no cloud workspace requirement.
- **User-controlled automation**: choose read-only planning, manual approvals, auto-edit, or full turbo mode.

---

## Install

```bash
npm install -g @serjm/deepseek-code
```

Run it:

```bash
deepseek-code
```

Or run without installing:

```bash
npx @serjm/deepseek-code
```

Short alias:

```bash
dsc
dsc -p "Find the bug in auth.ts and patch it"
dsc --headless --json -p "Review this repository"
```

---

## Why Use It

| Need | DeepSeek Code |
|---|---|
| Fix code from the terminal | Reads files, proposes patches, and runs verification commands |
| Keep costs predictable | Uses your DeepSeek API key directly |
| Work inside existing repos | Runs where your code already lives |
| Avoid blind automation | Approval modes keep edits and shell commands under your control |
| Debug browser flows | Built-in Chrome automation for pages, forms, console, screenshots, and network state |
| Keep context over time | Project memory and resumable sessions help with longer work |

---

## What It Can Do

```text
You: "Find why checkout fails after login and fix it"

DeepSeek Code:
  1. Searches the relevant files
  2. Reads the auth and checkout code
  3. Applies a focused patch
  4. Runs tests or the command you approve
  5. Summarizes the change
```

Core features:

- **Autonomous coding agent**: plans, reads, edits, searches, and runs commands.
- **Full terminal UI**: streaming output, tool activity, status, costs, and context usage.
- **Approval modes**: Plan, Default, Auto-Edit, and Turbo.
- **Browser automation**: open pages, click, fill forms, inspect console/network, take screenshots.
- **MCP support**: connect external tool servers for custom workflows.
- **Persistent memory**: save project facts with `/remember`.
- **AI code review**: use `/review` to inspect bugs, risks, and security issues.
- **Headless mode**: CI-friendly JSON output with `--headless --json`.

---

## Commands

| Command | Description |
|---|---|
| `/help` | Show available commands |
| `/setup` | Configure API key, language, and approval mode |
| `/remember <text>` | Save project context |
| `/memory` | Show saved memories |
| `/review` | Run AI code review |
| `/checkpoint` | Save a git checkpoint |
| `/restore` | Restore a checkpoint |
| `/theme` | Switch terminal theme |
| `/lang` | Switch language |
| `/git <cmd>` | Run git operations |
| `/loop <interval> <task>` | Schedule recurring work |
| `/sandbox` | Run commands in Docker isolation |
| `/mcp` | Manage MCP servers |
| `/stats` | Show session statistics |
| `/clear` | Clear chat |

---

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

---

## Safety Model

DeepSeek Code is designed around explicit control:

- **Plan**: read-only analysis.
- **Default**: asks before edits and commands.
- **Auto-Edit**: file edits are automatic, shell commands still need approval.
- **Turbo**: full automation for trusted local work.

It also supports command sanitization, file size limits, `.deepseekignore`, checkpoints, and optional Docker sandboxing.

---

## Development

```bash
git clone https://github.com/SerjMihashin/deepseek-code.git
cd deepseek-code
npm install
npm run build
npm test
```

Package check:

```bash
npm pack --dry-run
npm publish --dry-run --access public
```

Publish to npm:

```bash
npm login
npm publish --access public
```

If npm asks for two-factor authentication:

```bash
npm publish --access public --otp=123456
```

---

## License

Apache-2.0 © 2026 Serj Mikhashin
