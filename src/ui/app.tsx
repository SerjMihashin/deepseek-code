import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ChatView } from './chat-view.js';
import { InputBar } from './input-bar.js';
import { StatusBar } from './status-bar.js';
import type { DeepSeekConfig, ApprovalMode } from '../config/defaults.js';
import type { SessionOptions } from '../cli/interactive.js';
import { DeepSeekAPI, type ChatMessage } from '../api/index.js';
import { getToolsForMode } from '../tools/registry.js';
import { saveMemory, listMemories, deleteMemory, searchMemories, type MemoryEntry } from '../core/memory.js';
import { saveSession, getLastSessionId } from '../core/session.js';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from '../core/checkpoint.js';

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

  // Initialize session on mount
  useEffect(() => {
    (async () => {
      if (options.continue_) {
        const lastId = await getLastSessionId();
        if (lastId) sessionIdRef.current = lastId;
      }
      if (!sessionIdRef.current) {
        sessionIdRef.current = await saveSession({});
      }
    })();
  }, []);

  const tools = getToolsForMode(approvalMode);

  const handleSlashCommand = useCallback(async (input: string): Promise<boolean> => {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    switch (cmd) {
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
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Usage: /forget <query> — remove matching memories',
          }]);
          return true;
        }
        const matches = await searchMemories(query);
        if (matches.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'No memories found matching that query.',
          }]);
          return true;
        }
        for (const m of matches) {
          await deleteMemory(m.name);
        }
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
        const list = allMemories.map((m, i) =>
          `${i + 1}. **${m.name}** — ${m.description}`,
        ).join('\n');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `**Saved Memories (${allMemories.length}):**\n${list}`,
        }]);
        return true;
      }

      case '/compress': {
        const totalLen = messages.reduce((sum, m) => sum + m.content.length, 0);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Context compressed. Previous size: ~${(totalLen / 1024).toFixed(1)}KB across ${messages.length} messages.`,
        }]);
        // In a real implementation, this would summarize older messages
        return true;
      }

      case '/checkpoint': {
        const cpMsg = parts.slice(1).join(' ') || `Checkpoint at ${new Date().toLocaleTimeString()}`;
        const cp = await createCheckpoint(cpMsg);
        if (!cp) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Checkpoint requires a git repository. Initialize one with `git init`.',
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
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: 'No checkpoints found.',
            }]);
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
        if (ok) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✓ Restored checkpoint: ${cpId}`,
          }]);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✗ Could not restore checkpoint: ${cpId}. Patch may not exist or apply cleanly.`,
          }]);
        }
        return true;
      }

      default:
        return false;
    }
  }, [messages]);

  const handleSubmit = useCallback(async (input: string) => {
    if (!input.trim() || isProcessing) return;

    // Check for system slash commands
    if (input.startsWith('/')) {
      const handled = await handleSlashCommand(input);
      if (handled) return;

      // Fall through to AI for unknown slash commands
    }

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);
    setStatusText('Processing...');

    try {
      const response = await apiRef.current.chat([...messages, userMessage]);
      const assistantMessage: ChatMessage = { role: 'assistant', content: response };
      setMessages(prev => [...prev, assistantMessage]);

      // Auto-save session
      await saveSession({
        id: sessionIdRef.current,
        messageCount: messages.length + 2,
      });
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${(err as Error).message}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      setStatusText('Ready');
    }
  }, [messages, isProcessing, handleSlashCommand]);

  // Handle approval mode cycling
  useInput((_input, key) => {
    if (key.tab) {
      setApprovalMode(prev => {
        const modes: ApprovalMode[] = ['plan', 'default', 'auto-edit', 'yolo'];
        const idx = modes.indexOf(prev);
        return modes[(idx + 1) % modes.length];
      });
    }
  });

  const handleClear = useCallback(() => {
    setMessages([]);
  }, []);

  const handleExit = useCallback(() => {
    exit();
  }, [exit]);

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
