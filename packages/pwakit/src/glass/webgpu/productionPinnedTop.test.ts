import { expect, it } from 'vitest'
import { LENS_REACH_POINTS } from '../captureWindow.ts'
import {
  cropTopRows,
  pinnedTopCovers,
  pinnedTopWindow,
  planPinnedTop,
  type PinnedTop,
  type PinnedTopInput,
} from './productionPinnedTop.ts'

// A long list scrolled away from its top keeps a second capture, of its top, so that a jump to
// the top (a status-bar tap, a tab re-selected, scrollToTop) lands on real pixels in its first
// frame instead of waiting for a capture (review round, October 2).

const top = pinnedTopWindow(956, 29000, 3)
const list = (overrides: Partial<PinnedTopInput> = {}): PinnedTopInput => ({
  window: { top: 8000, bottom: 10730, viewport: 956 },
  viewport: 956,
  contentHeight: 29000,
  resolution: 3,
  width: 440,
  appearance: 'light',
  text: '17px',
  existing: undefined,
  outgoing: undefined,
  mayCapture: false,
  ...overrides,
})
const held = (overrides: Partial<PinnedTop> = {}): PinnedTop => ({
  key: 'backdrop:plane-1:top:1',
  window: top,
  width: 440,
  resolution: 3,
  appearance: 'light',
  text: '17px',
  stale: false,
  ...overrides,
})
const outgoing = {
  window: { top: 0, bottom: 2730, viewport: 956 },
  width: 440,
  resolution: 3,
  appearance: 'light' as const,
  text: '17px',
  damaged: false,
  hasBytes: true,
}

it('the pinned window is what an entry at the top captures: the scrollport, the lens reach and its margin', () => {
  expect(top.top).toBe(0)
  expect(top.bottom).toBeGreaterThan(956 + LENS_REACH_POINTS)
  expect(top.bottom).toBeLessThan(956 * 2)
  expect(pinnedTopCovers(held(), 0, 956, 29000)).toBe(true)
  expect(pinnedTopCovers(held(), top.bottom - 956 - LENS_REACH_POINTS + 2, 956, 29000)).toBe(false)
  // Glass must not be told a stale capture is the list.
  expect(pinnedTopCovers(held({ stale: true }), 0, 956, 29000)).toBe(false)
})

it('a window that leaves the top keeps the rows it is replacing: cropped, nothing is captured', () => {
  expect(planPinnedTop(list({ outgoing }))).toEqual({ action: 'crop', window: top, stale: false })
  // Rows that changed since they were captured are kept too (better than none), marked stale.
  expect(planPinnedTop(list({ outgoing: { ...outgoing, damaged: true } }))).toEqual({
    action: 'crop',
    window: top,
    stale: true,
  })
})

it('cropping takes the first rows of the capture, byte for byte', () => {
  const bytes = new Uint8ClampedArray(Array.from({ length: 2 * 4 * 5 }, (_, index) => index))
  const cropped = cropTopRows(bytes, 2, 3)
  expect([...cropped]).toEqual([...bytes.subarray(0, 24)])
  // A copy: the capture it came from is released by the renderer on its own schedule.
  expect(cropped.buffer).not.toBe(bytes.buffer)
})

it('a capture that cannot give the top (entered mid-list, another appearance, no bytes) waits for an idle capture', () => {
  const midList = { ...outgoing, window: { top: 4000, bottom: 6730, viewport: 956 } }
  expect(planPinnedTop(list({ outgoing: midList }))).toEqual({ action: 'none' })
  expect(planPinnedTop(list({ outgoing: { ...outgoing, appearance: 'dark' } }))).toEqual({
    action: 'none',
  })
  expect(planPinnedTop(list({ outgoing: { ...outgoing, hasBytes: false } }))).toEqual({
    action: 'none',
  })
  // The idle preparation (or a framework jump that asks for it) captures the top from the page.
  expect(planPinnedTop(list({ mayCapture: true }))).toEqual({ action: 'capture', window: top })
})

it('a current pinned window is kept; a stale one is kept until an idle preparation captures it again', () => {
  expect(planPinnedTop(list({ existing: held() }))).toEqual({ action: 'keep' })
  expect(planPinnedTop(list({ existing: held(), mayCapture: true }))).toEqual({ action: 'keep' })
  expect(planPinnedTop(list({ existing: held({ stale: true }) }))).toEqual({ action: 'keep' })
  expect(planPinnedTop(list({ existing: held({ stale: true }), mayCapture: true }))).toEqual({
    action: 'capture',
    window: top,
  })
})

it('a pinned window of another appearance, text size, width or a shorter scrollport is not the list', () => {
  for (const existing of [
    held({ appearance: 'dark' }),
    held({ text: '21px' }),
    held({ width: 414 }),
    held({ window: pinnedTopWindow(400, 29000, 3) }),
  ]) {
    expect(planPinnedTop(list({ existing }))).toEqual({ action: 'release' })
    expect(planPinnedTop(list({ existing, mayCapture: true }))).toEqual({
      action: 'capture',
      window: top,
    })
  }
})

it('a list whose own window holds the top, or that is captured whole, needs no pinned window', () => {
  const atTop = { top: 0, bottom: 2730, viewport: 956 }
  expect(planPinnedTop(list({ window: atTop }))).toEqual({ action: 'none' })
  expect(planPinnedTop(list({ window: atTop, existing: held() }))).toEqual({ action: 'release' })
  expect(planPinnedTop(list({ window: undefined, existing: held() }))).toEqual({
    action: 'release',
  })
})

it('keeps a useful top when viewport growth only exceeds its prefetch margin', () => {
  const existing = held()
  expect(pinnedTopCovers(existing, 0, 1100, 29000)).toBe(true)
  expect(planPinnedTop(list({ existing, viewport: 1100 }))).toEqual({ action: 'keep' })
  expect(planPinnedTop(list({ existing, viewport: 1100, mayCapture: true }))).toEqual({
    action: 'capture',
    window: pinnedTopWindow(1100, 29000, 3),
  })
})

it('releases texels beyond the new content end after a list shrinks', () => {
  expect(planPinnedTop(list({ existing: held(), contentHeight: 600 }))).toEqual({
    action: 'release',
  })
})
