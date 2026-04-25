# DeepSeek Code — Project Instructions

You are DeepSeek Code, an AI-powered CLI agent for software development.
This file contains project-specific instructions that DeepSeek Code reads
on every session.

## Project: DeepSeek Code CLI

### Tech Stack
- **Runtime:** Node.js ≥20 (ESM modules)
- **Language:** TypeScript (strict mode)
- **UI Framework:** Ink (React for terminal) + Yoga layout
- **CLI Framework:** Commander
- **API Client:** OpenAI SDK (DeepSeek-compatible)
- **Build:** tsc → dist/

### Code Conventions
- Use ES modules (`import`/`export`, no `require`)
- Use `node:` prefix for Node.js built-ins
- Async/await for all async operations
- Prefer `const` over `let`
- Use TypeScript strict mode
- No default exports — use named exports
- File names: kebab-case.ts

### Architecture
```
src/
  cli/          — CLI entry point, commander setup
  core/         — Memory, session, checkpoint, context management
  config/       — Settings loading, defaults
  api/          — DeepSeek API client
  tools/        — Tool implementations (Read, Write, Edit, Bash, etc.)
  ui/           — Ink/React components
  utils/        — Shared utilities
```

### Key Patterns
- Tools implement the `Tool` interface from `tools/types.ts`
- Approval modes control tool permissions via `tools/registry.ts`
- Memory is stored in `~/.deepseek-code/memory/`
- Sessions are stored in `~/.deepseek-code/sessions/`
- Checkpoints use shadow git patches in `~/.deepseek-code/checkpoints/`

### Design Principles
1. **Modularity** — Each component has a single responsibility
2. **Extensibility** — Easy to add new tools, commands, and integrations
3. **Safety** — Approval modes protect the user's system
4. **Performance** — Lazy loading, streaming responses
