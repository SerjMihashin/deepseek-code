import { describe, it, expect } from 'vitest'
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

    expect(result).toHaveLength(1)
    expect(result[0].function.name).toBe('read_file')
    expect(result[0].function.description).toBe('Read a file')

    const props = result[0].function.parameters.properties as Record<string, { type: string }>
    expect(props.file_path.type).toBe('string')

    const required = result[0].function.parameters.required as string[]
    expect(required.includes('file_path')).toBe(true)
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

    expect(result[0].function.parameters.required).toHaveLength(0)
  })
})
