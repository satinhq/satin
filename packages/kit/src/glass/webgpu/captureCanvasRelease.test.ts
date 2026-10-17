// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'

// Throwaway capture canvases are emptied as soon as they have been consumed. Left to the garbage
// collector, WebKit destroys each one's cached image with a synchronous GPU-process round trip,
// and a sweep of several stalled the main thread for about 200 ms at the start of a navigation.

const captured: HTMLCanvasElement[] = []
vi.mock('./foreground.ts', async original => ({
  ...(await original<typeof import('./foreground.ts')>()),
  captureRegionForeground: vi.fn(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 150
    captured.push(canvas)
    return canvas
  }),
}))
const { releaseCaptureCanvas, releaseCaptureCanvasesAfter } = await import('./captureRelease.ts')
const { captureProductionGlyphs } = await import('./capture.ts')

it('empties a capture canvas', () => {
  const canvas = document.createElement('canvas')
  canvas.width = 408
  canvas.height = 276
  releaseCaptureCanvas(canvas)
  expect([canvas.width, canvas.height]).toEqual([0, 0])
})

it("draws each tab's capture into the glyph canvas, then releases it", async () => {
  const dock = document.createElement('div')
  for (const label of ['Merge', 'Menus', 'Scroll']) {
    const tab = document.createElement('button')
    tab.setAttribute('role', 'tab')
    tab.textContent = label
    dock.append(tab)
  }
  document.body.append(dock)
  // The size each capture had when it was drawn: it must still hold its pixels then.
  const drawnSizes: number[][] = []
  const context = {
    setTransform() {},
    clearRect() {},
    scale() {},
    drawImage(source: HTMLCanvasElement) {
      drawnSizes.push([source.width, source.height])
    },
    set globalAlpha(_value: number) {},
  }
  const target = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement
  const spec = {
    sampleWidth: 526,
    sampleHeight: 318,
    sampleInsetX: 64,
    sampleInsetY: 128,
  } as SurfaceRenderSpec
  await captureProductionGlyphs(dock, spec, 3, target)
  expect(drawnSizes).toEqual([
    [300, 150],
    [300, 150],
    [300, 150],
  ])
  expect(captured).toHaveLength(3)
  expect(captured.map(canvas => [canvas.width, canvas.height])).toEqual([
    [0, 0],
    [0, 0],
    [0, 0],
  ])
  dock.remove()
})

it('releases after the reply settles either way, or after the fallback when it never does', async () => {
  const make = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1320
    canvas.height = 2868
    return canvas
  }
  vi.useFakeTimers()
  try {
    // Acknowledged.
    const acknowledged = [make()]
    const first = acknowledged[0]
    let acknowledge!: () => void
    releaseCaptureCanvasesAfter(new Promise<void>(resolve => (acknowledge = resolve)), acknowledged)
    await vi.advanceTimersByTimeAsync(1000)
    expect(first.width).toBe(1320)
    acknowledge()
    await vi.advanceTimersByTimeAsync(0)
    expect(first.width).toBe(0)
    expect(acknowledged).toEqual([])
    // Rejected.
    const rejected = [make()]
    const second = rejected[0]
    releaseCaptureCanvasesAfter(Promise.reject(Error('worker failed')), rejected)
    await vi.advanceTimersByTimeAsync(0)
    expect(second.width).toBe(0)
    // Never answered: released after the fallback delay, once.
    const unanswered = [make()]
    const third = unanswered[0]
    releaseCaptureCanvasesAfter(new Promise(() => {}), unanswered)
    await vi.advanceTimersByTimeAsync(4999)
    expect(third.width).toBe(1320)
    await vi.advanceTimersByTimeAsync(2)
    expect(third.width).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})
