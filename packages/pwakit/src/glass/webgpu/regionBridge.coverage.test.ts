// @vitest-environment happy-dom
import * as accessoryMotion from './accessoryMorph.ts'
import * as presentationFrame from '../presentationFrame.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { GlassRegionRegistry } from '../regionRegistry.ts'
import { Glass } from '../regions.ts'
import type { WebGPUClient } from './client.ts'
import { demandBands } from './captureDemand.ts'
import { uncoveredRows } from './captureBands.ts'
import type { GlassRendererOperation } from '../rendererContract.ts'
import { RegionBridge } from './regionBridge.ts'
import { preparePresentationGlassMotion } from '../../presentation/glassMotion.ts'
import { observePresenterViewport } from './presenterViewport.ts'

vi.mock('./presenterViewport.ts', () => ({
  observePresenterViewport: vi.fn(() => ({ sample() {}, dispose() {} })),
}))

vi.mock('./foreground.ts', () => ({
  captureRegionForeground: vi.fn(async () => document.createElement('canvas')),
}))
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it.each([false, true])(
  'keeps presenter demand across a source rebind (reply pending: %s)',
  async pending => {
    const registry = new GlassRegionRegistry()
    const source = document.createElement('div')
    const element = document.createElement('div')
    const canvas = document.createElement('canvas')
    element.append(canvas)
    source.append(element)
    document.body.append(source)
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 54, 400, 44))
    Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
    registry.register({
      id: 'search',
      element,
      canvas,
      descriptor: { id: 'search', material: Glass.regular.material, shape: 'capsule' },
    })
    let acknowledge: (() => void) | undefined
    const request = vi.fn(async ({ request }: { request: GlassRendererOperation }) => {
      if (pending && request.type === 'presenter-viewport')
        await new Promise<void>(resolve => {
          acknowledge = resolve
        })
    })
    const bridge = new RegionBridge(
      {
        request,
        onEvent: () => () => {},
      } as unknown as WebGPUClient,
      'light',
    )
    try {
      bridge.bind(registry, source)
      await bridge.refresh()
      const move = vi
        .mocked(observePresenterViewport)
        .mock.calls.findLast(call => call[0] === canvas)![1]
      // The worker keeps this viewport while a context menu/tab change rebinds the source.
      // DOM layout has returned to the top. That does not reset the worker's viewport.
      const accepted = [0, 191, 440, 84] as const
      move({ x: 0, y: 191, scaleX: 1, scaleY: 1 }, accepted)
      await vi.waitFor(() => expect(bridge.sampleRects()).toContainEqual(accepted))
      if (pending) await vi.waitFor(() => expect(acknowledge).toBeDefined())
      bridge.bind(registry, source)
      const bands = demandBands({
        host: { left: 0, top: 0, right: 440, bottom: 894 },
        contentHeight: 894,
        resolution: 3,
        demand: {
          rects: [...bridge.sampleRects(), [0, 683, 440, 187]],
          covered: false,
          damaged: true,
        },
      })
      expect(
        uncoveredRows(accepted, {
          origin: { y: 0 },
          scroll: { y: 0 },
          height: 894,
          clip: [0, 0, 440, 894],
          resolution: 3,
          rows: bands,
        }),
      ).toBeUndefined()
      if (pending) {
        await bridge.refresh()
        const rebound = vi
          .mocked(observePresenterViewport)
          .mock.calls.findLast(call => call[0] === canvas)![1]
        const replacement = [0, 400, 440, 84] as const
        rebound({ x: 0, y: 400, scaleX: 1, scaleY: 1 }, replacement)
        expect(bridge.sampleRects()).toContainEqual(accepted)
        expect(bridge.sampleRects()).toContainEqual(replacement)
        acknowledge?.()
        await vi.waitFor(() =>
          expect(
            request.mock.calls.filter(([message]) => message.request.type === 'presenter-viewport'),
          ).toHaveLength(2),
        )
        // The old reply must not strand the new binding's pending viewport, or retire
        // its old sample before the renderer acknowledges the replacement.
        expect(bridge.sampleRects()).toContainEqual(accepted)
        acknowledge?.()
        await vi.waitFor(() => expect(bridge.sampleRects()).not.toContainEqual(accepted))
        expect(bridge.sampleRects()).toContainEqual(replacement)
      } else expect(bridge.sampleRects()).toContainEqual(accepted)
    } finally {
      bridge.unbind()
    }
  },
)

it('recaptures moved composer bands before drawing and coalesces movement during capture', async () => {
  const registry = new GlassRegionRegistry()
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  element.append(canvas)
  document.body.append(element)
  let top = 810
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, top, 400, 24))
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  registry.register({
    id: 'composer',
    element,
    canvas,
    descriptor: {
      id: 'composer',
      material: Glass.regular.material,
      shape: 'capsule',
    },
  })
  let bands = [
    { top: 0, bottom: 88 },
    { top: 798, bottom: 834 },
  ]
  const draws: number[] = []
  const client = {
    request: vi.fn(async ({ request }: { request: GlassRendererOperation }) => {
      if (request.type === 'presenter-viewport') {
        const viewport = request.viewport
        expect(
          uncoveredRows([viewport.x, viewport.y, 400 * viewport.scaleX, 84 * viewport.scaleY], {
            origin: { y: 0 },
            scroll: { y: 0 },
            height: 1000,
            clip: [0, 0, 1000, 1000],
            rows: bands,
          }),
        ).toBeUndefined()
        draws.push(viewport.y)
      }
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const bridge = new RegionBridge(client, 'light')
  let release: (() => void) | undefined
  try {
    bridge.bind(registry, element)
    await bridge.refresh()
    const observe = vi
      .mocked(observePresenterViewport)
      .mock.calls.findLast(call => call[0] === canvas)!
    const move = observe[1]
    bridge.coverage = rects => {
      if (
        rects().every(
          rect =>
            !uncoveredRows(rect, {
              origin: { y: 0 },
              scroll: { y: 0 },
              height: 1000,
              clip: [0, 0, 1000, 1000],
              rows: bands,
            }),
        )
      )
        return
      return new Promise<void>(resolve => {
        release = resolve
      })
    }
    top = 431
    move({ x: 0, y: 407, scaleX: 1, scaleY: 1 }, [0, 407, 400, 84])
    await Promise.resolve()
    expect(draws).toEqual([])
    expect(release).toBeDefined()
    // The keyboard keeps moving while the first capture is prepared.
    top = 374
    move({ x: 0, y: 350, scaleX: 1, scaleY: 1 }, [0, 350, 400, 84])
    bands = demandBands({
      host: { left: 0, top: 0, right: 1000, bottom: 1000 },
      contentHeight: 1000,
      resolution: 2,
      demand: { rects: bridge.sampleRects(), covered: false, damaged: false },
    })!
    release!()
    await vi.waitFor(() => expect(draws).toEqual([350]))
    // Rotation/scale changes must demand the whole scaled presenter, not an unscaled halo.
    move({ x: 0, y: 600, scaleX: 1.5, scaleY: 2 }, [0, 600, 600, 168])
    await Promise.resolve()
    expect(draws).toEqual([350])
    bands = demandBands({
      host: { left: 0, top: 0, right: 1000, bottom: 1000 },
      contentHeight: 1000,
      resolution: 2,
      demand: { rects: bridge.sampleRects(), covered: false, damaged: false },
    })!
    release!()
    await vi.waitFor(() => expect(draws).toEqual([350, 600]))
  } finally {
    bridge.unbind()
  }
})

it.each([0, 902])('covers retained fields with sheet travel %s', async travel => {
  vi.spyOn(presentationFrame, 'presentationTravel').mockReturnValue({ x: 0, y: travel })
  const presenters: { origin: { x: number; y: number }; width: number; height: number }[] = []
  const client = {
    request: vi.fn(
      async (message: { request: { type: string; presenter?: (typeof presenters)[number] } }) => {
        if (message.request.presenter) presenters.push(message.request.presenter)
      },
    ),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  const container = document.createElement('div')
  const shared = document.createElement('canvas')
  source.append(container)
  container.append(shared)
  document.body.append(source)
  container.getAnimations = () => []
  vi.spyOn(container, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, travel, 400, 900),
  )
  Object.defineProperty(shared, 'transferControlToOffscreen', { value: () => ({}) })
  const unregister = registry.registerContainer('field', container, shared)
  let top = 575
  for (let index = 0; index < 2; index++) {
    const element = document.createElement('div')
    const canvas = document.createElement('canvas')
    element.append(canvas)
    container.append(element)
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(100 + index * 80, top + travel, 44, 64),
    )
    Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
    registry.register({
      id: `member-${index}`,
      element,
      canvas,
      descriptor: {
        id: `member-${index}`,
        material: Glass.regular.material,
        shape: 'capsule',
        container: { id: 'field', spacing: 80 },
      },
    })
  }
  const bridge = new RegionBridge(client, 'light')
  try {
    bridge.bind(registry, source)
    let priorTop = Infinity
    for (const position of [575, 400, 575]) {
      top = position
      const bands = demandBands({
        host: { left: 0, top: 0, right: 400, bottom: 900 },
        contentHeight: 900,
        resolution: 2,
        demand: { rects: bridge.sampleRects(), covered: false, damaged: true },
      })
      expect(bands).toBeDefined()
      await bridge.refresh()
      const presenter = presenters.at(-1)!
      expect(presenter).toBeDefined()
      const rect = [
        presenter.origin.x,
        presenter.origin.y,
        presenter.width,
        presenter.height,
      ] as const
      expect(
        uncoveredRows(rect, {
          origin: { y: 0 },
          scroll: { y: 0 },
          height: 900,
          clip: [0, 0, 400, 900],
          rows: bands,
        }),
      ).toBeUndefined()
      expect(rect[1]).toBeLessThanOrEqual(priorTop)
      priorTop = rect[1]
    }
  } finally {
    bridge.unbind()
    unregister()
  }
})

it('demands the emerge trigger before attaching a menu presenter', async () => {
  const registry = new GlassRegionRegistry()
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  element.append(canvas)
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 763, 200, 51))
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  registry.register({
    id: 'search-menu',
    element,
    canvas,
    descriptor: {
      id: 'search-menu',
      material: { ...Glass.regular.material, treatment: 'contextMenu' },
      shape: 'capsule',
      emerge: { from: { x: 20, y: 482.6, width: 44, height: 44, radius: 22 } },
    },
  })
  const bridge = new RegionBridge(
    { request: vi.fn(async () => {}), onEvent: () => () => {} } as unknown as WebGPUClient,
    'light',
  )
  try {
    bridge.bind(registry, element)
    // Before the first presenter exists, its trigger-to-menu sample must already be demanded.
    const bands = demandBands({
      host: { left: 0, top: 0, right: 440, bottom: 894 },
      contentHeight: 894,
      resolution: 3,
      demand: { rects: bridge.sampleRects(), covered: false, damaged: true },
    })
    expect(
      uncoveredRows([20, 402.6, 200, 491.4], {
        origin: { y: 0 },
        scroll: { y: 0 },
        height: 894,
        resolution: 3,
        clip: [0, 0, 440, 894],
        rows: bands,
      }),
    ).toBeUndefined()
  } finally {
    bridge.unbind()
  }
})

it('keeps the source transaction queue available while region coverage is pending', async () => {
  const registry = new GlassRegionRegistry()
  const element = document.createElement('div')
  document.body.append(element)
  const client = {
    request: vi.fn(async () => ({})),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const bridge = new RegionBridge(client, 'light')
  let covered = false
  let release!: () => void
  const coverage = new Promise<void>(resolve => {
    release = resolve
  })
  bridge.bind(registry, element)
  bridge.coverage = () => (covered ? undefined : coverage)
  try {
    const refresh = bridge.refresh()
    await Promise.resolve()
    let sourceAcknowledged = false
    const source = bridge.sourceChanged('light').then(() => {
      sourceAcknowledged = true
    })
    for (let turn = 0; turn < 20; turn++) await Promise.resolve()
    expect(sourceAcknowledged).toBe(true)
    covered = true
    release()
    await Promise.all([refresh, source])
  } finally {
    covered = true
    release()
    bridge.unbind()
  }
})

it('requires the current navigation source in the region draw receipt', async () => {
  const registry = new GlassRegionRegistry()
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  element.append(canvas)
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(460, 453, 192, 51))
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  registry.register({
    id: 'destination',
    element,
    canvas,
    descriptor: {
      id: 'destination',
      material: Glass.regular.material,
      shape: 'capsule',
    },
  })
  let navigation = 'old-atlas'
  let changeShow = false
  let scenes = 0
  const client = {
    request: vi.fn(async ({ request }: { request: GlassRendererOperation }) => {
      if (request.type === 'scene') {
        scenes++
        if (changeShow) {
          changeShow = false
          canvas.dataset.satinGlassShow = 'next-show'
        }
      }
      return { navigation, presented: ['destination'] }
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, element)
  const release = bridge.holdNavigation()
  try {
    await expect(bridge.admitNavigation('destination-atlas')).rejects.toThrow(
      'current-source region draw receipt',
    )
    navigation = 'destination-atlas'
    await bridge.admitNavigation(navigation)
    expect(canvas.dataset.satinGlassPresented).toBe('true')
    const before = scenes
    changeShow = true
    await bridge.admitNavigation(navigation)
    expect(scenes - before).toBe(2)
    expect(canvas.dataset.satinGlassPresentedShow).toBe('next-show')
  } finally {
    release()
    bridge.unbind()
  }
})

it('retries navigation when registration changes before a scene can be submitted', async () => {
  const registry = new GlassRegionRegistry()
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  element.append(canvas)
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(460, 453, 192, 51))
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  const entry = {
    id: 'destination',
    element,
    canvas,
    descriptor: { id: 'destination', material: Glass.regular.material, shape: 'capsule' as const },
  }
  let unregister = registry.register(entry)
  let scenes = 0
  const client = {
    request: vi.fn(async ({ request }: { request: GlassRendererOperation }) => {
      if (request.type === 'attach-presenter') {
        unregister()
        unregister = registry.register(entry)
      }
      if (request.type === 'scene') scenes++
      return { navigation: 'destination-atlas', presented: ['destination'] }
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, element)
  const release = bridge.holdNavigation()
  try {
    await bridge.admitNavigation('destination-atlas')
    expect(scenes).toBe(1)
    expect(canvas.dataset.satinGlassPresented).toBe('true')
  } finally {
    release()
    bridge.unbind()
  }
})

it('covers the entire sheet travel before releasing its visible dismissal', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      e = 0
      f: number
      constructor(transform: string) {
        this.f = Number(/translateY\(([-.0-9]+)px\)/.exec(transform)?.[1] ?? 0)
      }
    },
  )
  const layer = document.createElement('div')
  layer.setAttribute('data-satin-glass-layer', '')
  const material = document.createElement('div')
  material.className = 'satin-presentation-surface'
  material.setAttribute('data-satin-glass-region-id', 'sheet')
  const canvas = document.createElement('canvas')
  material.append(canvas)
  layer.append(material)
  document.body.append(layer)
  vi.spyOn(material, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 100, 300, 400))
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  const animation = {
    effect: {
      getKeyframes: () =>
        [0, 500, 480].map((y, index) => ({
          computedOffset: index / 2,
          transform: `translateY(${y}px)`,
        })),
      getTiming: () => ({ duration: 500 }),
    },
    finished: new Promise(() => {}),
    startTime: 100,
  } as unknown as Animation
  const motion = preparePresentationGlassMotion(layer, animation)!
  const registry = new GlassRegionRegistry()
  registry.register({
    id: 'sheet',
    element: material,
    canvas,
    descriptor: {
      id: 'sheet',
      material: Glass.sheet.material,
      shape: 'capsule',
    },
  })
  const client = {
    request: async () => ({ presented: ['sheet'] }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const bridge = new RegionBridge(client, 'light')
  let release!: () => void
  let ready = false
  void motion.ready.then(() => {
    ready = true
  })
  try {
    bridge.bind(registry, layer)
    bridge.coverage = rects => {
      const swept = rects()[0]!
      // The midpoint overshoot, not just the final offset, must be covered with the halo.
      expect(swept[1]).toBeLessThanOrEqual(100)
      expect(swept[1] + swept[3]).toBeGreaterThanOrEqual(1000)
      return new Promise<void>(resolve => {
        release = resolve
      })
    }
    const refresh = bridge.refresh()
    await Promise.resolve()
    expect(ready).toBe(false)
    bridge.coverage = () => undefined
    release()
    await refresh
    await Promise.resolve()
    expect(ready).toBe(true)
    expect(motion.admitted).toBe(false)
    // A delayed preparation receipt cannot admit the running successor clock.
    const preparedTrack = motion.track
    motion.start()
    await Promise.resolve()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    motion.acknowledge(preparedTrack)
    expect(motion.admitted).toBe(false)
    motion.acknowledge(motion.track)
    expect(motion.admitted).toBe(true)
    // Reflow while awaiting a successor draw must resume DOM following, not wait 10 seconds.
    const replacement = preparePresentationGlassMotion(layer, animation)!
    const pending = replacement.start()
    window.dispatchEvent(new Event('resize'))
    expect(Number.isFinite(await pending)).toBe(true)
    expect(replacement.current()).toBe(false)
    expect(replacement.admitted).toBe(false)
  } finally {
    motion.dispose()
    bridge.unbind()
    vi.unstubAllGlobals()
  }
})

it('does not present a successor accessory run from its predecessor scene receipt', async () => {
  const registry = new GlassRegionRegistry()
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  element.append(canvas)
  document.body.append(element)
  const rect = { x: 0, y: 700, width: 300, height: 48 }
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect(rect))
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  registry.register({
    id: 'accessory',
    element,
    canvas,
    descriptor: { id: 'accessory', material: Glass.regular.material, shape: 'capsule' },
  })
  const makeMotion = (epoch: number): accessoryMotion.AccessoryGlassMotion => ({
    rect,
    sampleRect: rect,
    widths: [300, 300],
    duration: 100,
    viewportTrack: {
      epoch,
      duration: 100,
      widths: [300, 300],
      offsets: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    },
  })
  let motion = makeMotion(1000)
  vi.spyOn(accessoryMotion, 'accessoryGlassMotion').mockImplementation(target =>
    target === element ? motion : undefined,
  )
  const replies: (() => void)[] = []
  const client = {
    request: ({ request }: { request: GlassRendererOperation }) =>
      request.type === 'scene'
        ? new Promise(resolve => replies.push(() => resolve({ presented: ['accessory'] })))
        : Promise.resolve(),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const bridge = new RegionBridge(client, 'light')
  try {
    bridge.bind(registry, element)
    const first = bridge.refresh()
    await vi.waitFor(() => expect(replies.length).toBe(1))
    motion = makeMotion(2000)
    replies.shift()!()
    await first
    expect(canvas.dataset.satinGlassPresented).toBeUndefined()
    const next = bridge.refresh()
    await vi.waitFor(() => expect(replies.length).toBe(1))
    replies.shift()!()
    await next
    expect(canvas.dataset.satinGlassPresented).toBe('true')
  } finally {
    bridge.unbind()
  }
})

it('recaptures a toolbar that moves up while its first presenters are registering', async () => {
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  document.body.append(source)
  let top = 1146
  for (const id of ['new-reminder', 'add-list']) {
    const element = document.createElement('div')
    const canvas = document.createElement('canvas')
    element.append(canvas)
    source.append(element)
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, top, 100, 48),
    )
    Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
    registry.register({
      id,
      element,
      canvas,
      descriptor: { id, material: Glass.regular.material, shape: 'capsule' },
    })
  }
  let bands = [
    { top: 0, bottom: 88 },
    { top: 1102, bottom: 1194 },
  ]
  const layer = () => ({
    origin: { y: 0 },
    scroll: { y: 0 },
    height: 1194,
    resolution: 2,
    clip: [0, 0, 834, 1194] as const,
    rows: bands,
  })
  let presented = false
  const client = {
    request: async ({ request }: { request: GlassRendererOperation }) => {
      if (request.type === 'attach-presenter') top = 1114
      if (request.type === 'scene') {
        for (const region of request.snapshot.regions) {
          expect(
            uncoveredRows(
              [
                region.frame.x - 20,
                region.frame.y - 20,
                region.frame.width + 40,
                region.frame.height + 40,
              ],
              layer(),
            ),
          ).toBeUndefined()
        }
        presented = true
        return { presented: request.snapshot.regions.map(region => region.id) }
      }
    },
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const bridge = new RegionBridge(client, 'light')
  try {
    bridge.bind(registry, source)
    bridge.coverage = rects => {
      if (rects().every(rect => !uncoveredRows(rect, layer()))) return
      bands = demandBands({
        host: { left: 0, top: 0, right: 834, bottom: 1194 },
        contentHeight: 1194,
        resolution: 2,
        demand: { rects: rects(), covered: false, damaged: true },
      })!
      return Promise.resolve()
    }
    await bridge.refresh()
    await vi.waitFor(() => expect(presented).toBe(true))
  } finally {
    bridge.unbind()
  }
})

it('covers the accepted and pending bottom-toolbar canvas envelopes in the navigation atlas', async () => {
  const registry = new GlassRegionRegistry()
  const chrome = document.createElement('header')
  chrome.dataset.satinNavigationChrome = 'true'
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  element.append(canvas)
  chrome.append(element)
  document.body.append(chrome)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(28, 810, 48, 48))
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  registry.register({
    id: 'bottom-toolbar',
    element,
    canvas,
    descriptor: { id: 'bottom-toolbar', material: Glass.regular.material, shape: 'capsule' },
  })
  const bridge = new RegionBridge(
    { request: vi.fn(async () => {}), onEvent: () => () => {} } as unknown as WebGPUClient,
    'light',
  )
  try {
    bridge.bind(registry, chrome)
    await bridge.refresh()
    const move = vi
      .mocked(observePresenterViewport)
      .mock.calls.findLast(call => call[0] === canvas)![1]
    // Press scales the canvas plus its halo, rather than just the control's bounds.
    const accepted = [20, 784, 105.6, 105.6] as const
    move({ x: 20, y: 784, scaleX: 1.2, scaleY: 1.2 }, accepted)
    await bridge.refresh()
    const pending = [20, 774, 105.6, 105.6] as const
    move({ x: 20, y: 774, scaleX: 1.2, scaleY: 1.2 }, pending)
    const rows = bridge.navigationCaptureRows(894)
    for (const rect of [accepted, pending]) {
      expect(
        uncoveredRows(rect, {
          origin: { y: 0 },
          scroll: { y: 0 },
          height: 894,
          clip: [0, 0, 440, 894],
          rows: [{ top: rows.top, bottom: rows.top + rows.height }],
        }),
      ).toBeUndefined()
    }
  } finally {
    bridge.unbind()
  }
})

it('covers a menu envelope expanding above a retained presenter origin', async () => {
  const registry = new GlassRegionRegistry()
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  element.append(canvas)
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 66, 240, 635 / 3))
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  const emerge = { from: { x: 300, y: 0, width: 44, height: 44, radius: 22 } }
  registry.register({
    id: 'menu',
    element,
    canvas,
    descriptor: { id: 'menu', material: Glass.regular.material, shape: 'capsule', emerge },
  })
  const bridge = new RegionBridge(
    { request: vi.fn(async () => {}), onEvent: () => () => {} } as unknown as WebGPUClient,
    'dark',
  )
  try {
    bridge.bind(registry, element)
    await bridge.refresh()
    // The renderer retains y=-20 until the viewport request is acknowledged. A new
    // scene grows its sample height from 317 2/3 to 346 while that origin is live.
    registry.updateEmerge('menu', { ...emerge, from: { ...emerge.from, y: -85 / 3 } })
    const bands = demandBands({
      host: { left: 0, top: 0, right: 440, bottom: 894 },
      contentHeight: 894,
      resolution: 3,
      demand: {
        rects: [...bridge.sampleRects(), [0, 798, 440, 72]],
        covered: false,
        damaged: true,
      },
    })
    expect(
      uncoveredRows([80, -20, 284, 346], {
        origin: { y: 0 },
        scroll: { y: 0 },
        height: 894,
        resolution: 3,
        clip: [0, 0, 440, 894],
        rows: bands,
      }),
    ).toBeUndefined()
  } finally {
    bridge.unbind()
  }
})
