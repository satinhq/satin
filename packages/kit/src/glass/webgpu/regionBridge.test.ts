// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { GlassRegionRegistry } from '../regionRegistry.ts'
import { Glass } from '../regions.ts'
import { subscribeGlassErrors } from '../errors.ts'
import type { WebGPUClient } from './client.ts'
import type { GlassRendererRequest } from '../rendererContract.ts'
import { RegionBridge } from './regionBridge.ts'
import { bindToolbarMaterialContent } from '../toolbarMaterialContext.ts'
import { animateLayout } from '../../motion/animate.ts'
import type { GlassRendererOperation } from '../rendererContract.ts'

vi.mock('./foreground.ts', () => ({
  captureRegionForeground: vi.fn(async () => document.createElement('canvas')),
}))

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function registeredCapsule(id: string) {
  const registry = new GlassRegionRegistry(),
    source = document.createElement('div'),
    element = document.createElement('div'),
    canvas = document.createElement('canvas')
  element.append(canvas)
  source.append(element)
  document.body.append(source)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    top: 0,
    left: 0,
    right: 100,
    bottom: 60,
    toJSON: () => ({}),
  })
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  registry.register({
    id,
    element,
    canvas,
    descriptor: { id, material: Glass.regular.material, shape: 'capsule' },
  })
  return { registry, source, element, canvas }
}

it('lifts current-width ink before a quick press and release during layout motion', async () => {
  const messages: GlassRendererOperation[] = []
  const client = {
    request: async (message: { request: GlassRendererOperation }) => {
      messages.push(message.request)
    },
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  const overlay = document.createElement('canvas')
  element.append(canvas, overlay)
  source.append(element)
  document.body.append(source)
  let width = 400
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, width, 48))
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  vi.stubGlobal('createImageBitmap', async () => ({ width: width + 40, height: 88, close() {} }))
  for (const target of [canvas, overlay])
    Object.defineProperty(target, 'transferControlToOffscreen', { value: () => ({}) })
  registry.register({
    id: 'player',
    element,
    canvas,
    overlay,
    descriptor: { id: 'player', material: Glass.regular.interactive().material, shape: 'capsule' },
  })
  let finish!: () => void
  const animation = {
    playState: 'running',
    finished: new Promise<void>(resolve => {
      finish = resolve
    }),
  }
  Object.defineProperty(element, 'animate', { value: () => animation })
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  try {
    await bridge.refresh()
    animateLayout(element, [{ width: '300px' }], { duration: 100 })
    width = 350
    await bridge.refresh()
    // The finger lands between layout samples. Its lens must use the new 325-point ink,
    // not the image at the previous width, even if release arrives before capture finishes.
    width = 325
    registry.interact({ regionId: 'player', phase: 'pressed', epoch: 1 })
    registry.interact({ regionId: 'player', phase: 'releasing', epoch: 2 })
    await vi.waitFor(() =>
      expect(
        messages
          .filter(message => message.type === 'interaction')
          .map(message => message.interaction.phase),
      ).toEqual(['pressed', 'releasing']),
    )
    const pressed = messages.findIndex(message => message.type === 'interaction')
    const ink = messages.slice(0, pressed).findLast(message => message.type === 'source')
    expect(ink?.type === 'source' && ink.source.width).toBe(365)
  } finally {
    animation.playState = 'finished'
    finish()
    bridge.unbind()
    vi.unstubAllGlobals()
  }
})

it('refreshes changed accessory content before lifting it and while the contact stays held', async () => {
  const { captureRegionForeground } = await import('./foreground.ts')
  const captured: string[] = []
  vi.mocked(captureRegionForeground).mockImplementation(async element => {
    captured.push(element.textContent ?? '')
    return document.createElement('canvas')
  })
  const lifted: string[] = []
  const client = {
    request: async ({ request }: { request: GlassRendererOperation }) => {
      if (request.type === 'interaction' && request.interaction.phase === 'pressed')
        lifted.push(captured.at(-1)!)
    },
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  const element = document.createElement('div')
  const label = document.createElement('span')
  const canvas = document.createElement('canvas')
  const overlay = document.createElement('canvas')
  label.textContent = 'Dust and Chrome'
  element.append(canvas, overlay, label)
  source.append(element)
  document.body.append(source)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 48))
  vi.stubGlobal('createImageBitmap', async () => ({ width: 440, height: 88, close() {} }))
  for (const target of [canvas, overlay])
    Object.defineProperty(target, 'transferControlToOffscreen', { value: () => ({}) })
  const unregister = registry.register({
    id: 'player',
    element,
    canvas,
    overlay,
    descriptor: { id: 'player', material: Glass.regular.interactive().material, shape: 'capsule' },
  })
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  try {
    await bridge.refresh()
    expect(captured.at(-1)).toBe('Dust and Chrome')
    // React updates the existing Text node, without resizing or remounting the glass.
    label.firstChild!.textContent = 'Overdrive'
    registry.interact({ regionId: 'player', phase: 'pressed', epoch: 1 })
    await vi.waitFor(() => {
      expect(lifted.length).toBeGreaterThan(0)
      expect(lifted.every(title => title === 'Overdrive')).toBe(true)
    })
    label.firstChild!.textContent = 'Current song while held'
    await vi.waitFor(() => expect(captured.at(-1)).toBe('Current song while held'))
    const capturesAtRest = captured.length
    await bridge.refresh()
    expect(captured).toHaveLength(capturesAtRest)
  } finally {
    bridge.unbind()
    unregister()
    vi.unstubAllGlobals()
    vi.mocked(captureRegionForeground).mockImplementation(async () =>
      document.createElement('canvas'),
    )
  }
})

it('supports container members alongside clear and tinted regions', async () => {
  const requests: unknown[] = []
  const client = {
    request: vi.fn(async (message: unknown) => {
      requests.push(message)
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const errors: string[] = [],
    unsubscribe = subscribeGlassErrors(error => errors.push(error.message))
  const source = document.createElement('div')
  document.body.append(source)
  const bridge = new RegionBridge(client, 'light')
  for (const [id, glass, container] of [
    ['clear', Glass.clear.tint([0, 0.48, 1, 0.16]), false],
    ['union', Glass.regular, true],
  ] as const) {
    const element = document.createElement('div'),
      canvas = document.createElement('canvas')
    element.append(canvas)
    source.append(element)
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      top: 0,
      left: 0,
      right: 100,
      bottom: 60,
      toJSON: () => ({}),
    })
    Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
    registry.register({
      id,
      element,
      canvas,
      descriptor: {
        id,
        material: glass.material,
        shape: 'capsule',
        ...(container ? { container: { id: 'pair', spacing: 8 } } : {}),
      },
    })
  }
  bridge.bind(registry, source)
  await bridge.refresh()
  const scenes = requests.filter(
    (message): message is { request: { type: string; snapshot: { regions: { id: string }[] } } } =>
      !!message &&
      typeof message === 'object' &&
      'request' in message &&
      (message as { request?: { type?: string } }).request?.type === 'scene',
  )
  expect(scenes.at(-1)?.request.snapshot.regions.map(region => region.id)).toEqual([
    'clear',
    'union',
  ])
  expect(source.querySelectorAll('canvas')[0]?.hidden).toBe(false)
  expect(source.querySelectorAll('canvas')[1]?.hidden).toBe(false)
  expect(errors).toEqual([])
  bridge.unbind()
  unsubscribe()
})

it('keeps ownership of a transferred canvas while a registered screen is temporarily detached', async () => {
  const messages: { request: { type: string } }[] = []
  const client = {
    request: vi.fn(async (message: { request: { type: string } }) => {
      messages.push(message)
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry(),
    source = document.createElement('div'),
    element = document.createElement('div'),
    canvas = document.createElement('canvas')
  element.append(canvas)
  source.append(element)
  document.body.append(source)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    top: 0,
    left: 0,
    right: 100,
    bottom: 60,
    toJSON: () => ({}),
  })
  let transferred = false
  const transfer = vi.fn(() => {
    if (transferred) throw new DOMException('Canvas already transferred', 'InvalidStateError')
    transferred = true
    return {}
  })
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: transfer })
  registry.register({
    id: 'held-screen',
    element,
    canvas,
    descriptor: { id: 'held-screen', material: Glass.regular.material, shape: 'capsule' },
  })
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  await bridge.refresh()
  element.remove()
  await bridge.refresh()
  source.append(element)
  await bridge.refresh()
  expect(transfer).toHaveBeenCalledTimes(1)
  expect(messages.filter(m => m.request.type === 'detach-presenter')).toHaveLength(0)
  expect(canvas.hidden).toBe(false)
  bridge.unbind()
})

it.each(['invalidate', 'appearance'] as const)(
  'never reuses foreground ink after %s supersedes its capture',
  async supersession => {
    const sources: { id: string; revision: number }[] = []
    let bridge: RegionBridge | undefined,
      supersede = true
    const client = {
      request: vi.fn(
        async (message: {
          request: { type: string; source?: { id: string; revision: number } }
        }) => {
          if (message.request.type !== 'source') return
          sources.push(message.request.source!)
          // The first capture's refresh is superseded (retarget/hidden) after its foreground was sent.
          if (supersede) {
            supersede = false
            if (supersession === 'appearance') bridge!.setAppearance('dark')
            else bridge!.invalidateSources()
          }
        },
      ),
      onEvent: () => () => {},
    } as unknown as WebGPUClient
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 2076, height: 168, close() {} })),
    )
    const registry = new GlassRegionRegistry(),
      source = document.createElement('div'),
      element = document.createElement('div'),
      canvas = document.createElement('canvas'),
      overlay = document.createElement('canvas')
    element.append(canvas, overlay)
    source.append(element)
    document.body.append(source)
    // Mid-push the rect carries a fractional-transform residual; settled it is exact.
    let reads = 0
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
      const width = reads++ ? 998 : 998.00003
      return {
        x: 0,
        y: 0,
        width,
        height: 44,
        top: 0,
        left: 0,
        right: width,
        bottom: 44,
        toJSON: () => ({}),
      } as DOMRect
    })
    for (const c of [canvas, overlay])
      Object.defineProperty(c, 'transferControlToOffscreen', { value: () => ({}) })
    registry.register({
      id: 'separate',
      element,
      canvas,
      overlay,
      descriptor: {
        id: 'separate',
        material: Glass.regular.interactive().material,
        shape: 'capsule',
      },
    })
    bridge = new RegionBridge(client, 'light')
    bridge.bind(registry, source)
    await bridge.refresh()
    await bridge.refresh()
    expect(sources.map(s => s.id)).toEqual(['foreground:separate', 'foreground:separate'])
    expect(new Set(sources.map(s => `${s.id}:${s.revision}`)).size).toBe(2)
    bridge.unbind()
    vi.unstubAllGlobals()
  },
)

it.each(['current', 'stale', 'missing-material'])(
  'publishes per-show readiness only for a submitted current scene: %s',
  async state => {
    let acknowledge: (() => void) | undefined
    const client = {
      request: vi.fn(async (message: { request: { type: string } }) => {
        if (message.request.type === 'transaction')
          await new Promise<void>(resolve => {
            acknowledge = resolve
          })
        return { presented: state === 'missing-material' ? [] : ['alert'] }
      }),
      onEvent: () => () => {},
    } as unknown as WebGPUClient
    const registry = new GlassRegionRegistry(),
      source = document.createElement('div'),
      element = document.createElement('div'),
      canvas = document.createElement('canvas')
    element.append(canvas)
    source.append(element)
    document.body.append(source)
    canvas.dataset.satinGlassShow = 'first'
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      top: 0,
      left: 0,
      right: 100,
      bottom: 60,
      toJSON: () => ({}),
    })
    Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
    registry.register({
      id: 'alert',
      element,
      canvas,
      descriptor: { id: 'alert', material: Glass.alert.material, shape: 'capsule' },
    })
    const bridge = new RegionBridge(client, 'light')
    bridge.bind(registry, source)
    const updating = bridge.sourceChanged('light')
    await vi.waitFor(() => expect(acknowledge).toBeTypeOf('function'))
    expect(canvas.dataset.satinGlassPresentedShow).toBeUndefined()
    if (state === 'stale') canvas.dataset.satinGlassShow = 'second'
    acknowledge!()
    await updating
    expect(canvas.dataset.satinGlassPresentedShow).toBe(state === 'current' ? 'first' : undefined)
    bridge.unbind()
  },
)

it('publishes readiness only after the worker transaction acknowledges the scene', async () => {
  let acknowledge: (() => void) | undefined
  const client = {
    request: vi.fn(async (message: { request: { type: string } }) => {
      if (message.request.type === 'transaction')
        await new Promise<void>(resolve => {
          acknowledge = resolve
        })
      return { presented: ['new-context'] }
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const { registry, source, canvas } = registeredCapsule('new-context')
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  const updating = bridge.sourceChanged('light')
  await vi.waitFor(() => expect(acknowledge).toBeTypeOf('function'))
  expect(canvas.dataset.satinGlassPresented).toBeUndefined()
  acknowledge!()
  await updating
  expect(canvas.dataset.satinGlassPresented).toBe('true')
  bridge.unbind()
})

it('marks a new presenter presented only after its scene reply, and merges superseded scenes when the worker lags', async () => {
  const pending: (() => void)[] = [],
    scenes: number[] = []
  const client = {
    request: vi.fn((message: { request: { type: string; snapshot?: { revision: number } } }) => {
      if (message.request.type !== 'scene') return Promise.resolve()
      scenes.push(message.request.snapshot!.revision)
      return new Promise(resolve => pending.push(() => resolve({ presented: ['menu'] })))
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const { registry, source, canvas } = registeredCapsule('menu')
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  const first = bridge.refresh()
  await vi.waitFor(() => expect(scenes).toHaveLength(1))
  // The worker has not answered: the glass does not exist yet.
  expect(canvas.dataset.satinGlassPresented).toBeUndefined()
  pending.shift()!()
  await first
  expect(canvas.dataset.satinGlassPresented).toBe('true')
  // Presented: later scenes are posted without waiting; with two unanswered, newer ones merge.
  for (let i = 0; i < 5; i++) await bridge.refresh()
  expect(scenes).toHaveLength(3)
  pending.shift()!()
  await vi.waitFor(() => expect(scenes).toHaveLength(4))
  // Only the newest queued scene was sent.
  expect(scenes.at(-1)).toBe(Math.max(...scenes))
  expect(scenes.at(-1)! - scenes.at(-2)!).toBeGreaterThan(1)
  while (pending.length) pending.shift()!()
  bridge.unbind()
})

it.each(['after publication', 'during collection'])(
  'retires an older coalesced scene with acknowledgement %s',
  async acknowledgement => {
    const posted: number[] = [],
      acknowledge: (() => void)[] = []
    const client = {
      request: vi.fn(
        (
          message: {
            request: {
              type: string
              snapshot?: { revision: number }
              requests?: { type: string; snapshot?: { revision: number } }[]
            }
          },
          _transfer?: Transferable[],
          admitted?: () => void,
        ) => {
          admitted?.()
          const request = message.request
          if (request.type === 'scene') {
            posted.push(request.snapshot!.revision)
            return new Promise<void>(resolve => acknowledge.push(resolve))
          }
          if (request.type === 'transaction')
            for (const operation of request.requests ?? [])
              if (operation.type === 'scene') posted.push(operation.snapshot!.revision)
          return Promise.resolve()
        },
      ),
      onEvent: () => () => {},
    } as unknown as WebGPUClient
    const registry = new GlassRegionRegistry(),
      source = document.createElement('div')
    document.body.append(source)
    const bridge = new RegionBridge(client, 'light')
    bridge.bind(registry, source)
    await bridge.refresh()
    await bridge.refresh()
    await bridge.refresh()
    expect(posted).toEqual([1, 2])
    if (acknowledgement === 'during collection') {
      // Suspend the asynchronous refresh after collecting its new scene. An old
      // transport acknowledgement is free to arrive before transaction publication.
      const transport = bridge as unknown as {
        send: (request: GlassRendererRequest, transfer?: Transferable[]) => Promise<unknown>
      }
      const send = transport.send
      let collected!: () => void, release!: () => void
      const ready = new Promise<void>(resolve => {
          collected = resolve
        }),
        hold = new Promise<void>(resolve => {
          release = resolve
        })
      transport.send = async (request, transfer) => {
        const result = send(request, transfer)
        if (request.type === 'scene' && request.snapshot.revision === 4) {
          collected()
          await hold
        }
        return result
      }
      const update = bridge.sourceChanged('dark')
      await ready
      acknowledge.shift()!()
      for (let i = 0; i < 8; i++) await Promise.resolve()
      release()
      await update
    } else {
      await bridge.sourceChanged('dark')
      acknowledge.shift()!()
    }
    expect(posted).toEqual([1, 2, 4])
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(posted).toEqual([1, 2, 4])
    // A later refresh still publishes, and the remaining old acknowledgement cannot regress it.
    await bridge.refresh()
    expect(posted).toEqual([1, 2, 4, 5])
    while (acknowledge.length) acknowledge.shift()!()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(posted).toEqual([1, 2, 4, 5])
    bridge.unbind()
  },
)

it('captures only fixed navigation chrome rows including their full sampling halo', () => {
  const source = document.createElement('div'),
    chrome = document.createElement('header'),
    element = document.createElement('button'),
    canvas = document.createElement('canvas')
  chrome.dataset.satinNavigationChrome = 'true'
  chrome.append(element)
  source.append(chrome)
  document.body.append(source)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({
      x: 336,
      y: 86,
      width: 44,
      height: 44,
    }),
  )
  const registry = new GlassRegionRegistry()
  registry.register({
    id: 'back',
    element,
    canvas,
    descriptor: { id: 'back', material: Glass.regular.material, shape: 'capsule' },
  })
  const bridge = new RegionBridge(
    {
      request: vi.fn(async () => {}),
      onEvent: () => () => {},
    } as unknown as WebGPUClient,
    'light',
  )
  bridge.bind(registry, source)
  expect(bridge.navigationCaptureRows(1024)).toEqual({ top: 42, height: 132 })
  // iPad's adaptive tab bar is fixed above the navigation chrome. It expands
  // the sampled band, rather than forcing an otherwise unused full-page upload.
  const tabs = document.createElement('nav')
  tabs.dataset.satinTabBar = 'true'
  tabs.dataset.satinTabPlacement = 'top'
  source.append(tabs)
  vi.spyOn(tabs, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({
      x: 590,
      y: 32,
      width: 185,
      height: 44,
    }),
  )
  registry.register({
    id: 'tabs',
    element: tabs,
    canvas: document.createElement('canvas'),
    descriptor: { id: 'tabs', material: Glass.regular.material, shape: 'capsule' },
  })
  expect(bridge.navigationCaptureRows(1024)).toEqual({ top: 0, height: 174 })
  tabs.dataset.satinTabPlacement = 'bottom'
  expect(bridge.navigationCaptureRows(1024)).toEqual({ top: 0, height: 1024 })
  tabs.dataset.satinTabPlacement = 'top'

  // A moving content surface may sample elsewhere; never crop it to the chrome.
  source.append(element)
  expect(bridge.navigationCaptureRows(1024)).toEqual({ top: 0, height: 1024 })
  bridge.unbind()
})

it('holds inactive retained-tab glass in the scene and reuses its presenter on activation', async () => {
  const requests: {
    request: { type: string; snapshot?: { regions: { id: string; suspended?: boolean }[] } }
  }[] = []
  const client = {
    request: vi.fn(async (message: (typeof requests)[number]) => {
      requests.push(message)
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry(),
    source = document.createElement('div'),
    panel = document.createElement('div'),
    element = document.createElement('button'),
    canvas = document.createElement('canvas')
  panel.dataset.satinTabActive = 'true'
  panel.dataset.satinTabPanel = 'kept'
  element.append(canvas)
  panel.append(element)
  source.append(panel)
  document.body.append(source)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 50,
    width: 44,
    height: 44,
  } as DOMRect)
  const transfer = vi.fn(() => ({}))
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: transfer })
  registry.register({
    id: 'retained',
    element,
    canvas,
    descriptor: { id: 'retained', material: Glass.regular.material, shape: 'capsule' },
  })
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  const regions = () =>
    requests
      .filter(x => x.request.type === 'scene')
      .at(-1)
      ?.request.snapshot?.regions.map(x => [x.id, !!x.suspended])
  await bridge.refresh()
  expect(regions()).toEqual([['retained', false]])
  // Unselected: the region stays in the scene, held, and its canvas keeps its own tab's pixels.
  panel.dataset.satinTabActive = 'false'
  await bridge.refresh()
  expect(regions()).toEqual([['retained', true]])
  expect(canvas.hidden).toBe(false)
  // Selected again: still held until its own tab's source preparation is acknowledged.
  panel.dataset.satinTabActive = 'true'
  await bridge.refresh()
  expect(regions()).toEqual([['retained', true]])
  await bridge.sourceInstalled(Promise.resolve(), 'light')
  await bridge.refresh()
  expect(regions()).toEqual([['retained', false]])
  expect(canvas.hidden).toBe(false)
  expect(transfer).toHaveBeenCalledOnce()
  bridge.unbind()
})

it.each(['discarded batch', 'synchronous transport failure', 'rejected transport failure'])(
  'preserves a parked scene after %s',
  async failure => {
    const posted: number[] = [],
      acks: (() => void)[] = []
    const client = {
      request: vi.fn(
        (
          message: { request: GlassRendererRequest },
          _transfer?: Transferable[],
          admitted?: () => void,
        ) => {
          const request = message.request
          if (request.type === 'transaction') {
            if (failure === 'rejected transport failure')
              return Promise.reject(Error('transport unavailable'))
            throw Error('transport unavailable')
          }
          admitted?.()
          if (request.type === 'scene') {
            posted.push(request.snapshot.revision)
            return new Promise<void>(resolve => acks.push(resolve))
          }
          return Promise.resolve()
        },
      ),
      onEvent: () => () => {},
    } as unknown as WebGPUClient
    const source = document.createElement('div')
    document.body.append(source)
    const bridge = new RegionBridge(client, 'light')
    bridge.bind(new GlassRegionRegistry(), source)
    await bridge.refresh()
    await bridge.refresh()
    await bridge.refresh()
    const transport = bridge as unknown as {
      send: (request: GlassRendererRequest, transfer?: Transferable[]) => Promise<unknown>
    }
    const send = transport.send
    let collected!: () => void, release!: () => void
    const ready = new Promise<void>(resolve => {
        collected = resolve
      }),
      hold = new Promise<void>(resolve => {
        release = resolve
      })
    transport.send = async (request, transfer) => {
      const result = send(request, transfer)
      if (request.type === 'scene' && request.snapshot.revision === 4) {
        collected()
        await hold
      }
      return result
    }
    const update = bridge.sourceChanged('dark')
    const settled =
      failure !== 'discarded batch'
        ? expect(update).rejects.toThrow('transport unavailable')
        : update
    await ready
    acks.shift()!()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(posted).toEqual([1, 2])
    if (failure === 'discarded batch') bridge.invalidateSources()
    release()
    await settled
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(posted).toEqual([1, 2, 3])
    while (acks.length) acks.shift()!()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    bridge.unbind()
  },
)

it.each([3, 4])(
  'retires a parked scene when published revision %i is equal or newer',
  async revision => {
    const posted: number[] = [],
      acks: (() => void)[] = []
    const client = {
      request: vi.fn(
        (
          message: { request: GlassRendererRequest },
          _transfer?: Transferable[],
          admitted?: () => void,
        ) => {
          const request = message.request
          admitted?.()
          if (request.type === 'scene') {
            posted.push(request.snapshot.revision)
            return new Promise<void>(resolve => acks.push(resolve))
          }
          if (request.type === 'transaction')
            for (const operation of request.requests)
              if (operation.type === 'scene') posted.push(operation.snapshot.revision)
          return Promise.resolve()
        },
      ),
      onEvent: () => () => {},
    } as unknown as WebGPUClient
    const source = document.createElement('div')
    document.body.append(source)
    const bridge = new RegionBridge(client, 'light')
    bridge.bind(new GlassRegionRegistry(), source)
    await bridge.refresh()
    await bridge.refresh()
    await bridge.refresh()
    const transport = bridge as unknown as {
      send: (request: GlassRendererRequest) => Promise<unknown>
    }
    await transport.send({
      type: 'transaction',
      requests: [{ type: 'scene', snapshot: { revision, regions: [], layers: [], scrolls: [] } }],
    })
    while (acks.length) acks.shift()!()
    for (let i = 0; i < 8; i++) await Promise.resolve()
    expect(posted).toEqual([1, 2, revision])
    bridge.unbind()
  },
)

it('posts a menu scene without ink and shows the live rows when the ink capture fails', async () => {
  const { captureRegionForeground } = await import('./foreground.ts')
  vi.mocked(captureRegionForeground).mockRejectedValueOnce(Error('unsupported content'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const requests: { request: GlassRendererRequest }[] = []
  const client = {
    request: vi.fn(async (message: { request: GlassRendererRequest }) => {
      requests.push(message)
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div'),
    element = document.createElement('div'),
    canvas = document.createElement('canvas'),
    rows = document.createElement('div')
  rows.dataset.satinMenuInk = 'true'
  rows.textContent = 'A label long enough to wrap onto a second line'
  element.append(canvas, rows)
  source.append(element)
  document.body.append(source)
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  for (const node of [element, rows])
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
      x: 170,
      y: 62,
      width: 250,
      height: 190,
      top: 62,
      left: 170,
      right: 420,
      bottom: 252,
      toJSON: () => ({}),
    })
  registry.register({
    id: 'menu',
    element,
    canvas,
    descriptor: {
      id: 'menu',
      material: Glass.regular.material,
      shape: { kind: 'roundedRectangle', cornerRadius: 32 },
      emerge: { from: { x: 380, y: 62, width: 44, height: 44, radius: 22 }, generation: 4 },
    },
  })
  const handed: [string, number | undefined][] = []
  registry.onEmergeInk('menu', (phase, generation) => handed.push([phase, generation]))
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  await bridge.refresh()
  const scene = requests.filter(message => message.request.type === 'scene').at(-1)?.request
  expect(scene?.type === 'scene' && scene.snapshot.regions[0]?.emerge?.ink).toBeUndefined()
  expect(scene?.type === 'scene' && scene.snapshot.regions[0]?.emerge?.generation).toBe(4)
  expect(handed).toEqual([['open-settled', 4]])
  bridge.unbind()
})

async function menuInkFixture() {
  const { captureRegionForeground } = await import('./foreground.ts')
  const capture = vi.mocked(captureRegionForeground)
  capture.mockClear()
  const getContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ drawImage() {} }),
  })
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
  const client = {
    request: vi.fn(async () => undefined),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div'),
    element = document.createElement('div'),
    canvas = document.createElement('canvas'),
    rows = document.createElement('div')
  rows.dataset.satinMenuInk = 'true'
  rows.textContent = 'Welcome'
  element.append(canvas, rows)
  source.append(element)
  document.body.append(source)
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  const descriptor = {
    id: 'menu',
    material: Glass.regular.material,
    shape: { kind: 'roundedRectangle' as const, cornerRadius: 32 },
    emerge: { from: { x: 380, y: 62, width: 44, height: 44, radius: 22 }, generation: 1 },
  }
  const unregister = registry.register({
    id: 'menu',
    element,
    canvas,
    descriptor,
  })
  for (const node of [element, rows])
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
      x: 170,
      y: 62,
      width: 250,
      height: 190,
      top: 62,
      left: 170,
      right: 420,
      bottom: 252,
      toJSON: () => ({}),
    })
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  return {
    capture,
    bridge,
    rows,
    registry,
    element,
    canvas,
    descriptor,
    unregister,
    dispose() {
      bridge.unbind()
      vi.unstubAllGlobals()
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getContext)
    },
  }
}

it('re-captures a menu ink atlas when the appearance changes, and only then', async () => {
  const fixture = await menuInkFixture()
  const { capture, bridge, rows } = fixture
  try {
    await bridge.refresh()
    const once = capture.mock.calls.length
    expect(once).toBeGreaterThan(0)
    await bridge.refresh()
    expect(capture.mock.calls.length).toBe(once)
    // A held panel strains with the finger: its transform moves the rows' on-screen rect by
    // fractions of a point every frame, but their ink is unchanged.
    vi.spyOn(rows, 'getBoundingClientRect').mockReturnValue({
      x: 170.06,
      y: 61.94,
      width: 249.88,
      height: 190.12,
      top: 61.94,
      left: 170.06,
      right: 419.94,
      bottom: 252.06,
      toJSON: () => ({}),
    })
    await bridge.refresh()
    expect(capture.mock.calls.length).toBe(once)
    await bridge.sourceChanged('dark')
    expect(capture.mock.calls.length).toBe(2 * once)
  } finally {
    fixture.dispose()
  }
})

it('keeps an emerged container source for ink but excludes it from the shared material', async () => {
  const messages: {
    request: {
      type: string
      snapshot?: { regions: { id: string }[] }
      presenter?: { regionIds: string[] }
    }
  }[] = []
  const client = {
    request: vi.fn(async (message: (typeof messages)[number]) => {
      messages.push(message)
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  document.body.append(source)
  const bridge = new RegionBridge(client, 'light')
  for (const index of [0, 1, 2]) {
    const element = document.createElement('div')
    const canvas = document.createElement('canvas')
    element.append(canvas)
    source.append(element)
    if (index === 1) element.dataset.satinMenuEmerged = 'true'
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: index * 70,
      y: 200,
      width: 60,
      height: 40,
      top: 200,
      left: index * 70,
      right: index * 70 + 60,
      bottom: 240,
      toJSON: () => ({}),
    })
    Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
    registry.register({
      id: `member-${index}`,
      element,
      canvas,
      descriptor: {
        id: `member-${index}`,
        material: Glass.regular.material,
        shape: 'capsule',
        container: { id: 'row', spacing: 20 },
      },
    })
  }
  try {
    bridge.bind(registry, source)
    await bridge.refresh()
    const scene = messages.filter(message => message.request.type === 'scene').at(-1)
    expect(scene?.request.snapshot?.regions.map(region => region.id)).toEqual([
      'member-0',
      'member-1',
      'member-2',
    ])
    const presenters = messages.filter(message => message.request.type === 'attach-presenter')
    expect(presenters.length).toBeGreaterThan(0)
    expect(presenters.flatMap(message => message.request.presenter!.regionIds)).not.toContain(
      'member-1',
    )
  } finally {
    bridge.unbind()
    source.remove()
  }
})

it('refreshes changed radio checks for close while ignoring the ink root inert state', async () => {
  const fixture = await menuInkFixture()
  const { capture, bridge, rows, registry, element, canvas, descriptor, unregister } = fixture
  try {
    await bridge.refresh()
    const once = capture.mock.calls.length
    expect(once).toBeGreaterThan(0)
    await bridge.refresh()
    expect(capture.mock.calls.length).toBe(once)
    rows.inert = true
    await bridge.refresh()
    expect(capture.mock.calls.length).toBe(once)
    rows.innerHTML =
      '<button role="menuitemradio" aria-checked="false">Food</button><button role="menuitemradio" aria-checked="true">Home ✓</button>'
    unregister()
    registry.register({
      id: 'menu',
      element,
      canvas,
      descriptor: {
        ...descriptor,
        emerge: { ...descriptor.emerge, closing: true },
      },
    })
    await bridge.refresh()
    expect(capture.mock.calls.length).toBeGreaterThan(once)
  } finally {
    fixture.dispose()
  }
})

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>(done => {
    resolve = done
  })
  return { promise, resolve }
}
async function dropTransportFixture(bind = true) {
  const { captureRegionForeground } = await import('./foreground.ts')
  const capture = vi.mocked(captureRegionForeground)
  capture.mockReset()
  capture.mockImplementation(async () => document.createElement('canvas'))
  vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(99)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage() {},
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>)
  const bitmap = { width: 250, height: 190, close: vi.fn() }
  const createBitmap = vi.fn(async () => bitmap)
  vi.stubGlobal('createImageBitmap', createBitmap)
  const operations: GlassRendererRequest[] = []
  const request = vi.fn(async (message: { request: GlassRendererRequest }): Promise<unknown> => {
    operations.push(message.request)
    return { presented: registry.values().map(entry => entry.id) }
  })
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  document.body.append(source)
  const bridge = new RegionBridge(
    { request, onEvent: () => () => {} } as unknown as WebGPUClient,
    'light',
  )
  if (bind) bridge.bind(registry, source)
  const add = (id: string) => {
    const element = document.createElement('div'),
      canvas = document.createElement('canvas'),
      rows = document.createElement('div')
    rows.dataset.satinMenuInk = 'true'
    rows.textContent = id
    element.append(canvas, rows)
    source.append(element)
    Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
    for (const node of [element, rows])
      vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
        x: 170,
        y: 62,
        width: 250,
        height: 190,
        top: 62,
        left: 170,
        right: 420,
        bottom: 252,
        toJSON: () => ({}),
      })
    const remove = registry.register({
      id,
      element,
      canvas,
      descriptor: {
        id,
        material: Glass.regular.material,
        shape: { kind: 'roundedRectangle', cornerRadius: 24 },
        emerge: {
          sourceKind: 'label',
          from: { x: 200, y: 62, width: 20, height: 20, radius: 10 },
          ready: false,
        },
      },
    })
    return { remove, element, canvas }
  }
  const close = () => {
    bridge.unbind()
    vi.unstubAllGlobals()
  }
  return {
    bridge,
    registry,
    source,
    add,
    request,
    operations,
    capture,
    bitmap,
    createBitmap,
    close,
  }
}
function containsDrop(request: GlassRendererRequest, id: string): boolean {
  if (request.type === 'transaction')
    return request.requests.some(operation => containsDrop(operation, id))
  return (
    (request.type === 'source' && request.source.regionId === id) ||
    (request.type === 'scene' && request.snapshot.regions.some(region => region.id === id))
  )
}
it('posts prepared drop glass and ink without waiting for an animation frame', async () => {
  const f = await dropTransportFixture()
  try {
    f.add('prepared')
    // The registration microtask itself must start the real capture/transport path.
    await vi.waitFor(() =>
      expect(f.operations.some(op => op.type === 'scene' && containsDrop(op, 'prepared'))).toBe(
        true,
      ),
    )
    expect(f.operations.some(op => op.type === 'source' && containsDrop(op, 'prepared'))).toBe(true)
  } finally {
    f.close()
  }
})
it.each(['capture', 'bitmap', 'source-ack'] as const)(
  'never posts retired drop work after unregister during %s',
  async stage => {
    const f = await dropTransportFixture()
    const entered = deferred<void>(),
      release = deferred<void>()
    if (stage === 'capture')
      f.capture.mockImplementationOnce(async () => {
        entered.resolve()
        await release.promise
        return document.createElement('canvas')
      })
    if (stage === 'bitmap')
      f.createBitmap.mockImplementationOnce(async () => {
        entered.resolve()
        await release.promise
        return f.bitmap
      })
    if (stage === 'source-ack')
      f.request.mockImplementation(async message => {
        f.operations.push(message.request)
        if (message.request.type === 'source') {
          entered.resolve()
          await release.promise
        }
      })
    try {
      const drop = f.add('retired')
      await entered.promise
      drop.remove() // Keep its DOM connected: registry ownership, not isConnected, is authoritative.
      const afterRemoval = f.operations.length
      release.resolve()
      await f.bridge.refresh()
      expect(f.operations.slice(afterRemoval).some(op => containsDrop(op, 'retired'))).toBe(false)
      if (stage === 'bitmap') expect(f.bitmap.close).toHaveBeenCalled()
      expect(f.operations.at(-1)).toMatchObject({ type: 'scene', snapshot: { regions: [] } })
    } finally {
      release.resolve()
      f.close()
    }
  },
)
it('does not flush a parked scene containing an unregistered drop', async () => {
  const f = await dropTransportFixture()
  const pending: Array<ReturnType<typeof deferred<void>>> = []
  try {
    const drop = f.add('parked')
    await f.bridge.refresh()
    f.request.mockImplementation(async message => {
      f.operations.push(message.request)
      if (message.request.type === 'scene') {
        const reply = deferred<void>()
        pending.push(reply)
        await reply.promise
      }
    })
    await f.bridge.refresh()
    await f.bridge.refresh()
    await f.bridge.refresh()
    expect(pending.length).toBe(2)
    drop.remove()
    const afterRemoval = f.operations.length
    pending[0]!.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(f.operations.slice(afterRemoval).some(op => containsDrop(op, 'parked'))).toBe(false)
  } finally {
    pending.forEach(reply => reply.resolve())
    f.close()
  }
})

it('discards an in-flight menu capture when its retained motion descriptor changes', async () => {
  const f = await dropTransportFixture()
  const entered = deferred<void>(),
    release = deferred<void>()
  f.capture.mockImplementationOnce(async () => {
    entered.resolve()
    await release.promise
    return document.createElement('canvas')
  })
  try {
    f.add('retained')
    await entered.promise
    const entry = f.registry.values()[0]!
    f.registry.updateEmerge(entry.id, { ...entry.descriptor.emerge!, generation: 2, ready: true })
    release.resolve()
    await f.bridge.refresh()
    const scenes = f.operations.filter(op => op.type === 'scene')
    expect(scenes.length).toBeGreaterThan(0)
    for (const scene of scenes)
      expect(
        scene.snapshot.regions.find(region => region.id === entry.id)?.emerge?.generation,
      ).toBe(2)
    expect(f.registry.values()[0]).toBe(entry)
    expect(f.registry.retirementVersion).toBe(0)
  } finally {
    release.resolve()
    f.close()
  }
})

it('does not flush a parked scene from a superseded retained menu generation', async () => {
  const f = await dropTransportFixture()
  const pending: Array<ReturnType<typeof deferred<void>>> = []
  try {
    f.add('retained')
    await f.bridge.refresh()
    f.request.mockImplementation(async message => {
      f.operations.push(message.request)
      if (message.request.type === 'scene') {
        const reply = deferred<void>()
        pending.push(reply)
        await reply.promise
      }
    })
    await f.bridge.refresh()
    await f.bridge.refresh()
    await f.bridge.refresh()
    expect(pending.length).toBe(2)
    const entry = f.registry.values()[0]!
    f.registry.updateEmerge(entry.id, { ...entry.descriptor.emerge!, generation: 2, closing: true })
    const afterUpdate = f.operations.length
    pending[0]!.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    for (const operation of f.operations.slice(afterUpdate)) {
      if (operation.type !== 'scene') continue
      expect(
        operation.snapshot.regions.find(region => region.id === entry.id)?.emerge?.generation,
      ).toBe(2)
    }
    expect(f.registry.values()[0]).toBe(entry)
  } finally {
    pending.forEach(reply => reply.resolve())
    f.close()
  }
})

it('discards batched ink when its registration retires before transaction publication', async () => {
  const f = await dropTransportFixture(false)
  const entered = deferred<void>(),
    release = deferred<void>()
  try {
    const removed = f.add('retired-batch')
    f.add('survivor')
    f.capture.mockImplementation(async element => {
      if (element.textContent === 'survivor') {
        entered.resolve()
        await release.promise
      }
      return document.createElement('canvas')
    })
    f.bridge.bind(f.registry, f.source)
    const batch = f.bridge.sourceChanged('light')
    await entered.promise
    removed.remove()
    release.resolve()
    await batch
    await f.bridge.refresh()
    expect(f.operations.some(op => containsDrop(op, 'retired-batch'))).toBe(false)
    expect(f.operations.some(op => op.type === 'scene' && containsDrop(op, 'survivor'))).toBe(true)
  } finally {
    release.resolve()
    f.close()
  }
})

it.each(['first show', 'lost after presentation'])(
  'reports missing visible navigation glass loudly: %s',
  async failure => {
    vi.useFakeTimers()
    const errors: string[] = []
    const unsubscribe = subscribeGlassErrors(error => errors.push(error.message))
    let materialAvailable = failure === 'lost after presentation'
    const client = {
      request: async () => ({ presented: materialAvailable ? ['back'] : [] }),
      onEvent: () => () => {},
    } as unknown as WebGPUClient
    const registry = new GlassRegionRegistry()
    const source = document.createElement('div')
    const element = document.createElement('div')
    const canvas = document.createElement('canvas')
    element.append(canvas)
    source.append(element)
    document.body.append(source)
    const geometry = vi
      .spyOn(element, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 44, 44))
    Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
    const registration = {
      id: 'back',
      element,
      canvas,
      descriptor: { id: 'back', material: Glass.regular.material, shape: 'capsule' as const },
    }
    let unregister = registry.register(registration)
    const bridge = new RegionBridge(client, 'light')
    try {
      bridge.bind(registry, source)
      await bridge.refresh()
      materialAvailable = false
      await bridge.refresh()
      for (let update = 0; update < 3; update++) {
        await vi.advanceTimersByTimeAsync(3000)
        unregister()
        unregister = registry.register({ ...registration })
        await bridge.refresh()
      }
      expect(errors).toEqual([])
      if (failure === 'lost after presentation') {
        geometry.mockReturnValue(new DOMRect(0, 0, 0, 0))
        await bridge.refresh()
        await vi.advanceTimersByTimeAsync(30_000)
        expect(errors).toEqual([])
        geometry.mockReturnValue(new DOMRect(0, 0, 44, 44))
        await bridge.refresh()
      }
      await vi.advanceTimersByTimeAsync(1001)
      expect(
        errors.some(message => message.includes('back') && message.includes('not presented')),
      ).toBe(true)
      expect(canvas.dataset.satinGlassPresented).not.toBe('true')
    } finally {
      bridge.unbind()
      unsubscribe()
      vi.useRealTimers()
    }
  },
)

function registerPlainButton(registry: GlassRegionRegistry, source: HTMLElement, id: string) {
  const element = document.createElement('div'),
    canvas = document.createElement('canvas'),
    label = document.createElement('span')
  label.textContent = id
  element.append(canvas, label)
  source.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 44,
    top: 0,
    left: 0,
    right: 100,
    bottom: 44,
    toJSON: () => ({}),
  })
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  registry.register({
    id,
    element,
    canvas,
    descriptor: {
      id,
      material: { ...Glass.regular.material, press: 'button' },
      shape: 'capsule',
    },
  })
  return { element, canvas }
}

it('reads no foreground ink for plain glass buttons and discovers top-layer dialogs once', async () => {
  const registry = new GlassRegionRegistry(),
    source = document.createElement('div')
  document.body.append(source)
  const buttons = ['save', 'close'].map(id => registerPlainButton(registry, source, id))
  const bridge = new RegionBridge(
    { request: async () => {}, onEvent: () => () => {} } as unknown as WebGPUClient,
    'light',
  )
  const elementQueries = vi.spyOn(Element.prototype, 'querySelectorAll')
  const documentQueries = vi.spyOn(document, 'querySelectorAll')
  const styles = vi.spyOn(window, 'getComputedStyle')
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  bridge.bind(registry, source)
  try {
    await bridge.refresh()
    const ink = elementQueries.mock.calls.filter(
      (call, index) =>
        call[0] === '*' &&
        buttons.some(button => elementQueries.mock.instances[index] === button.element),
    )
    const dialogs = documentQueries.mock.calls.filter(call => call[0] === 'dialog[open]')
    const fontReads = styles.mock.calls.filter(call =>
      buttons.some(button => call[0] === button.element),
    )
    // Each button is read for visibility twice (queued readiness, then this
    // refresh), then for layout and its containing block. The foreground key
    // (font, color, descendant ink) is not read: a press button never lifts it.
    expect(ink).toHaveLength(0)
    expect(dialogs).toHaveLength(1)
    expect(fontReads).toHaveLength(4 * buttons.length)
  } finally {
    bridge.unbind()
  }
})

it('does not rewrite a presenter canvas whose geometry is unchanged', async () => {
  const registry = new GlassRegionRegistry(),
    source = document.createElement('div')
  document.body.append(source)
  const { canvas } = registerPlainButton(registry, source, 'save')
  const bridge = new RegionBridge(
    { request: async () => {}, onEvent: () => () => {} } as unknown as WebGPUClient,
    'light',
  )
  const assign = vi.spyOn(Object, 'assign')
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  bridge.bind(registry, source)
  try {
    await bridge.refresh()
    await bridge.refresh()
    expect(assign.mock.calls.filter(call => call[0] === canvas.style)).toHaveLength(1)
  } finally {
    bridge.unbind()
  }
})

it('carries both toolbar symbols in the shared capsule ink', async () => {
  const { captureRegionForeground } = await import('./foreground.ts')
  const capturedSymbols: string[] = []
  vi.mocked(captureRegionForeground).mockImplementation(async element => {
    capturedSymbols.push(element.textContent ?? '')
    return document.createElement('canvas')
  })
  const getContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ drawImage() {} }),
  })
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
  const client = {
    request: vi.fn(async () => undefined),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  source.innerHTML = `<header data-satin-navigation-chrome>
    <div data-satin-toolbar-glass="trailing" data-satin-glass-region-id="toolbar"></div>
    <div data-satin-navigation-toolbar-slot="trailing">
      <div data-satin-toolbar-item="item"><div data-satin-glass-slot-content>Love</div></div>
      <div data-satin-toolbar-item="item"><div data-satin-glass-slot-content>More</div></div>
    </div>
  </header>`
  const owner = source.querySelector<HTMLElement>('[data-satin-toolbar-glass]')!
  const symbols = source.querySelectorAll<HTMLElement>('[data-satin-glass-slot-content]')
  bindToolbarMaterialContent(owner, symbols[0]!)
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  element.append(canvas)
  source.append(element)
  document.body.append(source)
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 62, 96, 44))
  symbols.forEach((symbol, index) => {
    vi.spyOn(symbol, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(300 + index * 52, 62, 44, 44),
    )
  })
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(146, 62, 250, 190))
  registry.register({
    id: 'menu',
    element,
    canvas,
    descriptor: {
      id: 'menu',
      material: Glass.regular.material,
      shape: { kind: 'roundedRectangle', cornerRadius: 32 },
      emerge: {
        from: { x: 300, y: 62, width: 96, height: 44, radius: 22 },
        sourceRegionId: 'toolbar',
        generation: 1,
      },
    },
  })
  const bridge = new RegionBridge(client, 'light')
  try {
    bridge.bind(registry, source)
    await bridge.refresh()
    expect(capturedSymbols).toContain('Love')
    expect(capturedSymbols).toContain('More')
  } finally {
    bridge.unbind()
    vi.unstubAllGlobals()
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getContext)
  }
})

it('retains independent field envelopes while their shared container moves', async () => {
  const messages: GlassRendererOperation[] = []
  const client = {
    request: async ({ request }: { request: GlassRendererOperation }) => {
      messages.push(request)
    },
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  const container = document.createElement('div')
  const canvas = document.createElement('canvas')
  const member = document.createElement('div')
  const memberCanvas = document.createElement('canvas')
  member.append(memberCanvas)
  container.append(canvas, member)
  source.append(container)
  document.body.append(source)
  let y = 240
  vi.spyOn(container, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(16, y, 408, 600),
  )
  vi.spyOn(member, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(16, y + 30, 408, 180),
  )
  for (const target of [canvas, memberCanvas])
    Object.defineProperty(target, 'transferControlToOffscreen', { value: () => ({}) })
  registry.registerContainer('cards', container, canvas)
  const cardRegistration = {
    id: 'card',
    element: member,
    canvas: memberCanvas,
    descriptor: {
      id: 'card',
      shape: 'capsule' as const,
      material: Glass.regular.material,
      container: { id: 'cards', spacing: 20 },
    },
  }
  let unregisterCard = registry.register(cardRegistration)
  const distant = document.createElement('div')
  const distantCanvas = document.createElement('canvas')
  distant.append(distantCanvas)
  container.append(distant)
  vi.spyOn(distant, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(16, y + 450, 80, 44),
  )
  Object.defineProperty(distantCanvas, 'transferControlToOffscreen', { value: () => ({}) })
  const unregisterDistant = registry.register({
    id: 'distant',
    element: distant,
    canvas: distantCanvas,
    descriptor: {
      id: 'distant',
      shape: 'capsule',
      material: Glass.regular.material,
      container: { id: 'cards', spacing: 20 },
      namespace: 'controls',
      union: 'distant',
    },
  })
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  try {
    await bridge.refresh()
    const attached = messages.find(message => message.type === 'attach-presenter')
    expect(attached?.type === 'attach-presenter' && attached.presenter.fieldOrigin).toEqual({
      x: 16,
      y: 240,
    })
    // Independent fields must not allocate the empty space between their materials.
    const attachments = messages.filter(message => message.type === 'attach-presenter')
    expect(attachments).toHaveLength(2)
    for (const message of attachments) expect(message.presenter.height).toBeLessThan(300)
    const updates = () => messages.filter(message => message.type === 'update-presenter').length
    const unchanged = updates()
    await bridge.refresh()
    expect(updates()).toBe(unchanged)
    y = 40
    await bridge.refresh()
    const updated = messages.findLast(
      message =>
        message.type === 'update-presenter' && message.presenter.regionIds.includes('card'),
    )
    expect(updated?.type === 'update-presenter' && updated.presenter.fieldOrigin).toEqual({
      x: 16,
      y: 40,
    })
    if (attached?.type !== 'attach-presenter' || updated?.type !== 'update-presenter')
      throw Error('missing presenters')
    expect(updated.presenter.origin.y - attached.presenter.origin.y).toBe(-200)
    expect(updated.presenter.height).toBe(attached.presenter.height)
    // A field that dissolves leaves its presenter unused, and the renderer may resize it
    // meanwhile. Rejoining with unchanged geometry must admit the descriptor again.
    unregisterDistant()
    await bridge.refresh()
    unregisterCard()
    const { container: _container, ...standalone } = cardRegistration.descriptor
    unregisterCard = registry.register({ ...cardRegistration, descriptor: standalone })
    await bridge.refresh()
    expect(canvas.hidden).toBe(true)
    unregisterCard()
    unregisterCard = registry.register(cardRegistration)
    const beforeRejoin = updates()
    await bridge.refresh()
    expect(updates()).toBe(beforeRejoin + 1)
  } finally {
    bridge.unbind()
  }
})
