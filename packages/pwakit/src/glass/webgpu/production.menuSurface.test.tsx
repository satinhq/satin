// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GlassPresentation, type GlassPresentationConsumer } from '../GlassPresentation.tsx'
import { subscribeGlassErrors, type GlassError } from '../errors.ts'
import { ProductionGlassRuntime } from './production.ts'
import { GlassRegionRegistry } from '../regionRegistry.ts'

// The real GlassPresentation and ProductionGlassRuntime: creation, scheduling (schedulePrepare,
// requestAnimationFrame, scroll idling), the serial preparation, its installs and the menu surface
// watchdog all run as in the app, on fake timers. Only the boundaries are replaced: the worker
// client (acknowledgements can be withheld) and DOM rasterization (a capture can be made to hang).
const boundary = vi.hoisted(() => ({
  documentOwned: false,
  visible: true,
  pixelAcks: [] as (() => void)[],
  /** The arguments of every source staging call: the retained snapshot and what the worker's bitmap is taken from. */
  pixelStagings: [] as unknown[][],
  holdMenuAck: false,
  deferMenuAck: false,
  menuAcks: [] as (() => void)[],
  hangCapture: false,
  requests: [] as { type: string; layerId?: string; request?: { type: string } }[],
}))
vi.mock('./sourcePixels.ts', () => ({
  SourcePixels: class {
    prepare(...staging: unknown[]) {
      boundary.pixelStagings.push(staging)
      return new Promise<void>(resolve => boundary.pixelAcks.push(resolve))
    }
  },
}))
vi.mock('./client.ts', () => ({
  WebGPUClient: class {
    deferResume = false
    backend = 'webgpu'
    get documentOwned() {
      return boundary.documentOwned
    }
    async init() {}
    async attachLayer() {}
    resume() {}
    async park() {
      boundary.visible = false
    }
    onEvent() {
      return () => {}
    }
    request(request: {
      type: string
      layerId?: string
      visible?: boolean
      request?: { type: string }
    }) {
      if (request.type === 'visible') boundary.visible = Boolean(request.visible)
      boundary.requests.push(request)
      if (boundary.holdMenuAck && request.type === 'layer-source' && request.layerId === 'menu')
        return new Promise(() => {})
      // A controllable acknowledgement: held until the test releases it (in post order).
      if (boundary.deferMenuAck && request.type === 'layer-source' && request.layerId === 'menu')
        return new Promise(resolve => {
          boundary.menuAcks.push(() => resolve({}))
        })
      if (request.type === 'canonical' && request.request?.type === 'scene')
        return Promise.resolve({ navigation: 'navigation:1', presented: [] })
      return Promise.resolve({})
    }
  },
}))
vi.mock('./capture.ts', async original => {
  const actual = await original<typeof import('./capture.ts')>()
  const canvas = () => document.createElement('canvas')
  return {
    ...actual,
    measureProductionSource: async () => ({
      layout: { contentHeight: 800, nodes: [] },
      top: 0,
      left: 0,
    }),
    rasterProductionSource: (target: HTMLCanvasElement) =>
      boundary.hangCapture ? new Promise(() => {}) : Promise.resolve(target),
    captureProductionGlyphs: async () => canvas(),
    captureIncomplete: () => false,
  }
})
// The menu surface's own capture (its trigger ink) is the preparation step a newly enabled menu runs.
vi.mock('./foreground.ts', () => ({
  captureRegionForeground: () =>
    boundary.hangCapture
      ? new Promise(() => {})
      : Promise.resolve(document.createElement('canvas')),
}))

let root: Root,
  mount: HTMLDivElement,
  scroller: HTMLDivElement,
  content: HTMLDivElement,
  visibility: DocumentVisibilityState = 'visible'
const consumer = (): GlassPresentationConsumer => ({
  scroller,
  content,
  onReady() {},
})
let errors: GlassError[] = [],
  unsubscribe = () => {}
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(async () => {
  // A fresh app-lifetime runtime per test (it is shared across creates by design).
  ;(ProductionGlassRuntime as unknown as { shared?: unknown }).shared = undefined
  // happy-dom rejects an animation's `finished` promise on cancel even when nothing reads it
  // (browsers do not report that); mark it handled so disposal does not look like an app error.
  const cancel = Animation.prototype.cancel
  vi.spyOn(Animation.prototype, 'cancel').mockImplementation(function (this: Animation) {
    this.finished.catch(() => {})
    cancel.call(this)
  })
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'Date',
    ],
  })
  Object.assign(boundary, {
    documentOwned: false,
    visible: true,
    pixelAcks: [],
    pixelStagings: [],
    holdMenuAck: false,
    deferMenuAck: false,
    menuAcks: [],
    hangCapture: false,
    requests: [],
  })
  errors = []
  unsubscribe = subscribeGlassErrors(error => {
    errors.push(error)
  })
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => visibility !== 'visible',
  })
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} },
  })
  const context = new Proxy(
    {},
    {
      get: (_t, key) =>
        key === 'getImageData'
          ? (_x: number, _y: number, w: number, h: number) => ({
              width: w,
              height: h,
              data: new Uint8ClampedArray(Math.max(4, w * h * 4)),
            })
          : key === 'canvas'
            ? undefined
            : () => {},
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never)
  // Navigation atlas cells are rastered into fresh OffscreenCanvases and transferred.
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number
      height: number
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }
      getContext() {
        return context
      }
      transferToImageBitmap() {
        return { width: this.width, height: this.height, close() {} }
      }
    },
  )
  vi.stubGlobal('createImageBitmap', async (source: { width?: number; height?: number }) => ({
    width: source.width ?? 1,
    height: source.height ?? 1,
    close() {},
  }))
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mount = document.createElement('div')
  scroller = document.createElement('div')
  content = document.createElement('div')
  scroller.append(content)
  document.body.append(mount, scroller)
  root = createRoot(mount)
  // Created without a menu (the split layout's sidebar menu registers later); the first
  // preparation completes before the menu arrives.
  await act(async () => {
    root.render(<GlassPresentation consumer={consumer()} />)
  })
  await flush(100)
})
afterEach(async () => {
  unsubscribe()
  await act(async () => {
    root.unmount()
  })
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('prepares and publishes a navigation atlas for app regions without a dock', async () => {
  const runtime = await (
    ProductionGlassRuntime as unknown as {
      shared: Promise<{
        specs: Map<string, unknown>
        appRegions: {
          needsBackdrop: boolean
          bind: (registry: GlassRegionRegistry, source: HTMLElement) => void
        }
        contentPlane?: string
        navigation: (state: unknown) => Promise<void>
      }>
    }
  ).shared
  expect(runtime.specs.has('dock')).toBe(false)
  // Bind a real (empty) app registry so navigation must receive its current-atlas scene receipt.
  runtime.appRegions.bind(new GlassRegionRegistry(), scroller)
  // Declare the scene needs a backdrop; exercise the real navigation preparation and transport.
  Object.defineProperty(runtime.appRegions, 'needsBackdrop', { configurable: true, value: true })
  expect(runtime.contentPlane).toBeTruthy()
  const route = (key: string) => {
    const screen = document.createElement('div'),
      motion = document.createElement('div'),
      dim = document.createElement('div')
    screen.append(motion, dim)
    document.body.append(screen)
    for (const element of [screen, motion]) element.getAnimations = () => []
    return { key, screen, motion, dim, source: motion }
  }
  const start = boundary.requests.length
  await runtime.navigation({
    active: true,
    width: 400,
    top: 'two',
    routes: [route('one'), route('two')],
  })
  const sent = boundary.requests.slice(start).map(r => r.type)
  expect(sent).toContain('navigation-atlas')
  expect(sent).toContain('navigation-regions')
  expect(boundary.requests.slice(start).some(r => r.request?.type === 'scene')).toBe(true)
  expect(sent.indexOf('navigation-pose')).toBeLessThan(sent.indexOf('navigation-regions'))
})

it.each([false, true])(
  'awaits source staging before publication and discards a changed navigation epoch (%s)',
  async cancelled => {
    const runtime = await (
      ProductionGlassRuntime as unknown as {
        shared: Promise<{
          planes: Map<string, unknown>
          navigationRevision: number
          prepare: () => Promise<void>
        }>
      }
    ).shared
    runtime.planes.clear()
    boundary.documentOwned = true
    const start = boundary.requests.length,
      job = runtime.prepare()
    await flush(30)
    expect(boundary.pixelAcks.length).toBeGreaterThan(0)
    expect(boundary.requests.slice(start).some(r => r.type === 'source-images')).toBe(false)
    if (cancelled) runtime.navigationRevision++
    boundary.pixelAcks.splice(0).forEach(resolve => resolve())
    await job
    expect(boundary.requests.slice(start).some(r => r.type === 'source-images')).toBe(!cancelled)
  },
)

it('stages a document-owned capture from its capture canvas, not from a copy of the snapshot', async () => {
  const runtime = await (
    ProductionGlassRuntime as unknown as {
      shared: Promise<{ planes: Map<string, unknown>; prepare: () => Promise<void> }>
    }
  ).shared
  runtime.planes.clear()
  boundary.documentOwned = true
  const job = runtime.prepare()
  await flush(30)
  expect(boundary.pixelStagings.length).toBeGreaterThan(0)
  for (const [snapshot, capture] of boundary.pixelStagings) {
    // The worker's bitmap is a second snapshot of the canvas the capture was drawn into. A copy of
    // the first snapshot blocked the main thread for 5 to 6 ms per megabyte in WebKit.
    expect(capture).toBeInstanceOf(HTMLCanvasElement)
    expect(snapshot).not.toBe(capture)
    expect(snapshot).not.toBeInstanceOf(HTMLCanvasElement)
  }
  boundary.pixelAcks.splice(0).forEach(resolve => resolve())
  await job
})

// A menu can be the only glass on a screen. Closing it unmounts the presenter;
// opening another must make the retained worker drawable again.
it('restores drawing after the last glass presenter closes and another opens', async () => {
  expect(boundary.visible).toBe(true)
  await act(async () => root.render(null))
  expect(boundary.visible).toBe(false)
  await act(async () => root.render(<GlassPresentation consumer={consumer()} />))
  await flush(100)
  expect(boundary.visible).toBe(true)
  expect(errors).toEqual([])
})
