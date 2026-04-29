import { isAbsolute, relative, resolve } from 'node:path'

export function isPathInWorkspace (filePath: string, workspaceRoot: string = process.cwd()): boolean {
  if (filePath.trim() === '') {
    return false
  }

  const root = normalizeForCompare(resolve(workspaceRoot))
  const target = normalizeForCompare(resolve(filePath))
  const rel = relative(root, target)

  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function assertPathInWorkspace (filePath: string, workspaceRoot: string = process.cwd()): void {
  if (!isPathInWorkspace(filePath, workspaceRoot)) {
    throw new Error(`Path is outside the workspace: ${filePath}`)
  }
}

function normalizeForCompare (filePath: string): string {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath
}
