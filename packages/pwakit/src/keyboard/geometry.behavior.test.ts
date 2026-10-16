import { describe, expect, it } from 'vitest'
import { keyboardGeometry, revealDelta } from './geometry.ts'

describe('keyboard occlusion policy', () => {
  it('reports the visible viewport and clamps negative viewport offsets during software keyboard engagement', () => {
    expect(keyboardGeometry(900, 600, 25, 1, true)).toEqual({
      height: 300,
      visible: true,
      viewportHeight: 600,
      offsetTop: 25,
      layoutHeight: 900,
    })
    expect(keyboardGeometry(900, 600, -10, 1, true).offsetTop).toBe(0)
  })

  it.each([
    ['page zoom', 600, 2, true],
    ['no focused editor', 600, 1, false],
    ['hardware keyboard', 900, 1, true],
    ['viewport larger than layout', 950, 1, true],
  ])('does not report keyboard occlusion for %s', (_reason, visualHeight, scale, engaged) => {
    expect(keyboardGeometry(900, visualHeight, 30, scale, engaged)).toEqual({
      height: 0,
      visible: false,
      viewportHeight: 900,
      offsetTop: 0,
      layoutHeight: 900,
    })
  })
})

describe('focused editor reveal distance', () => {
  it('uses the tighter keyboard or scroll-surface bottom and preserves the focus gap', () => {
    expect(revealDelta(450, 490, 0, 800, 500)).toBe(2)
    expect(revealDelta(450, 490, 0, 480, 800)).toBe(22)
    expect(revealDelta(450, 490, 0, 480, 800, 20)).toBe(30)
  })

  it('leaves fully visible inputs in place and reveals fields above the surface', () => {
    expect(revealDelta(120, 160, 100, 500, 500)).toBe(0)
    expect(revealDelta(90, 130, 100, 500, 500)).toBe(-22)
    expect(revealDelta(0, 40, -50, 500, 500)).toBe(-12)
  })

  it('reveals the top of a tall editor instead of scrolling its bottom past the caret viewport', () => {
    expect(revealDelta(140, 700, 100, 500, 500)).toBe(28)
    expect(revealDelta(80, 700, 100, 500, 500)).toBe(-32)
  })
})
