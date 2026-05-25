import { describe, expect, it } from 'vitest'
import { getCommanderParseSource } from './index.js'

describe('cli argument parsing', () => {
  it('parses process.argv style arguments as node argv', () => {
    expect(getCommanderParseSource(['node', 'dist/cli/index.js', '--json'])).toBe('node')
  })

  it('keeps direct user argument arrays supported for tests', () => {
    expect(getCommanderParseSource(['--json'])).toBe('user')
  })
})
