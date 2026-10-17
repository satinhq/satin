import { describe, expect, it } from 'vitest'
import {
  LENS_REACH_POINTS,
  captureWindowExhausted,
  planCaptureWindow,
  windowCoversScrollport,
  type CaptureWindowRequest,
} from './captureWindow.ts'
import { GLASS_OVERSCAN_Y_PX } from './lens/Scene.tsx'

// Review round (October 2): coverage is judged for the scrollport as it is now, and for what a
// lens samples beyond it, never for the scrollport the window was captured with.

const request = (overrides: Partial<CaptureWindowRequest>): CaptureWindowRequest => ({
  scrollTop: 0,
  viewport: 956,
  contentHeight: 29000,
  resolution: 3,
  grow: false,
  velocity: 0,
  ...overrides,
})

describe('coverage follows the live scrollport', () => {
  // Captured while the keyboard was up (a 400 pt scrollport), 2,730 pt of content from the top.
  const short = { top: 0, bottom: 2730, viewport: 400 }

  it('a window captured with a short scrollport does not cover the taller one', () => {
    // With the keyboard up the scrollport ended at 2,400; dismissed, it ends at 2,800.
    expect(windowCoversScrollport(short, 2000, 400, 29000)).toBe(true)
    expect(windowCoversScrollport(short, 2000, 800, 29000)).toBe(false)
    expect(captureWindowExhausted(short, 2000, 29000, 0, 800)).toBe(true)
  })

  it('a preparation after the scrollport grew captures a window for it', () => {
    const next = planCaptureWindow(request({ current: short, scrollTop: 2000, viewport: 800 }))!
    expect(next).not.toBe(short)
    expect(next.viewport).toBe(800)
    expect(next.top).toBeLessThanOrEqual(2000 - LENS_REACH_POINTS)
    expect(next.bottom).toBeGreaterThanOrEqual(2800 + LENS_REACH_POINTS)
  })

  it('a window that still covers a resized scrollport keeps its pixels and takes the new height', () => {
    const kept = planCaptureWindow(request({ current: short, scrollTop: 600, viewport: 800 }))!
    expect([kept.top, kept.bottom]).toEqual([0, 2730])
    expect(kept.viewport).toBe(800)
    // Unchanged geometry keeps the very same window (nothing to commit).
    const same = { top: 0, bottom: 2730, viewport: 800 }
    expect(planCaptureWindow(request({ current: same, scrollTop: 600, viewport: 800 }))).toBe(same)
  })
})

describe('coverage includes what a lens samples beyond the scrollport', () => {
  it('the lens reach is the sample overscan of a glass surface', () => {
    expect(LENS_REACH_POINTS).toBeGreaterThanOrEqual(GLASS_OVERSCAN_Y_PX)
  })

  it('an entry window reaches further than the lens on both sides, on any scrollport', () => {
    for (const viewport of [500, 750, 956, 1366]) {
      const window = planCaptureWindow(request({ viewport, scrollTop: 12000 }))!
      expect(12000 - window.top).toBeGreaterThan(LENS_REACH_POINTS)
      expect(window.bottom - 12000 - viewport).toBeGreaterThan(LENS_REACH_POINTS)
      // …with room to scroll before the first recentre.
      expect(captureWindowExhausted(window, 12000, 29000, 0, viewport)).toBe(false)
      expect(captureWindowExhausted(window, 12000 + viewport * 0.02, 29000, 0, viewport)).toBe(
        false,
      )
    }
  })

  it('a scrollport whose lens reach leaves the window is not covered', () => {
    const window = { top: 1000, bottom: 3730, viewport: 956 }
    expect(windowCoversScrollport(window, 1000 + LENS_REACH_POINTS, 956, 29000)).toBe(true)
    expect(windowCoversScrollport(window, 1000 + LENS_REACH_POINTS - 2, 956, 29000)).toBe(false)
    expect(windowCoversScrollport(window, 3730 - 956 - LENS_REACH_POINTS + 2, 956, 29000)).toBe(
      false,
    )
  })

  it('the ends of the content need no reach: there is nothing beyond them to sample', () => {
    expect(windowCoversScrollport({ top: 0, bottom: 2730, viewport: 956 }, 0, 956, 29000)).toBe(
      true,
    )
    const last = { top: 29000 - 2730, bottom: 29000, viewport: 956 }
    expect(windowCoversScrollport(last, 29000 - 956, 956, 29000)).toBe(true)
  })

  it('a recentre starts while the lens reach is still inside the window', () => {
    const window = { top: 1000, bottom: 3730, viewport: 956 }
    const edge = 3730 - 956
    const guard = 956 / 8
    expect(
      captureWindowExhausted(window, edge - LENS_REACH_POINTS - guard - 2, 29000, 0, 956),
    ).toBe(false)
    expect(
      captureWindowExhausted(window, edge - LENS_REACH_POINTS - guard + 2, 29000, 0, 956),
    ).toBe(true)
  })
})
