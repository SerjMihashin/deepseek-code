import { describe, expect, it } from 'vitest'
import { windowsUiTool, escapeSendKeysText } from './windows-ui.js'

const isWindows = process.platform === 'win32'

describe('escapeSendKeysText', () => {
  it('braces SendKeys special characters', () => {
    expect(escapeSendKeysText('a+b^c%d~e')).toBe('a{+}b{^}c{%}d{~}e')
    expect(escapeSendKeysText('(x) {y} [z]')).toBe('{(}x{)} {{}y{}} {[}z{]}')
    expect(escapeSendKeysText('plain text 123')).toBe('plain text 123')
  })
})

describe('windowsUiTool argument validation', () => {
  it.runIf(isWindows)('rejects unknown actions', async () => {
    const result = await windowsUiTool.execute({ action: 'explode' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('unknown action')
  })

  it.runIf(isWindows)('requires window for non-list actions', async () => {
    const result = await windowsUiTool.execute({ action: 'tree' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('"window"')
  })

  it.runIf(isWindows)('requires name for invoke', async () => {
    const result = await windowsUiTool.execute({ action: 'invoke', window: 'Some Window' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('"name"')
  })

  it.runIf(!isWindows)('fails cleanly on non-Windows platforms', async () => {
    const result = await windowsUiTool.execute({ action: 'list_windows' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('only available on Windows')
  })
})

describe('windowsUiTool integration', () => {
  it.runIf(isWindows)('lists top-level windows through UIA', async () => {
    const result = await windowsUiTool.execute({ action: 'list_windows' })
    expect(result.success).toBe(true)
    // At minimum the hint line is present; on a desktop session real windows too.
    expect(result.output).toContain('list')
  }, 60_000)

  it.runIf(isWindows)('reports a clear error for a missing window', async () => {
    const result = await windowsUiTool.execute({ action: 'tree', window: 'dsc-definitely-no-such-window-42' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('no top-level window matches')
  }, 60_000)
})
