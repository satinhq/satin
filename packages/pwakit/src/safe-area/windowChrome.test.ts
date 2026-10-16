import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { windowControlsBackInset } from './windowChrome.ts'

const sample = (width: number, screen: [number, number], standalone = true) =>
  windowControlsBackInset({
    standalone,
    screen: { width: screen[0], height: screen[1] },
    layoutViewport: { width, height: 714 },
  })

beforeEach(() => {
  vi.stubGlobal('navigator', { userAgent: 'iPad', platform: 'iPad', maxTouchPoints: 5 })
})
afterEach(() => vi.unstubAllGlobals())

it.each([
  {
    device: 'narrow iPad below the old screen cutoff',
    userAgent: 'iPad',
    platform: 'iPad',
    maxTouchPoints: 5,
    width: 440,
    screen: [700, 1000] as [number, number],
    inset: 78,
  },
  {
    device: 'desktop-agent iPad below the old screen cutoff',
    userAgent: 'Macintosh',
    platform: 'MacIntel',
    maxTouchPoints: 5,
    width: 440,
    screen: [700, 1000] as [number, number],
    inset: 78,
  },
  {
    device: 'wide phone',
    userAgent: 'iPhone',
    platform: 'iPhone',
    maxTouchPoints: 5,
    width: 700,
    screen: [800, 1000] as [number, number],
    inset: 0,
  },
  {
    device: 'unknown large host',
    userAgent: 'Desktop',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    width: 700,
    screen: [800, 1000] as [number, number],
    inset: 0,
  },
])(
  'uses $device identity for window-control clearance',
  ({ userAgent, platform, maxTouchPoints, width, screen, inset }) => {
    vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints })
    expect(sample(width, screen)).toBe(inset)
  },
)

it('clears controls in narrow installed tablet windows without shifting full-screen or phone chrome', () => {
  expect(sample(375, [744, 1133])).toBe(78)
  expect(sample(473, [1032, 1376])).toBe(78)
  expect(sample(473, [1376, 1032])).toBe(78)
  expect(sample(744, [744, 1133])).toBe(0)
  expect(sample(1376, [1032, 1376])).toBe(0)
  expect(sample(375, [744, 1133], false)).toBe(0)
  vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 })
  expect(sample(440, [440, 956])).toBe(0)
})
