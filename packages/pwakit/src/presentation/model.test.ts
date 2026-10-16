import { describe, expect, it } from 'vitest'
import {
  confirmationPopoverFrame,
  usesExpandedSheetMaterial,
  detentHeight,
  resolveDetents,
  releaseDetent,
  rubberBandHeight,
  sheetPlacement,
  sheetFrame,
} from './model.ts'
import { createLayoutClassState, reduceLayoutClass } from '../layout/layoutClass.ts'

it('uses the shipping window class for sheets at 700 × 800, including after resize', () => {
  const viewport = { width: 700, height: 800 }
  expect(createLayoutClassState(viewport).layoutClass).toEqual({
    horizontal: 'regular',
    vertical: 'regular',
  })
  expect(
    reduceLayoutClass(createLayoutClassState({ width: 440, height: 956 }), viewport).state
      .layoutClass,
  ).toEqual({ horizontal: 'regular', vertical: 'regular' })
  const placement = sheetPlacement(viewport, 20, true)
  expect(placement).toEqual({ kind: 'form', bottom: 70 })
  // A regular window still constrains its sheet to the measured local width.
  expect(sheetFrame(viewport.width, 1, 0, placement)).toEqual({
    width: 580,
    left: 60,
    bottom: 70,
    contentScale: 1,
  })
})
describe('sheet decisions', () => {
  it('changes material between the two recorded native midpoint frames', () => {
    expect(usesExpandedSheetMaterial(956 - 257.6667 - 8, 497, 894)).toBe(false)
    expect(usesExpandedSheetMaterial(956 - 244.6667 - 8, 497, 894)).toBe(true)
    expect(usesExpandedSheetMaterial(890, 497, 894)).toBe(true)
  })
  it('resolves sorted unique detents against safe geometry', () => {
    expect(resolveDetents(['large', 'medium', { fraction: 0.5 }, { height: 200 }], 800)).toEqual([
      200, 400, 800,
    ])
    expect(detentHeight({ height: 900 }, 800)).toBe(800)
  })
  it('rejects unusable detents', () => {
    for (const value of [{ height: NaN }, { height: -1 }, { fraction: 0 }, { fraction: 2 }])
      expect(() => detentHeight(value, 800)).toThrow()
    expect(() => resolveDetents([], 800)).toThrow()
  })
  it('never interactively dismisses a protected draft', () => {
    expect(releaseDetent(50, 2, [400, 800], true)).toBe(400)
    expect(releaseDetent(50, 2, [400, 800], false)).toBe(0)
    expect(releaseDetent(420, -1, [400, 800], false)).toBe(800)
    expect(releaseDetent(420, 0, [400, 800], false)).toBe(400)
  })
  it('bounds upper rubber band extension and never returns a negative height', () => {
    expect(rubberBandHeight(-20, 800)).toBe(0)
    expect(rubberBandHeight(900, 800)).toBeGreaterThan(800)
    expect(rubberBandHeight(900, 800)).toBeLessThan(900)
    expect(rubberBandHeight(1e9, 800)).toBeLessThan(1600)
  })
})

describe('confirmation popover placement (native reference native reference, iPhone 17 Pro Max)', () => {
  const viewport = { width: 440, top: 62, bottom: 922 }
  it('points at a swipe-deleted row from above, centred on it, like native', () => {
    // Native: the Atlas row spans 563-653 pt; the 214.5 pt popover spans x 100-340 and ends at
    // 565.5 pt, its arrow tip at (220, 579.5).
    const row = { left: 0, top: 563, right: 440, bottom: 653.3 }
    const frame = confirmationPopoverFrame(row, false, 214.5, viewport)
    expect(frame.left).toBe(100)
    expect(frame.top + 214.5).toBeCloseTo(565.5, 0)
    expect(frame.arrow).toEqual({ x: 120, edge: 'bottom' })
    // It grows from (and shrinks into) the arrow tip.
    expect(frame.origin).toEqual({ x: 120, y: 214.5 + 14 })
  })
  it('grows out of a trailing toolbar button, 10 pt from the screen edge', () => {
    // Native: compose button x 376-419.7, top 62; popover x 189.7-429.7, top 62.
    const button = { left: 376, top: 62, right: 419.7, bottom: 106 }
    const frame = confirmationPopoverFrame(button, true, 193, viewport)
    expect(frame).toMatchObject({ left: 190, top: 62 })
    expect(frame.arrow).toBeUndefined()
    expect(frame.origin!.x).toBeCloseTo(397.85 - 190, 6)
    expect(frame.origin!.y).toBe(22)
  })
})
