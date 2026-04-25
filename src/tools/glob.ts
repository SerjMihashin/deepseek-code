import { globby } from 'globby';
import { type Tool, type ToolResult } from './types.js';

export const globTool: Tool = {
  name: 'Glob',
  description: 'Find files matching a glob pattern. Supports **/*.ts, src/**/*.tsx, etc.',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'The glob pattern to search for',
      required: true,
    },
  ],
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;

    try {
      const paths = await globby(pattern, {
        cwd: process.cwd(),
        onlyFiles: true,
        gitignore: true,
      });

      if (paths.length === 0) {
        return {
          success: true,
          output: 'No files found matching pattern',
        };
      }

      return {
        success: true,
        output: paths.join('\n'),
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to search files: ${(err as Error).message}`,
      };
    }
  },
};
