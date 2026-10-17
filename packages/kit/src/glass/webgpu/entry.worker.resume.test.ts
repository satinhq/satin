import { PageFrameHost } from './frameClock.ts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('./passes.ts', () => ({ prewarmKernels: async () => {} }))
import { installAppearanceStore } from '../../app/appearanceStore.ts'

// Exercise the actual serialized worker handler; only GPU storage/presentation is replaced.
const frames = vi.hoisted(() => ({
  adapterRecovery: undefined as ((pending: boolean) => void) | undefined,
  recoveryEvents: [] as boolean[],
  appearance: 'dark',
  presented: [] as string[],
  submissions: 0,
  chromeAppearance: 'light',
  chromePresented: [] as string[],
  deviceListeners: [] as ((device: object | undefined) => void)[],
  appearanceRevision: 0,
  appearanceRefreshReceived: undefined as (() => void) | undefined,
  readyGate: undefined as Promise<void> | undefined,
  duringEncode: undefined as (() => void) | undefined,
  animationFrame: undefined as (() => void) | undefined,
}))
vi.mock('./layers.ts', () => ({
  LayerDevice: class {
    constructor(_onError: unknown, onAdapterRecovery: (pending: boolean) => void) {
      frames.adapterRecovery = onAdapterRecovery
    }
    liveDevice = {
      features: new Set(),
      createCommandEncoder: () => ({ finish: () => ({}) }),
      queue: {
        submit: () => frames.submissions++,
        onSubmittedWorkDone: () => Promise.resolve(),
      },
    }
    subscribe(listener: (device: object | undefined) => void) {
      frames.deviceListeners.push(device => {
        this.liveDevice = device as typeof this.liveDevice
        listener(device)
      })
    }
    async ready() {
      await frames.readyGate
      return this.liveDevice
    }
  },
}))
vi.mock('./errors.ts', () => ({
  gpuScope: (_device: unknown, _stage: string, work: () => unknown) => work(),
}))
vi.mock('./backdrop.ts', () => ({ Backdrop: { for: () => ({ suspend() {} }) } }))
vi.mock('./raster.ts', () => ({
  WebGPURaster: class {
    setSubmissionGate() {}
    withSharedPresentation(draw: () => void) {
      draw()
    }
    spec: object | undefined
    async init() {}
    async settled() {}
    setVisible() {}
    setAppearance(value: string) {
      frames.chromeAppearance = value
    }
    setLift() {}
    install(setup: object) {
      this.spec = setup
    }
    report() {
      return {}
    }
    submitted() {}
    // A freshly attached or otherwise eligible surface must still obey worker visibility.
    setLensDebug() {
      this.spec = {}
    }
    encodeResult() {
      frames.duringEncode?.()
      return true
    }
    static presentLayer() {
      frames.presented.push(frames.appearance)
      frames.chromePresented.push(frames.chromeAppearance)
    }
  },
}))
vi.mock('./regionScene.ts', () => ({
  RegionScene: class {
    private canPresent: () => boolean
    constructor(_owner: unknown, _event: unknown, canPresent: () => boolean) {
      this.canPresent = canPresent
    }
    visible = true
    async request(request: { type: string; value?: string; visible?: boolean }) {
      if (request.type === 'appearance') frames.appearance = request.value!
      if (request.type === 'visibility') this.visible = request.visible!
    }
    setLensDebug() {}
    sample() {}
    async prepareResume() {
      this.visible = true
    }
    present() {
      if (this.visible && this.canPresent()) frames.presented.push(frames.appearance)
    }
  },
}))

let nextId = 0
let replies: Map<number, { error?: string; value?: unknown }>
let completions: Map<number, () => void>
beforeEach(async () => {
  vi.resetModules()
  frames.appearance = 'dark'
  frames.presented = []
  frames.submissions = 0
  frames.chromeAppearance = 'light'
  frames.chromePresented = []
  frames.readyGate = undefined
  frames.duringEncode = undefined
  frames.animationFrame = undefined
  frames.deviceListeners = []
  frames.recoveryEvents = []
  frames.appearanceRevision = 0
  frames.appearanceRefreshReceived = undefined
  replies = new Map()
  completions = new Map()
  vi.stubGlobal('self', globalThis)
  const pageFrames = new PageFrameHost()
  vi.stubGlobal(
    'postMessage',
    (reply: {
      id?: number
      error?: string
      adapterRecovery?: boolean
      appearanceRevision?: number
      glassFrame?: { token: number; cancel?: boolean }
    }) => {
      if (
        pageFrames.receive(reply, data => {
          const handler = globalThis.onmessage as (event: MessageEvent) => void
          handler({ data } as MessageEvent)
        })
      )
        return
      if (typeof reply.adapterRecovery === 'boolean')
        frames.recoveryEvents.push(reply.adapterRecovery)
      if (reply.appearanceRevision) {
        frames.appearanceRevision = reply.appearanceRevision
        frames.appearanceRefreshReceived?.()
      }
      if (reply.id === undefined) return
      replies.set(reply.id, reply)
      completions.get(reply.id)?.()
    },
  )
  vi.stubGlobal('addEventListener', () => {})
  vi.stubGlobal('requestAnimationFrame', (callback: (at: number) => void) => {
    frames.animationFrame = () => callback(performance.now())
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  await import('./entry.worker.ts')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function send(request: Record<string, unknown>) {
  const id = ++nextId
  await new Promise<void>(resolve => {
    completions.set(id, resolve)
    const handler = globalThis.onmessage as (event: MessageEvent) => void
    handler({ data: { id, request } } as MessageEvent)
  })
  const reply = replies.get(id)!
  if (reply.error) throw Error(reply.error)
  return reply.value
}
async function initialize() {
  await send({ type: 'init', canvas: {}, resolution: 1, appearance: 'dark' })
}
it('never submits a hidden appearance frame, including an eligible newly prepared surface', async () => {
  await initialize()
  await send({ type: 'visible', visible: false })
  await send({ type: 'lens-debug', view: 'material' })
  await send({
    type: 'canonical',
    request: { type: 'appearance', value: 'light', reducedMotion: false },
  })
  expect(frames.presented).toEqual([])
  expect(frames.submissions).toBe(0)
})
it('applies the current page appearance before the first resumed presentation', async () => {
  await initialize()
  await send({ type: 'visible', visible: false })
  await send({
    type: 'canonical',
    request: { type: 'appearance', value: 'light', reducedMotion: false },
  })
  await send({ type: 'visible', visible: true, appearance: 'dark', reducedMotion: false })
  expect(frames.presented[0]).toBe('dark')
  expect(frames.presented).not.toContain('light')
  expect(frames.appearance).toBe('dark')
})

it('retints the separate CHROME raster before its first resumed submission', async () => {
  await initialize()
  await send({ type: 'visible', visible: false })
  await send({ type: 'lens-debug', view: 'material' })
  await send({
    type: 'canonical',
    request: { type: 'appearance', value: 'light', reducedMotion: false },
  })
  expect(frames.chromePresented).toEqual([])
  await send({ type: 'visible', visible: true, appearance: 'dark' })
  expect(frames.chromePresented).toEqual(['dark'])
})

it('aborts an in-flight resume as soon as hide arrives, before queued hide handling', async () => {
  await initialize()
  await send({ type: 'visible', visible: false })
  await send({ type: 'lens-debug', view: 'material' })
  let release!: () => void
  frames.readyGate = new Promise<void>(resolve => {
    release = resolve
  })
  const resume = send({ type: 'visible', visible: true, appearance: 'light' })
  await Promise.resolve()
  const hide = send({ type: 'visible', visible: false })
  release()
  await Promise.all([resume, hide])
  expect(frames.presented).toEqual([])
  expect(frames.chromePresented).toEqual([])
  expect(frames.submissions).toBe(0)
})

it('requires a fresh page appearance reply before restored-device chrome is presented', async () => {
  await initialize()
  await send({ type: 'lens-debug', view: 'material' })
  frames.chromePresented = []
  frames.submissions = 0
  frames.adapterRecovery!(true)
  for (const listener of frames.deviceListeners) listener(undefined)
  for (const listener of frames.deviceListeners) {
    listener({
      features: new Set(),
      createCommandEncoder: () => ({ finish: () => ({}) }),
      queue: { submit: () => frames.submissions++, onSubmittedWorkDone: () => Promise.resolve() },
    })
  }
  frames.adapterRecovery!(false)
  await Promise.resolve()
  await send({
    type: 'canonical',
    request: { type: 'appearance', value: 'light', reducedMotion: false },
  })
  expect(frames.recoveryEvents).toEqual([true])
  expect(frames.chromePresented).toEqual([])
  expect(frames.submissions).toBe(0)
  await send({
    type: 'canonical',
    appearanceRevision: frames.appearanceRevision,
    request: { type: 'appearance', value: 'dark', reducedMotion: false },
  })
  expect(frames.chromePresented).toEqual(['dark'])
  expect(frames.recoveryEvents).toEqual([true, false])
})

it.each(['dark', 'light'])(
  'presents retained chrome in %s before any source recapture',
  async appearance => {
    await initialize()
    await send({ type: 'visible', visible: false })
    await send({ type: 'lens-debug', view: 'material' })
    await send({ type: 'visible', visible: true, appearance })
    expect(frames.chromePresented).toEqual([appearance])
    expect(frames.submissions).toBe(1)
  },
)

it('drops an encoded frame if hide begins before its submission', async () => {
  await initialize()
  await send({ type: 'lens-debug', view: 'material' })
  frames.submissions = 0
  let hidden!: Promise<unknown>
  frames.duringEncode = () => {
    frames.duringEncode = undefined
    frames.animationFrame = undefined
    hidden = send({ type: 'visible', visible: false })
  }
  await send({ type: 'lens-debug', view: 'material' })
  await hidden
  expect(frames.submissions).toBe(0)
})

it('drops an already-running animation tick when hide begins during encoding', async () => {
  await initialize()
  // Wait for the restore handshake before replying with its exact revision.
  const appearanceRefresh = new Promise<void>(resolve => {
    frames.appearanceRefreshReceived = resolve
  })
  // FrameProbe receives its device through the real owner subscription.
  for (const listener of frames.deviceListeners) {
    listener({
      features: new Set(),
      createCommandEncoder: () => ({ finish: () => ({}) }),
      queue: { submit: () => frames.submissions++, onSubmittedWorkDone: () => Promise.resolve() },
    })
  }
  await appearanceRefresh
  await send({
    type: 'canonical',
    appearanceRevision: frames.appearanceRevision,
    request: { type: 'appearance', value: 'dark', reducedMotion: false },
  })
  frames.submissions = 0
  frames.chromePresented = []
  await send({
    type: 'source',
    setup: {},
    front: {},
    rear: {},
    glyphs: {},
    settle: false,
    sentAt: 0,
  })
  expect(frames.animationFrame).toBeTypeOf('function')
  let hidden: Promise<unknown> | undefined
  frames.duringEncode = () => {
    frames.duringEncode = undefined
    hidden = send({ type: 'visible', visible: false })
  }
  frames.animationFrame!()
  expect(hidden).toBeDefined()
  await hidden
  expect(frames.submissions).toBe(0)
  expect(frames.chromePresented).toEqual([])
})

it('uses the newest appearance received while resume waits for the device', async () => {
  await initialize()
  await send({ type: 'visible', visible: false })
  await send({ type: 'lens-debug', view: 'material' })
  let release!: () => void
  frames.readyGate = new Promise<void>(resolve => {
    release = resolve
  })
  const resume = send({ type: 'visible', visible: true, appearance: 'light' })
  await Promise.resolve()
  const change = send({
    type: 'canonical',
    request: { type: 'appearance', value: 'dark', reducedMotion: false },
  })
  release()
  await Promise.all([resume, change])
  expect(frames.chromePresented[0]).toBe('dark')
  expect(frames.chromePresented).not.toContain('light')
})

it('retains the previous frame until the matching appearance capture batch commits', async () => {
  await send({ type: 'lens-debug', view: 'material' })
  frames.submissions = 0
  frames.presented = []
  await send({ type: 'appearance-begin', revision: 7 })
  await send({
    type: 'canonical',
    request: { type: 'appearance', value: 'light', reducedMotion: false },
  })
  await send({ type: 'lens-debug', view: 'material' })
  expect(frames.submissions).toBe(0)
  expect(frames.presented).toEqual([])
  await send({ type: 'appearance-begin', revision: 8 })
  await send({ type: 'appearance-commit', revision: 7 })
  expect(frames.submissions).toBe(0)
  await send({ type: 'appearance-commit', revision: 8 })
  expect(frames.submissions).toBeGreaterThan(0)
  expect(frames.presented.every(value => value === 'light')).toBe(true)
})

it('keeps a capture barrier across hide and opens it only after a fresh resume capture commits', async () => {
  await send({ type: 'lens-debug', view: 'material' })
  await send({ type: 'appearance-begin', revision: 21 })
  await send({
    type: 'canonical',
    request: { type: 'appearance', value: 'dark', reducedMotion: false },
  })
  await send({ type: 'visible', visible: false })
  frames.submissions = 0
  frames.presented = []
  await send({ type: 'visible', visible: true, appearance: 'dark' })
  expect(frames.submissions).toBe(0)
  expect(frames.presented).toEqual([])
  await send({ type: 'appearance-begin', revision: 22 })
  await send({ type: 'appearance-commit', revision: 21 })
  expect(frames.submissions).toBe(0)
  await send({ type: 'appearance-commit', revision: 22 })
  expect(frames.submissions).toBeGreaterThan(0)
  expect(frames.presented.every(value => value === 'dark')).toBe(true)
})

it('rejects a hide-during-capture commit before a fresh resume capture begins', async () => {
  await send({ type: 'lens-debug', view: 'material' })
  await send({ type: 'appearance-begin', revision: 31 })
  await send({
    type: 'canonical',
    request: { type: 'appearance', value: 'dark', reducedMotion: false },
  })
  await send({ type: 'visible', visible: false })
  await send({ type: 'appearance-commit', revision: 31 })
  frames.submissions = 0
  frames.presented = []
  await send({ type: 'visible', visible: true, appearance: 'dark' })
  expect(frames.submissions).toBe(0)
  expect(frames.presented).toEqual([])
  await send({ type: 'appearance-begin', revision: 32 })
  await send({ type: 'appearance-commit', revision: 32 })
  expect(frames.presented.every(value => value === 'dark')).toBe(true)
  expect(frames.presented.length).toBeGreaterThan(0)
})

it('publishes only the latest confirmation-during-capture revision', async () => {
  await send({ type: 'lens-debug', view: 'material' })
  await send({ type: 'appearance-begin', revision: 41 })
  await send({
    type: 'canonical',
    request: { type: 'appearance', value: 'light', reducedMotion: false },
  })
  await send({ type: 'appearance-begin', revision: 42 })
  await send({
    type: 'canonical',
    request: { type: 'appearance', value: 'dark', reducedMotion: false },
  })
  frames.submissions = 0
  frames.presented = []
  await send({ type: 'appearance-commit', revision: 41 })
  expect(frames.submissions).toBe(0)
  expect(frames.presented).toEqual([])
  await send({ type: 'appearance-commit', revision: 42 })
  expect(frames.presented.length).toBeGreaterThan(0)
  expect(frames.presented.every(value => value === 'dark')).toBe(true)
})

it('closes the appearance gate before a suspended resume can present', async () => {
  await initialize()
  await send({ type: 'visible', visible: false })
  await send({ type: 'lens-debug', view: 'material' })
  let release!: () => void
  frames.readyGate = new Promise<void>(resolve => {
    release = resolve
  })
  const resume = send({ type: 'visible', visible: true, appearance: 'light' })
  await Promise.resolve()
  const begin = send({ type: 'appearance-begin', revision: 51 })
  release()
  await Promise.all([resume, begin])
  expect(frames.submissions).toBe(0)
  expect(frames.presented).toEqual([])
  expect(frames.chromePresented).toEqual([])
  expect(await send({ type: 'appearance-commit', revision: 51 })).toEqual({
    accepted: true,
    revision: 51,
  })
  expect(frames.submissions).toBeGreaterThan(0)
})

it('does not let a queued old begin overwrite the newest received barrier', async () => {
  await initialize()
  await send({ type: 'visible', visible: false })
  let release!: () => void
  frames.readyGate = new Promise<void>(resolve => {
    release = resolve
  })
  const resume = send({ type: 'visible', visible: true, appearance: 'light' })
  await Promise.resolve()
  const firstBegin = send({ type: 'appearance-begin', revision: 61 })
  const staleCommit = send({ type: 'appearance-commit', revision: 61 })
  const nextBegin = send({ type: 'appearance-begin', revision: 62 })
  release()
  await Promise.all([resume, firstBegin, nextBegin])
  expect(await staleCommit).toEqual({ accepted: false, revision: 61 })
  expect(frames.submissions).toBe(0)
  expect(frames.presented).toEqual([])
  expect(await send({ type: 'appearance-commit', revision: 62 })).toEqual({
    accepted: true,
    revision: 62,
  })
})

// These expected failures are the unresolved reference publication contract, not acceptance passes.
// Use the real held store and worker handler; only GPU storage/presentation is mocked.
function heldStoreFixture() {
  vi.useFakeTimers()
  let systemDark = true
  const media = Object.assign(new EventTarget(), { matches: true })
  const root = { dataset: {} as Record<string, string>, style: {} }
  const page = Object.assign(new EventTarget(), {
    hidden: false,
    documentElement: root,
    head: { appendChild() {} },
    createElement: () => ({ textContent: '' }),
  })
  const browser = new EventTarget()
  const storage = new Map<string, string>()
  vi.stubGlobal('window', browser)
  vi.stubGlobal('document', page)
  vi.stubGlobal('matchMedia', () => media)
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: () => (systemDark ? 'dark' : 'light'),
  }))
  vi.stubGlobal('addEventListener', browser.addEventListener.bind(browser))
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key),
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  const store = installAppearanceStore('r12-publication-contract')
  return {
    store,
    pageAppearance: () => root.dataset.satinAppearance,
    hide() {
      page.hidden = true
      page.dispatchEvent(new Event('visibilitychange'))
    },
    show() {
      page.hidden = false
      page.dispatchEvent(new Event('visibilitychange'))
    },
    change(dark: boolean) {
      systemDark = dark
      media.matches = dark
      media.dispatchEvent(new Event('change'))
    },
  }
}

it.fails(
  'reference contract: confirmation during capture keeps held page and visible glass together',
  async () => {
    await initialize()
    await send({ type: 'lens-debug', view: 'material' })
    const state = heldStoreFixture()
    const pending: Promise<unknown>[] = []
    state.store.subscribe(() => {
      pending.push(send({ type: 'appearance-begin', revision: 71 }))
      pending.push(
        send({
          type: 'canonical',
          request: { type: 'appearance', value: 'light', reducedMotion: false },
        }),
      )
    })
    state.hide()
    await send({ type: 'visible', visible: false })
    state.change(false)
    state.show()
    await send({ type: 'visible', visible: true, appearance: 'dark' })
    await vi.advanceTimersByTimeAsync(1900)
    await Promise.all(pending)
    // Source capture is still pending; the actual held store already published light.
    expect(state.store.getSnapshot().dark).toBe(false)
    expect(state.pageAppearance()).toBe('light')
    expect(frames.presented.at(-1)).toBe('dark')
    expect(state.pageAppearance()).toBe(frames.presented.at(-1))
  },
)

it.fails(
  'reference contract: hide during capture retains a matching held page and visible glass',
  async () => {
    await initialize()
    await send({ type: 'lens-debug', view: 'material' })
    const state = heldStoreFixture()
    const pending: Promise<unknown>[] = []
    state.store.subscribe(() => {
      pending.push(send({ type: 'appearance-begin', revision: 81 }))
      pending.push(
        send({
          type: 'canonical',
          request: { type: 'appearance', value: 'light', reducedMotion: false },
        }),
      )
    })
    state.change(false)
    await vi.advanceTimersByTimeAsync(750)
    await Promise.all(pending)
    state.hide()
    await send({ type: 'visible', visible: false })
    expect(await send({ type: 'appearance-commit', revision: 81 })).toEqual({
      accepted: false,
      revision: 81,
    })
    expect(state.store.getSnapshot().dark).toBe(false)
    expect(state.pageAppearance()).toBe('light')
    expect(frames.presented.at(-1)).toBe('dark')
    expect(state.pageAppearance()).toBe(frames.presented.at(-1))
  },
)
