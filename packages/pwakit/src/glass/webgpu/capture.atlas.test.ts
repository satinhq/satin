// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { rasterNavigationAtlas } from './capture.ts'

// A route in a split column (the iPad detail column at x = 320) is rasterized into its atlas cell
// with only its column opaque: the navigation composite draws each route cell across the whole
// viewport width, so an opaque cell left of the column would paint the page background over the
// routes a pushed page passes (the back button glass went black mid-push).
it('an atlas cell is transparent outside its route column', async () => {
  const calls: string[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_t, key) =>
        key === 'clearRect' || key === 'fillRect'
          ? (...a: number[]) => calls.push(`${String(key)} ${a.join(',')}`)
          : key === 'canvas'
            ? undefined
            : () => {},
    },
  )
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockImplementation(() => ctx as never)
  const measured = {
    top: 54,
    left: 320,
    layout: {
      contentHeight: 800,
      measuredAt: 0,
      screen: 'root',
      width: 1046,
      nodes: [
        {
          id: 'page',
          kind: 'rect',
          x: 0,
          y: 0,
          width: 1046,
          height: 800,
          color: 'rgb(200, 40, 90)',
        },
      ],
    },
  }
  await rasterNavigationAtlas(
    canvas,
    [{ measured: measured as never, scrollTop: 0 }],
    1366,
    1024,
    1,
    true,
  )
  expect(calls[0]).toBe('clearRect 0,0,1366,1024')
  expect(calls).toContain('fillRect 320,0,1046,1024')
  expect(calls.some(c => c.startsWith('fillRect 0,0,'))).toBe(false)
})

it('rasterizes a sampling band at its original viewport and scroll coordinates', async () => {
  const calls: unknown[][] = [],
    ctx = new Proxy(
      {},
      {
        get:
          (_t, key) =>
          (...args: unknown[]) =>
            calls.push([key, ...args]),
      },
    )
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockImplementation(() => ctx as never)
  const measured = {
    top: 54,
    left: 320,
    layout: { contentHeight: 2000, measuredAt: 0, screen: 'root', width: 1046, nodes: [] },
  }
  await rasterNavigationAtlas(
    canvas,
    [{ measured: measured as never, scrollTop: 300 }],
    1366,
    84,
    2,
    true,
    66,
  )
  expect(canvas.height).toBe(168)
  expect(canvas.width).toBe(2732)
  expect(calls).toContainEqual(['setTransform', 2, 0, 0, 2, 0, -732])
  expect(calls).toContainEqual(['fillRect', 640, 0, 2092, 168])
})
