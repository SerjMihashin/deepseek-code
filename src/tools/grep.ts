import { execSync } from 'node:child_process';
import { type Tool, type ToolResult } from './types.js';

export const grepTool: Tool = {
  name: 'Grep',
  description: 'Search file contents using regular expressions. Uses ripgrep for fast searching.',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'The regular expression pattern to search for',
      required: true,
    },
    {
      name: 'glob',
      type: 'string',
      description: 'Optional glob pattern to filter files (e.g. "*.ts", "*.{ts,tsx}")',
      required: false,
    },
    {
      name: 'path',
      type: 'string',
      description: 'Optional directory path to search in (defaults to current directory)',
      required: false,
    },
  ],
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const glob = args.glob as string | undefined;
    const searchPath = (args.path as string) ?? process.cwd();

    try {
      let cmd = `rg --no-heading --line-number --color never "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`;
      if (glob) {
        cmd += ` --glob "${glob}"`;
      }

      const output = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });

      if (!output.trim()) {
        return {
          success: true,
          output: 'No matches found',
        };
      }

      // Limit output to avoid huge responses
      const lines = output.split('\n');
      const limited = lines.slice(0, 200);
      let result = limited.join('\n');
      if (lines.length > 200) {
        result += `\n... and ${lines.length - 200} more matches`;
      }

      return {
        success: true,
        output: result,
      };
    } catch (err) {
      const error = err as Error & { status?: number };
      // rg returns exit code 1 when no matches found
      if (error.status === 1) {
        return {
          success: true,
          output: 'No matches found',
        };
      }
      return {
        success: false,
        output: '',
        error: `Failed to search: ${error.message}`,
      };
    }
  },
};
