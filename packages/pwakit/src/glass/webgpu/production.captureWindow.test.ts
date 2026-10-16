import {
  beginSearchBackdrop,
  refreshSearchBackdrop,
  searchBackdropAnchor,
} from '../../search/searchBackdrop.ts'
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CaptureWindow } from '../captureWindow.ts'
import { ProductionGlassRuntime } from './production.ts'
import { commitPlaneSet } from './productionInstalls.ts'
import type { PinnedTop } from './productionPinnedTop.ts'
import type { MaterialContext, PlaneEntry } from './productionPlanes.ts'
import { ResidentPlanes } from './residentPlanes.ts'
import { uncoveredRows } from './captureBands.ts'
import * as presentationFrame from '../presentationFrame.ts'

// The runtime's part of bounded capture (captureWindow.ts): following a windowed plane's scroll,
// what a plane's next window is chosen from, and growing an entry window once the scene is idle.
// The runtime is built without its renderer: only the members these methods use exist.

type Runtime = Omit<ProductionGlassRuntime, 'schedulePrepare'> & {
  schedulePrepare: ReturnType<typeof vi.fn>
}

const host = (scrollTop: number, scrollHeight = 29375) => {
  const element = { scrollTop, scrollHeight, clientHeight: 956, isConnected: true } as HTMLElement
  element.contains = node => node === element
  return element
}

const entry = (window: CaptureWindow | undefined, element: HTMLElement): PlaneEntry => ({
  window,
  signature: 'signature',
  key: 'backdrop:plane-1:1',
  revision: 1,
  origin: { x: 0, y: 0 },
  width: 440,
  height: window ? window.bottom - window.top : element.scrollHeight,
  resolution: 3,
  host: element,
  appearance: 'light',
  text: '17px',
})

function runtime(planes: [string, PlaneEntry][] = []) {
  const instance = Object.create(ProductionGlassRuntime.prototype) as unknown as Runtime
  Object.assign(instance, {
    planes: new Map(planes),
    resident: new ResidentPlanes<MaterialContext>(80e6),
    scrollSpeeds: new WeakMap(),
    growPlanes: new Set<string>(),
    growTimer: 0,
    pendingRecentre: false,
    captureWindows: { recentres: 0, grows: 0, outruns: [] },
    outrunSince: new Map<string, number>(),
    pinnedTops: new Map(),
    pinnedOrphans: new Set(),
    damaged: new Set(),
    damageGenerations: new Map(),
    preparingPlaneHosts: new Map(),
    preparingPlaneWindows: new Map(),
    pendingDamage: new Map(),
    fire: vi.fn(),
    nextTransport: () => 1,
    planeIds: new WeakMap(),
    nextPlane: 0,
    fontGeneration: 0,
    keptGlyphs: { reset: vi.fn() },
    client: { documentOwned: true },
    options: { appearance: 'light' },
    lastText: '17px',
    lastScrollAt: -Infinity,
    attached: true,
    lifecycleHidden: false,
    pointer: false,
    navigationActive: false,
    schedulePrepare: vi.fn(),
  })
  return instance
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  })
})
afterEach(() => {
  vi.useRealTimers()
})

it('keeps waiting when a keyboard move outruns the acknowledged capture', async () => {
  const element = document.createElement('div')
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 440, 1000))
  const plane = { ...entry(undefined, element), height: 1000, bands: [{ top: 798, bottom: 834 }] }
  const glass = runtime([['plane-1', plane]])
  Object.assign(glass, { coverageWaiters: [], record: vi.fn() })
  let top = 407
  let covered = false
  const waiting = glass
    .coverFor(() => [[0, top, 440, 84]])!
    .then(() => {
      covered = true
    })
  top = 350
  plane.bands = [{ top: 400, bottom: 500 }]
  glass.coverageInstalled()
  await Promise.resolve()
  expect(covered).toBe(false)
  plane.bands = [{ top: 326, bottom: 500 }]
  glass.coverageInstalled()
  await waiting
  expect(covered).toBe(true)
  element.remove()
})

it('checks nested sheet glass against the resting plane while its DOM travels offscreen', async () => {
  const element = document.createElement('div')
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 1000, 440, 874))
  const travel = vi.spyOn(presentationFrame, 'presentationTravel').mockReturnValue({ x: 0, y: 918 })
  const plane = {
    ...entry(undefined, element),
    origin: { x: 0, y: 82 },
    height: 874,
    bands: [
      { top: 79, bottom: 437 },
      { top: 639, bottom: 874 },
    ],
  }
  const glass = runtime([['sheet-content', plane]])
  Object.assign(glass, { coverageWaiters: [], record: vi.fn() })
  try {
    const waiting = glass.coverFor(() => [[0, 82, 440, 64]])
    expect(waiting).toBeInstanceOf(Promise)
    expect(glass.schedulePrepare).toHaveBeenCalledWith(false, true)
    plane.bands = [
      { top: 0, bottom: 437 },
      { top: 639, bottom: 874 },
    ]
    glass.coverageInstalled()
    await waiting
    expect(glass.coverageWaiting).toBe(false)
  } finally {
    travel.mockRestore()
    element.remove()
  }
})

it('continuous damage every 10 ms lets an in-flight plane capture finish', async () => {
  const scroller = host(0)
  const glass = runtime([['plane-1', entry(undefined, scroller)]])
  glass.revision = 7
  const captureRevision = glass.revision
  let finishCapture!: () => void
  const captured = new Promise<void>(resolve => {
    finishCapture = resolve
  })
  Object.assign(glass, {
    captureRevision: 0,
    planeBytes: new Map(),
    planeCanvases: new Map(),
    prepareAgain: false,
  })
  const capturedPlane = {
    id: 'plane-1',
    measured: {
      top: 0,
      left: 0,
      layout: { nodes: [], width: 440, contentHeight: 956, measuredAt: 0, screen: 'root' },
    },
    host: scroller,
    width: 440,
    height: 956,
    contentHeight: 956,
  }
  const prepared = {
    planes: [capturedPlane],
    contentPlane: capturedPlane,
    captures: new Map([['plane-1', { signature: 'captured', bitmap: {} as ImageBitmap }]]),
    reused: new Set<string>(),
    capture: undefined,
    contextKey: 'context',
    geometry: { width: 440, height: 956 },
    resolution: 1,
    appearance: 'light',
    text: 'text',
    damageGenerations: new Map(glass.damageGenerations),
  } as unknown as Parameters<typeof commitPlaneSet>[1]
  const preparation = captured.then(() => {
    if (captureRevision === glass.revision)
      commitPlaneSet(glass as unknown as ProductionGlassRuntime, prepared)
  })
  const mutations = setInterval(() => glass.damageSource(scroller), 10)
  await vi.advanceTimersByTimeAsync(100)
  finishCapture()
  await preparation
  clearInterval(mutations)
  expect(glass.planes.get('plane-1')?.signature).toBe('captured')
  expect(glass.damaged.has('plane-1')).toBe(true)
  expect(glass.prepareAgain).toBe(true)
})

it('recentres before the scrollport reaches the edge of the window, without waiting for the scroll to end', () => {
  const scroller = host(0)
  const window = { top: 0, bottom: 2730, viewport: 956 }
  const glass = runtime([['plane-1', entry(window, scroller)]])
  scroller.scrollTop = 1000
  glass.followWindow('plane-1', scroller)
  expect(glass.schedulePrepare).not.toHaveBeenCalled()
  // 2730 - 956 = 1774 of travel; a recentre starts while the lens reach (128) and the guard at
  // rest, an eighth of the scrollport (119.5), are still inside the window.
  vi.advanceTimersByTime(500)
  scroller.scrollTop = 1560
  glass.followWindow('plane-1', scroller)
  expect(glass.schedulePrepare).toHaveBeenCalledExactlyOnceWith(true, true)
  expect(glass.pendingRecentre).toBe(true)
  // Further scroll events before that preparation runs ask again but count once.
  vi.advanceTimersByTime(16)
  scroller.scrollTop = 1570
  glass.followWindow('plane-1', scroller)
  expect(glass.captureWindows.recentres).toBe(1)
  expect(glass.captureWindows.outruns).toEqual([])
})

it('takes the lead of a fast scroll: the faster it travels, the earlier the recentre', () => {
  const scroller = host(0)
  const glass = runtime([['plane-1', entry({ top: 0, bottom: 2730, viewport: 956 }, scroller)]])
  // 60 pt per 16 ms frame is 3,750 pt/s: a lead of 750 pt beyond the lens reach.
  for (const top of [712, 772, 832, 892]) {
    vi.advanceTimersByTime(16)
    scroller.scrollTop = top
    glass.followWindow('plane-1', scroller)
  }
  expect(glass.schedulePrepare).not.toHaveBeenCalled()
  vi.advanceTimersByTime(16)
  scroller.scrollTop = 952
  glass.followWindow('plane-1', scroller)
  expect(glass.schedulePrepare).toHaveBeenCalledWith(true, true)
})

it('records a scroll that left the window, how far and for how long, and never fails the glass', () => {
  const scroller = host(0, 116375)
  const window = { top: 0, bottom: 2730, viewport: 956 }
  const glass = runtime([['plane-1', entry(window, scroller)]])
  scroller.scrollTop = 4000
  expect(() => glass.followWindow('plane-1', scroller)).not.toThrow()
  vi.advanceTimersByTime(16)
  scroller.scrollTop = 6000
  glass.followWindow('plane-1', scroller)
  expect(glass.captureWindows.outruns).toHaveLength(1)
  // The scrollport's far edge and the lens reach beyond it, less the window's end.
  expect(glass.captureWindows.outruns[0]).toMatchObject({
    plane: 'plane-1',
    by: 6000 + 956 + 128 - 2730,
  })
  expect(glass.schedulePrepare).toHaveBeenCalledWith(true, true)
  // The recentred window is installed 40 ms later.
  vi.advanceTimersByTime(40)
  glass.planes.set('plane-1', entry({ top: 5500, bottom: 8230, viewport: 956 }, scroller))
  glass.windowsCommitted()
  expect(glass.captureWindows.outruns[0].forMs).toBe(56)
})

it('chooses a window from what the plane holds: installed, resident and usable, or nothing', () => {
  const scroller = host(300)
  const window = { top: 0, bottom: 1434, viewport: 956 }
  const installed = runtime([['plane-1', entry(window, scroller)]])
  expect(installed.windowHint('plane-1', scroller)).toMatchObject({
    current: window,
    grow: false,
    velocity: 0,
  })
  const whole = runtime([['plane-1', entry(undefined, scroller)]])
  expect(whole.windowHint('plane-1', scroller).current).toBe('full')

  const away = runtime()
  away.resident.retain('plane-1', { ...entry(window, scroller), imageBytes: 22e6 })
  expect(away.windowHint('plane-1', scroller).current).toEqual(window)
  // A resident capture that has to be taken again (DOM damage inside it) starts as an entry.
  away.resident.damage(scroller)
  expect(away.windowHint('plane-1', scroller).current).toBeUndefined()
  expect(runtime().windowHint('plane-1', scroller).current).toBeUndefined()
})

it('reports the scroll speed of the last two events, and none once the scroll has stopped', () => {
  const scroller = host(0)
  const glass = runtime([['plane-1', entry({ top: 0, bottom: 2730, viewport: 956 }, scroller)]])
  glass.followWindow('plane-1', scroller)
  vi.advanceTimersByTime(20)
  scroller.scrollTop = 40
  glass.followWindow('plane-1', scroller)
  expect(glass.windowHint('plane-1', scroller).velocity).toBeCloseTo(2000, 0)
  vi.advanceTimersByTime(200)
  expect(glass.windowHint('plane-1', scroller).velocity).toBe(0)
})

it('grows an entry window once the scene has been idle, and not while a finger is down or it scrolls', () => {
  const scroller = host(0)
  const glass = runtime([['plane-1', entry({ top: 0, bottom: 1434, viewport: 956 }, scroller)]])
  glass.windowsCommitted()
  vi.advanceTimersByTime(650)
  expect(glass.schedulePrepare).not.toHaveBeenCalled()
  // A touch that may become a scroll: no capture under it.
  document.dispatchEvent(new Event('pointerdown'))
  vi.advanceTimersByTime(400)
  expect(glass.schedulePrepare).not.toHaveBeenCalled()
  document.dispatchEvent(new Event('pointerup'))
  vi.advanceTimersByTime(250)
  expect(glass.schedulePrepare).toHaveBeenCalledExactlyOnceWith()
  expect([...glass.growPlanes]).toEqual(['plane-1'])
  expect(glass.windowHint('plane-1', scroller).grow).toBe(true)
  // The grown window is installed: nothing more to grow, no further preparation.
  glass.planes.set('plane-1', entry({ top: 0, bottom: 2730 + 2 / 3, viewport: 956 }, scroller))
  glass.windowsCommitted()
  expect(glass.growPlanes.size).toBe(0)
  vi.advanceTimersByTime(5000)
  expect(glass.schedulePrepare).toHaveBeenCalledTimes(1)
})

it('has nothing to grow for a plane that holds its whole content', () => {
  const scroller = host(0, 2695)
  const glass = runtime([['plane-1', entry(undefined, scroller)]])
  glass.windowsCommitted()
  vi.advanceTimersByTime(5000)
  expect(glass.schedulePrepare).not.toHaveBeenCalled()
})

it('judges a windowed plane against the scrollport the host has now, not the one it was captured with', () => {
  // Captured while the keyboard was up: the window says its scrollport is 400 pt.
  const scroller = host(2000)
  const glass = runtime([['plane-1', entry({ top: 0, bottom: 2730, viewport: 400 }, scroller)]])
  // The host's scrollport is 956 pt (the keyboard is gone): 2000 + 956 is past the window.
  glass.followWindow('plane-1', scroller)
  expect(glass.schedulePrepare).toHaveBeenCalledWith(true, true)
  expect(glass.captureWindows.outruns).toHaveLength(1)
})

it('counts a scrollport whose lens reach has left the window as uncovered', () => {
  const scroller = host(1100)
  const window = { top: 1000, bottom: 3730, viewport: 956 }
  const glass = runtime([['plane-1', entry(window, scroller)]])
  // 100 pt below the window's top edge: a lens at the scrollport's top samples 128 pt above it.
  glass.followWindow('plane-1', scroller)
  expect(glass.captureWindows.outruns).toHaveLength(1)
  expect(glass.captureWindows.outruns[0].by).toBe(28)
})

const pinnedTop = (stale = false) => ({
  key: 'backdrop:plane-1:top:2',
  window: { top: 0, bottom: 1498, viewport: 956 },
  width: 440,
  resolution: 3,
  appearance: 'light' as const,
  text: '17px',
  stale,
})

it('a jump to the top lands on the pinned top: covered, and the list still recentres its own window', () => {
  const scroller = host(9000)
  const glass = runtime([['plane-1', entry({ top: 8000, bottom: 10730, viewport: 956 }, scroller)]])
  glass.pinnedTops.set('plane-1', pinnedTop())
  // The status bar is tapped: the next scroll event is at the top.
  scroller.scrollTop = 0
  glass.followWindow('plane-1', scroller)
  expect(glass.captureWindows.outruns).toEqual([])
  expect(glass.schedulePrepare).toHaveBeenCalledWith(true, true)
  // On the way there, between the two captures, nothing has the pixels.
  scroller.scrollTop = 4000
  glass.followWindow('plane-1', scroller)
  expect(glass.captureWindows.outruns).toHaveLength(1)
})

it('a stale pinned top does not count as the list', () => {
  const scroller = host(0)
  const glass = runtime([['plane-1', entry({ top: 8000, bottom: 10730, viewport: 956 }, scroller)]])
  glass.pinnedTops.set('plane-1', pinnedTop(true))
  glass.followWindow('plane-1', scroller)
  expect(glass.captureWindows.outruns).toHaveLength(1)
})

it('a framework scroll requests preparation without retaining a delayed jump', () => {
  const scroller = host(9000)
  const glass = runtime([['plane-1', entry({ top: 8000, bottom: 10730, viewport: 956 }, scroller)]])
  Object.assign(glass, {
    client: { documentOwned: true },
    planeIds: new WeakMap([[scroller, 'plane-1']]),
  })
  expect(glass.prepareScrollToTop(scroller)).toBeUndefined()
  expect(glass.schedulePrepare).toHaveBeenCalledExactlyOnceWith(true, true)
  glass.pinnedTops.set('plane-1', pinnedTop())
  glass.windowsCommitted()
  // Pinned and current: the next jump starts at once.
  expect(glass.prepareScrollToTop(scroller)).toBeUndefined()
  // A list whose own window holds the top has nothing to wait for either.
  glass.planes.set('plane-1', entry({ top: 0, bottom: 2730, viewport: 956 }, scroller))
  glass.pinnedTops.clear()
  expect(glass.prepareScrollToTop(scroller)).toBeUndefined()
  // An element that is not a plane of this scene.
  expect(glass.prepareScrollToTop(host(0))).toBeUndefined()
})

it('an idle scene captures the top of a list whose window left it without one', () => {
  const scroller = host(9000)
  const grown = { top: 8000, bottom: 10730 + 2 / 3, viewport: 956 }
  const glass = runtime([['plane-1', entry(grown, scroller)]])
  Object.assign(glass, { client: { documentOwned: true } })
  glass.windowsCommitted()
  vi.advanceTimersByTime(750)
  expect(glass.schedulePrepare).toHaveBeenCalledExactlyOnceWith()
  expect([...glass.growPlanes]).toEqual(['plane-1'])
  // Pinned: nothing more to do when idle.
  glass.pinnedTops.set('plane-1', pinnedTop())
  glass.windowsCommitted()
  vi.advanceTimersByTime(5000)
  expect(glass.schedulePrepare).toHaveBeenCalledTimes(1)
})

it('loaded source pixels invalidate and detach their pinned layer immediately', async () => {
  const scene = document.createElement('div')
  const scroller = document.createElement('div')
  const image = document.createElement('img')
  scroller.append(image)
  image.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 20 }) as DOMRect
  scene.append(scroller)
  // Construct without initialize/bind so the real load handler exists, without starting WebGPU.
  const RuntimeConstructor = ProductionGlassRuntime as unknown as new (options: unknown) => Runtime
  const glass = new RuntimeConstructor({
    appearance: 'light',
    elements: {
      band: { canvas: document.createElement('canvas') },
      menu: {
        items: document.createElement('div'),
        shadow: document.createElement('div'),
        trigger: document.createElement('button'),
      },
    },
  })
  Object.assign(glass, { fire: vi.fn(), schedulePrepare: vi.fn() })
  glass.planes.set('plane-1', entry({ top: 8000, bottom: 10730, viewport: 956 }, scroller))
  glass.pinnedTops.set('plane-1', pinnedTop())
  const loaded = (glass as unknown as { sourceLoaded: EventListener }).sourceLoaded
  scene.addEventListener('load', loaded, true)
  try {
    image.dispatchEvent(new Event('load'))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  } finally {
    scene.removeEventListener('load', loaded, true)
  }
  expect(glass.pinnedTops.get('plane-1')?.stale).toBe(true)
  expect(glass.damaged.has('plane-1')).toBe(true)
  expect(glass.fire).toHaveBeenCalledWith(
    expect.objectContaining({
      removePinned: ['plane-1'],
      release: ['plane:plane-1:top'],
    }),
  )
  expect(glass.schedulePrepare).toHaveBeenCalledOnce()
})

it('teardown releases installed and orphaned pinned slots', () => {
  const glass = runtime()
  glass.pinnedTops.set('plane-1', pinnedTop())
  glass.pinnedOrphans.add('plane-2')
  const park = vi.fn().mockResolvedValue(undefined)
  const scroller = document.createElement('div')
  Object.assign(glass, {
    coverageWaiters: [],
    unbindAppearance: vi.fn(),
    menuCancel: vi.fn(),
    options: { elements: { scroller, menu: { trigger: scroller } } },
    appRegions: { unbind: vi.fn() },
    scrollScopes: [],
    menuDom: { dispose: vi.fn() },
    menuSurface: { cancel: vi.fn() },
    client: { park },
  })
  if (!document.fonts)
    Object.defineProperty(document, 'fonts', { configurable: true, value: new EventTarget() })
  glass.dispose()
  expect(glass.pinnedTops.size).toBe(0)
  expect(glass.pinnedOrphans.size).toBe(0)
  expect(glass.fire).toHaveBeenCalledWith(
    expect.objectContaining({
      removePinned: ['plane-1', 'plane-2'],
      release: ['plane:plane-1:top', 'plane:plane-2:top'],
    }),
  )
  expect(vi.mocked(glass.fire).mock.invocationCallOrder[0]).toBeLessThan(
    park.mock.invocationCallOrder[0]!,
  )
})

it('tracks damage to a plane while its first capture is being prepared', () => {
  const scroller = host(0)
  const glass = runtime()
  glass.preparing = Promise.resolve()
  const id = glass.planeId(scroller)
  glass.damageSource(scroller)
  expect(glass.damaged.has(id)).toBe(true)
  expect(glass.damageGenerations.get(id)).toBe(1)
  expect(glass.revision).toBeUndefined()
})

it('font loads preserve plane preparations and invalidate the affected pins and ink', () => {
  const scroller = host(0)
  const firstCapture = host(0)
  const glass = runtime([['plane-1', entry(undefined, scroller)]])
  glass.revision = 7
  glass.preparingPlaneHosts.set('plane-2', firstCapture)
  const pin = { stale: false } as PinnedTop
  glass.pinnedTops.set('plane-1', pin)

  const fonts = glass as unknown as { damageFontSources: () => void }
  fonts.damageFontSources()

  expect(glass.revision).toBe(7)
  expect(glass.fontGeneration).toBe(1)
  expect([...glass.damaged]).toEqual(['plane-1', 'plane-2'])
  expect(glass.planes.has('plane-1')).toBe(true)
  expect(glass.pinnedTops.get('plane-1')?.stale).toBe(true)
  expect(glass.fire).toHaveBeenCalledWith(
    expect.objectContaining({ removePinned: ['plane-1', 'plane-2'] }),
  )
  expect(glass.schedulePrepare).toHaveBeenCalledOnce()
})

it('requires the whole device-pixel interval at fractional band edges', async () => {
  const element = document.createElement('div')
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 440, 894))
  const plane = {
    ...entry(undefined, element),
    height: 894,
    bands: [{ top: 1135 / 3, bottom: 894 }],
  }
  const layer = { ...plane, scroll: { y: 0 }, clip: [0, 0, 440, 894] as const, rows: plane.bands }
  // The owner interval needs texel 1134 as well: 378.333 is not enough for 378.1.
  expect(uncoveredRows([0, 378.1, 440, 259], layer)).toEqual({ top: 378, bottom: 1912 / 3 })
  const glass = runtime([['plane-1', plane]])
  Object.assign(glass, { coverageWaiters: [], record: vi.fn() })
  // Even a fraction below the old point tolerance crosses into that same missing texel.
  const waiting = glass.coverFor(() => [[0, 1135 / 3 - 0.001, 440, 259]])
  expect(waiting).toBeInstanceOf(Promise)
  plane.bands = [{ top: 378, bottom: 894 }]
  glass.coverageInstalled()
  await waiting
  expect(uncoveredRows([0, 378.1, 440, 259], { ...layer, rows: plane.bands })).toBeUndefined()
  element.remove()
})

it('waits for rows exposed by Search content compensation, not just the DOM rectangle', async () => {
  const element = document.createElement('div')
  element.dataset.satinSearchable = ''
  const drawer = document.createElement('div')
  drawer.dataset.satinSearch = ''
  const content = document.createElement('section')
  element.append(drawer, content)
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 440, 1200))
  let contentTop = 0
  vi.spyOn(content, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, contentTop, 440, 300),
  )
  beginSearchBackdrop(element)
  const plane = {
    ...entry(undefined, element),
    height: 894,
    searchAnchor: searchBackdropAnchor(element),
    bands: [{ top: 659, bottom: 894 }],
  }
  contentTop = 298
  refreshSearchBackdrop(element)
  const glass = runtime([['plane-1', plane]])
  Object.assign(glass, { coverageWaiters: [], record: vi.fn() })
  const waiting = glass.coverFor(() => [[0, 700.6, 440, 267]])
  expect(waiting).toBeInstanceOf(Promise)
  // A recapture at the drawer's new origin restores those viewport rows.
  plane.searchAnchor = searchBackdropAnchor(element)
  glass.coverageInstalled()
  await waiting
  element.remove()
})

it('rejects a coverage deadline instead of authorizing an uncovered draw', async () => {
  const element = document.createElement('div')
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 440, 894))
  const plane = { ...entry(undefined, element), height: 894, bands: [{ top: 659, bottom: 894 }] }
  const glass = runtime([['plane-1', plane]])
  Object.assign(glass, { coverageWaiters: [], record: vi.fn() })
  const rejected = expect(glass.coverFor(() => [[0, 402.6, 440, 267]])).rejects.toThrow(
    'Capture coverage was not installed',
  )
  await vi.advanceTimersByTimeAsync(10_001)
  await rejected
  expect(glass.coverageWaiting).toBe(false)
  element.remove()
})

it('waits through Search layout preparation beyond 500 ms for acknowledged coverage', async () => {
  const element = document.createElement('div')
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 440, 894))
  const plane = { ...entry(undefined, element), height: 894, bands: [{ top: 659, bottom: 894 }] }
  const glass = runtime([['plane-1', plane]])
  Object.assign(glass, { coverageWaiters: [], record: vi.fn() })
  let admitted = false
  const waiting = glass
    .coverFor(() => [[0, 402.6, 440, 267]])!
    .then(() => {
      admitted = true
    })
  await vi.advanceTimersByTimeAsync(600)
  expect(admitted).toBe(false)
  expect(glass.coverageWaiting).toBe(true)
  plane.bands = [{ top: 378, bottom: 894 }]
  glass.coverageInstalled()
  await waiting
  expect(admitted).toBe(true)
  element.remove()
})

it('waits for navigation atlas rows even when the settled content plane is a whole capture', async () => {
  const element = document.createElement('div')
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 440, 894))
  const glass = runtime([['plane-1', { ...entry(undefined, element), height: 894 }]])
  Object.assign(glass, {
    coverageWaiters: [],
    record: vi.fn(),
    navigationActive: true,
    contentPlane: 'plane-1',
    navigationCoverage: {
      key: 'navigation:1',
      width: 440,
      height: 894,
      rows: [{ top: 0, bottom: 88 }],
    },
  })
  let covered = false
  const waiting = glass.coverFor(() => [[20, 797.7, 88, 88.6]])
  expect(waiting).toBeDefined()
  const done = waiting!.then(() => {
    covered = true
  })
  glass.coverageInstalled()
  await Promise.resolve()
  expect(covered).toBe(false)
  glass.navigationCoverage!.rows = [{ top: 0, bottom: 894 }]
  glass.coverageInstalled()
  await done
  expect(covered).toBe(true)
})
