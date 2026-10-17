import { describe, expect, it } from 'vitest'
import { filterCaptureNodes } from './captureWindow.ts'

describe('capture node filtering', () => {
  it('keeps intersecting paint nodes, including overflow margin, in paint order', () => {
    const nodes = [
      { y: 0, height: 10 },
      { y: 940, height: 5 },
      { y: 1100, height: 20 },
      { y: 2060, height: 4 },
      { y: 2200, height: 10 },
    ]
    expect(filterCaptureNodes(nodes, { top: 1000, bottom: 2000, viewport: 500 })).toEqual(
      nodes.slice(1, 4),
    )
  })
})
