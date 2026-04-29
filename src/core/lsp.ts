import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface LSPServerConfig {
  language: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface LSPDefinition {
  filePath: string;
  line: number;
  column: number;
}

export interface LSPReference {
  filePath: string;
  line: number;
  column: number;
  text: string;
}

export interface LSPHover {
  contents: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface LSPDiagnostic {
  filePath: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
}

/**
 * Lightweight LSP client for Go-to-Definition, Find References, Hover, Diagnostics.
 * Uses JSON-RPC over stdio (same pattern as MCP).
 */
export class LSPClient extends EventEmitter {
  private process: ReturnType<typeof spawn> | null = null
  private messageId = 0
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private buffer = ''
  private initialized = false
  private serverCapabilities: Record<string, unknown> = {}
  private rootUri: string

  constructor (private config: LSPServerConfig) {
    super()
    this.rootUri = pathToFileURL(process.cwd()).href
  }

  async initialize (): Promise<void> {
    if (this.initialized) return

    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...this.config.env } as Record<string, string>

      this.process = spawn(this.config.command, this.config.args ?? [], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })

      const timeout = setTimeout(() => {
        reject(new Error(`LSP server "${this.config.language}" connection timeout`))
      }, 15000)

      this.process.stdout!.on('data', (data: Buffer) => {
        this.buffer += data.toString()
        this.processBuffer()
      })

      this.process.stderr!.on('data', (data: Buffer) => {
        this.emit('stderr', data.toString())
      })

      this.process.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })

      this.process.on('exit', (code) => {
        this.initialized = false
        this.emit('exit', code)
      })

      // Send initialize request
      this.sendRequest('initialize', {
        processId: process.pid,
        rootUri: this.rootUri,
        capabilities: {},
      }).then((result) => {
        this.serverCapabilities = (result as { capabilities: Record<string, unknown> }).capabilities ?? {}
        this.sendNotification('initialized', {})
        this.initialized = true
        clearTimeout(timeout)
        resolve()
      }).catch(reject)
    })
  }

  async goToDefinition (filePath: string, line: number, column: number): Promise<LSPDefinition | null> {
    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri: this.toUri(filePath) },
      position: { line, character: column },
    }) as { range: { start: { line: number; character: number } } } | null

    if (!result) return null
    return {
      filePath: this.fromUri((result as unknown as { uri: string }).uri),
      line: result.range.start.line,
      column: result.range.start.character,
    }
  }

  async findReferences (filePath: string, line: number, column: number): Promise<LSPReference[]> {
    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri: this.toUri(filePath) },
      position: { line, character: column },
      context: { includeDeclaration: true },
    }) as Array<{ uri: string; range: { start: { line: number; character: number } } }> | null

    if (!result) return []
    return result.map(r => ({
      filePath: this.fromUri(r.uri),
      line: r.range.start.line,
      column: r.range.start.character,
      text: '',
    }))
  }

  async hover (filePath: string, line: number, column: number): Promise<LSPHover | null> {
    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri: this.toUri(filePath) },
      position: { line, character: column },
    }) as { contents: { value: string } | string; range?: { start: { line: number; character: number }; end: { line: number; character: number } } } | null

    if (!result) return null

    const contents = typeof result.contents === 'string'
      ? result.contents
      : (result.contents as { value: string }).value

    return { contents, range: result.range }
  }

  async getDiagnostics (filePath: string): Promise<LSPDiagnostic[]> {
    // Diagnostics come as notifications, so we need to request them
    await this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: this.toUri(filePath),
        languageId: this.config.language,
        version: 1,
        text: '',
      },
    })

    // In a real implementation, we'd listen for publishDiagnostics notifications
    return []
  }

  async shutdown (): Promise<void> {
    if (!this.initialized) return

    try {
      await this.sendRequest('shutdown', {})
      this.sendNotification('exit', {})
    } catch { /* ignore */ }

    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.initialized = false
  }

  private toUri (filePath: string): string {
    return pathToFileURL(filePath).href
  }

  private fromUri (uri: string): string {
    return fileURLToPath(uri)
  }

  private sendRequest (method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId
      const msg = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      this.pending.set(id, { resolve, reject })
      this.sendMessage(msg)
    })
  }

  private sendNotification (method: string, params: Record<string, unknown>): void {
    const msg = { jsonrpc: '2.0', method, params }
    this.sendMessage(msg)
  }

  private sendMessage (msg: Record<string, unknown>): void {
    const content = JSON.stringify(msg)
    const header = `Content-Length: ${Buffer.byteLength(content, 'utf-8')}\r\n\r\n`
    this.process!.stdin!.write(header + content)
  }

  private processBuffer (): void {
    // LSP uses Content-Length headers
    const headerEnd = this.buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return

    const header = this.buffer.slice(0, headerEnd)
    const lengthMatch = header.match(/Content-Length: (\d+)/)
    if (!lengthMatch) return

    const contentLength = parseInt(lengthMatch[1], 10)
    const contentStart = headerEnd + 4

    if (this.buffer.length < contentStart + contentLength) return

    const content = this.buffer.slice(contentStart, contentStart + contentLength)
    this.buffer = this.buffer.slice(contentStart + contentLength)

    try {
      const msg = JSON.parse(content)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        if (msg.error) {
          reject(new Error(msg.error.message))
        } else {
          resolve(msg.result)
        }
      } else if (msg.method === 'textDocument/publishDiagnostics') {
        this.emit('diagnostics', msg.params)
      }
    } catch { /* ignore */ }

    // Process more messages if buffer has data
    if (this.buffer.includes('Content-Length:')) {
      this.processBuffer()
    }
  }
}

export class LSPManager {
  private clients: Map<string, LSPClient> = new Map()

  async load (configPath?: string): Promise<void> {
    const paths = [
      configPath,
      join(process.cwd(), '.lsp.json'),
    ].filter(Boolean) as string[]

    for (const p of paths) {
      if (existsSync(p)) {
        const content = await readFile(p, 'utf-8')
        const configs = JSON.parse(content) as LSPServerConfig[]
        for (const cfg of configs) {
          this.clients.set(cfg.language, new LSPClient(cfg))
        }
      }
    }
  }

  getClient (language: string): LSPClient | undefined {
    return this.clients.get(language)
  }

  async initializeAll (): Promise<void> {
    const promises: Promise<void>[] = []
    for (const client of this.clients.values()) {
      promises.push(client.initialize().catch(err => {
        console.error(`[LSP] Failed to initialize ${client['config'].language}:`, err.message)
      }))
    }
    await Promise.all(promises)
  }

  async shutdownAll (): Promise<void> {
    const promises: Promise<void>[] = []
    for (const client of this.clients.values()) {
      promises.push(client.shutdown())
    }
    await Promise.all(promises)
  }
}

// Singleton
export const lspManager = new LSPManager()
