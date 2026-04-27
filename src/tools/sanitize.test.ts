import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
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
    assert.equal(result.file_path, '/path/to/file.txt')
    assert.equal(result.offset, 10)
    assert.equal(result.replace_all, true)
  })

  it('should throw for missing required param', () => {
    assert.throws(() => sanitizeArgs({}, params), /Missing required/)
  })

  it('should throw for wrong type (string instead of number)', () => {
    assert.throws(
      () => sanitizeArgs({ file_path: '/path', offset: 'ten' as any }, params),
      /expected number/
    )
  })

  it('should throw for wrong type (number instead of boolean)', () => {
    assert.throws(
      () => sanitizeArgs({ file_path: '/path', replace_all: 1 as any }, params),
      /expected boolean/
    )
  })

  it('should throw for wrong type (string instead of array)', () => {
    assert.throws(
      () => sanitizeArgs({ file_path: '/path', tags: 'not-array' as any }, params),
      /expected array/
    )
  })

  it('should throw for wrong type (array instead of object)', () => {
    assert.throws(
      () => sanitizeArgs({ file_path: '/path', metadata: [1, 2] as any }, params),
      /expected object/
    )
  })

  it('should throw for non-finite number', () => {
    assert.throws(
      () => sanitizeArgs({ file_path: '/path', offset: Infinity as any }, params),
      /finite number/
    )
  })

  it('should throw for NaN', () => {
    assert.throws(
      () => sanitizeArgs({ file_path: '/path', offset: NaN as any }, params),
      /finite number/
    )
  })

  it('should pass optional params omitted', () => {
    const result = sanitizeArgs({ file_path: '/path' }, params)
    assert.equal(result.file_path, '/path')
    assert.equal(result.offset, undefined)
  })

  it('should pass valid array', () => {
    const result = sanitizeArgs({ file_path: '/path', tags: ['a', 'b'] }, params)
    assert.deepEqual(result.tags, ['a', 'b'])
  })

  it('should pass valid object', () => {
    const result = sanitizeArgs({ file_path: '/path', metadata: { key: 'val' } }, params)
    assert.deepEqual(result.metadata, { key: 'val' })
  })

  it('should throw for null required param', () => {
    assert.throws(
      () => sanitizeArgs({ file_path: null as any }, params),
      /Missing required/
    )
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
    assert.equal(result.s, 'hello')
    assert.equal(result.n, 42)
    assert.equal(result.b, false)
    assert.deepEqual(result.a, [1, 2, 3])
    assert.deepEqual(result.o, { foo: 'bar' })
  })
})
