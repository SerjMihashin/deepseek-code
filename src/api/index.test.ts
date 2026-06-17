import { describe, expect, it, vi } from 'vitest'
import { DeepSeekAPI, StreamTimeoutError, flattenContent } from './index.js'
import type { DeepSeekConfig } from '../config/defaults.js'

describe('flattenContent (DeepSeek has no vision — never send image_url)', () => {
  it('passes plain strings through', () => {
    expect(flattenContent('hello')).toBe('hello')
  })

  it('replaces image_url blocks with a text placeholder (no base64, no 400)', () => {
    const out = flattenContent([
      { type: 'text', text: 'look at this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ])
    expect(out).toContain('look at this')
    expect(out).toContain('[image omitted')
    expect(out).not.toContain('base64')
  })
})

const TEST_CONFIG: DeepSeekConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  approvalMode: 'turbo',
  theme: 'default-dark',
  language: 'en',
  maxTokens: 128_000,
  temperature: 0.7,
}

describe('DeepSeekAPI streaming', () => {
  it('throws StreamTimeoutError when chunk timeout aborts the stream', async () => {
    vi.useFakeTimers()

    const api = new DeepSeekAPI(TEST_CONFIG)
    ;(api as any).client.chat.completions.create = async (_args: unknown, options: { signal: AbortSignal }) => ({
      async * [Symbol.asyncIterator] () {
        await new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      },
    })

    const iterator = api.streamChat([{ role: 'user', content: 'hello' }])
    const next = iterator.next()
    const assertion = expect(next).rejects.toBeInstanceOf(StreamTimeoutError)
    await vi.advanceTimersByTimeAsync(60_001)

    await assertion
    vi.useRealTimers()
  })
})
