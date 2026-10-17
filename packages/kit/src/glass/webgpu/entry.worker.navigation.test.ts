import { workerMessageQueue, type WorkerReply as Reply } from '../../../test/workerMocks.ts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GLASS_RENDERER_PROTOCOL } from '../rendererContract.ts'

// Exercise the real serialized message queue and frame loop. GPU and scene drawing are
// boundaries; request ordering, frame completion, and pose ownership stay in the worker.
const state = vi.hoisted(() => ({
  realRegionReceipts: false,
  events: [] as string[],
  fail: '',
  installs: [] as Record<string, unknown>[],
  shares: [] as unknown[][],
  copies: [] as unknown[],
  settle: undefined as Promise<void> | undefined,
  poses: [] as { frontX: number; rearX: number }[],
  sampleTimes: [] as number[],
}))
vi.mock('./passes.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('./passes.ts')>()),
  prewarmKernels: async () => {},
}))
vi.mock('./layers.ts', () => ({
  LayerDevice: class {
    liveDevice = {
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createCommandEncoder: () => ({
        finish() {},
        copyTextureToTexture() {},
        beginRenderPass: () => ({ end() {} }),
      }),
      queue: {
        submit() {},
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
vi.mock('./regionScene.ts', async importOriginal => {
  const { RegionScene } = await importOriginal<typeof import('./regionScene.ts')>()
  return {
    RegionScene: class {
      private receipts: InstanceType<typeof RegionScene>
      constructor(owner: ConstructorParameters<typeof RegionScene>[0]) {
        this.receipts = new RegionScene(owner)
      }
      beginSourceChange(revision: number) {
        if (state.realRegionReceipts) this.receipts.beginSourceChange(revision)
      }
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
      sample(at: number, presentationAt = at) {
        state.sampleTimes.push(presentationAt)
        if (state.fail === 'sample') throw Error('sample draw failed')
      }
      async navigationSource(value: Record<string, unknown>) {
        state.events.push('install')
        state.installs.push(value)
        this.navigationActive = true
      }
      async request(request: Parameters<InstanceType<typeof RegionScene>['request']>[0]) {
        if (state.realRegionReceipts) return this.receipts.request(request)
      }
      diagnostics() {
        return {}
      }
    },
  }
})
vi.mock('./raster.ts', () => ({
  WebGPURaster: class {
    navigationRoutes = 2
    spec = {}
    encodeResult() {
      return true
    }
    submitted() {}
    static presentLayer() {
      state.events.push('dock-present')
    }
    stats = {}
    async init() {}
    setNavigation(pose: { frontX: number; rearX: number }) {
      state.poses.push(pose)
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
const pose = { frontX: 70, rearX: -20, frontDim: 0, rearDim: 0.2 }
const regions = (key = 'navigation:1') => ({
  type: 'navigation-regions',
  key,
  routes: 2,
  contentLayer: 'page',
  width: 100,
  height: 100,
})
const track = () => ({
  type: 'navigation-track',
  key: 'navigation:1',
  track: {
    epoch: performance.timeOrigin + performance.now(),
    duration: 10000,
    poses: [pose, pose],
  },
})
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
  state.realRegionReceipts = false
  state.events = []
  state.installs = []
  state.shares = []
  state.copies = []
  state.settle = undefined
  state.fail = ''
  state.poses = []
  state.sampleTimes = []
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each([0, 16])('samples the route and moving glass at the same %i ms lead', async leadMs => {
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  const now = performance.timeOrigin + 1000
  await send({
    type: 'init',
    canvas: {},
    resolution: 1,
    appearance: 'light',
    presentationLeadMs: leadMs,
  })
  await send({
    type: 'navigation-track',
    key: 'navigation:1',
    track: {
      epoch: now - 40,
      duration: 100,
      poses: [
        { frontX: 0, rearX: -100, frontDim: 0, rearDim: 0 },
        { frontX: 100, rearX: 0, frontDim: 0, rearDim: 0 },
      ],
    },
  })
  frame!()
  await flush()
  expect(state.poses.at(-1)?.frontX).toBeCloseTo(40 + leadMs)
  expect(state.sampleTimes.at(-1)).toBe(now + leadMs)
  // A fresh finger pose cancels the known trajectory, including its prediction.
  await send({ type: 'navigation-pose', key: 'navigation:1', at: now + 1, pose })
  expect(state.poses.at(-1)).toEqual(pose)
})

it('poses moving glass at the animation frame time, not when its callback happens to run', async () => {
  // The callback runs 10 ms into the frame (other callbacks, style work). The page's own
  // animations are posed at the frame time; the glass must be posed on the same clock.
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  const now = performance.timeOrigin + 1000
  await send({ type: 'init', canvas: {}, resolution: 1, appearance: 'light' })
  await send({
    type: 'navigation-track',
    key: 'navigation:1',
    track: {
      epoch: now - 40,
      duration: 100,
      poses: [
        { frontX: 0, rearX: -100, frontDim: 0, rearDim: 0 },
        { frontX: 100, rearX: 0, frontDim: 0, rearDim: 0 },
      ],
    },
  })
  ;(frame as (frameTime: number) => void)(990)
  await flush()
  expect(state.poses.at(-1)?.frontX).toBeCloseTo(30)
  expect(state.sampleTimes.at(-1)).toBe(now - 10)
})

it.each(['pose', 'sample', 'submission'])(
  'rejects a waiting install after a %s failure and processes later requests',
  async failure => {
    await send(track())
    const pending = enqueue(regions())
    await flush()
    expect(reply(pending)).toBeUndefined()
    state.fail = failure
    frame!()
    await flush()
    expect(posted.some(p => p.glassError?.stage === 'frame submission')).toBe(true)
    expect(reply(pending)).toBeDefined()
    expect(reply(pending)?.error).toMatch(/draw failed/)
    expect(state.installs).toHaveLength(0)
    expect((await send({ type: 'visible', visible: false })).error).toBeUndefined()
  },
)

it('presents a dock frame before installing regions without drawing them during installation', async () => {
  await send(track())
  const pending = enqueue(regions())
  await flush()
  expect(state.events).toEqual([])
  frame!()
  await flush()
  expect(reply(pending)?.error).toBeUndefined()
  expect(state.events).toEqual(['dock-pose', 'region-pose', 'dock-present', 'install'])
  expect(state.installs[0]).toMatchObject({ pose, deferPresent: true })
})

it('retains a direct pose sent before regions and presents it even without another frame', async () => {
  await send({ type: 'navigation-pose', key: 'navigation:1', at: 1, pose })
  expect((await send(regions())).error).toBeUndefined()
  expect(state.installs[0]).toMatchObject({ pose, deferPresent: false })
})

it('does not reuse the previous atlas generation pose', async () => {
  await send({ type: 'navigation-pose', key: 'navigation:1', at: 1, pose })
  await atlas('navigation:2')
  await send(regions('navigation:2'))
  expect(state.installs[0].pose).toBeUndefined()
})

it('settles regions even when a completed navigation restores the same capture revision', async () => {
  const settle = () =>
    send({
      type: 'source-images',
      revision: ++id,
      images: [{ slot: 'root', key: 'root:front', image: { width: 100, height: 100, close() {} } }],
      backdrop: {
        regions: true,
        key: 'root:front',
        revision: 5,
        appearance: 'light',
        reducedMotion: false,
        resolution: 1,
      },
    })
  await settle()
  await send({ type: 'navigation-pose', key: 'navigation:1', at: 1, pose })
  await send(regions())
  await settle()
  expect(state.shares).toHaveLength(2)
  expect(state.shares[1][3]).toBe(true)
})

it('retains an immutable canvas snapshot and transferred images until their atlas is released', async () => {
  const canvas = { width: 100, height: 100 },
    image = { width: 100, height: 100, close: vi.fn() },
    snapshot = { width: 100, height: 100, close: vi.fn() }
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => snapshot),
  )
  const result = await send({
    type: 'navigation-atlas',
    revision: 100,
    key: 'direct-canvas',
    width: 200,
    height: 100,
    background: [0, 0, 0, 0],
    cells: [
      { canvas, dx: 0, dy: 0 },
      { image, dx: 100, dy: 0 },
    ],
  })
  expect(result.error).toBeUndefined()
  expect(createImageBitmap).toHaveBeenCalledWith(canvas)
  expect(state.copies).toEqual([{ source: snapshot }, { source: image }])
  expect(image.close).not.toHaveBeenCalled()
  expect(snapshot.close).not.toHaveBeenCalled()
  expect((await send(regions('direct-canvas'))).error).toBeUndefined()
  await send({ type: 'source-images', revision: 101, images: [], release: ['navigation'] })
  expect(image.close).toHaveBeenCalledOnce()
  expect(snapshot.close).toHaveBeenCalledOnce()
})

it('keeps the admitted backdrop scene drawable when cold-entry navigation uploads its atlas', async () => {
  state.realRegionReceipts = true
  await send({
    type: 'canonical',
    request: {
      type: 'initialize',
      protocol: GLASS_RENDERER_PROTOCOL,
      appearance: 'light',
      reducedMotion: false,
    },
  })
  await send({ type: 'source-images', revision: 100, images: [], backdrop: { regions: false } })
  const scene = (revision: number, sourceRevision: number) => ({
    type: 'canonical',
    request: {
      type: 'scene',
      snapshot: { revision, sourceRevision, regions: [], layers: [], scrolls: [] },
    },
  })
  const initialReceipt = await send(scene(1, 100))
  expect(initialReceipt.error).toBeUndefined()
  expect(initialReceipt.value).toEqual({ navigation: undefined, presented: [] })
  await send({
    type: 'source-images',
    revision: 101,
    images: [
      {
        slot: 'navigation',
        key: 'cold-entry-pop:front',
        image: { width: 200, height: 100, close() {} },
      },
    ],
  })
  expect((await send(scene(2, 100))).value).toEqual({ navigation: undefined, presented: [] })
  // A genuine backdrop replacement still rejects the predecessor scene.
  await send({ type: 'source-images', revision: 1000, images: [], backdrop: { regions: false } })
  expect((await send(scene(3, 100))).value).toEqual({ superseded: true, presented: [] })
  expect((await send(scene(4, 1000))).value).toEqual({ navigation: undefined, presented: [] })
})
