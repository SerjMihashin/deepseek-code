import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Filter tools: include only these */
  includeTools?: string[];
  /** Filter tools: exclude these */
  excludeTools?: string[];
  /** Trust mode: skip permissions */
  trusted?: boolean;
}

export interface MCPTool {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export class MCPServer extends EventEmitter {
  private process: ReturnType<typeof spawn> | null = null
  private messageId = 0
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private buffer = ''
  private _tools: MCPTool[] = []
  private connected = false

  constructor (public config: MCPServerConfig) {
    super()
  }

  get tools (): MCPTool[] {
    return this._tools
  }

  get isConnected (): boolean {
    return this.connected
  }

  async connect (): Promise<void> {
    if (this.connected) return

    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...this.config.env } as Record<string, string>

      this.process = spawn(this.config.command, this.config.args ?? [], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })

      const timeout = setTimeout(() => {
        reject(new Error(`MCP server "${this.config.name}" connection timeout`))
      }, 10000)

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
        this.connected = false
        this.emit('exit', code)
      })

      // Initialize by listing tools
      this.sendRequest('tools/list', {}).then((result) => {
        clearTimeout(timeout)
        const tools = (result as { tools: MCPTool[] }).tools ?? []
        this._tools = this.filterTools(tools)
        this.connected = true
        resolve()
      }).catch((err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  }

  async callTool (name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error(`MCP server "${this.config.name}" is not connected`)
    }
    return this.sendRequest('tools/call', { name, arguments: args })
  }

  async disconnect (): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.connected = false
  }

  private filterTools (tools: MCPTool[]): MCPTool[] {
    let filtered = tools

    if (this.config.includeTools && this.config.includeTools.length > 0) {
      filtered = filtered.filter(t => this.config.includeTools!.includes(t.name))
    }
    if (this.config.excludeTools && this.config.excludeTools.length > 0) {
      filtered = filtered.filter(t => !this.config.excludeTools!.includes(t.name))
    }

    return filtered.map(t => ({ ...t, serverName: this.config.name }))
  }

  private sendRequest (method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId
      const msg: MCPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      this.pending.set(id, { resolve, reject })
      this.process!.stdin!.write(JSON.stringify(msg) + '\n')
    })
  }

  private processBuffer (): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line) as MCPMessage
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
          if (msg.error) {
            reject(new Error(msg.error.message))
          } else {
            resolve(msg.result)
          }
        } else if (msg.method) {
          // Server-initiated notification
          this.emit('notification', msg)
        }
      } catch {
        // Ignore malformed JSON
      }
    }
  }
}

export class MCPManager {
  private servers: Map<string, MCPServer> = new Map()

  async addServer (config: MCPServerConfig): Promise<MCPServer> {
    const existing = this.servers.get(config.name)
    if (existing) {
      await existing.disconnect()
    }

    const server = new MCPServer(config)
    this.servers.set(config.name, server)
    return server
  }

  async removeServer (name: string): Promise<void> {
    const server = this.servers.get(name)
    if (server) {
      await server.disconnect()
      this.servers.delete(name)
    }
  }

  getServer (name: string): MCPServer | undefined {
    return this.servers.get(name)
  }

  getAllTools (): MCPTool[] {
    const tools: MCPTool[] = []
    for (const server of this.servers.values()) {
      tools.push(...server.tools)
    }
    return tools
  }

  async connectAll (): Promise<void> {
    const promises: Promise<void>[] = []
    for (const server of this.servers.values()) {
      promises.push(server.connect().catch(() => {
        // Silently ignore MCP connection errors — they are non-fatal
      }))
    }
    await Promise.all(promises)
  }

  async disconnectAll (): Promise<void> {
    const promises: Promise<void>[] = []
    for (const [name, server] of this.servers) {
      promises.push(server.disconnect())
      this.servers.delete(name)
    }
    await Promise.all(promises)
  }

  async loadConfig (configPath?: string): Promise<void> {
    const paths = [
      configPath,
      join(process.cwd(), '.deepseek-code', 'mcp.json'),
      join(homedir(), '.deepseek-code', 'mcp.json'),
    ].filter(Boolean) as string[]

    for (const p of paths) {
      if (existsSync(p)) {
        const content = await readFile(p, 'utf-8')
        const configs = JSON.parse(content) as MCPServerConfig[]
        for (const cfg of configs) {
          await this.addServer(cfg)
        }
      }
    }
  }
}

// Singleton
export const mcpManager = new MCPManager()
