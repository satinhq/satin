// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { Backdrop } from './backdrop.ts'
import { FrameGraph } from './frameGraph.ts'
import type { LayerDevice } from './layers.ts'
import { compositeUniforms, planeCompositeUniforms } from './rasterUniforms.ts'
import type { BackdropLayer, RasterSetup } from '../worker/protocol.ts'

// What glass shows where a plane's capture window has no pixels (review round, October 2).
// A window edge that is not an end of the content is "open": beyond it the plane's fill is shown,
// never the window's edge row stretched. Real scrolling edges separately request fillEdges;
// static captures retain edge extension. A pinned top lies under the list's own window.

const owner = () => ({ liveDevice: undefined, subscribe: () => () => {} }) as unknown as LayerDevice
const bitmap = (width: number, height: number) =>
  ({ width, height, close() {} }) as unknown as ImageBitmap
function backdrop(layers: BackdropLayer[]) {
  const device = owner()
  const graph = FrameGraph.for(device)
  for (const layer of layers) graph.image(layer.key, bitmap(1320, layer.height * 3))
  const installed = Backdrop.for(device)
  installed.setLayers(layers)
  return installed
}
/** A list plane in a 440 x 956 scrollport, scrolled to 9,000: its window holds 8,000..10,730. */
const list = (overrides: Partial<BackdropLayer> = {}): BackdropLayer => ({
  id: 'list',
  key: 'list:7:front',
  width: 440,
  height: 2730,
  resolution: 3,
  origin: { x: 0, y: 8000 },
  clip: [0, 0, 440, 956],
  scroll: { x: 0, y: 9000 },
  fill: [1, 1, 1, 1],
  openEdges: 3,
  ...overrides,
})
/** The same list's first 1,498 pt, pinned for a scroll to the top. */
const pinned: BackdropLayer = {
  id: 'list:top',
  follows: 'list',
  key: 'list:top:3:front',
  width: 440,
  height: 1498,
  resolution: 3,
  origin: { x: 0, y: 0 },
  clip: [0, 0, 440, 956],
  scroll: { x: 0, y: 9000 },
  fill: [1, 1, 1, 1],
  openEdges: 2,
}

it('keeps a page landmark fixed when its glass canvas translates and squishes', () => {
  const plane = list({ origin: { x: 0, y: 0 }, scroll: { x: 0, y: 0 } })
  const screenLandmark = { x: 210, y: 260 }
  // The same retained page texture, seen through a 200 x 100 canvas at two poses.
  for (const [left, top, scaleX, scaleY] of [
    [100, 200, 1, 1],
    [120, 190, 1.1, 0.8],
  ]) {
    const values = planeCompositeUniforms(
      [600, 300],
      3,
      plane,
      [left, top, 200 * scaleX, 100 * scaleY],
      [scaleX, scaleY],
    )
    const localX = (screenLandmark.x - left) / scaleX
    const localY = (screenLandmark.y - top) / scaleY
    // Composite shader's local-texel -> captured-page mapping. Old uniforms have no scale.
    expect(localX * (values[56] ?? 1) + values[4]).toBeCloseTo(screenLandmark.x)
    expect(localY * (values[57] ?? 1) + values[5]).toBeCloseTo(screenLandmark.y)
  }
})

// GPU pixel coverage: scripts/perf/open-edge-pixels.mjs (Catalyst flow, including a negative control).

it('a plane says which of its edges are open and what its fill is; the default is neither', () => {
  const values = planeCompositeUniforms([1320, 954], 3, list(), [0, 800, 440, 318])
  // struct P: size, origin, background, source (front height, rear height, scroll, open edges)…
  expect(values[15]).toBe(3)
  // …route, eight atlas slots, then atlasCount (atlas routes, fill rgb).
  expect(values.slice(52, 56)).toEqual([0, 1, 1, 1])
  expect(
    planeCompositeUniforms([1320, 954], 3, list({ openEdges: undefined }), [0, 0, 1, 1])[15],
  ).toBe(0)
  // A raster's own capture (no backdrop installed, or the content plane) starts closed on both
  // edges, with the page background as its fill: the pixels it always had.
  const setup = {
    spec: {
      sampleWidth: 440,
      sampleHeight: 318,
      frameX: 0,
      frameY: 800,
      sampleInsetX: 0,
      sampleInsetY: 0,
    },
    resolution: 3,
    width: 440,
    height: 956,
  } as unknown as RasterSetup
  const own = compositeUniforms(setup, undefined, 0, 0, [0.5, 0.25, 0.125, 1], 2868, 2868)
  expect(own[15]).toBe(0)
  expect(own.slice(52, 56)).toEqual([0, 0.5, 0.25, 0.125])
})

it('a scroll moves a pinned window with the plane it belongs to', () => {
  const installed = backdrop([pinned, list()])
  expect(installed.setScroll('list', 0, 400)).toBe(true)
  expect(installed.layers.map(layer => layer.scroll.y)).toEqual([400, 400])
  expect(installed.setScroll('list', 0, 400)).toBe(false)
})

it('keeps overscroll fill separate from window clipping and invalidates either sampling path', () => {
  const rect = [20, 60, 44, 44] as const
  const plain = list({ origin: { x: 0, y: 0 }, scroll: { x: 0, y: -160 }, openEdges: 0 })
  const filled = { ...plain, fillEdges: 3 }
  for (const skip of [undefined, plain.id]) {
    expect(backdrop([filled]).keyFor(rect, skip)).not.toBe(backdrop([plain]).keyFor(rect, skip))
  }
  // A filled real top must not become a missing-window band boundary. It still
  // draws through the entire gap; otherwise unrelated underlying planes could leak in.
  expect(backdrop([{ ...filled, band: true }]).under(rect)[0].clip).toEqual(rect)
  expect(planeCompositeUniforms([132, 132], 3, plain, rect)[15]).toBe(0)
  expect(planeCompositeUniforms([132, 132], 3, filled, rect)[15]).toBe(3)
})

it('a window over a pinned one is drawn only where it has pixels; the pinned one fills the rest', () => {
  // Scrolled to the top by a status-bar tap: the list's own window is 8,000 pt further down.
  const installed = backdrop([pinned, list({ band: true })])
  installed.setScroll('list', 0, 0)
  const bar: readonly [number, number, number, number] = [40, 870, 360, 62]
  expect(installed.under(bar).map(({ plane, clip }) => [plane.layer.id, clip])).toEqual([
    ['list:top', [40, 870, 360, 62]],
  ])
  // Half-way back into the window: its part of the surface only.
  installed.setScroll('list', 0, 7100)
  expect(installed.under(bar).map(({ plane, clip }) => [plane.layer.id, clip])).toEqual([
    ['list:top', [40, 870, 360, 62]],
    ['list', [40, 900, 360, 32]],
  ])
  // Without a pinned window under it, a window covers its whole clip (the shader fills beyond).
  const alone = backdrop([list()])
  alone.setScroll('list', 0, 0)
  expect(alone.under(bar).map(({ clip }) => clip)).toEqual([[40, 870, 360, 62]])
})

it('a composed backdrop is keyed by its open edges and its band', () => {
  const rect: readonly [number, number, number, number] = [40, 870, 360, 62]
  const closed = backdrop([list({ openEdges: 0 })]).keyFor(rect)
  expect(backdrop([list()]).keyFor(rect)).not.toBe(closed)
  // A band's colour change must invalidate glass sitting above the scroll edge.
  const installed = backdrop([list()])
  const edge = {
    rect: [0, 0, 440, 116] as const,
    solid: 96,
    sigma: 5.5,
    tint: [1, 1, 1, 0.765550479] as const,
    strength: 1,
    cap: { color: [1, 1, 1, 1] as const, solid: 1, end: 44 },
  }
  const control = [20, 8, 44, 44] as const
  installed.setEdges([edge])
  const light = installed.keyFor(control)
  installed.setEdges([{ ...edge, cap: { ...edge.cap, color: [0, 0, 0, 1] } }])
  expect(installed.keyFor(control)).not.toBe(light)
})

it('removing a pinned plane releases its image reference and restores the parent fill', () => {
  const installed = backdrop([pinned, list({ band: true })])
  installed.removePinned(['list'])
  expect(installed.layers.map(layer => layer.id)).toEqual(['list'])
  expect(installed.layers[0].band).not.toBe(true)
})
