import { workerMessageQueue, type WorkerReply as Reply } from '../../../test/workerMocks.ts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Exercise the real serialized message queue and frame loop. GPU and scene drawing are
// boundaries; request ordering, frame completion, and pose ownership stay in the worker.
const state = vi.hoisted(() => ({
  material: undefined as
    { wanted: string; cached: string; gpu: string; painted: string } | undefined,
  events: [] as string[],
  fail: '',
  installs: [] as Record<string, unknown>[],
  shares: [] as unknown[][],
  copies: [] as unknown[],
  settle: undefined as Promise<void> | undefined,
  compilation: undefined as Promise<void> | undefined,
}))
vi.mock('./passes.ts', () => ({
  prewarmKernels: async () => state.compilation,
}))
vi.mock('./layers.ts', () => ({
  LayerDevice: class {
    liveDevice = {
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createCommandEncoder: () => {
        const commands: Array<() => void> = []
        return { commands, finish: () => commands, beginRenderPass: () => ({ end() {} }) }
      },
      queue: {
        submit(buffers: Array<Array<() => void>>) {
          for (const commands of buffers) for (const command of commands) command()
        },
        copyExternalImageToTexture(source: unknown) {
          state.copies.push(source)
        },
      },
    }
    subscribe() {}
    report() {
      return {}
    }
    async ready() {}
  },
}))
vi.mock('./errors.ts', async () => {
  const { gpuScopeMock } = await import('../../../test/workerMocks.ts')
  return gpuScopeMock()
})
vi.mock('./frameProbe.ts', async () => {
  const { frameProbeMock } = await import('../../../test/workerMocks.ts')
  return frameProbeMock(state)
})
vi.mock('./backdrop.ts', async () => {
  const { backdropMock } = await import('../../../test/workerMocks.ts')
  return backdropMock()
})
vi.mock('./regionScene.ts', () => ({
  RegionScene: class {
    navigationRasters() {
      return []
    }
    active = false
    pressing = false
    navigationActive = false
    sharedRevision: number | undefined
    async shareSource(descriptor: { revision: number }, ...args: unknown[]) {
      state.shares.push([descriptor, ...args])
      this.sharedRevision = descriptor.revision
      this.navigationActive = false
    }
    setNavigation() {
      state.events.push('region-pose')
      if (state.fail === 'pose') throw Error('pose draw failed')
    }
    sample() {
      if (state.fail === 'sample') throw Error('sample draw failed')
    }
    async navigationSource(value: Record<string, unknown>) {
      state.events.push('install')
      state.installs.push(value)
      this.navigationActive = true
    }
    present() {}
    async request() {}
    diagnostics() {
      return {}
    }
  },
}))
vi.mock('./raster.ts', () => ({
  WebGPURaster: class {
    navigationRoutes = 2
    spec = {}
    install(setup: { spec: Record<string, unknown> }) {
      this.spec = setup.spec
    }
    updateSpec(spec: Record<string, unknown>) {
      this.spec = spec
    }
    setAppearance(appearance: string) {
      if (state.material) state.material.wanted = appearance
    }
    encodeResult(encoder: { commands?: Array<() => void> }) {
      const material = state.material
      if (material && material.cached !== material.wanted) {
        const appearance = material.wanted
        // Model the raster's cache publication during encoding, before GPU submission.
        material.cached = appearance
        encoder.commands!.push(() => {
          material.gpu = appearance
        })
      }
      return true
    }
    submitted() {}
    static presentLayer(encoder: { commands?: Array<() => void> }) {
      if (state.material)
        encoder.commands!.push(() => {
          state.material!.painted = state.material!.gpu
        })
      state.events.push('dock-present')
    }
    stats = {}
    setNavigation() {
      state.events.push('dock-pose')
    }
    setVisible() {}
    setSubmissionGate() {}
    async settled() {
      state.events.push('gpu-settle')
      await state.settle
    }
    report() {
      return {}
    }
    presentation() {}
  },
}))

let renderer: ReturnType<typeof import('./renderer.ts').createWebGPURenderer>
let posted: Reply[],
  frame: ((at?: number) => void) | undefined,
  id = 0
const { flush, enqueue, reply, send } = workerMessageQueue(
  () => posted,
  () => ++id,
)
async function atlas(key = 'navigation:1') {
  await send({
    type: 'source-images',
    revision: ++id,
    images: [
      { slot: 'navigation', key: key + ':front', image: { width: 200, height: 100, close() {} } },
    ],
  })
}
beforeEach(async () => {
  vi.resetModules()
  posted = []
  frame = undefined
  state.events = []
  state.installs = []
  state.shares = []
  state.copies = []
  state.settle = undefined
  state.compilation = undefined
  state.fail = ''
  vi.stubGlobal('GPUTextureUsage', {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
    STORAGE_BINDING: 16,
  })
  vi.stubGlobal('postMessage', (value: Reply) => posted.push(value))
  vi.stubGlobal('addEventListener', () => {})
  vi.stubGlobal('requestAnimationFrame', (callback: (at: number) => void) => {
    frame = (at = performance.now()) => callback(at)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    frame = undefined
  })
  const { createWebGPURenderer } = await import('./renderer.ts')
  renderer = createWebGPURenderer(value => posted.push(value as Reply))
  globalThis.onmessage = renderer.receive
  await atlas()
})
afterEach(() => {
  state.material = undefined
  vi.unstubAllGlobals()
})

it('holds canonical startup readiness until material compilation succeeds', async () => {
  let rejectCompilation!: (error: Error) => void
  state.compilation = new Promise<void>((_resolve, reject) => {
    rejectCompilation = reject
  })
  const request = enqueue({ type: 'canonical', request: { type: 'diagnostics' } })
  await flush()
  expect(reply(request)).toBeUndefined()
  rejectCompilation(new Error('material compilation failed'))
  await flush()
  expect(reply(request)?.error).toContain('material compilation failed')
})

const tabConfig = (selected: number, centres = [50, 150, 250]) => ({
  type: 'tab-config',
  selected,
  centres,
  width: 80,
  height: 52,
  dockWidth: 400,
})
async function capsuleCentre() {
  const response = await send({ type: 'report' })
  return (response.value as unknown as { interactive: { tab: { capsule: { centerX: number } } } })
    .interactive.tab.capsule.centerX
}

it('snaps the first config and an unrelated selection while idle', async () => {
  await send(tabConfig(2))
  expect(await capsuleCentre()).toBe(250)
  await send(tabConfig(1))
  expect(await capsuleCentre()).toBe(150)
})

it.each([false, true])(
  'keeps travel alive through config with changed geometry=%s',
  async changed => {
    await send({
      type: 'source',
      setup: {
        appearance: 'light',
        spec: { tabSelection: {} },
        width: 400,
        height: 100,
        resolution: 1,
      },
      front: {},
      rear: {},
      glyphs: {},
      settle: false,
      sentAt: 0,
    })
    await send(tabConfig(0))
    const at = performance.timeOrigin + performance.now()
    await send({ type: 'tab-input', event: 'select', index: 2, at })
    vi.spyOn(performance, 'now').mockReturnValue(at - performance.timeOrigin + 100)
    frame!()
    const beforeConfig = await capsuleCentre()
    expect(beforeConfig).toBeGreaterThan(50)
    expect(beforeConfig).toBeLessThan(250)
    await send(tabConfig(2, changed ? [60, 180, 320] : [50, 150, 250]))
    expect(await capsuleCentre()).toBe(beforeConfig)
    for (const elapsed of [120, 140, 160]) {
      vi.spyOn(performance, 'now').mockReturnValue(at - performance.timeOrigin + elapsed)
      frame!()
      expect(await capsuleCentre()).toBeGreaterThan(50)
      expect(await capsuleCentre()).toBeLessThan(changed ? 320 : 250)
    }
    vi.restoreAllMocks()
    const response = await send({ type: 'report' })
    expect(
      (response.value as unknown as { interactive: { tab: { active: boolean } } }).interactive.tab
        .active,
    ).toBe(true)
  },
)

it('keeps the resting pill hidden when the source is refreshed during a held drag', async () => {
  const source = {
    type: 'source',
    setup: {
      appearance: 'light',
      spec: { tabSelection: { capsule: { centerX: 250 } } },
      width: 400,
      height: 100,
      resolution: 1,
    },
    front: {},
    rear: {},
    glyphs: {},
    settle: false,
    sentAt: 0,
  }
  await send(source)
  await send(tabConfig(2))
  const at = performance.timeOrigin + performance.now()
  await send({ type: 'tab-input', event: 'down', index: 2, x: 250, at })
  await send({ type: 'tab-input', event: 'move', x: 50, at })
  vi.spyOn(performance, 'now').mockReturnValue(at - performance.timeOrigin + 1000)
  frame!()
  await send(source)
  const report = await send({ type: 'report' })
  const tab = (
    report.value as unknown as {
      interactive: {
        tab: { spec: { tabSelection: { lensMix: number; capsule: { centerX: number } } } }
      }
    }
  ).interactive.tab
  expect(tab.spec.tabSelection.lensMix).toBe(1)
  expect(tab.spec.tabSelection.capsule.centerX).toBe(50)
  vi.restoreAllMocks()
})

it('lets the dragged lens own selection while the dock expansion track owns its shape', async () => {
  const spec = { tabSelection: { capsule: { centerX: 250 } } }
  await send({
    type: 'source',
    setup: { spec, width: 400, height: 100, resolution: 1 },
    front: {},
    rear: {},
    glyphs: {},
    settle: false,
    sentAt: 0,
  })
  await send(tabConfig(2))
  const at = performance.timeOrigin + performance.now()
  await send({
    type: 'region-track',
    track: { id: 'chrome', epoch: at, duration: 2000, specs: [spec, spec] },
  })
  await send({ type: 'tab-input', event: 'down', index: 2, x: 250, at })
  await send({ type: 'tab-input', event: 'move', x: 50, at })
  vi.spyOn(performance, 'now').mockReturnValue(at - performance.timeOrigin + 1000)
  frame!()
  const report = await send({ type: 'report' })
  const selection = (
    report.value as unknown as {
      interactive: {
        tab: { spec: { tabSelection: { lensMix: number; capsule: { centerX: number } } } }
      }
    }
  ).interactive.tab.spec.tabSelection
  expect(selection.capsule.centerX).toBe(50)
  expect(selection.lensMix).toBe(1)
  vi.restoreAllMocks()
})

it('settles a region track at its end when the page hides mid-track', async () => {
  // The page ends its minimize transaction at the committed layout when it hides; the renderer's
  // copy of that track must end there too, not keep the pose its last frame sampled.
  await send({
    type: 'source',
    setup: { spec: { width: 0 }, width: 400, height: 100, resolution: 1 },
    front: {},
    rear: {},
    glyphs: {},
    settle: false,
    sentAt: 0,
  })
  const at = performance.timeOrigin + performance.now()
  await send({
    type: 'region-track',
    track: { id: 'chrome', epoch: at, duration: 1000, specs: [{ width: 0 }, { width: 100 }] },
  })
  vi.spyOn(performance, 'now').mockReturnValue(at - performance.timeOrigin + 250)
  frame!()
  const spec = async () =>
    (
      (await send({ type: 'report' })).value as unknown as {
        interactive: { tab: { spec: { width: number } } }
      }
    ).interactive.tab.spec.width
  expect(await spec()).toBe(25)
  await send({ type: 'visible', visible: false })
  expect(await spec()).toBe(100)
  vi.restoreAllMocks()
})

it('presents the new appearance after a gated material refresh', async () => {
  state.material = { wanted: 'light', cached: 'light', gpu: 'light', painted: 'light' }
  await send({ type: 'appearance-begin', revision: 7 })
  await send({ type: 'canonical', request: { type: 'appearance', value: 'dark' } })
  expect(state.material.painted).toBe('light')
  expect((await send({ type: 'appearance-commit', revision: 7 })).error).toBeUndefined()
  expect(state.material.painted).toBe('dark')
})

it('holds all presenters through a tab source install and rejects superseded commits', async () => {
  state.material = { wanted: 'light', cached: 'light', gpu: 'light', painted: 'light' }
  await send({ type: 'content-begin', revision: 11 } as never)
  await send({ type: 'canonical', request: { type: 'appearance', value: 'dark' } })
  expect(state.material.painted).toBe('light')
  await send({ type: 'content-begin', revision: 12 } as never)
  expect((await send({ type: 'content-commit', revision: 11 } as never)).value).toEqual({
    accepted: false,
    revision: 11,
  })
  expect(state.material.painted).toBe('light')
  expect((await send({ type: 'content-commit', revision: 12 } as never)).value).toEqual({
    accepted: true,
    revision: 12,
  })
  expect(state.material.painted).toBe('dark')
})

it('does not release a tab source across hide until a resumed installation commits', async () => {
  state.material = { wanted: 'light', cached: 'light', gpu: 'light', painted: 'light' }
  await send({ type: 'content-begin', revision: 11 })
  await send({ type: 'visible', visible: false })
  await send({ type: 'visible', visible: true })
  expect((await send({ type: 'content-commit', revision: 11 })).value).toEqual({
    accepted: false,
    revision: 11,
  })
  await send({ type: 'content-begin', revision: 12 })
  expect((await send({ type: 'content-commit', revision: 12 })).value).toEqual({
    accepted: true,
    revision: 12,
  })
})

it.each([false, true])(
  'poses collapse/expand from page time at 60 Hz on a 120 Hz page, expand=%s',
  async expand => {
    const spec = (width: number) => ({ width })
    await send({
      type: 'source',
      setup: { spec: spec(0), width: 400, height: 100, resolution: 1 },
      front: {},
      rear: {},
      glyphs: {},
      settle: false,
      sentAt: 0,
    })
    const start = 1000
    await send({
      type: 'region-track',
      track: {
        id: 'chrome',
        epoch: performance.timeOrigin + start,
        duration: 1000,
        specs: expand ? [spec(0), spec(100)] : [spec(100), spec(0)],
      },
    })
    // Callback delivery runs 7 ms late. The pose must still use the page frame timestamp.
    for (let i = 0; i <= 120; i++) {
      const at = start + (i * 1000) / 120
      vi.spyOn(performance, 'now').mockReturnValue(at + 7)
      frame!(at)
      const report = (await send({ type: 'report' })).value as unknown as {
        interactive: { tab: { spec: { width: number } } }
      }
      const progress = Math.floor(i / 2) / 60
      expect(report.interactive.tab.spec.width).toBeCloseTo(
        (expand ? progress : 1 - progress) * 100,
      )
    }
    vi.restoreAllMocks()
  },
)
