import { readFile, writeFile } from 'node:fs/promises'
import { type Tool, type ToolResult } from './types.js'
import { assertPathInWorkspace } from './path-safety.js'

export const editTool: Tool = {
  name: 'edit',
  description: 'Replace text in a file. Uses exact string matching to find and replace content.',
  parameters: [
    {
      name: 'file_path',
      type: 'string',
      description: 'The absolute path to the file to edit',
      required: true,
    },
    {
      name: 'old_string',
      type: 'string',
      description: 'The exact text to replace',
      required: true,
    },
    {
      name: 'new_string',
      type: 'string',
      description: 'The replacement text',
      required: true,
    },
    {
      name: 'replace_all',
      type: 'boolean',
      description: 'Replace all occurrences instead of just the first',
      required: false,
    },
  ],
  async execute (args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.file_path as string
    const oldString = args.old_string as string
    const newString = args.new_string as string
    const replaceAll = !!args.replace_all

    try {
      assertPathInWorkspace(filePath)
      const content = await readFile(filePath, 'utf-8')

      // Check if old_string exists
      const index = content.indexOf(oldString)
      if (index === -1) {
        return {
          success: false,
          output: '',
          error: 'String not found in file',
          changed: false,
          verified: false,
          changedFiles: [],
        }
      }

      if (replaceAll) {
        const replaced = content.replaceAll(oldString, newString)
        if (replaced === content) {
          return {
            success: false,
            output: '',
            error: 'String not found in file',
            changed: false,
            verified: false,
            changedFiles: [],
          }
        }
        await writeFile(filePath, replaced, 'utf-8')
        // Verify by re-reading
        const writtenContent = await readFile(filePath, 'utf-8')
        const verified = writtenContent === replaced
        return {
          success: true,
          output: `Replaced all occurrences in ${filePath}`,
          changed: true,
          verified,
          changedFiles: [filePath],
        }
      } else {
        const replaced = content.replace(oldString, newString)
        await writeFile(filePath, replaced, 'utf-8')
        // Verify by re-reading
        const writtenContent = await readFile(filePath, 'utf-8')
        const verified = writtenContent === replaced
        return {
          success: true,
          output: `Successfully edited ${filePath}`,
          changed: true,
          verified,
          changedFiles: [filePath],
        }
      }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to edit file: ${(err as Error).message}`,
        changed: false,
        verified: false,
        changedFiles: [],
      }
    }
  },
}
