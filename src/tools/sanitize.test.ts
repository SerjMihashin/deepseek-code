import { describe, it, expect } from 'vitest'
import { sanitizeArgs, type ToolParameter } from './types.js'

describe('sanitizeArgs', () => {
  const params: ToolParameter[] = [
    { name: 'file_path', type: 'string', description: 'File path', required: true },
    { name: 'offset', type: 'number', description: 'Line offset', required: false },
    { name: 'replace_all', type: 'boolean', description: 'Replace all', required: false },
    { name: 'tags', type: 'array', description: 'Tags', required: false },
    { name: 'metadata', type: 'object', description: 'Metadata', required: false },
  ]

  it('should pass valid args', () => {
    const result = sanitizeArgs({
      file_path: '/path/to/file.txt',
      offset: 10,
      replace_all: true,
    }, params)
    expect(result.file_path).toBe('/path/to/file.txt')
    expect(result.offset).toBe(10)
    expect(result.replace_all).toBe(true)
  })

  it('should throw for missing required param', () => {
    expect(() => sanitizeArgs({}, params)).toThrow(/Missing required/)
  })

  it('should throw for wrong type (string instead of number)', () => {
    expect(
      () => sanitizeArgs({ file_path: '/path', offset: 'ten' as any }, params)
    ).toThrow(/expected number/)
  })

  it('should throw for wrong type (number instead of boolean)', () => {
    expect(
      () => sanitizeArgs({ file_path: '/path', replace_all: 1 as any }, params)
    ).toThrow(/expected boolean/)
  })

  it('should throw for wrong type (string instead of array)', () => {
    expect(
      () => sanitizeArgs({ file_path: '/path', tags: 'not-array' as any }, params)
    ).toThrow(/expected array/)
  })

  it('should throw for wrong type (array instead of object)', () => {
    expect(
      () => sanitizeArgs({ file_path: '/path', metadata: [1, 2] as any }, params)
    ).toThrow(/expected object/)
  })

  it('should throw for non-finite number', () => {
    expect(
      () => sanitizeArgs({ file_path: '/path', offset: Infinity as any }, params)
    ).toThrow(/finite number/)
  })

  it('should throw for NaN', () => {
    expect(
      () => sanitizeArgs({ file_path: '/path', offset: NaN as any }, params)
    ).toThrow(/finite number/)
  })

  it('should pass optional params omitted', () => {
    const result = sanitizeArgs({ file_path: '/path' }, params)
    expect(result.file_path).toBe('/path')
    expect(result.offset).toBeUndefined()
  })

  it('should pass valid array', () => {
    const result = sanitizeArgs({ file_path: '/path', tags: ['a', 'b'] }, params)
    expect(result.tags).toEqual(['a', 'b'])
  })

  it('should pass valid object', () => {
    const result = sanitizeArgs({ file_path: '/path', metadata: { key: 'val' } }, params)
    expect(result.metadata).toEqual({ key: 'val' })
  })

  it('should throw for null required param', () => {
    expect(
      () => sanitizeArgs({ file_path: null as any }, params)
    ).toThrow(/Missing required/)
  })

  it('should handle all param types at once', () => {
    const allParams: ToolParameter[] = [
      { name: 's', type: 'string', description: '', required: true },
      { name: 'n', type: 'number', description: '', required: true },
      { name: 'b', type: 'boolean', description: '', required: true },
      { name: 'a', type: 'array', description: '', required: true },
      { name: 'o', type: 'object', description: '', required: true },
    ]
    const result = sanitizeArgs({
      s: 'hello',
      n: 42,
      b: false,
      a: [1, 2, 3],
      o: { foo: 'bar' },
    }, allParams)
    expect(result.s).toBe('hello')
    expect(result.n).toBe(42)
    expect(result.b).toBe(false)
    expect(result.a).toEqual([1, 2, 3])
    expect(result.o).toEqual({ foo: 'bar' })
  })
})
