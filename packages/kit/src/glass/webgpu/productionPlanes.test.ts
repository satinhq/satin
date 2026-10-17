import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MirrorNode } from '../lens/Scene.tsx'
import { measureProductionSource } from './capture.ts'
import {
  backdropLayers,
  type PlaneEntry,
  type PlaneWindowHint,
  composeMaterialContext,
  materialContextAreas,
  measurePlane,
  uncoveredCapturePlane,
  TAB_CONTEXT_RADIUS,
  type Plane,
} from './productionPlanes.ts'
import type { RuntimeGeometry, SurfaceRenderSpec } from '../renderSpecs.ts'
import { uncoveredRows } from './captureBands.ts'
import { planeCompositeUniforms } from './rasterUniforms.ts'
import type { PinnedTop } from './productionPinnedTop.ts'

vi.mock('./capture.ts', () => ({ measureProductionSource: vi.fn() }))
vi.mock('./backdropLayers.ts', () => ({
  backdropOwner: () => undefined,
  backdropClip: () => [0, 0, 400, 800],
  effectiveBackground: () => [0, 0, 0, 1],
  cssColor: vi.fn(),
}))

const host = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
} as HTMLElement
const backdrop: MirrorNode = {
  id: 'backdrop',
  kind: 'text',
  text: 'Behind glass',
  color: '#fff',
  x: 10,
  y: 10,
  width: 100,
  height: 20,
}
const foreground: MirrorNode = { ...backdrop, id: 'label', regionId: 'glass' }

async function signature(
  nodes: readonly MirrorNode[],
  contentHeight = 800,
  windowHint?: () => PlaneWindowHint,
) {
  vi.mocked(measureProductionSource).mockResolvedValue({
    top: 0,
    left: 0,
    layout: { nodes, contentHeight, width: 400, measuredAt: 0, screen: 'root' },
  })
  return (
    await measurePlane(
      host,
      { page: [0, 0, 0], resolution: 2, appearance: 'dark' },
      () => 'plane',
      false,
      windowHint,
    )
  )?.signature
}

beforeEach(() => vi.clearAllMocks())

describe('backdrop capture identity', () => {
  it('reuses the backdrop when excluded glass foreground moves or changes content', async () => {
    const original = await signature([backdrop, foreground])
    const moved = await signature([
      backdrop,
      { ...foreground, x: 180, width: 150, text: 'New label' },
    ])
    expect(moved).toBe(original)
    expect(await signature([backdrop])).toBe(original)
  })

  it('reuses the backdrop when excluded nodes renumber generated IDs', async () => {
    const original = await signature([foreground, { ...backdrop, id: 'background-1' }])
    expect(await signature([{ ...backdrop, id: 'background-0' }])).toBe(original)
  })

  it('invalidates when an ordinary sibling moves or changes paint', async () => {
    const original = await signature([backdrop, foreground])
    expect(await signature([{ ...backdrop, x: 30 }, foreground])).not.toBe(original)
    expect(await signature([{ ...backdrop, color: '#f00' }, foreground])).not.toBe(original)
    expect(await signature([backdrop, foreground], 900)).not.toBe(original)
  })

  it('invalidates when foreground becomes part of the backdrop', async () => {
    const original = await signature([backdrop, foreground])
    expect(await signature([backdrop, { ...foreground, regionId: undefined }])).not.toBe(original)
  })
})

describe('planned capture window identity', () => {
  const entryWindow = () => ({ grow: false, velocity: 0 })
  const windowSignature = (nodes: readonly MirrorNode[]) => signature(nodes, 10000, entryWindow)
  beforeEach(() => {
    Object.assign(host, { scrollTop: 0, scrollHeight: 10000, clientHeight: 800 })
  })

  it('ignores off-window paint changes but invalidates visible paint', async () => {
    const distant = { ...backdrop, id: 'distant', y: 3000 }
    const original = await windowSignature([backdrop, distant])
    expect(await windowSignature([backdrop, { ...distant, color: '#f00' }])).toBe(original)
    expect(await windowSignature([{ ...backdrop, color: '#f00' }, distant])).not.toBe(original)
  })

  it('keeps the measured window when scrolling changes during asynchronous measurement', async () => {
    vi.mocked(measureProductionSource).mockImplementationOnce(async () => {
      Object.assign(host, { scrollTop: 3000 })
      return {
        top: 0,
        left: 0,
        layout: {
          nodes: [backdrop],
          contentHeight: 10000,
          width: 400,
          measuredAt: 0,
          screen: 'root',
        },
      }
    })
    const plane = await measurePlane(
      host,
      { page: [0, 0, 0], resolution: 2, appearance: 'dark' },
      () => 'plane',
      false,
      entryWindow,
    )
    expect(plane?.window?.top).toBe(0)
    expect(plane?.window?.bottom).toBe(1296)
    expect(vi.mocked(measureProductionSource).mock.calls[0]?.[3]).toEqual(plane?.window)
  })

  it('invalidates when the capture window moves', async () => {
    const original = await windowSignature([backdrop])
    Object.assign(host, { scrollTop: 2000 })
    expect(await windowSignature([backdrop])).not.toBe(original)
  })
})

describe('bounded capture window identity', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('a kept window that only records a new scrollport height is the same capture', async () => {
    vi.stubGlobal('document', {
      documentElement: { hasAttribute: () => false, getAttribute: () => null },
    })
    Object.assign(host, { scrollTop: 600, scrollHeight: 29000, clientHeight: 800 })
    const plane = (viewport: number) => {
      // The scrollport now (the keyboard came or went); the plane holds a window captured at 800.
      Object.assign(host, { clientHeight: viewport })
      return measurePlane(
        host,
        { page: [0, 0, 0], resolution: 2, appearance: 'dark' },
        () => 'plane',
        false,
        () => ({ current: { top: 0, bottom: 2730, viewport: 800 }, grow: false, velocity: 0 }),
      )
    }
    vi.mocked(measureProductionSource).mockResolvedValue({
      top: 0,
      left: 0,
      layout: {
        nodes: [backdrop],
        contentHeight: 29000,
        width: 400,
        measuredAt: 0,
        screen: 'root',
      },
    })
    const keyboardGone = await plane(800)
    const keyboardUp = await plane(400)
    expect(keyboardUp?.window).toEqual({ top: 0, bottom: 2730, viewport: 400 })
    expect(keyboardUp?.signature).toBe(keyboardGone?.signature)
  })
})

// Search-origin motion and scroll correction are exercised with real DOM hosts in
// search/searchBackdrop.test.ts; these plane tests cover its worker-layer wiring.
it('uses the captured logical search origin for a backdrop layer', () => {
  const scroller = {
    scrollLeft: 0,
    scrollTop: 140,
    hasAttribute: () => true,
  } as unknown as HTMLElement
  const plane = {
    id: 'chats',
    host: scroller,
    origin: { x: 0, y: 0 },
    width: 440,
    height: 956,
    clip: [0, 0, 440, 956],
    fill: [0, 0, 0, 1],
    measured: { searchAnchor: { offset: 54 } },
  } as unknown as Plane
  const installed = new Map([['chats', { key: 'capture' } as PlaneEntry]])
  expect(backdropLayers([plane], installed, 3)[0]!.scroll.y).toBe(194)
})

it.each([false, true])('fills real scroll-content edges during bounce, pinned=%s', pinned => {
  const plane = {
    id: 'album',
    host: { scrollLeft: 0, scrollTop: -160, hasAttribute: () => true },
    origin: { x: 0, y: pinned ? 8000 : 0 },
    width: 440,
    height: pinned ? 2000 : 1200,
    contentHeight: pinned ? 10000 : 1200,
    window: pinned ? { top: 8000, bottom: 10000, viewport: 956 } : undefined,
    clip: [0, 0, 440, 956],
    fill: [0, 0, 0, 1],
    measured: {},
  } as unknown as Plane
  const installed = new Map([['album', { key: 'copper-sun' } as PlaneEntry]])
  const tops = new Map<string, PinnedTop>([
    [
      'album',
      {
        key: 'copper-top',
        resolution: 3,
        width: 440,
        appearance: 'dark',
        text: '17px',
        stale: false,
        window: { top: 0, bottom: 1498, viewport: 956 },
      },
    ],
  ])
  const layers = backdropLayers([plane], installed, 3, pinned ? tops : undefined)
  // At -160 the toolbar lies above the orange first row. The shader must use the
  // scrollport's black background; clamp-to-edge would stretch that orange row.
  const top = planeCompositeUniforms([132, 132], 3, layers[0], [20, 60, 44, 44])
  expect(top[5] + top[14]).toBe(-100)
  expect(top[15] & 1).toBe(1)
  expect(top.slice(53, 56)).toEqual([0, 0, 0])
  // The same policy covers the real bottom, including a moving window over a pinned top.
  const bottom = planeCompositeUniforms([132, 132], 3, layers.at(-1)!, [20, 880, 44, 44])
  expect(bottom[15] & 2).toBe(2)
})

describe('capture bounded by the glass over a screen', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A screen that does not scroll, with glass at rows 100..160 and a tab bar from row 700. */
  const glassOver = (nodes: readonly MirrorNode[]) => {
    vi.stubGlobal('document', {
      documentElement: { hasAttribute: () => false, getAttribute: () => null },
    })
    Object.assign(host, { scrollTop: 0, scrollHeight: 800, clientHeight: 800 })
    vi.mocked(measureProductionSource).mockResolvedValue({
      top: 0,
      left: 0,
      layout: { nodes, contentHeight: 800, width: 400, measuredAt: 0, screen: 'root' },
    })
    return measurePlane(
      host,
      { page: [0, 0, 0], resolution: 2, appearance: 'dark' },
      () => 'plane',
      false,
      () => ({
        grow: false,
        velocity: 0,
        demand: {
          rects: [
            [10, 100, 60, 60],
            [0, 700, 400, 100],
          ],
          covered: false,
          damaged: true,
        },
      }),
    )
  }
  const away: MirrorNode = { ...backdrop, id: 'away', y: 400 }

  it('measures and captures only the rows under glass; content away from it is no change', async () => {
    const plane = await glassOver([backdrop, away])
    expect(plane?.bands).toEqual([
      { top: 76, bottom: 184 },
      { top: 676, bottom: 800 },
    ])
    expect(vi.mocked(measureProductionSource).mock.calls.at(-1)?.[3]).toMatchObject({
      bands: plane?.bands,
    })
    expect(plane?.measured.layout.nodes.map(node => node.id)).toEqual(['backdrop'])
    const changed = await glassOver([backdrop, { ...away, text: 'Changed away from glass' }])
    expect(changed?.signature).toBe(plane?.signature)
  })

  it('captures held sheet content in its resting frame before revealing it', async () => {
    vi.stubGlobal('document', {
      documentElement: { hasAttribute: () => false, getAttribute: () => null },
    })
    const surface = {}
    const layer = {
      contains: () => true,
      closest: () => ({ getAttribute: () => 'sheet' }),
    }
    const sheetContent = {
      scrollTop: 0,
      scrollHeight: 800,
      clientHeight: 800,
      closest: () => layer,
      parentElement: { closest: () => surface },
      getBoundingClientRect: () => ({
        x: 0,
        y: 957,
        left: 0,
        top: 957,
        right: 400,
        bottom: 1757,
        width: 400,
        height: 800,
      }),
    } as unknown as HTMLElement
    vi.stubGlobal('getComputedStyle', () => ({ transform: 'matrix(1, 0, 0, 1, 0, 900)' }))
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        e = 0
        f = 900
      },
    )
    vi.mocked(measureProductionSource).mockResolvedValue({
      top: 0,
      left: 0,
      layout: { nodes: [backdrop], contentHeight: 800, width: 400, measuredAt: 0, screen: 'root' },
    })
    // One resting toolbar and an unrelated offscreen region. Sampling the
    // offscreen host chooses only the latter's rows and cannot reveal the sheet.
    const samples = [
      [10, 157, 60, 60],
      [10, 1357, 60, 60],
    ] as const
    const plane = await measurePlane(
      sheetContent,
      { page: [0, 0, 0], resolution: 2, appearance: 'dark' },
      () => 'developer-menu',
      false,
      () => ({
        grow: false,
        velocity: 0,
        demand: { rects: samples, covered: false, damaged: true },
      }),
    )
    expect(uncoveredCapturePlane([plane!], samples, 2)).toBeUndefined()
  })

  it('refuses a sample outside the captured rows, but not beyond the end of the content', () => {
    const layer = {
      origin: { y: 0 },
      scroll: { y: 0 },
      height: 800,
      clip: [0, 0, 400, 800] as const,
      rows: [
        { top: 76, bottom: 184 },
        { top: 676, bottom: 800 },
      ],
    }
    expect(uncoveredRows([0, 100, 60, 60], layer)).toBeUndefined()
    expect(uncoveredRows([0, 700, 400, 300], layer)).toBeUndefined()
    expect(uncoveredRows([0, 300, 60, 60], layer)).toEqual({ top: 300, bottom: 360 })
  })
})

describe('material context readback', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads back only where the tab glyphs and the trigger sample a screen that does not scroll', () => {
    const reads: number[][] = []
    const context = {
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      getImageData: (x: number, y: number, width: number, height: number) => {
        reads.push([x, y, width, height])
        return { data: new Uint8ClampedArray(width * height * 4), width, height }
      },
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement
    Object.assign(context, { canvas })
    const spec = (id: string, frameX: number, frameY: number, frameWidth: number) =>
      ({ id, frameX, frameY, frameWidth, frameHeight: 50 }) as SurfaceRenderSpec
    const specs = [spec('dock', 20, 700, 360), spec('right', 0, 40, 44)]
    const plane = { id: 'plane', host, origin: { x: 0, y: 0 }, height: 800 } as Plane
    const { context: material } = composeMaterialContext(
      canvas,
      [plane],
      new Map(),
      plane,
      { width: 400, height: 800 } as RuntimeGeometry,
      { page: [0, 0, 0], resolution: 2 },
      materialContextAreas(specs, { scrollHeight: 800, clientHeight: 800 }, 800),
    )
    const pixels = reads.reduce((sum, [, , width, height]) => sum + width * height, 0)
    expect(pixels).toBeLessThan(400 * 800 * 0.25)
    expect(material.sample(200, 725, TAB_CONTEXT_RADIUS)).toBeDefined()
    expect(reads).toHaveLength(2)
    // A sample nowhere it was expected reads its own disc, never answers from nothing.
    expect(material.sample(200, 400, 10)).toBeDefined()
    expect(reads).toHaveLength(3)
  })
})
