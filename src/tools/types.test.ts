import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { type Tool, toOpenAITools } from './types.js'

describe('toOpenAITools', () => {
  it('should convert a Tool to OpenAI tool format', () => {
    const tool: Tool = {
      name: 'read_file',
      description: 'Read a file',
      parameters: [
        { name: 'file_path', type: 'string', description: 'Path to file', required: true },
        { name: 'limit', type: 'number', description: 'Max lines', required: false },
      ],
      async execute () {
        return { success: true, output: 'test' }
      },
    }

    const result = toOpenAITools([{ tool, approval: 'never' }])

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].function.name, 'read_file')
    assert.strictEqual(result[0].function.description, 'Read a file')

    const props = result[0].function.parameters.properties as Record<string, { type: string }>
    assert.strictEqual(props.file_path.type, 'string')

    const required = result[0].function.parameters.required as string[]
    assert.strictEqual(required.includes('file_path'), true)
  })

  it('should handle tools with no required parameters', () => {
    const tool: Tool = {
      name: 'test_tool',
      description: 'A test tool',
      parameters: [
        { name: 'optional_param', type: 'string', description: 'Optional', required: false },
      ],
      async execute () {
        return { success: true, output: 'ok' }
      },
    }

    const result = toOpenAITools([{ tool, approval: 'never' }])

    assert.strictEqual(result[0].function.parameters.required?.length, 0)
  })
})
