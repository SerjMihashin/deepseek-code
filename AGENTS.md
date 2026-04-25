# AGENTS.md — AI Agent Instructions

This file is read by AI coding agents (DeepSeek Code, Claude Code, Cursor, etc.)
to understand project context and conventions.

## Project Overview
DeepSeek Code CLI — AI-powered terminal agent for software development.

## Important Conventions
1. All source code is in `src/` directory
2. TypeScript with strict mode, ES modules
3. Tests go in `src/` alongside source files (e.g., `src/tools/read.test.ts`)
4. Configuration files use JSON format
5. Memory system stores data in `~/.deepseek-code/`

## Build Commands
- `npm run build` — compile TypeScript
- `npm run watch` — watch mode
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript type checking only

## Project Status
Active development. See DEEPSEEK.md for detailed architecture docs.
