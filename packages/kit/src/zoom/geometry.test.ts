import { describe, expect, it } from 'vitest'
import { boundZoom, pinchZoom } from './geometry.ts'
describe('component zoom geometry', () => {
  it('keeps the content point beneath a moving pinch midpoint', () => {
    const result = pinchZoom({ scale: 1, x: 0, y: 0 }, { x: 100, y: 80 }, { x: 120, y: 100 }, 2)
    expect(result).toEqual({ scale: 2, x: -80, y: -60 })
    expect(result.x + 100 * result.scale).toBe(120)
  })
  it('never exposes empty space beyond any edge or scales below one', () => {
    expect(boundZoom({ scale: 9, x: -999, y: 12 }, 200, 100, 4)).toEqual({
      scale: 4,
      x: -600,
      y: 0,
    })
    expect(boundZoom({ scale: 0.5, x: -20, y: -30 }, 200, 100, 4)).toEqual({ scale: 1, x: 0, y: 0 })
  })
})
