# DeepSeek Code

AI-powered CLI agent for software development, powered by DeepSeek API.

## Installation

```bash
npm install -g deepseek-code
```

## Usage

```bash
# Start interactive session
deepseek-code

# Short alias
dsc

# Run a single prompt and exit
dsc -p "Explain this codebase"

# Start with a prompt then continue interactively
dsc -i "Let's refactor this module"

# Use a specific model
dsc -m deepseek-reasoner

# YOLO mode (auto-approve all actions)
dsc -y

# Continue last session
dsc -c
```

## Features

- **Interactive TUI** — Full terminal UI with chat interface
- **Approval Modes** — Plan, Default, Auto-Edit, YOLO
- **File Operations** — Read, write, and edit files
- **Shell Commands** — Execute commands in your terminal
- **Code Search** — Glob and grep for files and content
- **DeepSeek API** — Powered by DeepSeek's powerful models

## Configuration

Configuration is loaded from (in order of priority):
1. Environment variables (`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`)
2. Project config: `.deepseek-code/settings.json`
3. User config: `~/.deepseek-code/settings.json`
4. Defaults

## License

Apache-2.0
