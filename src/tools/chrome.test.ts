import { describe, expect, it } from 'vitest'
import { chromeTool, getLastBrowserTestResult } from './chrome.js'

describe('chrome tool', () => {
  it('requires an action', async () => {
    const result = await chromeTool.execute({})

    expect(result).toEqual({
      success: false,
      output: '',
      error: 'Action is required',
    })
  })

  it('rejects unknown actions without launching a browser', async () => {
    const result = await chromeTool.execute({ action: 'missing' })

    expect(result).toEqual({
      success: false,
      output: '',
      error: 'Unknown action: missing',
    })
  })

  it('returns browser runtime state without launching a browser', async () => {
    const result = await chromeTool.execute({ action: 'state' })

    expect(result.success).toBe(true)
    expect(JSON.parse(result.output)).toMatchObject({
      connected: false,
      headless: false,
    })
  })

  it('exposes required action parameter metadata', () => {
    expect(chromeTool.parameters).toContainEqual(expect.objectContaining({
      name: 'action',
      type: 'string',
      required: true,
    }))
  })

  it('starts with no browser test result', () => {
    expect(getLastBrowserTestResult()).toBeNull()
  })

  it('advertises perception + semantic-targeting in its metadata', () => {
    const actionParam = chromeTool.parameters.find(p => p.name === 'action')
    expect(actionParam?.description).toMatch(/observe/)
    expect(actionParam?.description).toMatch(/dom/)
    for (const name of ['targetText', 'role', 'near']) {
      expect(chromeTool.parameters).toContainEqual(expect.objectContaining({ name }))
    }
    expect(chromeTool.description).toMatch(/NO vision/)
  })
})
