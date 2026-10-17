import { describe, expect, it } from 'vitest'
import { formSheetHeight, sheetCornerShape, sheetFrame, sheetPlacement } from './model.ts'
import { resolveDisplayCornerMetrics } from '../safe-area/displayCorners.ts'

describe('sheet frame available space', () => {
  it('keeps medium and large screen-edge bottom corners concentric without changing floating cards', () => {
    const screen = { width: 440, height: 956 }
    const viewport = { width: 440, height: 894 }
    const display = resolveDisplayCornerMetrics({ ...screen, scale: 3 })
    const edge = { kind: 'edge' } as const
    expect(
      sheetCornerShape(sheetFrame(440, 0, 0, edge), edge, viewport, screen, display),
    ).toMatchObject({
      cornerRadius: 38,
      bottomCornerRadius: 54,
    })
    expect(
      sheetCornerShape(sheetFrame(440, 1, 0, edge), edge, viewport, screen, display)
        .bottomCornerRadius,
    ).toBe(62)
    expect(
      sheetCornerShape(sheetFrame(440, 0, 200, edge), edge, viewport, screen, display)
        .bottomCornerRadius,
    ).toBeUndefined()
    const floating = { kind: 'floating', bottom: 20 } as const
    expect(
      sheetCornerShape(
        sheetFrame(834, 0, 0, floating),
        floating,
        { width: 834, height: 1162 },
        { width: 834, height: 1194 },
        display,
      ).bottomCornerRadius,
    ).toBeUndefined()
    expect(
      sheetCornerShape(
        sheetFrame(375, 0, 0, edge),
        edge,
        { width: 375, height: 894 },
        screen,
        display,
      ).bottomCornerRadius,
    ).toBeUndefined()
  })
  it('matches the native iPad default form in both fitted standalone orientations', () => {
    // Installed layout excludes the 32 pt status band. Native centers in the whole window.
    for (const [width, height, nativeLeft, nativeTop] of [
      [834, 1162, 127, 267],
      [1194, 802, 307, 87],
    ] as const) {
      const placement = sheetPlacement({ width, height }, 20, true, 32)
      const frame = sheetFrame(width, 1, 0, placement)
      const sheetHeight = formSheetHeight(height)
      expect(sheetHeight).toBe(660)
      expect(frame.left).toBe(nativeLeft)
      expect(height - frame.bottom - sheetHeight + 32).toBe(nativeTop)
    }
  })

  it.each([
    [390, 0, 374, 8, 8],
    [390, 0.5, 382, 4, 4],
    [390, 1, 390, 0, 0],
    [1024, 0, 580, 222, 8],
    [1024, 1, 580, 222, 0],
  ])(
    'centers a %s-point viewport at expansion %s without exceeding the sheet width cap',
    (viewport, expansion, width, left, bottom) => {
      const frame = sheetFrame(viewport, expansion, 0)
      expect(frame.width).toBe(width)
      expect(frame.left).toBe(left)
      expect(frame.bottom).toBe(bottom)
      expect(frame.left * 2 + frame.width).toBe(viewport)
      expect(frame.contentScale).toBeCloseTo(width / Math.min(viewport, 580))
    },
  )

  // Historical 13-inch viewport cases. The shared 660 pt policy needs fresh physical remeasurement there.
  it.each([
    // Preferred form height is independent of the presenting window's orientation.
    [1032, 1376, true, 'form', 580, 226, 358],
    [1376, 1032, true, 'form', 580, 398, 186],
    // With other detents it is a 580 pt sheet standing on the 20 pt bottom inset (large detent).
    [1032, 1376, false, 'floating', 580, 226, 20],
    // Compact width (split view) falls back to the iPhone sheet; compact height fills the screen.
    [500, 1376, true, 'edge', 500, 0, 0],
    [956, 440, true, 'fill', 956, 0, 0],
  ] as const)(
    'places a %s x %s sheet (only large: %s) as %s',
    (width, height, onlyLarge, kind, frameWidth, left, bottom) => {
      const placement = sheetPlacement({ width, height }, 20, onlyLarge)
      expect(placement.kind).toBe(kind)
      const frame = sheetFrame(width, 1, 0, placement)
      expect([frame.width, frame.left, frame.bottom]).toEqual([frameWidth, left, bottom])
    },
  )

  it.each([0, 0.5, 1])(
    'keeps expansion %s above keyboard occlusion without changing width',
    expansion => {
      const resting = sheetFrame(390, expansion, 0)
      const keyboard = sheetFrame(390, expansion, 300)
      expect(keyboard).toEqual({ ...resting, bottom: 300 })
      expect(sheetFrame(390, expansion, 2).bottom).toBe(Math.max(resting.bottom, 2))
    },
  )
})
