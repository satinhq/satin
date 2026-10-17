import { workerMessageQueue, type WorkerReply as Reply } from '../../../test/workerMocks.ts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// The renderer's side of kept glyph ink (keptGlyphs.ts): the real serialized message queue and
// frame graph; GPU and scene drawing are boundaries (as in entry.worker.navigation.test.ts).
const state = vi.hoisted(() => ({
  events: [] as string[],
  fail: '',
  installs: [] as Record<string, unknown>[],
  shares: [] as unknown[][],
  copies: [] as unknown[],
  settle: undefined as Promise<void> | undefined,
  textures: [] as { destroy: ReturnType<typeof vi.fn> }[],
  deviceListeners: [] as ((device: unknown) => void)[],
  device: undefined as unknown,
}))
vi.mock('./layers.ts', () => ({
  LayerDevice: class {
    liveDevice = {
      createTexture: () => {
        const texture = { createView: () => ({}), destroy: vi.fn() }
        state.textures.push(texture)
        return texture
      },
      createCommandEncoder: () => ({ finish() {}, beginRenderPass: () => ({ end() {} }) }),
      queue: {
        submit() {},
        copyExternalImageToTexture(source: unknown) {
          state.copies.push(source)
        },
      },
    }
    subscribe(listener: (device: unknown) => void) {
      state.deviceListeners.push(listener)
      state.device = this.liveDevice
    }
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
    beginSourceChange() {}
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
    encodeResult() {
      return true
    }
    submitted() {}
    static presentLayer() {
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
  id = 0
const { send } = workerMessageQueue(
  () => posted,
  () => ++id,
)
const image = () => ({ width: 30, height: 10, close: vi.fn() })
const images = (...entries: Record<string, unknown>[]) => ({
  type: 'source-images',
  revision: ++id,
  images: entries,
})
beforeEach(async () => {
  vi.resetModules()
  posted = []
  state.events = []
  state.textures = []
  state.deviceListeners = []
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
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const { createWebGPURenderer } = await import('./renderer.ts')
  renderer = createWebGPURenderer(value => posted.push(value as Reply))
  globalThis.onmessage = renderer.receive
})
afterEach(() => vi.unstubAllGlobals())

it('keeps the ink a slot gives up, installs it again by key alone, and lets it go when told', async () => {
  const flat = image()
  const rows = image()
  await send(images({ slot: 'glyph:dock', key: 'glyph:1', image: flat }))
  // The dock takes other ink; the outgoing ink is kept.
  const replaced = await send({
    ...images({ slot: 'glyph:dock', key: 'glyph:2', image: rows }),
    keep: ['glyph:1'],
  })
  expect(replaced.error).toBeUndefined()
  expect(flat.close).not.toHaveBeenCalled()
  // Back to the first ink: by key, with no image. The second is kept in its turn.
  const restored = await send({
    ...images({ slot: 'glyph:dock', key: 'glyph:1' }),
    keep: ['glyph:2'],
  })
  expect(restored.error).toBeUndefined()
  expect(flat.close).not.toHaveBeenCalled()
  expect(rows.close).not.toHaveBeenCalled()
  // Let go of the kept ink that is not installed: its image is closed, the installed one is not.
  await send({ ...images(), unkeep: ['glyph:2'] })
  expect(rows.close).toHaveBeenCalledOnce()
  expect(flat.close).not.toHaveBeenCalled()
})

it('ink that was not kept is gone with its slot: installing it by key fails loudly', async () => {
  const flat = image()
  await send(images({ slot: 'glyph:dock', key: 'glyph:1', image: flat }))
  await send(images({ slot: 'glyph:dock', key: 'glyph:2', image: image() }))
  expect(flat.close).toHaveBeenCalledOnce()
  const missing = await send(images({ slot: 'glyph:dock', key: 'glyph:1' }))
  expect(missing.error).toMatch(/Missing retained glass image/)
})

it('keeps the texture the ink has now: a lease from before a device loss is replaced when the ink is kept again', async () => {
  const flat = image()
  await send(images({ slot: 'glyph:dock', key: 'glyph:1', image: flat }))
  await send({
    ...images({ slot: 'glyph:dock', key: 'glyph:2', image: image() }),
    keep: ['glyph:1'],
  })
  expect(state.textures).toHaveLength(1)
  const [beforeLoss] = state.textures
  // The GPU device is lost and restored: every texture of the frame graph is gone.
  for (const listener of state.deviceListeners) listener(undefined)
  for (const listener of state.deviceListeners) listener(state.device)
  // The ink is installed again and given up again: the renderer keeps its texture of the new device.
  const back = await send({ ...images({ slot: 'glyph:dock', key: 'glyph:1' }), keep: ['glyph:2'] })
  const away = await send({ ...images({ slot: 'glyph:dock', key: 'glyph:2' }), keep: ['glyph:1'] })
  expect([back.error, away.error]).toEqual([undefined, undefined])
  const afterLoss = state.textures.filter(texture => texture !== beforeLoss)
  expect(afterLoss.length).toBeGreaterThan(0)
  // Letting the ink go destroys the textures of the new device and never touches the lost one's.
  await send({ ...images(), unkeep: ['glyph:1'] })
  expect(beforeLoss.destroy).not.toHaveBeenCalled()
  expect(afterLoss.some(texture => texture.destroy.mock.calls.length === 1)).toBe(true)
  // Nothing holds the ink any more (the slot has the other one): its image is closed, once.
  expect(flat.close).toHaveBeenCalledOnce()
})
