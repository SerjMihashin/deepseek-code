# Contributing to DeepSeek Code

Thank you for your interest in contributing! 🎉

## Development Setup

```bash
# Clone the repository
git clone https://github.com/deepseek-ai/deepseek-code.git
cd deepseek-code

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode
node dist/cli.js
```

## Project Structure

```
src/
├── api/          # DeepSeek API client
├── cli/          # CLI entry points (interactive, headless)
├── config/       # Configuration loading and defaults
├── core/         # Core logic (AgentLoop, memory, MCP, etc.)
├── tools/        # Tool definitions (read, write, edit, bash, etc.)
├── ui/           # TUI components (Ink/React)
└── utils/        # Utilities (logger, ignore)
```

## Coding Standards

- **TypeScript** with strict mode
- **ES modules** (`import`/`export`)
- Follow existing code style (naming, formatting, patterns)
- No `any` types — use proper generics or `unknown`
- Async/await for asynchronous code

## Before Submitting a PR

1. **Build**: `npm run build` — must compile without errors
2. **Lint**: `npm run lint` — must pass
3. **Typecheck**: `npm run typecheck` — must pass
4. **Tests**: Add tests for new functionality
5. **Commit**: Use clear, descriptive commit messages

## Commit Messages

Follow conventional commits:

```
feat: add context-aware system prompt
fix: approval dialog now shows confirmation prompt
refactor: rename tools to snake_case
docs: add CONTRIBUTING.md
test: add unit tests for tool types
```

## Code Review

All PRs require review. Focus on:
- Correctness
- Security (no dangerous defaults)
- Performance (no unnecessary I/O or polling)
- Consistency with existing patterns

## Questions?

Open an issue or discussion on GitHub.
