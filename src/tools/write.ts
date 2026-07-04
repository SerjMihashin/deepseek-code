import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { type Tool, type ToolResult } from './types.js'
import { assertPathInWorkspace } from './path-safety.js'
import { lineDiff } from './diff.js'

const MAX_FILE_SIZE = 1_048_576 // 1MB limit

export const writeTool: Tool = {
  name: 'write_file',
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
  async execute (args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.file_path as string
    const content = args.content as string

    // Size limit check
    if (content.length > MAX_FILE_SIZE) {
      return {
        success: false,
        output: '',
        error: `File too large: ${content.length} bytes exceeds the maximum of ${MAX_FILE_SIZE} bytes (1MB). Use run_shell_command to write large files.`,
        changed: false,
        verified: false,
        changedFiles: [],
      }
    }

    try {
      assertPathInWorkspace(filePath)

      // Read the previous content (if any) BEFORE overwriting, to show a diff.
      const isNew = !existsSync(filePath)
      let previous = ''
      if (!isNew) {
        try { previous = await readFile(filePath, 'utf-8') } catch { /* unreadable — treat as empty */ }
      }

      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, content, 'utf-8')

      // Verify by re-reading the file
      const writtenContent = await readFile(filePath, 'utf-8')
      const verified = writtenContent === content

      return {
        success: true,
        output: `Successfully wrote ${content.length} bytes to ${filePath}${isNew ? ' (new file)' : ''}`,
        changed: true,
        verified,
        changedFiles: [filePath],
        diff: lineDiff(previous, content),
      }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Failed to write file: ${(err as Error).message}`,
        changed: false,
        verified: false,
        changedFiles: [],
      }
    }
  },
}
