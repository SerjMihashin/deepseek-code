import { describe, expect, it } from 'vitest'
import { getScrollStatusLabel } from './status-bar.js'

describe('StatusBar scroll status', () => {
  it('should describe follow mode controls', () => {
    expect(getScrollStatusLabel('follow', 0, false)).toBe('VIEW:FOLLOW PageUp')
  })

  it('should describe paused mode controls', () => {
    expect(getScrollStatusLabel('paused', 10, false)).toBe('VIEW:PAUSED PageDown/End')
  })

  it('should show new message indicator while paused', () => {
    expect(getScrollStatusLabel('paused', 10, true)).toBe('VIEW:PAUSED +new End')
  })
})
