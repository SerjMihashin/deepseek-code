import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { type Tool, type ToolResult } from './types.js'
import { assertPathInWorkspace } from './path-safety.js'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
}

async function readAsImage (filePath: string): Promise<ToolResult> {
  const buffer = await readFile(filePath) // binary — no encoding
  const ext = extname(filePath).toLowerCase()
  const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mime};base64,${base64}`
  return {
    success: true,
    output: `[Image: ${filePath}](${dataUrl})\nSize: ${buffer.length} bytes, Type: ${mime}`,
  }
}

async function readAsNotebook (filePath: string): Promise<ToolResult> {
  const content = await readFile(filePath, 'utf-8')
  const notebook = JSON.parse(content)
  const cells = (notebook.cells ?? [])
    .filter((c: any) => c.source && (c.cell_type === 'code' || c.cell_type === 'markdown'))
    .map((c: any) => `### [${c.cell_type}]\n${Array.isArray(c.source) ? c.source.join('') : c.source}`)
  if (cells.length === 0) {
    return { success: true, output: '[Notebook: no code or markdown cells found]' }
  }
  return { success: true, output: cells.join('\n\n') }
}

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
      assertPathInWorkspace(filePath)

      const ext = extname(filePath).toLowerCase()

      // Images — binary read + base64 data URL
      if (IMAGE_EXTENSIONS.has(ext)) {
        return readAsImage(filePath)
      }

      // Jupyter Notebook
      if (ext === '.ipynb') {
        return readAsNotebook(filePath)
      }

      // Default: text file with optional offset/limit
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
