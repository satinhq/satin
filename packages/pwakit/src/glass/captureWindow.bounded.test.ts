import { describe, expect, it } from 'vitest'
import {
  ACCELERATED_CANVAS_PIXELS,
  captureWindowExhausted,
  grownExtent,
  planCaptureWindow,
  texelCount,
  type CaptureWindowRequest,
} from './captureWindow.ts'

describe('bounded capture windows', () => {
  const phone = (overrides: Partial<CaptureWindowRequest>): CaptureWindowRequest => ({
    scrollTop: 0,
    viewport: 956,
    contentHeight: 2695,
    resolution: 3,
    grow: false,
    velocity: 0,
    ...overrides,
  })
  const extent = (window: { top: number; bottom: number }) => window.bottom - window.top

  it('an entry capture is the scrollport and its margin, whatever the length of the list', () => {
    for (const rows of [40, 80, 200, 500, 2000]) {
      const window = planCaptureWindow(phone({ contentHeight: 375 + rows * 58 }))!
      // The scrollport, the lens reach (128 pt) and 0.15 of the scrollport, either side.
      expect(extent(window)).toBeCloseTo(956 + 2 * (128 + 956 * 0.15), 0)
      expect(window.top).toBe(0)
    }
  })
  it('an entry in the middle of a list has content either side, on texel rows', () => {
    const window = planCaptureWindow(phone({ contentHeight: 29000, scrollTop: 12000.4 }))!
    expect(window.top).toBeLessThan(12000.4 - 128 - 956 * 0.14)
    expect(window.bottom).toBeGreaterThan(12000.4 + 128 + 956 * 1.14)
    expect(window.top * 3).toBeCloseTo(Math.round(window.top * 3))
  })
  it('content that an entry window would hold anyway is captured whole', () => {
    expect(planCaptureWindow(phone({ contentHeight: 956 }))).toBeUndefined()
    expect(planCaptureWindow(phone({ contentHeight: 1200 }))).toBeUndefined()
  })
  it('an idle scene grows to the whole content when one accelerated canvas holds it', () => {
    const entry = planCaptureWindow(phone({}))!
    expect(planCaptureWindow(phone({ current: entry, grow: true }))).toBeUndefined()
    // …and a whole capture stays whole.
    expect(planCaptureWindow(phone({ current: 'full' }))).toBeUndefined()
  })
  it('a longer list grows to the canvas ceiling and never beyond it', () => {
    const request = phone({ contentHeight: 29000, scrollTop: 12000 })
    const entry = planCaptureWindow(request)!
    const grown = planCaptureWindow({ ...request, current: entry, grow: true })!
    expect(extent(grown) * 3).toBeLessThanOrEqual(ACCELERATED_CANVAS_PIXELS)
    expect(extent(grown)).toBeGreaterThan(956 * 2.8)
    expect(grownExtent({ viewport: 1024, resolution: 2 })).toBe(4096)
  })
  it('keeps the window a plane holds while it covers the scrollport with the guard to spare', () => {
    const request = phone({ contentHeight: 29000, scrollTop: 12000 })
    const grown = planCaptureWindow({
      ...request,
      grow: true,
      current: planCaptureWindow(request)!,
    })!
    expect(planCaptureWindow({ ...request, current: grown })).toBe(grown)
    expect(planCaptureWindow({ ...request, current: grown, scrollTop: 12300 })).toBe(grown)
    // A tab that comes back at the scroll offset it left keeps its capture (nothing is captured).
    expect(planCaptureWindow({ ...request, current: grown, grow: true })).toBe(grown)
  })
  it('recentres before the scrollport reaches the edge, sooner the faster it scrolls, and ahead of the travel', () => {
    const request = phone({ contentHeight: 29000, scrollTop: 12000 })
    const window = planCaptureWindow({
      ...request,
      grow: true,
      current: planCaptureWindow(request)!,
    })!
    const spare = window.bottom - 956
    // At rest: the lens reach (128 pt) and an eighth of the scrollport (119.5 pt) from the edge.
    expect(captureWindowExhausted(window, spare - 300, 29000, 0)).toBe(false)
    expect(captureWindowExhausted(window, spare - 200, 29000, 0)).toBe(true)
    // At 4,000 pt/s the lead is 800 pt, beyond the lens reach.
    expect(captureWindowExhausted(window, spare - 900, 29000, 4000)).toBe(true)
    expect(captureWindowExhausted(window, spare - 1000, 29000, 4000)).toBe(false)
    // Scrolling towards the start only the leading (top) edge takes the lead.
    expect(captureWindowExhausted(window, spare - 700, 29000, -4000)).toBe(false)
    const next = planCaptureWindow({
      ...request,
      current: window,
      scrollTop: spare - 700,
      velocity: 4000,
    })!
    expect(next).not.toBe(window)
    const ahead = next.bottom - (spare - 700) - 956
    const behind = spare - 700 - next.top
    expect(ahead).toBeGreaterThan(behind * 2.5)
  })
  it('a jump outside the window is exhausted (and recentred), never an error', () => {
    const request = phone({ contentHeight: 116000 })
    const window = planCaptureWindow(request)!
    expect(captureWindowExhausted(window, 50000, 116000, 0)).toBe(true)
    const next = planCaptureWindow({ ...request, current: window, scrollTop: 50000 })!
    expect(next.top).toBeLessThan(50000)
    expect(next.bottom).toBeGreaterThan(50956)
    // At rest the jump is an entry at the new place (the smallest capture is installed soonest)…
    expect(extent(next)).toBeCloseTo(956 + 2 * (128 + 956 * 0.15), 0)
    // …and a flick that outran the window gets the large one, ahead of its travel.
    const flick = planCaptureWindow({
      ...request,
      current: window,
      scrollTop: 50000,
      velocity: 9000,
    })!
    expect(extent(flick) * 3).toBeGreaterThan(8000)
    expect(flick.bottom - 50956).toBeGreaterThan(50000 - flick.top)
  })
  it('does not recentre forever at the ends of the content', () => {
    const request = phone({ contentHeight: 29000 })
    const top = planCaptureWindow({ ...request, grow: true, current: planCaptureWindow(request)! })!
    expect(captureWindowExhausted(top, 0, 29000, -3000)).toBe(false)
    const end = { ...request, scrollTop: 29000 - 956 }
    const bottom = planCaptureWindow({ ...end, grow: true, current: planCaptureWindow(end)! })!
    expect(captureWindowExhausted(bottom, 29000 - 956, 29000, 3000)).toBe(false)
  })
  it('a whole capture whose content outgrew the canvas becomes a window', () => {
    const window = planCaptureWindow(
      phone({ current: 'full', contentHeight: 29000, scrollTop: 500 }),
    )
    expect(window).toBeDefined()
    expect(extent(window!) * 3).toBeLessThanOrEqual(ACCELERATED_CANVAS_PIXELS)
  })
})

it('bounds entry overscan when the content exceeds the accelerated texture limit', () => {
  const window = planCaptureWindow({
    scrollTop: 0,
    viewport: 2400,
    contentHeight: 3000,
    resolution: 3,
    grow: false,
    velocity: 0,
  })
  expect(window).toBeDefined()
  expect((window!.bottom - window!.top) * 3).toBeLessThanOrEqual(8192)
})

describe('window pixel counts at the accelerated limit', () => {
  // Owner's Chats thread on an iPhone (DPR 3, 146,532 pt of messages): grown windows such as
  // 26756.333…..29487 measured 8192.000000004 px and rounded up to 8193, past the limit.
  it('a grown window at DPR 3 never needs more than the accelerated canvas', () => {
    const resolution = 3
    for (let scrollTop = 0; scrollTop < 146532 - 834; scrollTop += 97.37) {
      const window = planCaptureWindow({
        scrollTop,
        viewport: 834,
        contentHeight: 146532,
        resolution,
        grow: true,
        velocity: 1200,
      })
      expect(window).toBeDefined()
      expect(texelCount(window!.bottom - window!.top, resolution)).toBeLessThanOrEqual(
        ACCELERATED_CANVAS_PIXELS,
      )
    }
  })

  it('counts the window the owner hit as exactly 8192 pixels', () => {
    expect(texelCount(29487 - 26756.333333333332, 3)).toBe(8192)
    expect(texelCount(2730.67, 3)).toBe(8193)
  })

  // Grok review: widths snapped to whole device pixels at DPR 2.625 measured a hair over the integer
  // (320.328125 pt = 841.0000000000001 px) and the canvas was allocated one column wider than the plane.
  it('counts snapped widths at DPR 2.625 as the pixels they were snapped to', () => {
    for (const points of [320.328125, 744.5, 1180.5]) {
      const snapped = Math.ceil(points * 2.625) / 2.625
      expect(texelCount(snapped, 2.625)).toBe(Math.round(snapped * 2.625))
    }
  })
})
