import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LSPClient } from './lsp.js'

describe('LSPClient URI conversion', () => {
  it('should round-trip local file paths through file URIs', () => {
    const client = new LSPClient({ language: 'typescript', command: 'tsserver' })
    const filePath = join(process.cwd(), 'src', 'core', 'lsp.ts')
    const uri = (client as unknown as { toUri: (path: string) => string }).toUri(filePath)
    const roundTrip = (client as unknown as { fromUri: (uri: string) => string }).fromUri(uri)

    expect(uri).toBe(pathToFileURL(filePath).href)
    expect(roundTrip).toBe(filePath)
  })

  it('should decode spaces and escaped characters in file URIs', () => {
    const client = new LSPClient({ language: 'typescript', command: 'tsserver' })
    const filePath = join(process.cwd(), 'tmp dir', 'file #1.ts')
    const uri = pathToFileURL(filePath).href

    expect((client as unknown as { fromUri: (uri: string) => string }).fromUri(uri)).toBe(filePath)
  })
})
