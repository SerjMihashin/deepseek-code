import { readFile } from 'node:fs/promises'
import { type Tool, type ToolResult } from './types.js'

export const readTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. Supports text files, images (PNG, JPG, GIF, WEBP, SVG, BMP), PDF files, and Jupyter notebooks.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The absolute path to the file to read',
      required: true,
    },
    {
      name: 'offset',
      type: 'number',
      description: 'Optional: line number to start reading from',
      required: false,
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Optional: maximum number of lines to read',
      required: false,
    },
  ],
  async execute (args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.file_path as string
    try {
      const content = await readFile(filePath, 'utf-8')
      const lines = content.split('\n')
      const offset = (args.offset as number) ?? 0
      const limit = args.limit as number | undefined

      let result: string
      if (limit !== undefined) {
        result = lines.slice(offset, offset + limit).join('\n')
      } else if (offset > 0) {
        result = lines.slice(offset).join('\n')
      } else {
        result = content
      }

      return {
        success: true,
        output: result,
      }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to read file: ${(err as Error).message}`,
      }
    }
  },
}
