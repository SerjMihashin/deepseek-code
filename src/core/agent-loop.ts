import { DeepSeekAPI, type ChatMessage } from '../api/index.js'
import { type Tool, type ToolResult, type ToolDefinition, type ApprovalRequirement, type TaskBudget, toOpenAITools, sanitizeArgs } from '../tools/types.js'
import { loadAgentConfig, listAgentConfigs } from './subagent.js'
import { getDefaultTools, getToolsForMode } from '../tools/registry.js'
import { getMcpToolDefinitions, projectIdFromCwd } from './mcp-tools.js'
import { loadMemoryContext } from './project-memory.js'
import { resolveWindowsShell } from '../tools/shell.js'
import { contextWindowFor, type DeepSeekConfig, type ApprovalMode } from '../config/defaults.js'
import { EventEmitter } from 'node:events'
import { i18n } from './i18n.js'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { platform, release, type } from 'node:os'
import { MetricsCollector } from './metrics.js'
import { hooksManager } from './hooks.js'

export interface AgentLoopOptions {
  /** Maximum number of tool call iterations before stopping (default: 200) */
  maxIterations?: number;
  /** Timeout per tool execution in ms (default: 30000 for bash, 10000 for others) */
  toolTimeout?: number;
  /** Approval mode controlling which tools need confirmation */
  approvalMode?: ApprovalMode;
  /** Current working directory (project root) */
  cwd?: string;
  /** Callback when a tool call is made — used by UI for display */
  onToolCall?: (toolCall: ToolCallEvent) => void;
  /** Callback when a tool result is received */
  onToolResult?: (result: ToolResultEvent) => void;
  /** Callback for streaming text chunks */
  onStreamChunk?: (chunk: string) => void;
  /** Callback for streaming reasoning content from the model */
  onReasoningChunk?: (chunk: string) => void;
  /** Callback when agent produces final text response */
  onResponse?: (response: string) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Callback for approval requests — return true to approve, false to reject */
  onApprovalRequest?: (toolName: string, args: Record<string, unknown>, approval: ApprovalRequirement) => Promise<boolean>;
  /** Custom system prompt to prepend */
  systemPrompt?: string;
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
  /** Budget limits for the task session */
  budget?: TaskBudget;
  /** Automatically compress message history between iterations when context is high */
  autoCompact?: AutoCompactOptions;
  /** Callback when automatic context compression starts */
  onCompactStart?: (details: AutoCompactEvent) => void;
  /** Callback for automatic context compression progress */
  onCompactProgress?: (details: AutoCompactEvent) => void;
  /** Callback when automatic context compression finishes */
  onCompactEnd?: (details: AutoCompactEvent) => void;
  /** Restrict the loop to these tool names (subagents; undefined = all for mode). */
  allowedTools?: string[];
  /** Nesting level: 0 = main agent (default). Subagents (>0) cannot spawn further subagents. */
  subagentDepth?: number;
  /** Extra instructions appended to the (auto-rebuilt) default system prompt. */
  systemPromptAppendix?: string;
  /** Callback for subagent lifecycle/progress events (main loop only). */
  onSubagentEvent?: (event: SubagentProgressEvent) => void;
}

export interface SubagentProgressEvent {
  phase: 'start' | 'tool' | 'done' | 'failed';
  /** Named agent (if any) or 'subagent'. */
  agent: string;
  /** Short description: task on start, tool label on tool, summary on done. */
  detail: string;
}

export interface AutoCompactOptions {
  enabled?: boolean;
  thresholdPercent?: number;
  keepRecentMessages?: number;
  minMessages?: number;
}

export interface AutoCompactEvent {
  phase: 'start' | 'summarizing' | 'replacing' | 'done' | 'skipped' | 'failed';
  progress: number;
  contextPercent: number;
  beforeMessages: number;
  afterMessages?: number;
  error?: string;
}

export interface ToolCallEvent {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rejected';
  result?: string;
  error?: string;
  durationMs?: number;
  startedAt?: number;
  /** Whether the tool actually changed something (e.g., file written/modified) */
  changed?: boolean;
  /** Whether the change was verified by re-reading from disk */
  verified?: boolean;
  /** List of files that were changed */
  changedFiles?: string[];
  /** Compact +/- line diff of the change (write/edit), for TUI display. */
  diff?: string;
}

export interface ToolResultEvent {
  toolCallId: string;
  toolName: string;
  success: boolean;
  output: string;
  durationMs: number;
  error?: string;
}

const DEFAULT_MAX_ITERATIONS = 200
const DEFAULT_AUTO_COMPACT: Required<AutoCompactOptions> = {
  // Auto-compaction is OFF by default — compaction is a manual action (`/compact`).
  // A separate emergency safety net below still fires when the context is about
  // to overflow, so a single huge turn cannot 400 with a context-length error.
  enabled: false,
  thresholdPercent: 70,
  keepRecentMessages: 8,
  minMessages: 18,
}

// Hard safety net: even with auto-compaction disabled, compact when the context
// is this close to the model window to avoid a context-overflow API error.
const EMERGENCY_COMPACT_PERCENT = 92

/**
 * Build a dynamic system prompt with project context.
 */
const NO_BRUTE_FORCE = '- **Do NOT brute-force command variants.** If a command fails, read the actual error and fix the real cause, then issue ONE corrected command. Never spray permutations (cmd /c …, chcp, node.exe vs npx, env-prefix variants) hoping one works — that just fills the log with failures.'
const NO_BROAD_KILL = "- Never use broad process-kill commands such as `taskkill /F /IM node.exe`, `Stop-Process -Name node`, `pkill node`, or `killall node`. They can terminate the agent, the user's IDE terminal, and unrelated dev servers. Stop only a specific process you started and can identify by PID."

/**
 * Shell guidance that matches the shell `run_shell_command` actually uses, so the
 * model writes the correct dialect instead of guessing (and brute-forcing).
 */
function buildShellPolicySection (): string {
  if (platform() !== 'win32') {
    return `## Shell Policy
- \`run_shell_command\` runs through your system shell (\`/bin/sh\`). Standard POSIX syntax works: \`&&\`, \`||\`, \`$VAR\`, pipes, redirects.
- Prefer the built-in tools over shell for inspection: \`read_file\`, \`grep_search\`, \`glob\`.
${NO_BRUTE_FORCE}
${NO_BROAD_KILL}`
  }

  if (resolveWindowsShell() === 'cmd') {
    return `## Windows Shell Policy
- On this machine \`run_shell_command\` runs through **cmd.exe** (PowerShell was unavailable or \`DEEPSEEK_CODE_SHELL=cmd\`). Write cmd syntax — NOT PowerShell.
- Chain with \`&&\` (next only on success) or \`&\` (always). Environment variables: \`%VAR%\`; set inline with \`set VAR=value&& <command>\`.
- Do NOT use PowerShell syntax here (\`$env:\`, \`;\` as a separator, \`> $null\`, cmdlets) — it fails under cmd and can create junk files like a literal \`$null\`.
- Unix tools do NOT exist (\`sed\`, \`head\`, \`tail\`, \`grep\`, \`cat\`, \`ls\`, \`rm\`, \`touch\`, \`xargs\`). Use \`findstr\`, \`type\`, \`dir\`, \`del\`, or the \`read_file\`/\`grep_search\`/\`glob\` tools.
- Never use \`mkdir -p\` (creates a literal \`-p\` directory); use \`mkdir <path>\`.
- Prefer the built-in tools over shell for inspection: \`read_file\`, \`grep_search\`, \`glob\`.
${NO_BRUTE_FORCE}
${NO_BROAD_KILL}`
  }

  return `## Windows Shell Policy
- On Windows, \`run_shell_command\` runs through **Windows PowerShell 5.1** (a single, predictable shell — never cmd.exe). Write every command in PowerShell syntax. \`npm\`, \`node\`, \`git\`, \`npx\` run normally inside it.
- **No \`&&\` or \`||\`** — PowerShell 5.1 does not support them (it is a parse error). Run sequentially with \`;\`. To run B only if A succeeded: \`A; if ($?) { B }\`. Example: \`npm run build; if ($?) { npm test }\` — NOT \`npm run build && npm test\`.
- **Environment variables**: read with \`$env:NAME\`, set inline with \`$env:NAME='value'; <command>\`. There is no \`VAR=value cmd\` prefix and no \`set VAR=...\`.
- **Redirects work as PowerShell**: \`> $null\`, \`2>$null\`, \`*> out.txt\` are valid here.
- These are PowerShell aliases and work fine: \`cat\`, \`ls\`, \`rm\`, \`cp\`, \`mv\`, \`echo\`, \`pwd\`. These do NOT exist (use the noted replacement): \`sed\`, \`head\` (→ \`Get-Content -TotalCount n\`), \`tail\` (→ \`Get-Content -Tail n\`), \`grep\` (→ \`grep_search\` tool or \`Select-String\`), \`xargs\`, \`touch\` (→ \`New-Item\`).
- Never use \`mkdir -p\` (the \`-p\` is not a PowerShell parameter). Use \`New-Item -ItemType Directory -Force <path>\`.
- Prefer the built-in tools over shell for inspection: \`read_file\` for file content, \`grep_search\` for text search, \`glob\` for file discovery.
${NO_BRUTE_FORCE}
${NO_BROAD_KILL}`
}

export function buildSystemPrompt (cwd?: string, approvalMode?: ApprovalMode, model?: string): string {
  const osInfo = `${type()} ${release()} (${platform()})`
  let projectInfo = ''

  if (cwd) {
    projectInfo += '\n## Project Context\n'
    projectInfo += `- **Working directory:** \`${cwd}\`\n`
    projectInfo += `- **OS:** ${osInfo}\n`

    // Try to read package.json for project name and description
    const pkgPath = join(cwd, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        if (pkg.name) projectInfo += `- **Project:** ${pkg.name}\n`
        if (pkg.version) projectInfo += `- **Version:** ${pkg.version}\n`
        if (pkg.description) projectInfo += `- **Description:** ${pkg.description}\n`
      } catch {
        // Ignore parse errors
      }
    }

    // List top-level directory structure (non-recursive, max 30 entries)
    try {
      const entries = readdirSync(cwd, { withFileTypes: true })
      const dirs = entries.filter(e => e.isDirectory()).map(e => `  [dir] ${e.name}/`).slice(0, 15)
      const files = entries.filter(e => e.isFile()).map(e => `  [file] ${e.name}`).slice(0, 15)
      if (dirs.length > 0 || files.length > 0) {
        projectInfo += '\n### Project Structure (top-level)\n'
        projectInfo += [...dirs, ...files].join('\n')
        if (entries.length > 30) {
          projectInfo += `\n  ... and ${entries.length - 30} more entries`
        }
      }
    } catch {
      // Ignore read errors
    }

    // Check for common config files
    const configFiles = ['.gitignore', '.env', '.editorconfig', 'tsconfig.json', 'eslint.config.js', '.prettierrc']
    const foundConfigs = configFiles.filter(f => existsSync(join(cwd, f)))
    if (foundConfigs.length > 0) {
      projectInfo += '\n### Config Files\n'
      projectInfo += foundConfigs.map(f => `  - \`${f}\``).join('\n')
    }
  }

  // Build tools capability section from registry
  const allTools = getDefaultTools()
  const mode = approvalMode ?? 'default'
  const locale = i18n.getLocale()
  const modeTools = getToolsForMode(mode)
  const modeToolNames = new Set(modeTools.map(t => t.tool.name))

  const toolListLines = allTools.map(def => {
    const t = def.tool
    const available = modeToolNames.has(t.name)
    const note = available ? '' : ' (заблокирован в текущем режиме)'
    return `  - \`${t.name}\` — ${t.description}${note}`
  })

  const capabilitiesSection = [
    `\n## Current Mode: ${mode}`,
    '',
    ...toolListLines,
  ].join('\n')

  // Shared Context Hub / external MCP tools. Plan mode is read-only and does not
  // expose them, so only advertise when they are actually active.
  let mcpSection = ''
  if (mode !== 'plan') {
    const mcpTools = getMcpToolDefinitions()
    if (mcpTools.length > 0) {
      const mcpToolLines = mcpTools.map(def => `  - \`${def.tool.name}\` — ${def.tool.description}`)
      const hubProjectId = cwd ? projectIdFromCwd(cwd) : ''
      const orientation = mcpTools.some(def => def.tool.name === 'workspace_resume')
        ? `\n- If a \`workspace_resume\` tool is available, call it ONCE at the start of a new task to load project memory, open/handed-off tasks, and recent sessions in a single token-budgeted call — prefer it over reading many files just to get oriented.${hubProjectId ? ` This project's hub \`project_id\` is \`${hubProjectId}\` — pass it as the \`project_id\` argument (same id for memory/task tools).` : ''}`
        : ''
      const identity = `provider="deepseek", client="dsc"${model ? `, model="${model}"` : ''}`
      mcpSection = [
        '\n## Shared Context Hub (MCP)',
        'External MCP tools are connected — shared memory and a task queue used by other agents working on the same projects.' + orientation,
        '- Use `task_list`/`task_claim` to pick up work handed off by another agent, and `session_log`/`memory_write` to record durable outcomes for the next agent.',
        `- Identify yourself when writing to the hub so the shared history shows who did the work: call \`session_log\` with ${identity}; set \`surface="dsc"\` on \`memory_write\`.`,
        '- These tools are real and callable like any other; do not claim you used them without an actual tool call.',
        'Connected MCP tools:',
        ...mcpToolLines,
      ].join('\n')
    }
  }

  let responseLanguage = 'English'
  if (locale === 'ru') responseLanguage = 'Russian'
  if (locale === 'zh') responseLanguage = 'Chinese'

  const languageSection = `\n## Language\n- Respond in ${responseLanguage} unless the user explicitly asks otherwise.`

  const memorySection = cwd ? loadMemoryContext(cwd) : ''

  const planModeSection = mode === 'plan'
    ? `\n## Plan Mode (read-only — ACTIVE)
- You are in **Plan Mode**. Mutating tools (\`write_file\`, \`edit\`, \`run_shell_command\`, and others) are BLOCKED — calling them will be rejected. Only read/search/browse tools work.
- Your job: investigate with \`read_file\`, \`grep_search\`, \`glob\` (and \`chrome\` if a URL/UI matters), then present ONE clear, concrete, step-by-step PLAN for the requested work, and STOP.
- The plan must be specific: exact files to change and how, commands to run, and how to verify. Call out risks, assumptions, and open questions.
- Do NOT pretend to edit files or run commands. Do NOT claim work is done — nothing is executed in this mode.
- After you present the plan, the user reviews it and switches to an execute mode (press Tab to cycle to default/auto-edit/turbo) to carry it out.`
    : ''

  const shellPolicySection = buildShellPolicySection()

  return `You are DeepSeek Code, an AI-powered CLI agent for software development.

You have access to a set of tools that allow you to read, write, and edit files, run shell commands, search code, and use a real browser when rendered UI or web behavior matters.${projectInfo}${capabilitiesSection}${mcpSection}${languageSection}${memorySection}${planModeSection}

## Guidelines
0. **@-file mentions** — When the user writes \`@path/to/file\`, it is a reference to that file in the workspace; read it when relevant to the task.
1. **Plan first** — Before making changes, explore the codebase to understand the context.
2. **Use the right tool** — Choose the most appropriate tool for each task.
3. **Be precise** — When editing files, provide exact text matches.
4. **Verify** — After changes, run tests or linting to ensure correctness.
5. **Explain** — After completing a task, summarize what was done.

## Tool Usage
- Read files with \`read_file\` before editing them
- Search with \`grep_search\` or \`glob\` to find relevant code
- Use \`run_shell_command\` to run build/test commands
- Create or overwrite files with \`write_file\`
- Make targeted edits with \`edit\` (prefer over write_file for small changes)
- Use \`chrome\` proactively for UI flows, localhost app validation, rendered DOM state, screenshots, console logs, and network inspection

When you need to run multiple tools, call them one at a time and wait for results before deciding the next step.

## Workspace Boundary Policy
- The current working directory is the active project workspace. Do not silently switch to another project path inside shell commands.
- If \`write_file\`, \`edit\`, or \`read_file\` says a path is outside the workspace, stop and report the mismatch. Do not bypass the restriction by using shell redirection, PowerShell here-strings, Python scripts, or temporary generator scripts.
- If the user intended a different folder, ask them to restart/open the CLI in that folder or confirm the correct workspace.
- Avoid generating project files through ad-hoc scripts such as \`gen_helper.py\`, \`diag.py\`, or \`fix_pkg.py\`. Use the file tools for file content and remove any temporary helper before the final report.

${shellPolicySection}

## Long-Running Processes (dev/preview servers, watchers)
- A dev/preview server (e.g. \`npm run dev\`, \`nuxt dev\`, \`vite\`) does NOT exit — never run it as a normal blocking command, it will hang and hit the timeout.
- Start it with \`run_shell_command\` using \`background: true\`. To then verify the app, pass \`wait_for_port: <port>\` in the same call — it returns once the port is accepting connections (or reports it never became ready). Do NOT open the browser before the port is ready (that causes ERR_CONNECTION_REFUSED).
- Correct flow for a browser check: (1) \`run_shell_command\` with \`background:true, wait_for_port:3000\`; (2) use the \`chrome\` tool to open \`http://localhost:3000\` and inspect; (3) \`run_shell_command\` with \`stop_pid:<pid>\` to stop the server. Always stop a background process you started.
- If \`wait_for_port\` reports the port never opened, the server failed to start — read the returned output, fix the cause, and report it; do not pretend the page rendered.

## Important
- ALWAYS use absolute paths when referring to files. The project root is \`${cwd || 'the current working directory'}\`.
- When asked to audit or explore the project, start with \`glob\`, \`grep_search\`, and targeted reads to discover structure.
- If the task implies a browser or rendered UI check, do not wait for the user to explicitly say "open browser" before using \`chrome\`.
- Do NOT guess file paths — use \`glob\` or \`grep_search\` to discover them first.
- When asked about your capabilities, answer based on the tools listed in the "Current Mode" section above. Do NOT claim you lack tools that are listed there but blocked by mode — instead explain that the current mode restricts them.
- If the user asks "what tools do you have" or "what are your capabilities", refer to this prompt's tool list. If write_file or edit are listed as blocked, explain that they exist but are restricted in the current mode.
- **CRITICAL: Never claim an action was performed without an actual tool call.** Do not say "opening browser", "running eval", "taking screenshot", "passing captcha", "navigating to page", or any other action unless you have actually called the corresponding tool and received a result. If a tool call was not made, state honestly that it was not executed. If a tool is blocked by the current mode, do not promise to use it — explain that it is unavailable in this mode. If a captcha or site protection is encountered, do not claim to bypass it — stop and report the issue honestly.
- **CRITICAL: No post-factum reports without tool calls.** If Tool uses is 0 in the current response, do not claim "I checked the log", "I reviewed the previous run", "step X was successful", or any other retrospective analysis. You may only say: "I did not perform a check right now. Based on visible context I can assume..." Always separate findings into: **Verified** (confirmed by actual tool calls this turn), **Assumption** (inferred from visible context), **Not checked** (not examined this turn). Do not write "successful" for a step that was not actually executed or has no saved result. Use the \`/last-browser-test\` command to retrieve the last saved browser test report — do not reconstruct it from memory.

## Honest Reporting
- **An iteration/step counts as done ONLY if THIS run contains the tool calls that did it.** Narrating "Iteration N complete, files created, committed" in a turn with no corresponding write_file/edit/shell calls is fabrication. If you only planned or described work, say "planned, not yet executed". When a \`[verified-state]\` ledger appears in context, treat it as the single source of truth about what this run has actually done.
- Do not claim files were changed unless tool results include changed=true or files=\`<list>\`.
- Do not claim a change was verified unless tool results include verified=true.
- Do not claim tests/checks passed unless you actually ran the command and saw success.
- If no files changed, say "No files changed".
- Final report must match tool results and Execution Summary.
- Final report must start with a quality verdict: **Passed**, **Partial**, or **Failed**.
- If there were failed tool calls, failed browser/chrome calls, a budget/iteration stop, or skipped required acceptance checks, the verdict cannot be **Passed** unless every failure is explicitly classified as non-critical and the required check later succeeded.
- For web/UI projects, include a **Browser proof** block with the URL tested, page title, console error count, screenshot/rendered-state verdict, and whether Chrome/browser calls passed or failed. If browser proof was not performed, put it under **Not checked** and do not call the UI production-ready.
- For UI/product-design tasks, visual acceptance is required. If the rendered screenshot is blank, sparse, sidebar-only, broken, or clearly below the requested quality, say **Partial** or **Failed** and list the next visual iteration instead of claiming the project is complete.

## Failed Tool Calls Policy
- If any tool/shell command failed during the run, mention it in the final report.
- Explain whether each failure was **critical** (blocked the task goal) or **non-critical** (retried successfully, fallback worked, or unrelated to the task).
- Do not write "all checks passed" or "everything succeeded" if there were failed tool calls, unless you clearly separate successful required checks from non-critical failed attempts.
- If a failed command was retried successfully, say so explicitly (e.g., "first attempt failed, retry succeeded").
- **Separate the FINAL result from the attempts to reach it.** A clean final result (e.g. "lint: 0 errors") describes only the last run. If earlier commands/attempts failed, do NOT present the whole run as clean — say e.g. "lint passed on the 2nd attempt; 1st failed: <reason>". Writing "0 errors" while hiding several failed attempts before it is dishonest. With failed attempts present, the verdict is at best **Partial**.
- **"Could not run" is NOT "broken".** If you could not execute a check in your environment (command/tool unavailable, permission denied, a shell error on your side), report it as **Not checked — could not run \`<X>\`: <reason>**. Do NOT report your own inability to run a tool as a defect or failure of the project being worked on.
- If a failed command produced a temporary file or other side effect, clean it up or mention it in the report.

## Execution Policy
1. **Minimal reading**: for a small task, first locate the target with as few reads as possible. Usually 1-2 read_file calls and 1 edit is enough. Do not run a broad grep/glob if you already know the file.
2. **Do not repeat identical tool calls**: do not call read_file/grep_search/glob with the same arguments twice unless you have reason to believe the file changed.
3. **Checks**: run lint/typecheck/build/test only after making changes. Do not run the same check multiple times without a new edit. If you did not run a check, do not claim it passed.
4. **Temporary files**: do not create lint_out.txt, test_out.txt, err.txt, temp/debug scripts, one-off files like "1", or scratch files unnecessarily. **Never redirect a command's output to a file just to read it back** (e.g. \`eslint . > lint-output.txt\`) — the tool already returns stdout/stderr to you, so the file is pure junk. If you created a temporary file, remove it before the final report. Before the final report, check the working tree or otherwise verify no junk temp files remain. If cleanup failed or was not checked, say so explicitly.
5. **Report**: the final report must match the real tool results. Only mention what you actually read, changed, or verified. If no files were changed, explicitly say "No files changed". If there were errors, report them — do not hide them.
6. **Stop**: when the goal is achieved and checks are done — stop. Do not continue looking for extra issues without the user asking. Do not refactor beyond the task scope.

## Source of Truth Policy
1. **Do not invent** versions, release notes, dates, features, links, metrics, prices, or user/project facts.
2. **Source files/data** provided by the user are the source of truth.
3. **For release/version info**, use package.json, CHANGELOG.md, Git tags, npm, or GitHub Releases only if actually read/checked.
4. **Unchecked facts** must be labeled as assumption or not verified.
5. **Generated demo projects**: placeholder content is allowed only if explicitly requested.
6. **Do not present** invented content as real project history.
7. **If data is missing**, ask for it or write "Not verified" — never guess.

## Project Acceptance Policy
1. **For web projects**, build success alone is not enough. Verify that:
   - install/build succeeds;
   - dev server starts successfully;
   - the main page opens in a browser;
   - no framework error overlay (Nuxt/Vite/Next/etc.);
   - browser console has no critical errors;
   - the repository has an appropriate .gitignore for the stack;
   - git status has no junk files (.idea/, node_modules/, .nuxt/, .output/, dist/, temp files, screenshots, logs).
2. **Runtime/container verification is adaptive**, not Podman-only:
   - first inspect available tooling and project files before choosing a path;
   - if Docker Compose is available, use docker compose;
   - if Podman/Podman Compose is available, use podman compose or podman-compose;
   - if no container runtime is available, use the native package manager/dev server and report container verification as Not checked;
   - do not spend many repeated attempts on one runtime. After two similar runtime failures, switch strategy or report the blocker.
3. **For container-first projects**:
   - keep one clear container entrypoint path (Dockerfile or Containerfile) and ensure compose references it correctly;
   - verify build inside the container;
   - expose the correct host/port;
   - add .dockerignore or .containerignore as appropriate.
4. **If browser, git-hygiene, or container verification was not performed**, do not claim the project is fully verified.
5. **In the final report**, separate:
   - Verified
   - Not checked
   - Known issues`
}

/**
 * AgentLoop — manages the "request → tool call → result → next request" cycle.
 *
 * This is the core loop that turns DeepSeek Code from a chat wrapper
 * into a real AI agent with tool access.
 */
export class AgentLoop extends EventEmitter {
  private api: DeepSeekAPI
  private config: DeepSeekConfig
  private model: string
  private tools: ToolDefinition[]
  private options: Required<Omit<AgentLoopOptions, 'signal'>> & { signal?: AbortSignal }
  private messages: ChatMessage[] = []
  private toolCallHistory: Map<string, ToolCallEvent> = new Map()
  private metrics: MetricsCollector = new MetricsCollector()
  private iterationCount = 0
  private followUpSeq = 0
  private lastCompactedAtMessageCount = 0

  constructor (config: DeepSeekConfig, options: AgentLoopOptions = {}) {
    super()
    this.api = new DeepSeekAPI(config)
    this.config = config
    this.model = config.model
    this.metrics.setContextWindow(contextWindowFor(this.model))
    const defaultSystemPrompt = buildSystemPrompt(options.cwd || process.cwd(), options.approvalMode, this.model)
    this.options = {
      maxIterations: DEFAULT_MAX_ITERATIONS,
      toolTimeout: 30000,
      approvalMode: 'default',
      cwd: process.cwd(),
      onToolCall: () => {},
      onToolResult: () => {},
      onStreamChunk: () => {},
      onReasoningChunk: () => {},
      onResponse: () => {},
      onError: () => {},
      onCompactStart: () => {},
      onCompactProgress: () => {},
      onCompactEnd: () => {},
      onApprovalRequest: async () => true,
      systemPrompt: defaultSystemPrompt,
      signal: undefined,
      autoCompact: DEFAULT_AUTO_COMPACT,
      allowedTools: undefined,
      subagentDepth: 0,
      systemPromptAppendix: '',
      onSubagentEvent: () => {},
      ...options,
    } as Required<AgentLoopOptions>
    if (this.options.systemPromptAppendix && this.options.systemPrompt === defaultSystemPrompt) {
      this.options.systemPrompt = `${defaultSystemPrompt}\n\n${this.options.systemPromptAppendix}`
    }
    this.tools = this.buildActiveTools()
  }

  /** Get the current message history */
  getMessages (): ChatMessage[] {
    return [...this.messages]
  }

  /** Get tool call history for the current session */
  getToolCallHistory (): ToolCallEvent[] {
    return Array.from(this.toolCallHistory.values())
  }

  /** Get the current iteration count */
  getIterationCount (): number {
    return this.iterationCount
  }

  /** Get the metrics collector for this session */
  getMetrics (): MetricsCollector {
    return this.metrics
  }

  /**
   * Add a user follow-up message during an active agent loop.
   * The message will be picked up on the next API iteration.
   * Does NOT start a new loop or reset state.
   */
  addUserFollowUp (content: string): void {
    const trimmed = content?.trim()
    if (!trimmed) return
    this.followUpSeq++
    // Attach the verified-state ledger so the model stays grounded in what was
    // ACTUALLY done (it tends to narrate planned iterations as completed during
    // very long runs).
    this.messages.push({
      role: 'user',
      content: `User follow-up while task was running:\n${trimmed}\n\n${this.buildVerifiedLedger()}`,
    })
  }

  /**
   * Compact, tool-derived summary of what was REALLY done in this run: files
   * actually written/edited (verified by the tools) and tool-call counts.
   * Injected at grounding points (after auto-compaction, with follow-ups) so the
   * model cannot drift into claiming work that has no tool calls behind it.
   */
  private buildVerifiedLedger (): string {
    const calls = [...this.toolCallHistory.values()]
    const changedFiles = new Set<string>()
    for (const call of calls) {
      if (call.changed && call.changedFiles) {
        for (const file of call.changedFiles) changedFiles.add(file)
      }
    }
    const completed = calls.filter(c => c.status === 'completed').length
    const failed = calls.filter(c => c.status === 'failed' || c.status === 'rejected').length
    const filesList = changedFiles.size > 0
      ? [...changedFiles].slice(0, 40).join(', ') + (changedFiles.size > 40 ? ` … +${changedFiles.size - 40} more` : '')
      : '(none)'
    return `[verified-state] Tool calls so far in THIS run: ${completed} ok, ${failed} failed. Files actually changed (tool-verified): ${filesList}. Anything not listed here was NOT done in this run — do not claim it as completed; verify with git/glob before claiming prior work.`
  }

  /**
   * Set approval mode — updates which tools are available and rebuilds system prompt.
   */
  setApprovalMode (mode: ApprovalMode): void {
    this.options.approvalMode = mode
    this.tools = this.buildActiveTools()
    // Rebuild system prompt with updated mode info
    this.options.systemPrompt = this.composeSystemPrompt()
    // Update the system message if it exists
    const sysIdx = this.messages.findIndex(m => m.role === 'system')
    if (sysIdx !== -1) {
      this.messages[sysIdx] = { role: 'system', content: this.options.systemPrompt }
    }
  }

  /** Default system prompt for the current mode plus the optional appendix. */
  private composeSystemPrompt (): string {
    const base = buildSystemPrompt(this.options.cwd, this.options.approvalMode, this.model)
    return this.options.systemPromptAppendix
      ? `${base}\n\n${this.options.systemPromptAppendix}`
      : base
  }

  /**
   * Built-in tools for the current mode plus any connected MCP tools.
   * MCP servers connect asynchronously at startup, so this is recomputed at the
   * start of each loop. Plan mode stays read-only and excludes MCP tools; a
   * name clash resolves in favor of the built-in tool.
   */
  private buildActiveTools (): ToolDefinition[] {
    let base = getToolsForMode(this.options.approvalMode)
    if (this.options.allowedTools && this.options.allowedTools.length > 0) {
      const allowed = new Set(this.options.allowedTools)
      base = base.filter(t => allowed.has(t.tool.name))
    }
    if (this.options.approvalMode === 'plan') return base
    const taken = new Set(base.map(t => t.tool.name))
    const mcp = getMcpToolDefinitions().filter(t => !taken.has(t.tool.name))
    const result = [...base, ...mcp]
    // The main loop (depth 0) can delegate to subagents; nested loops cannot.
    if ((this.options.subagentDepth ?? 0) === 0) {
      result.push(this.buildRunAgentToolDef())
    }
    return result
  }

  /**
   * `run_agent` — delegate a self-contained subtask to a nested agent loop with
   * its own fresh context, restricted tools and budget. This keeps the main
   * context clean on big explorations and enables independent verification.
   */
  private buildRunAgentToolDef (): ToolDefinition {
    const tool: Tool = {
      name: 'run_agent',
      description: 'Delegate a self-contained subtask to a subagent — a separate AI agent with its OWN fresh context and a restricted toolset. Use it to: (1) explore/analyze a large part of the codebase without flooding your own context, (2) run an independent verification/review pass, (3) execute a well-scoped implementation subtask. The subagent CANNOT see your conversation: put ALL required context into `task` (paths, goal, constraints, and what the final report must contain). It works autonomously and returns one final text report. Prefer mode "read-only" unless the subtask must change files or run commands. For named agents defined in .deepseek-code/agents/, pass `agent`.',
      parameters: [
        { name: 'task', type: 'string', required: true, description: 'Full self-contained assignment for the subagent, including every path/detail it needs and the expected report format.' },
        { name: 'mode', type: 'string', enum: ['read-only', 'edit'], description: 'read-only (default): can read/search files only. edit: can also write/edit files and run shell commands.' },
        { name: 'agent', type: 'string', description: 'Optional named agent from .deepseek-code/agents/<name>.md (adds its instructions/tool limits).' },
        { name: 'max_tool_calls', type: 'number', description: 'Tool-call budget for the subagent (default 40, max 120).' },
      ],
      execute: (args, signal) => this.executeSubagent(args, signal),
    }
    // Launching an edit-capable nested agent is a real action — ask in default
    // mode, auto-approve in turbo like every other tool.
    const approval: ApprovalRequirement = this.options.approvalMode === 'turbo' ? 'auto' : 'always'
    return { tool, approval }
  }

  /** Factory for nested loops — separated so tests can stub the child's API. */
  protected createSubagentLoop (config: DeepSeekConfig, options: AgentLoopOptions): AgentLoop {
    return new AgentLoop(config, options)
  }

  private async executeSubagent (args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
    if ((this.options.subagentDepth ?? 0) > 0) {
      return { success: false, output: '', error: 'Subagents cannot spawn further subagents.' }
    }
    const task = typeof args.task === 'string' ? args.task.trim() : ''
    if (!task) {
      return { success: false, output: '', error: 'run_agent: "task" is required.' }
    }
    const mode = args.mode === 'edit' ? 'edit' : 'read-only'

    const READ_ONLY_TOOLS = ['read_file', 'glob', 'grep_search']
    const EDIT_TOOLS = [...READ_ONLY_TOOLS, 'write_file', 'edit', 'run_shell_command']
    let allowedTools = mode === 'edit' ? EDIT_TOOLS : READ_ONLY_TOOLS

    let agentName = 'subagent'
    let agentInstructions = ''
    let subConfig = this.config
    if (typeof args.agent === 'string' && args.agent.trim()) {
      const named = loadAgentConfig(args.agent.trim(), this.options.cwd)
      if (!named) {
        const available = listAgentConfigs(this.options.cwd).map(a => a.name)
        return {
          success: false,
          output: '',
          error: `run_agent: named agent "${args.agent}" not found.` +
            (available.length > 0 ? ` Available: ${available.join(', ')}.` : ' No agents defined in .deepseek-code/agents/.'),
        }
      }
      agentName = named.name
      agentInstructions = named.systemPrompt ?? ''
      if (named.allowedTools && named.allowedTools.length > 0) {
        // Named agent may narrow the toolset further, never widen past the mode.
        const modeSet = new Set(allowedTools)
        allowedTools = named.allowedTools.filter(t => modeSet.has(t))
      }
      subConfig = {
        ...this.config,
        model: named.model ?? this.config.model,
        temperature: named.temperature ?? this.config.temperature,
      }
    }

    const rawBudget = typeof args.max_tool_calls === 'number' ? args.max_tool_calls : 40
    const maxToolCalls = Math.min(Math.max(Math.floor(rawBudget), 5), 120)

    const appendix = [
      '## Subagent Contract',
      'You are a SUBAGENT spawned by a main agent for ONE focused task. Work autonomously — you cannot ask the user or the main agent questions.',
      mode === 'read-only'
        ? '- You have READ-ONLY tools (read/search). Do not attempt to modify anything; report what you found instead.'
        : '- You may read, search, write/edit files and run shell commands, but ONLY within the scope of your task.',
      `- Budget: at most ${maxToolCalls} tool calls. Be economical; stop exploring once you can answer.`,
      '- Your final text reply is your ONLY channel back to the main agent. Make it a complete, honest report: what you did/found (with file paths and line references), what failed, and what you did NOT check.',
      agentInstructions ? `\n## Agent Instructions (${agentName})\n${agentInstructions}` : '',
    ].filter(Boolean).join('\n')

    this.options.onSubagentEvent({ phase: 'start', agent: agentName, detail: task.slice(0, 160) })
    hooksManager.execute('SubagentStart', {
      event: 'SubagentStart',
      toolName: agentName,
      projectDir: this.options.cwd,
    }).catch(() => {})

    const sub = this.createSubagentLoop(subConfig, {
      cwd: this.options.cwd,
      // Tools are already narrowed via allowedTools; the nested loop has no UI,
      // so everything it is allowed to have must be auto-approved.
      approvalMode: 'turbo',
      allowedTools,
      subagentDepth: (this.options.subagentDepth ?? 0) + 1,
      maxIterations: 60,
      budget: { maxToolCalls },
      signal: signal ?? this.options.signal,
      systemPromptAppendix: appendix,
      onToolCall: e => {
        this.options.onSubagentEvent({
          phase: 'tool',
          agent: agentName,
          detail: `${e.name}: ${this.buildToolCallLabel(e.name, e.arguments)}`,
        })
      },
    })

    try {
      const report = await sub.run(task)
      // Fold the subagent's token spend into this session's cost accounting.
      this.metrics.absorb(sub.getMetrics())

      const calls = sub.getToolCallHistory()
      const ok = calls.filter(c => c.status === 'completed').length
      const failed = calls.filter(c => c.status === 'failed' || c.status === 'rejected').length
      const changedFiles = new Set<string>()
      for (const c of calls) {
        if (c.changed && c.changedFiles) for (const f of c.changedFiles) changedFiles.add(f)
      }
      const ledger = `[subagent ${agentName}: ${ok} tool calls ok, ${failed} failed; files changed: ${changedFiles.size > 0 ? [...changedFiles].join(', ') : 'none'}]`
      this.options.onSubagentEvent({ phase: 'done', agent: agentName, detail: ledger })
      hooksManager.execute('SubagentStop', {
        event: 'SubagentStop',
        toolName: agentName,
        projectDir: this.options.cwd,
      }).catch(() => {})

      return {
        success: true,
        output: `${report}\n\n${ledger}`,
        changed: changedFiles.size > 0,
        changedFiles: changedFiles.size > 0 ? [...changedFiles] : undefined,
      }
    } catch (err) {
      this.metrics.absorb(sub.getMetrics())
      const message = (err as Error).message
      this.options.onSubagentEvent({ phase: 'failed', agent: agentName, detail: message })
      return { success: false, output: '', error: `Subagent "${agentName}" failed: ${message}` }
    }
  }

  /**
   * Run the agent loop with a user prompt.
   * Returns the final assistant response text.
   */
  async run (prompt: string, history?: ChatMessage[]): Promise<string> {
    this.iterationCount = 0
    this.toolCallHistory.clear()

    // Start with system prompt
    this.messages = [
      { role: 'system', content: this.options.systemPrompt },
      ...(history ?? []),
      { role: 'user', content: prompt },
    ]

    return this.executeLoop()
  }

  /**
   * Continue the loop with additional context (e.g., after a tool result was added externally).
   */
  async continueWithMessages (messages: ChatMessage[]): Promise<string> {
    this.messages = messages
    return this.executeLoop()
  }

  /**
   * Execute the agent loop until a text response is received or max iterations reached.
   * Uses streaming for real-time text output via onStreamChunk callback.
   */
  private async executeLoop (): Promise<string> {
    // Refresh tools and system prompt so MCP servers that finished connecting
    // after this loop was constructed are reflected in both.
    this.tools = this.buildActiveTools()
    const sysIdx = this.messages.findIndex(m => m.role === 'system')
    if (sysIdx !== -1) {
      this.options.systemPrompt = this.composeSystemPrompt()
      this.messages[sysIdx] = { role: 'system', content: this.options.systemPrompt }
    }
    const openAITools = toOpenAITools(this.tools)

    // Capture git baseline before session starts
    this.metrics.captureGitBaseline(this.options.cwd)

    // Execute hooks at start of loop
    await hooksManager.execute('AgentLoopStart', {
      event: 'AgentLoopStart',
      projectDir: this.options.cwd,
      messageCount: this.messages.length,
    }).catch(() => {})

    while (this.iterationCount < this.getIterationLimit()) {
      this.iterationCount++

      // Budget: check maxToolCalls at top of each iteration
      if (this.checkBudgetHalt()) {
        return this.buildBudgetHaltMessage()
      }

      try {
        await this.maybeAutoCompact()

        // Use streaming chat to get real-time output
        // Budget: check maxApiCalls before API call
        if (this.options.budget?.maxApiCalls && this.metrics.apiCalls >= this.options.budget.maxApiCalls) {
          return this.buildBudgetHaltMessage()
        }

        // Cancelled before we even start the request — nothing to drain.
        if (this.options.signal?.aborted) {
          return this.finishCancelled()
        }

        const followUpSeqAtRequestStart = this.followUpSeq
        const stream = this.api.streamChat(this.messages, openAITools)
        let responseContent = ''
        let toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = []

        // Cooperative cancellation: once aborted we stop acting on chunks but keep
        // draining the stream to its natural end. Breaking out early would tear
        // down the streaming socket mid-flight, which hard-crashed the process on
        // Windows. The UI already shows the paused state immediately.
        let cancelledDuringStream = false

        for await (const chunk of stream) {
          if (this.options.signal?.aborted) {
            cancelledDuringStream = true
            continue
          }

          if (chunk.type === 'usage' && chunk.usage) {
            this.metrics.recordUsage(chunk.usage)
          } else if (chunk.type === 'reasoning') {
            this.options.onReasoningChunk(chunk.content)
          } else if (chunk.type === 'text') {
            responseContent += chunk.content
            this.options.onStreamChunk(chunk.content)
          } else if (chunk.type === 'tool_use') {
            // Collect tool call from stream
            if (chunk.toolCallId && chunk.toolName) {
              toolCalls.push({
                id: chunk.toolCallId,
                type: 'function',
                function: {
                  name: chunk.toolName,
                  arguments: JSON.stringify(chunk.toolInput ?? {}),
                },
              })
            }
          }
        }

        // Stream drained — if the user cancelled mid-stream, stop here cleanly.
        if (cancelledDuringStream || this.options.signal?.aborted) {
          return this.finishCancelled()
        }

        // Budget: catch limits reached during streaming usage accounting.
        if (this.checkBudgetHalt()) {
          return this.buildBudgetHaltMessage()
        }

        if (toolCalls.length === 0 && (!responseContent || responseContent.trim().length === 0)) {
          // Streaming не дал результата — пробуем non-streaming как fallback
          // Budget: check maxApiCalls before fallback API call
          if (this.options.budget?.maxApiCalls && this.metrics.apiCalls >= this.options.budget.maxApiCalls) {
            return this.buildBudgetHaltMessage()
          }

          const fallbackResult = await this.api.chat(this.messages, openAITools)
          if (fallbackResult.usage) {
            this.metrics.recordUsage(fallbackResult.usage)
            // Budget: catch limits reached during fallback usage accounting.
            if (this.checkBudgetHalt()) {
              return this.buildBudgetHaltMessage()
            }
          }

          if (fallbackResult.toolCalls && fallbackResult.toolCalls.length > 0) {
            toolCalls = fallbackResult.toolCalls
            responseContent = fallbackResult.content ?? ''
          } else if (fallbackResult.content && fallbackResult.content.trim().length > 0) {
            responseContent = fallbackResult.content
            this.options.onStreamChunk(responseContent)
          } else {
            const fallback = i18n.t('agentEmptyResponse')
            this.messages.push({ role: 'assistant', content: fallback })
            this.options.onResponse(fallback)
            return fallback
          }
        }

        if (toolCalls.length > 0) {
          // Add assistant message with tool calls to history
          this.messages.push({
            role: 'assistant',
            content: responseContent,
            tool_calls: toolCalls,
          })

          // Execute each tool call
          for (const tc of toolCalls) {
            const args = this.parseArguments(tc.function.arguments)
            const toolCallEvent: ToolCallEvent = {
              id: tc.id,
              name: tc.function.name,
              arguments: args,
              status: 'pending',
            }

            this.toolCallHistory.set(tc.id, toolCallEvent)
            this.options.onToolCall(toolCallEvent)

            // Check approval — skip only for 'never' (read-only tools)
            const approval = this.getToolApproval(tc.function.name)
            if (approval !== 'never') {
              // If signal is already aborted, reject without asking
              if (this.options.signal?.aborted) {
                toolCallEvent.status = 'rejected'
                this.toolCallHistory.set(tc.id, toolCallEvent)
                this.messages.push({
                  role: 'tool',
                  content: `Tool call "${tc.function.name}" aborted (cancellation signal).`,
                  tool_call_id: tc.id,
                })
                continue
              }
              const approved = await this.options.onApprovalRequest(
                tc.function.name,
                args,
                approval
              )
              if (!approved) {
                toolCallEvent.status = 'rejected'
                this.toolCallHistory.set(tc.id, toolCallEvent)
                this.messages.push({
                  role: 'tool',
                  content: `Tool call "${tc.function.name}" rejected by user.`,
                  tool_call_id: tc.id,
                })
                continue
              }
              // Re-check signal after approval dialog (user may have taken long)
              if (this.options.signal?.aborted) {
                toolCallEvent.status = 'rejected'
                this.toolCallHistory.set(tc.id, toolCallEvent)
                this.messages.push({
                  role: 'tool',
                  content: `Tool call "${tc.function.name}" aborted after approval.`,
                  tool_call_id: tc.id,
                })
                continue
              }
            }

            // Budget: check limits before tool execution
            if (this.options.budget?.maxToolCalls && this.metrics.toolCalls >= this.options.budget.maxToolCalls) {
              return this.buildBudgetHaltMessage()
            }

            // Budget: check maxReadFiles
            if (this.options.budget?.maxReadFiles && tc.function.name === 'read_file') {
              const readFileCount = this.metrics.getToolCallCount('read_file')
              if (readFileCount >= this.options.budget.maxReadFiles) {
                return this.buildBudgetHaltMessage()
              }
            }

            // Budget: check maxShellCommands
            if (this.options.budget?.maxShellCommands && ['run_shell_command', 'bash', 'shell'].includes(tc.function.name)) {
              const shellCount = this.metrics.getToolCallCountAny(['run_shell_command', 'bash', 'shell'])
              if (shellCount >= this.options.budget.maxShellCommands) {
                return this.buildBudgetHaltMessage()
              }
            }

            // Execute the tool
            toolCallEvent.status = 'running'
            toolCallEvent.startedAt = Date.now()
            this.toolCallHistory.set(tc.id, toolCallEvent)
            this.metrics.recordToolCallStart(tc.function.name)

            const startTime = toolCallEvent.startedAt
            try {
              const toolResult = await this.executeTool(tc.function.name, args)
              const duration = Date.now() - startTime
              const toolLabel = this.buildToolCallLabel(tc.function.name, args)

              this.metrics.recordToolCallEnd(tc.function.name, toolResult.success, toolLabel, toolResult.success ? undefined : toolResult.error)

              toolCallEvent.status = toolResult.success ? 'completed' : 'failed'
              toolCallEvent.result = toolResult.output
              toolCallEvent.error = toolResult.error
              toolCallEvent.durationMs = duration
              toolCallEvent.changed = toolResult.changed
              toolCallEvent.verified = toolResult.verified
              toolCallEvent.changedFiles = toolResult.changedFiles
              toolCallEvent.diff = toolResult.diff
              this.toolCallHistory.set(tc.id, toolCallEvent)

              this.options.onToolResult({
                toolCallId: tc.id,
                toolName: tc.function.name,
                success: toolResult.success,
                output: toolResult.output,
                durationMs: duration,
                error: toolResult.error,
              })

              // Add tool result to message history
              this.messages.push({
                role: 'tool',
                content: this.formatToolResult(toolResult, duration),
                tool_call_id: tc.id,
              })

              if (this.checkBudgetHalt()) {
                return this.buildBudgetHaltMessage()
              }
            } catch (err) {
              const duration = Date.now() - startTime
              const errorMsg = (err as Error).message
              const toolLabel = this.buildToolCallLabel(tc.function.name, args)

              this.metrics.recordToolCallEnd(tc.function.name, false, toolLabel, errorMsg)

              toolCallEvent.status = 'failed'
              toolCallEvent.error = errorMsg
              toolCallEvent.durationMs = duration
              this.toolCallHistory.set(tc.id, toolCallEvent)

              this.options.onToolResult({
                toolCallId: tc.id,
                toolName: tc.function.name,
                success: false,
                output: '',
                durationMs: duration,
                error: errorMsg,
              })

              this.messages.push({
                role: 'tool',
                content: `Tool "${tc.function.name}" execution error: ${errorMsg}`,
                tool_call_id: tc.id,
              })
            }
          }

          // Continue loop — send results back to AI
          continue
        }

        // Text response — agent is done
        if (!responseContent || responseContent.trim().length === 0) {
          // DeepSeek API returned empty response — model may have "changed its mind", add fallback
          const fallback = 'I have completed the requested actions. What else would you like me to do?'
          this.messages.push({ role: 'assistant', content: fallback })
          this.options.onResponse(fallback)
          // Check if a follow-up arrived while the API request was streaming
          if (this.followUpSeq > followUpSeqAtRequestStart) {
            // Follow-up received during this request — continue loop instead of finishing
            continue
          }
          this.finalizeSession()
          const summary = this.metrics.getSummary(this.model)
          this.options.onStreamChunk(summary)
          return fallback
        }
        this.messages.push({ role: 'assistant', content: responseContent })
        this.options.onResponse(responseContent)

        // Check if a follow-up arrived while this API request was streaming
        if (this.followUpSeq > followUpSeqAtRequestStart) {
          // Follow-up received during the stream — continue loop, skip finalization
          continue
        }

        // Output execution summary
        this.finalizeSession()
        const summary = this.metrics.getSummary(this.model)
        this.options.onStreamChunk(summary)

        return responseContent
      } catch (err) {
        const error = err as Error
        // If the user cancelled, treat any resulting error as a clean stop.
        if (this.options.signal?.aborted) {
          return this.finishCancelled()
        }
        this.options.onError(error)
        throw error
      }
    }

    // Max iterations reached
    const timeoutMsg = `Агент достиг максимального числа итераций (${this.getIterationLimit()}). Задача может быть не завершена.`
    this.messages.push({ role: 'assistant', content: timeoutMsg })
    this.options.onResponse(timeoutMsg)
    this.finalizeSession()
    const summary = this.metrics.getSummary(this.model)
    this.options.onStreamChunk(summary)
    return timeoutMsg
  }

  /** Record a clean user-cancellation result and finalize the session. */
  private finishCancelled (): string {
    const cancelledMsg = i18n.t('agentCancelled')
    this.messages.push({ role: 'assistant', content: cancelledMsg })
    this.options.onResponse(cancelledMsg)
    this.finalizeSession()
    return cancelledMsg
  }

  private getIterationLimit (): number {
    const budgetLimit = this.options.budget?.maxIterations
    if (budgetLimit && budgetLimit > 0) {
      return Math.min(this.options.maxIterations, budgetLimit)
    }
    return this.options.maxIterations
  }

  private getAutoCompactOptions (): Required<AutoCompactOptions> {
    return {
      ...DEFAULT_AUTO_COMPACT,
      ...(this.options.autoCompact ?? {}),
    }
  }

  private async maybeAutoCompact (): Promise<void> {
    const compact = this.getAutoCompactOptions()
    const contextPercent = this.metrics.getCurrentWindowPercent()
    const beforeMessages = this.messages.length

    // Emergency: about to overflow the context window — compact even when the
    // user has auto-compaction disabled (the default), to avoid a 400.
    const emergency = contextPercent >= EMERGENCY_COMPACT_PERCENT

    if (!compact.enabled && !emergency) return
    if (compact.enabled && !emergency && contextPercent < compact.thresholdPercent) return
    if (beforeMessages < compact.minMessages) return
    if (beforeMessages <= this.lastCompactedAtMessageCount + compact.keepRecentMessages) return

    const startEvent: AutoCompactEvent = {
      phase: 'start',
      progress: 5,
      contextPercent,
      beforeMessages,
    }
    this.options.onCompactStart(startEvent)
    this.options.onCompactProgress({ ...startEvent, phase: 'summarizing', progress: 35 })

    try {
      const result = await this.api.chat([
        {
          role: 'system',
          content: 'Compress the conversation for continuation. Preserve concrete user goals, decisions, file paths, commands, failures, verification results, pending work, and constraints. Do not invent facts. Return concise bullet points.',
        },
        {
          role: 'user',
          content: this.buildCompactTranscript(),
        },
      ])

      if (result.usage) {
        this.metrics.recordUsage(result.usage)
      }

      const summary = result.content.trim() || 'Auto-compaction completed, but the summarizer returned an empty summary.'
      this.options.onCompactProgress({
        phase: 'replacing',
        progress: 80,
        contextPercent,
        beforeMessages,
      })

      const systemMsg = this.messages.find(m => m.role === 'system')

      // BUG FIX: previously the whole history was replaced by [system, summary],
      // silently dropping both the original task text and the recent messages
      // that keepRecentMessages promised to keep. Continuing from a lossy
      // summary alone is how the model drifts into claiming un-done work.
      // Keep: the original user task verbatim + the recent tail.
      const firstUserMsg = this.messages.find(m => m.role === 'user')
      let taskText = ''
      if (firstUserMsg) {
        taskText = typeof firstUserMsg.content === 'string'
          ? firstUserMsg.content
          : firstUserMsg.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('\n')
      }
      const taskMsg: ChatMessage | null = taskText
        ? {
            role: 'user',
            content: `**Original task (verbatim, pre-compaction):**\n${taskText.length > 6000 ? taskText.slice(0, 6000) + '\n…[truncated]' : taskText}`,
          }
        : null

      // Recent tail, trimmed so it does not start with an orphan tool message
      // (a tool result must follow its assistant tool_calls message).
      const tail = this.messages.slice(-compact.keepRecentMessages).filter(m => m.role !== 'system')
      while (tail.length > 0 && tail[0].role === 'tool') tail.shift()

      this.messages = [
        ...(systemMsg ? [systemMsg] : []),
        ...(taskMsg ? [taskMsg] : []),
        {
          role: 'assistant',
          // The summary is lossy — after compaction the model is prone to
          // "remembering" planned work as done. Pin the tool-verified ledger
          // right next to it so reality stays in context.
          content: `**Context Auto-Compacted**\n\nOriginal messages: ${beforeMessages}\nPrevious context: ${contextPercent}% of window\n\n${summary}\n\n${this.buildVerifiedLedger()}`,
        },
        ...tail,
      ]
      this.lastCompactedAtMessageCount = this.messages.length

      this.options.onCompactEnd({
        phase: 'done',
        progress: 100,
        contextPercent,
        beforeMessages,
        afterMessages: this.messages.length,
      })
    } catch (err) {
      this.options.onCompactEnd({
        phase: 'failed',
        progress: 100,
        contextPercent,
        beforeMessages,
        error: (err as Error).message,
      })
      throw err
    }
  }

  private buildCompactTranscript (): string {
    return this.messages
      .filter(message => message.role !== 'system')
      .map((message, index) => {
        const content = typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content)
        const toolCalls = message.tool_calls?.length ? ` tool_calls=${message.tool_calls.map(tc => tc.function.name).join(',')}` : ''
        return `#${index + 1} ${message.role}${toolCalls}\n${content.slice(0, 8000)}`
      })
      .join('\n\n---\n\n')
  }

  /**
   * Build a short human-readable label for a tool call.
   * Used in Execution Summary to identify which files/commands failed.
   */
  private buildToolCallLabel (toolName: string, args: Record<string, unknown>): string {
    try {
      switch (toolName) {
        case 'run_shell_command': {
          const cmd = args.command ?? args.cmd ?? ''
          if (typeof cmd === 'string' && cmd.length > 0) {
            return cmd.length > 120 ? cmd.slice(0, 117) + '...' : cmd
          }
          break
        }
        case 'read_file':
        case 'edit':
        case 'write_file': {
          const path = args.path ?? args.file_path ?? args.file ?? ''
          if (typeof path === 'string' && path.length > 0) {
            return path.length > 120 ? path.slice(0, 117) + '...' : path
          }
          break
        }
        case 'grep_search':
        case 'glob': {
          const pattern = args.pattern ?? ''
          if (typeof pattern === 'string' && pattern.length > 0) {
            return pattern.length > 120 ? pattern.slice(0, 117) + '...' : pattern
          }
          break
        }
      }
      // Fallback: serialize first meaningful string value
      const fallback = JSON.stringify(args)
      return fallback.length > 120 ? fallback.slice(0, 117) + '...' : fallback
    } catch {
      return String(args)
    }
  }

  /**
   * Check if any budget limit has been exceeded (called at top of each iteration).
   * Returns the field name that exceeded or null if all good.
   */
  private checkBudgetHalt (): boolean {
    const budget = this.options.budget
    if (!budget) return false

    if (budget.maxToolCalls && this.metrics.toolCalls >= budget.maxToolCalls) return true
    if (budget.maxApiCalls && this.metrics.apiCalls >= budget.maxApiCalls) return true
    if (budget.maxIterations && this.iterationCount >= budget.maxIterations) return true

    return false
  }

  /**
   * Build the partial report message when budget is exceeded.
   * This is used as a fallback when the iteration-level check catches overruns.
   */
  private buildBudgetHaltMessage (): string {
    this.finalizeSession()

    const budget = this.options.budget!

    // Find which limit was hit
    const reasons: string[] = []
    if (budget.maxToolCalls && this.metrics.toolCalls >= budget.maxToolCalls) {
      reasons.push(`maxToolCalls: ${this.metrics.toolCalls}/${budget.maxToolCalls}`)
    }
    if (budget.maxApiCalls && this.metrics.apiCalls >= budget.maxApiCalls) {
      reasons.push(`maxApiCalls: ${this.metrics.apiCalls}/${budget.maxApiCalls}`)
    }
    if (budget.maxIterations && this.iterationCount >= budget.maxIterations) {
      reasons.push(`maxIterations: ${this.iterationCount}/${budget.maxIterations}`)
    }

    const reasonStr = reasons.length > 0 ? reasons.join(', ') : 'budget limit exceeded'

    // Build tool breakdown
    const groups = new Map<string, number>()
    for (const call of this.metrics.toolCallLogEntries) {
      groups.set(call.tool, (groups.get(call.tool) || 0) + 1)
    }
    const toolList = Array.from(groups.entries())
      .map(([name, count]) => `${name} x${count}`)
      .join(', ')

    const msg = [
      `[Budget] Agent stopped by budget limit: ${reasonStr}.`,
      `  API calls: ${this.metrics.apiCalls}`,
      `  Tool calls: ${this.metrics.toolCalls}`,
      `  Tools used: ${toolList}`,
      `  Iterations: ${this.iterationCount}`,
      '',
      'To continue, increase the budget limit or set budget to unlimited.',
    ].join('\n')

    this.messages.push({ role: 'assistant', content: msg })
    this.options.onStreamChunk(msg + '\n')

    // Append execution summary
    const summary = this.metrics.getSummary(this.model)
    this.options.onStreamChunk(summary)

    return msg
  }

  /**
   * Finalize the session: capture git final status.
   * Safe and idempotent — repeated calls will not throw or corrupt state.
   */
  private finalizeSession (): void {
    try {
      this.metrics.captureGitFinal(this.options.cwd)
    } catch {
      // Ignore errors from git final capture (e.g., outside a git repo)
    }
  }

  /** @inheritdoc */
  private parseArguments (argsStr: string): Record<string, unknown> {
    try {
      return JSON.parse(argsStr) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  /**
   * Get the approval requirement for a tool by name.
   */
  private getToolApproval (toolName: string): ApprovalRequirement {
    const def = this.tools.find(t => t.tool.name === toolName)
    return def?.approval ?? 'always'
  }

  /**
   * Execute a tool by name with given arguments.
   */
  private async executeTool (
    name: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; error?: string; changed?: boolean; verified?: boolean; changedFiles?: string[]; diff?: string }> {
    const def = this.tools.find(t => t.tool.name === name)
    if (!def) {
      return { success: false, output: '', error: `Неизвестный инструмент: "${name}"` }
    }

    // Sanitize arguments before execution
    try {
      args = sanitizeArgs(args, def.tool.parameters)
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Argument validation error for "${name}": ${(err as Error).message}`,
      }
    }

    // PreToolUse hooks may veto the call (blocking: true + non-zero exit).
    try {
      const pre = await hooksManager.execute('PreToolUse', {
        event: 'PreToolUse',
        toolName: name,
        toolInput: args,
        projectDir: this.options.cwd,
      })
      if (pre.blocked) {
        return { success: false, output: '', error: pre.blockReason ?? 'Blocked by a PreToolUse hook.' }
      }
    } catch { /* hooks must never break tool execution */ }

    try {
      const result = await def.tool.execute(args, this.options.signal)
      let output = result.output
      try {
        const post = await hooksManager.execute(result.success ? 'PostToolUse' : 'PostToolUseFailure', {
          event: result.success ? 'PostToolUse' : 'PostToolUseFailure',
          toolName: name,
          toolInput: args,
          error: result.error,
          projectDir: this.options.cwd,
        })
        // Hooks with addOutput feed their stdout back to the model — e.g. an
        // auto-lint hook surfacing errors right after an edit.
        for (const hookOutput of post.outputs) {
          output += `\n\n[hook ${hookOutput.name}]\n${hookOutput.output}`
        }
      } catch { /* hooks must never break tool execution */ }
      return {
        success: result.success,
        output,
        error: result.error,
        changed: result.changed,
        verified: result.verified,
        changedFiles: result.changedFiles,
        diff: result.diff,
      }
    } catch (err) {
      const message = (err as Error).message
      hooksManager.execute('PostToolUseFailure', {
        event: 'PostToolUseFailure',
        toolName: name,
        toolInput: args,
        error: message,
        projectDir: this.options.cwd,
      }).catch(() => {})
      return {
        success: false,
        output: '',
        error: message,
      }
    }
  }

  /**
   * Format tool result for the AI model.
   * Truncate very long outputs to save tokens.
   * Appends structured metadata (changed/verified/changedFiles) if present.
   */
  private formatToolResult (
    result: { success: boolean; output: string; error?: string; changed?: boolean; verified?: boolean; changedFiles?: string[] },
    durationMs: number
  ): string {
    const maxOutputLength = 50000 // 50KB max for tool output
    let output = result.output

    if (output.length > maxOutputLength) {
      output = output.slice(0, maxOutputLength) +
        `\n\n... [truncated ${output.length - maxOutputLength} chars]`
    }

    if (!result.success) {
      return `Tool execution error (${durationMs}ms):\n${result.error ?? result.output}`
    }

    let formatted = `Tool output (${durationMs}ms):\n${output}`

    // Append structured metadata only if at least one verification field is present
    if (result.changed !== undefined || result.verified !== undefined || (result.changedFiles && result.changedFiles.length > 0)) {
      const metaParts: string[] = []
      if (result.changed !== undefined) metaParts.push(`changed=${result.changed}`)
      if (result.verified !== undefined) metaParts.push(`verified=${result.verified}`)
      if (result.changedFiles && result.changedFiles.length > 0) metaParts.push(`files=${result.changedFiles.join(',')}`)
      formatted += `\n\n[verification: ${metaParts.join(', ')}]`
    }

    return formatted
  }
}
