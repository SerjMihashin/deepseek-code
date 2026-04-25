import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type Tool, type ToolResult } from './types.js';

export const writeTool: Tool = {
  name: 'Write',
  description: 'Write content to a file. Creates the file and any necessary parent directories.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The absolute path to the file to write',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'The content to write to the file',
      required: true,
    },
  ],
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.file_path as string;
    const content = args.content as string;

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      return {
        success: true,
        output: `Successfully wrote ${content.length} bytes to ${filePath}`,
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to write file: ${(err as Error).message}`,
      };
    }
  },
};
