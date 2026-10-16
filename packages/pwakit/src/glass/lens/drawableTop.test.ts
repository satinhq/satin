import { expect, it } from 'vitest'
import { lowerShapeTop, trimShapeTop } from './drawableTop.ts'
it('keeps a panel inside the drawable top by trimming its top edge only', () => {
  // Frame at page y = -20: a panel reaching local y 18.2 would start 1.8 pt above the page.
  const panel = { centerX: 0, centerY: 18.2 + 94, halfHeight: 94, halfWidth: 125, radius: 43 }
  const trimmed = trimShapeTop(panel, -20)
  expect(trimmed.centerY - trimmed.halfHeight).toBeCloseTo(20)
  expect(trimmed.centerY + trimmed.halfHeight).toBeCloseTo(panel.centerY + panel.halfHeight)
  expect(trimShapeTop(panel, -10)).toBe(panel)
})
it('lowers a growing lift lens instead of cutting it', () => {
  const lens = { centerY: 50, halfHeight: 32 }
  expect(lowerShapeTop(lens, -21)).toEqual({ centerY: 53, halfHeight: 32 })
  expect(lowerShapeTop(lens, 0)).toBe(lens)
})
