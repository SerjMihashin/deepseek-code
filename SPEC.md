# DeepSeek Code — Product and Technical Specification

## 1. Product Goal
Build a practical AI coding agent for the terminal that can:
- understand the current project;
- inspect and modify code safely;
- run commands and verify results;
- use a real browser when the task requires UI or web validation;
- leave an auditable execution trail so another agent or human can continue work.

The target category is not “chat wrapper for DeepSeek API”, but a real tool-using agent comparable in workflow quality to Qwen Code, Claude Code, and OpenAI Codex CLI.

## 2. Product Positioning
DeepSeek Code should compete on:
- DeepSeek-first cost efficiency;
- strong Windows support;
- browser-assisted coding and QA;
- explicit handoff and reproducibility.

The unique direction is:
- coding agent + browser QA agent in one CLI;
- evidence-first execution: commands, diffs, screenshots, console/network data;
- restartable work via iterations, checkpoints, sessions, and handoff notes.

## 3. Current Reality
The repository already has:
- tool calling with file, shell, search, and browser tools;
- TUI and headless execution;
- memory, sessions, checkpointing, MCP, skills, hooks, subagents;
- a Chrome/Puppeteer-based browser tool.

The repository does not yet consistently deliver:
- truthful documentation vs real behavior;
- clean lint/test baseline;
- production-grade browser lifecycle and telemetry;
- strong handoff discipline;
- complete parity between documented and registered tools;
- clean TUI layout (tool call logs dominate screen, no blinking cursor);
- meaningful context window display (current metric is session-cumulative, not per-request).

This document is the source of truth going forward.

## 4. Core Principles

### 4.1 Tool-First Agent
The model must solve tasks through tools, not by pretending to know file contents or runtime state.

### 4.2 Browser as First-Class Runtime
The browser layer is not an optional add-on. It is a native capability of the agent.

If a task implies:
- checking a local app in browser;
- validating a UI flow;
- reading rendered DOM state;
- collecting console or network evidence;
- reproducing a browser-only bug;

the agent should understand that it can use the browser tool proactively without the user explicitly saying “open browser”.

### 4.3 Honest State
Documentation, tool registry, system prompts, and UI must match real behavior.

### 4.4 Handoff-Friendly Work
Every finished iteration must leave:
- updated checklists;
- committed code;
- enough context for another agent to continue safely.

## 5. Runtime Architecture

### 5.1 Agent Loop
`src/core/agent-loop.ts`

Responsibilities:
- build system prompt with project context;
- send tool schemas to the model;
- stream text and reasoning;
- execute tool calls;
- return tool results back to the model;
- stop on final text or max iterations.

Requirements:
- keep tool history;
- support approvals by mode;
- support cancellation;
- truncate oversized tool outputs;
- be explicit about available browser capability.

### 5.2 Tool System
`src/tools/`

Each tool must provide:
- stable name;
- description;
- parameter schema;
- deterministic execution contract;
- explicit success/error result.

Registered tools are the only tools the model may call.
Docs and prompts must reference only registered tools.

### 5.3 Browser Runtime
Primary implementation:
- `src/tools/chrome.ts`
- `src/tools/chrome-manager.ts`

Responsibilities:
- launch and manage a reusable browser session;
- open/reuse pages as needed;
- expose high-value browser actions to the model;
- capture browser evidence;
- surface browser state to UI.

Design rules:
- browser capability must be available by default as a native tool;
- UI should reflect real browser connection state;
- browser actions should be safe for multi-step workflows;
- evidence should be easy to consume by both model and user;
- headless mode must be supported for automation and CI.

Note:
The vendored `chrome-cli-tools/` directory may remain as reference or compatibility layer, but the canonical agent browser runtime is the native tool layer inside `src/tools/`.

### 5.4 UI/TUI
`src/ui/`

Responsibilities:
- show chat history;
- show reasoning optionally;
- show tool calls and results;
- show approval requests;
- show runtime indicators including browser status.

The UI must never imply a capability that is not actually wired.

### 5.5 Supporting Systems
- Memory: `src/core/memory.ts`
- Sessions: `src/core/session.ts`
- Checkpoints: `src/core/checkpoint.ts`
- MCP: `src/core/mcp.ts`
- Skills: `src/core/skills.ts`
- Hooks: `src/core/hooks.ts`
- Subagents: `src/core/subagent.ts`
- Review: `src/core/review.ts`
- Sandbox: `src/core/sandbox.ts`

These systems are product multipliers, but they are secondary to a stable core loop and browser runtime.

## 6. Modes and Approvals

Modes:
- `plan`
- `default`
- `auto-edit`
- `yolo`

Behavior:
- `plan`: read/search only, used to inspect and propose work;
- `default`: dangerous operations require approval;
- `auto-edit`: edits auto-approved, shell still gated;
- `yolo`: full autonomous execution.

Requirements:
- mode semantics must be consistent between UI, docs, and runtime;
- browser tool must be treated as a native tool, not hidden side functionality;
- approvals must be explicit and predictable.

## 7. Browser Tool Requirements

### 7.1 Functional Scope
The browser tool should support:
- open or navigate page;
- click and fill;
- evaluate JS;
- read text or HTML;
- inspect console and network;
- capture screenshot;
- wait for selectors or state;
- scroll and locate elements;
- inspect cookies and storage.

### 7.2 Behavioral Expectations
- use existing page context for multi-step flows when appropriate;
- avoid losing browser events because listeners were attached too late;
- avoid accumulating duplicate listeners across calls;
- return concise outputs by default;
- expose file artefacts when screenshots are created.

### 7.3 Agent Expectations
The system prompt should teach the model:
- browser is available;
- use browser when terminal-only tools are insufficient;
- use browser for local UI validation and rendered state;
- prefer evidence over guesses.

## 8. Documentation Contract
The following files must stay aligned with code:
- `SPEC.md`
- `ITERATIONS.md`
- `README.md`
- `README.ru.md`
- `CHANGELOG.md`
- `AGENTS.md`

Rules:
- do not document a tool that is not registered;
- do not claim lint/tests pass unless verified;
- do not claim an external integration exists if the runtime does not use it.

## 9. Iteration Strategy
Work is delivered in explicit iterations.
Each iteration must:
- define scope;
- include code and documentation changes;
- mark checklist items complete when verified;
- end with a git commit.

The detailed execution checklist lives in `ITERATIONS.md`.

## 10. Acceptance Criteria
DeepSeek Code is considered healthy when:
- docs match runtime;
- typecheck, build, and lint pass locally;
- core tests run reliably;
- browser tool works as a first-class native capability;
- UI shows real browser and tool state;
- the model can autonomously inspect, edit, run, verify, and use browser evidence in one session;
- another agent can continue from repository state and iteration logs without hidden context.
