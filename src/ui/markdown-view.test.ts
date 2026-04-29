import { afterEach, describe, expect, it } from 'vitest'
import {
  isTableSeparator,
  padVisual,
  parseSegments,
  parseTableCells,
  shouldRenderTableAsList,
  tableColumnWidths,
} from './markdown-view.js'
import { visualWidth } from '../utils/string-width.js'

describe('MarkdownView table helpers', () => {
  const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns')

  afterEach(() => {
    if (originalColumns) {
      Object.defineProperty(process.stdout, 'columns', originalColumns)
    } else {
      delete (process.stdout as { columns?: number }).columns
    }
  })

  it('parses markdown table cells without edge pipes', () => {
    expect(parseTableCells('| Модуль | Тесты | Комментарий |')).toEqual([
      'Модуль',
      'Тесты',
      'Комментарий',
    ])
  })

  it('recognizes separator rows', () => {
    expect(isTableSeparator('| --- | :---: | ---: |')).toBe(true)
    expect(isTableSeparator('| core/lsp.ts | 0 тестов |')).toBe(false)
  })

  it('pads by visual terminal width', () => {
    const text = 'API OK'
    const padded = padVisual(text, 8)
    expect(visualWidth(padded)).toBe(8)
  })

  it('computes column widths using visual width', () => {
    const widths = tableColumnWidths([
      '| Модуль | Оценка |',
      '| --- | --- |',
      '| tools/types.ts | ***** |',
    ])

    expect(widths[0]).toBe(visualWidth('tools/types.ts'))
    expect(widths[1]).toBe(Math.max(visualWidth('Оценка'), visualWidth('*****')))
  })

  it('falls back to list rendering for wide tables on narrow terminals', () => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 50 })

    expect(shouldRenderTableAsList([
      '| Модуль | Качество | Тесты | Безопасность | Комментарий |',
      '| --- | --- | --- | --- | --- |',
      '| core/lsp.ts | *** | 0 тестов | OK | fromUri баг на Windows |',
    ])).toBe(true)
  })

  it('keeps compact tables as tables on wide terminals', () => {
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 120 })

    expect(shouldRenderTableAsList([
      '| Модуль | Тесты |',
      '| --- | --- |',
      '| edit.ts | 4 |',
    ])).toBe(false)
  })

  it('parses an unfinished streaming code fence as a code block', () => {
    expect(parseSegments('Before\n```python\nprint("ok")')).toEqual([
      { type: 'text', content: 'Before\n' },
      { type: 'code', lang: 'python', content: 'print("ok")' },
    ])
  })
})
