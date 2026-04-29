import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { execPath } from 'node:process'

const dirs = vi.hoisted(() => ({
  home: '',
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => dirs.home,
  }
})

const { MCPManager, MCPServer } = await import('./mcp.js')

const serverSource = `
const readline = require('node:readline')
const rl = readline.createInterface({ input: process.stdin })
const tools = [
  { name: 'echo', description: 'Echo input', inputSchema: { type: 'object' } },
  { name: 'hidden', description: 'Hidden tool', inputSchema: { type: 'object' } }
]
rl.on('line', (line) => {
  const msg = JSON.parse(line)
  if (msg.method === 'tools/list') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools } }) + '\\n')
    return
  }
  if (msg.method === 'tools/call') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: { content: [{ type: 'text', text: msg.params.arguments.text }] }
    }) + '\\n')
    return
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'not found' } }) + '\\n')
})
`

describe('MCP', () => {
  let tempDir: string
  let serverPath: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(process.cwd(), '.tmp-mcp-'))
    dirs.home = join(tempDir, 'home')
    await mkdir(dirs.home, { recursive: true })
    serverPath = join(tempDir, 'server.cjs')
    await writeFile(serverPath, serverSource, 'utf-8')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('connects, lists filtered tools, and calls a tool', async () => {
    const server = new MCPServer({
      name: 'mock',
      command: execPath,
      args: [serverPath],
      includeTools: ['echo'],
    })

    await server.connect()

    expect(server.isConnected).toBe(true)
    expect(server.tools).toEqual([
      {
        serverName: 'mock',
        name: 'echo',
        description: 'Echo input',
        inputSchema: { type: 'object' },
      },
    ])
    await expect(server.callTool('echo', { text: 'hello' })).resolves.toEqual({
      content: [{ type: 'text', text: 'hello' }],
    })

    await server.disconnect()
    expect(server.isConnected).toBe(false)
  })

  it('excludes configured tools', async () => {
    const server = new MCPServer({
      name: 'mock',
      command: execPath,
      args: [serverPath],
      excludeTools: ['hidden'],
    })

    await server.connect()
    expect(server.tools.map(tool => tool.name)).toEqual(['echo'])
    await server.disconnect()
  })

  it('loads server configs into the manager', async () => {
    const configPath = join(tempDir, 'mcp.json')
    await writeFile(configPath, JSON.stringify([
      { name: 'mock', command: execPath, args: [serverPath] },
    ]), 'utf-8')

    const manager = new MCPManager()
    await manager.loadConfig(configPath)

    expect(manager.getServer('mock')).toBeDefined()
    await manager.connectAll()
    expect(manager.getAllTools().map(tool => tool.name)).toEqual(['echo', 'hidden'])
    await manager.disconnectAll()
  })

  it('replaces existing servers with the same name', async () => {
    const manager = new MCPManager()
    const first = await manager.addServer({ name: 'mock', command: execPath, args: [serverPath] })
    const second = await manager.addServer({ name: 'mock', command: execPath, args: [serverPath] })

    expect(manager.getServer('mock')).toBe(second)
    expect(manager.getServer('mock')).not.toBe(first)
    await manager.disconnectAll()
  })
})
