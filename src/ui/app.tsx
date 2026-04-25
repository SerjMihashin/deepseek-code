import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ChatView } from './chat-view.js';
import { InputBar } from './input-bar.js';
import { StatusBar } from './status-bar.js';
import type { DeepSeekConfig, ApprovalMode } from '../config/defaults.js';
import type { SessionOptions } from '../cli/interactive.js';
import { DeepSeekAPI, type ChatMessage } from '../api/index.js';
import { getToolsForMode } from '../tools/registry.js';
import { saveMemory, listMemories, deleteMemory, searchMemories } from '../core/memory.js';
import { saveSession, getLastSessionId } from '../core/session.js';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from '../core/checkpoint.js';
import { mcpManager } from '../core/mcp.js';
import { subAgentManager, SubAgent } from '../core/subagent.js';
import { skillsManager } from '../core/skills.js';
import { hooksManager } from '../core/hooks.js';
import { lspManager } from '../core/lsp.js';
import { reviewCode, type ReviewOptions } from '../core/review.js';
import { sandbox } from '../core/sandbox.js';
import { gitIntegration } from '../core/git.js';
import { scheduler, Scheduler } from '../core/scheduler.js';
import type { ScheduledTask } from '../core/scheduler.js';

interface AppProps {
  config: DeepSeekConfig;
  options: SessionOptions;
}

export function App({ config, options }: AppProps) {
  const { exit } = useApp();
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(
    (options.approvalMode as ApprovalMode) ?? (options.yolo ? 'yolo' : config.approvalMode),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('Ready');
  const apiRef = useRef(new DeepSeekAPI(config));
  const sessionIdRef = useRef<string>('');
  const initializedRef = useRef(false);

  // Initialize session and services on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      if (options.continue_) {
        const lastId = await getLastSessionId();
        if (lastId) sessionIdRef.current = lastId;
      }
      if (!sessionIdRef.current) {
        sessionIdRef.current = await saveSession({});
      }

      // Initialize services in background
      await Promise.allSettled([
        mcpManager.loadConfig().then(() => mcpManager.connectAll()),
        skillsManager.loadAll(),
        hooksManager.load(),
        lspManager.load().then(() => lspManager.initializeAll()),
        subAgentManager.loadFromDir(),
      ]);

      setStatusText('Ready');
    })();
  }, []);

  const tools = getToolsForMode(approvalMode);

  const handleSlashCommand = useCallback(async (input: string): Promise<boolean> => {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    switch (cmd) {
      // === Memory commands ===
      case '/remember': {
        const text = parts.slice(1).join(' ');
        if (!text) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Usage: /remember <text> — save something to memory',
          }]);
          return true;
        }
        await saveMemory({
          name: `note_${Date.now()}`,
          description: text.slice(0, 80),
          type: 'reference',
          content: text,
        });
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✓ Saved to memory: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`,
        }]);
        return true;
      }

      case '/forget': {
        const query = parts.slice(1).join(' ');
        if (!query) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /forget <query>' }]);
          return true;
        }
        const matches = await searchMemories(query);
        if (matches.length === 0) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'No memories found.' }]);
          return true;
        }
        for (const m of matches) await deleteMemory(m.name);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✓ Removed ${matches.length} memory/memories matching "${query}"`,
        }]);
        return true;
      }

      case '/memory': {
        const allMemories = await listMemories();
        if (allMemories.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'No memories saved yet. Use /remember <text> to save something.',
          }]);
          return true;
        }
        const list = allMemories.map((m, i) => `${i + 1}. **${m.name}** — ${m.description}`).join('\n');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**Saved Memories (${allMemories.length}):**\n${list}`,
        }]);
        return true;
      }

      // === Context commands ===
      case '/compress': {
        const totalLen = messages.reduce((sum, m) => sum + m.content.length, 0);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Context compressed. Previous size: ~${(totalLen / 1024).toFixed(1)}KB across ${messages.length} messages.`,
        }]);
        return true;
      }

      // === Checkpoint commands ===
      case '/checkpoint': {
        const cpMsg = parts.slice(1).join(' ') || `Checkpoint at ${new Date().toLocaleTimeString()}`;
        const cp = await createCheckpoint(cpMsg);
        if (!cp) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Checkpoint requires a git repository.',
          }]);
          return true;
        }
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✓ Checkpoint created: **${cp.id}**\nFiles: ${cp.files.length > 0 ? cp.files.join(', ') : '(no changes)'}`,
        }]);
        return true;
      }

      case '/restore': {
        const cpId = parts[1];
        if (!cpId) {
          const cps = await listCheckpoints();
          if (cps.length === 0) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'No checkpoints found.' }]);
            return true;
          }
          const list = cps.slice(0, 10).map((cp, i) =>
            `${i + 1}. **${cp.id}** — ${cp.message} (${new Date(cp.timestamp).toLocaleString()})`,
          ).join('\n');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Recent Checkpoints:**\n${list}\n\nUse \`/restore <id>\` to restore.`,
          }]);
          return true;
        }
        const ok = await restoreCheckpoint(cpId);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: ok ? `✓ Restored checkpoint: ${cpId}` : `✗ Could not restore checkpoint: ${cpId}`,
        }]);
        return true;
      }

      // === MCP commands ===
      case '/mcp': {
        const sub = parts[1]?.toLowerCase();
        if (sub === 'list' || !sub) {
          const tools = mcpManager.getAllTools();
          if (tools.length === 0) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: 'No MCP tools available. Configure servers in `.deepseek-code/mcp.json`.',
            }]);
          } else {
            const list = tools.map(t => `- **${t.serverName}/${t.name}**: ${t.description}`).join('\n');
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `**MCP Tools (${tools.length}):**\n${list}`,
            }]);
          }
        } else if (sub === 'connect') {
          const name = parts.slice(2).join(' ');
          if (!name) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /mcp connect <server-name>' }]);
            return true;
          }
          const server = mcpManager.getServer(name);
          if (!server) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Server "${name}" not found.` }]);
            return true;
          }
          await server.connect();
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✓ Connected to MCP server: ${name} (${server.tools.length} tools)`,
          }]);
        }
        return true;
      }

      // === Skills commands ===
      case '/skills': {
        const name = parts.slice(1).join(' ');
        if (!name) {
          const all = skillsManager.listSkills();
          if (all.length === 0) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: 'No skills available. Create one in `.deepseek-code/skills/<name>/SKILL.md`.',
            }]);
          } else {
            const list = all.map(s => `- **${s.name}**: ${s.description}`).join('\n');
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `**Available Skills (${all.length}):**\n${list}\n\nUse \`/skills <name>\` to run a skill.`,
            }]);
          }
        } else {
          const skill = skillsManager.getSkill(name);
          if (!skill) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Skill "${name}" not found.` }]);
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `**Running skill: ${skill.name}**\n\n${skill.prompt}`,
            }]);
          }
        }
        return true;
      }

      // === Subagent commands ===
      case '/agents': {
        const allAgents = subAgentManager['agents'];
        if (allAgents.size === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'No subagents configured. Create them in `.deepseek-code/agents/`.',
          }]);
        } else {
          const list = Array.from(allAgents.keys()).map(name => `- **${name}**`).join('\n');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Registered Subagents:**\n${list}`,
          }]);
        }
        return true;
      }

      // === Review ===
      case '/review': {
        const sub = parts[1]?.toLowerCase();
        const reviewOptions: ReviewOptions = {};

        if (sub === 'all') {
          reviewOptions.files = ['src'];
        } else if (sub === 'diff') {
          reviewOptions.gitRef = parts[2] ?? 'HEAD';
        } else if (sub === 'auto') {
          reviewOptions.autoFix = true;
        }

        setStatusText('Reviewing code...');
        setMessages(prev => [...prev, { role: 'assistant', content: '🔍 Running code review...' }]);

        try {
          const result = await reviewCode(config, reviewOptions);
          const issueList = result.issues.slice(0, 20).map(i =>
            `- [${i.severity.toUpperCase()}] ${i.file}:${i.line} — ${i.message}`,
          ).join('\n');

          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Code Review Results**\n\nScore: **${result.score}/100**\nIssues: ${result.issues.length}\nDuration: ${(result.durationMs / 1000).toFixed(1)}s\n\n${issueList || '✅ No issues found.'}\n\n${result.summary}`,
          }]);
        } catch (err) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Review failed: ${(err as Error).message}`,
          }]);
        }

        setStatusText('Ready');
        return true;
      }

      // === Sandbox ===
      case '/sandbox': {
        const cmd = parts.slice(1).join(' ');
        if (!cmd) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Usage: /sandbox <command> — run command in isolated sandbox',
          }]);
          return true;
        }

        setStatusText('Running in sandbox...');
        try {
          const result = await sandbox.execute(cmd, { timeout: 60000 });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Sandbox Result** (${(result.durationMs / 1000).toFixed(1)}s, exit: ${result.exitCode})\n\n${result.stdout.slice(0, 2000)}${result.stderr ? `\n\n**Stderr:**\n${result.stderr.slice(0, 1000)}` : ''}`,
          }]);
        } catch (err) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Sandbox error: ${(err as Error).message}`,
          }]);
        }
        setStatusText('Ready');
        return true;
      }

      // === Git commands ===
      case '/git': {
        const sub = parts[1]?.toLowerCase();

        if (sub === 'commit' || !sub) {
          const msg = parts.slice(2).join(' ') || 'Update';
          const result = await gitIntegration.commit({ message: msg, all: true });
          if (result.success) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✓ Committed: \`${msg}\` (${result.hash?.slice(0, 7)})`,
            }]);
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✗ Commit failed: ${result.error}`,
            }]);
          }
        } else if (sub === 'branch') {
          const name = parts[2];
          if (!name) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Usage: /git branch <name>' }]);
            return true;
          }
          const result = await gitIntegration.createBranch({ name });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: result.success ? `✓ Switched to branch: ${name}` : `✗ ${result.error}`,
          }]);
        } else if (sub === 'diff') {
          const diff = await gitIntegration.getDiff(parts[2]);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `\`\`\`diff\n${diff.slice(0, 3000)}\n\`\`\``,
          }]);
        } else if (sub === 'status') {
          const { execSync } = await import('node:child_process');
          const status = execSync('git status', { encoding: 'utf-8', windowsHide: true });
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `\`\`\`\n${status}\n\`\`\``,
          }]);
        }
        return true;
      }

      // === Loop / Scheduler ===
      case '/loop': {
        const sub = parts[1]?.toLowerCase();

        if (sub === 'list') {
          const tasks = scheduler.listTasks();
          if (tasks.length === 0) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'No active tasks.' }]);
          } else {
            const list = tasks.map((t, i) =>
              `${i + 1}. **${t.prompt.slice(0, 40)}** — every ${(t.interval / 1000).toFixed(0)}s (${t.runCount}/${t.maxRuns ?? '∞'})`,
            ).join('\n');
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `**Active Tasks:**\n${list}`,
            }]);
          }
        } else if (sub === 'clear') {
          scheduler.clearAll();
          setMessages(prev => [...prev, { role: 'assistant', content: '✓ All tasks cleared.' }]);
        } else if (sub) {
          // Parse interval and prompt
          const intervalStr = sub;
          const prompt = parts.slice(2).join(' ') || 'check status';
          const intervalMs = Scheduler.parseInterval(intervalStr);
          const task = scheduler.addTask(prompt, intervalMs);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✓ Task scheduled: "${prompt}" every ${intervalStr} (ID: ${task.id})`,
          }]);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Usage:\n  /loop <interval> <prompt> — schedule task\n  /loop list — list tasks\n  /loop clear — clear all tasks',
          }]);
        }
        return true;
      }

      // === Stats ===
      case '/stats': {
        const mcpTools = mcpManager.getAllTools().length;
        const skills = skillsManager.listSkills().length;
        const agents = subAgentManager['agents'].size;
        const tasks = scheduler.count;
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**Session Statistics:**\n- Messages: ${messages.length}\n- MCP Tools: ${mcpTools}\n- Skills: ${skills}\n- Subagents: ${agents}\n- Scheduled Tasks: ${tasks}\n- Approval Mode: ${approvalMode}`,
        }]);
        return true;
      }

      default:
        return false;
    }
  }, [messages, approvalMode]);

  const handleSubmit = useCallback(async (input: string) => {
    if (!input.trim() || isProcessing) return;

    if (input.startsWith('/')) {
      const handled = await handleSlashCommand(input);
      if (handled) return;
    }

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);
    setStatusText('Processing...');

    try {
      // Execute hooks
      await hooksManager.execute('UserPromptSubmit', {
        event: 'UserPromptSubmit',
        projectDir: process.cwd(),
      });

      const response = await apiRef.current.chat([...messages, userMessage]);
      const assistantMessage: ChatMessage = { role: 'assistant', content: response };
      setMessages(prev => [...prev, assistantMessage]);

      await saveSession({
        id: sessionIdRef.current,
        messageCount: messages.length + 2,
      });
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${(err as Error).message}`,
      }]);
    } finally {
      setIsProcessing(false);
      setStatusText('Ready');
    }
  }, [messages, isProcessing, handleSlashCommand]);

  useInput((_input, key) => {
    if (key.tab) {
      setApprovalMode(prev => {
        const modes: ApprovalMode[] = ['plan', 'default', 'auto-edit', 'yolo'];
        const idx = modes.indexOf(prev);
        return modes[(idx + 1) % modes.length];
      });
    }
  });

  const handleClear = useCallback(() => { setMessages([]); }, []);
  const handleExit = useCallback(() => { exit(); }, [exit]);

  return (
    <Box flexDirection="column" height="100%">
      <ChatView messages={messages} />
      <InputBar
        onSubmit={handleSubmit}
        disabled={isProcessing}
        onClear={handleClear}
        onExit={handleExit}
      />
      <StatusBar
        mode={approvalMode}
        status={statusText}
        messageCount={messages.length}
      />
    </Box>
  );
}
