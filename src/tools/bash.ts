import { execSync } from 'node:child_process';
import { type Tool, type ToolResult } from './types.js';

export const bashTool: Tool = {
  name: 'Bash',
  description: 'Execute a shell command. Use for running build tools, tests, git operations, etc.',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The shell command to execute',
      required: true,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Optional timeout in milliseconds (default: 120000)',
      required: false,
    },
    {
      name: 'description',
      type: 'string',
      description: 'Brief description of what the command does',
      required: false,
    },
  ],
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;
    const timeout = (args.timeout as number) ?? 120_000;
    const description = (args.description as string) ?? '';

    try {
      const output = execSync(command, {
        timeout,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        windowsHide: true,
      });

      return {
        success: true,
        output: output || '(command completed with no output)',
      };
    } catch (err) {
      const error = err as Error & { stdout?: string; stderr?: string };
      const stdout = error.stdout ?? '';
      const stderr = error.stderr ?? '';
      return {
        success: false,
        output: stdout,
        error: stderr || error.message,
      };
    }
  },
};
