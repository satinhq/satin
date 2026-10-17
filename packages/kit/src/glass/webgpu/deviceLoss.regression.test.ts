import { afterEach, expect, it, vi } from 'vitest'
import { LayerDevice } from './layers.ts'
import { FrameGraph } from './frameGraph.ts'
import { retainNavigationAtlas } from './navigationAtlasCopy.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('recreates an unexpectedly destroyed page device without requiring the test hook', async () => {
  const requestDevice = vi.fn(async () => {
    let lose!: (info: { reason: string; message: string }) => void
    return {
      lost: new Promise(resolve => {
        lose = resolve
      }),
      destroy: () => lose({ reason: 'destroyed', message: '' }),
      addEventListener: vi.fn(),
    }
  })
  vi.stubGlobal('navigator', {
    gpu: { requestAdapter: async () => ({ requestDevice }) },
  })
  const reportError = vi.fn()
  const owner = new LayerDevice(reportError)
  const device = await owner.ready()
  device.destroy()
  await vi.waitFor(() => expect(owner.report().restores).toBe(1))
  expect(owner.liveDevice).not.toBe(device)
  expect(reportError).not.toHaveBeenCalled()
})

it('reconstructs GPU-only atlas pixels before a retained presenter uploads after loss', async () => {
  const listeners: ((device: GPUDevice | undefined) => void)[] = []
  const device = {
    createTexture: () => ({ destroy: vi.fn(), createView: () => ({}) }),
    createCommandEncoder: () => ({
      beginRenderPass: () => ({ end() {} }),
      copyTextureToTexture: vi.fn(),
      finish: () => ({}),
    }),
    queue: {
      copyExternalImageToTexture: vi.fn(({ source }) => {
        if (source !== bitmap) throw new TypeError('Metadata-only atlas is not an image')
      }),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice
  const owner = {
    liveDevice: device,
    subscribe: (listener: (device: GPUDevice | undefined) => void) => {
      listeners.push(listener)
      return () => {}
    },
  } as unknown as LayerDevice
  vi.stubGlobal('GPUTextureUsage', {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  })
  const graph = FrameGraph.for(owner)
  const bitmap = { width: 8, height: 8, close: vi.fn() } as unknown as ImageBitmap
  const replay = await retainNavigationAtlas(graph, {
    type: 'navigation-atlas',
    key: 'atlas',
    revision: 1,
    width: 8,
    height: 8,
    background: [0, 0, 0, 1],
    cells: [{ image: bitmap, dx: 0, dy: 0 }],
  })
  const atlas = graph.virtual('atlas', 8, 8, replay)
  const original = graph.target('front', 8, 8, false, atlas.key)
  graph.reconstructVirtual(atlas.key)
  graph.upload(atlas.value, original.value)
  for (const listener of listeners) listener(undefined)
  for (const listener of listeners) listener(device)
  const restored = graph.target('front', 8, 8, false, atlas.key)
  try {
    expect(() => graph.upload(atlas.value, restored.value)).not.toThrow()
    expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2)
    expect(device.queue.submit).toHaveBeenCalledTimes(2)
  } finally {
    restored.release()
    original.release()
    atlas.release()
  }
  expect(bitmap.close).toHaveBeenCalledTimes(1)
  expect(graph.report()).toMatchObject({ images: 0, textures: 0, gpuBytes: 0 })
})

it('keeps a failed reconstruction generation unavailable instead of reporting a restore', async () => {
  const devices: GPUDevice[] = []
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter: async () => ({
        requestDevice: async () => {
          let lose!: (value: { reason: string; message: string }) => void
          const device = {
            lost: new Promise(resolve => {
              lose = resolve
            }),
            destroy: vi.fn(() => lose({ reason: 'destroyed', message: '' })),
            addEventListener: vi.fn(),
          } as unknown as GPUDevice
          devices.push(device)
          return device
        },
      }),
    },
  })
  const reportError = vi.fn()
  const owner = new LayerDevice(reportError)
  const original = await owner.ready()
  const notifications: (GPUDevice | undefined)[] = []
  owner.subscribe(device => {
    notifications.push(device)
    if (device) throw Error('Atlas input unavailable')
  })
  original.destroy()
  await vi.waitFor(() => expect(reportError).toHaveBeenCalledOnce())
  expect(reportError).toHaveBeenCalledWith(
    'device recreation',
    'Atlas input unavailable',
    undefined,
  )
  expect(owner.liveDevice).toBeUndefined()
  expect(owner.report().restores).toBe(0)
  expect(notifications.at(-1)).toBeUndefined()
  expect(devices[1].destroy).toHaveBeenCalledOnce()
})

it('recovers all attached glass after transient null adapters without exposing an error', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('GPUTextureUsage', { RENDER_ATTACHMENT: 16, COPY_SRC: 1 })
  const adapter = {
    requestDevice: async () => {
      let lose!: (info: { reason: string; message: string }) => void
      return {
        lost: new Promise(resolve => {
          lose = resolve
        }),
        destroy: () => lose({ reason: 'destroyed', message: '' }),
        addEventListener() {},
        pushErrorScope() {},
        popErrorScope: async () => null,
      }
    },
  }
  let nullRemaining = 0
  vi.stubGlobal('navigator', {
    gpu: { requestAdapter: async () => (nullRemaining-- > 0 ? null : adapter) },
  })
  const visibleErrors: string[] = []
  const owner = new LayerDevice((_stage, message) => visibleErrors.push(message))
  const canvases = [0, 1].map(index => {
    const context = {
      configure(configuration: { device: GPUDevice }) {
        painted[index] = configuration.device
      },
      unconfigure() {},
    }
    return { width: 8, height: 8, getContext: () => context } as unknown as OffscreenCanvas
  })
  const painted: (GPUDevice | undefined)[] = []
  for (const [index, canvas] of canvases.entries()) {
    await owner.attach(
      { id: `glass-${index}`, depth: index, attachment: { kind: 'fixed' } },
      canvas,
    )
  }
  const original = owner.liveDevice!
  let rebuilt = false
  owner.subscribe(device => {
    rebuilt = !!device
  })
  nullRemaining = 7
  original.destroy()
  await vi.advanceTimersByTimeAsync(0)
  expect(rebuilt).toBe(false)
  await vi.advanceTimersByTimeAsync(6000)
  expect(owner.liveDevice).toBeDefined()
  expect(owner.liveDevice).not.toBe(original)
  expect(painted).toEqual([owner.liveDevice, owner.liveDevice])
  expect(rebuilt).toBe(true)
  expect(owner.report().restores).toBe(1)
  expect(owner.report().nullAdapters).toBe(7)
  expect(owner.report().errors).toHaveLength(7)
  expect(visibleErrors).toEqual([])
})

it('reconstructs after a long adapter outage without another foreground event', async () => {
  vi.useFakeTimers()
  let unavailable = false
  const adapter = {
    requestDevice: async () => {
      let lose!: (info: { reason: string; message: string }) => void
      return {
        lost: new Promise(resolve => {
          lose = resolve
        }),
        destroy: () => lose({ reason: 'destroyed', message: '' }),
        addEventListener() {},
      }
    },
  }
  vi.stubGlobal('navigator', {
    gpu: { requestAdapter: async () => (unavailable ? null : adapter) },
  })
  const visibleErrors: string[] = []
  const owner = new LayerDevice((_stage, message) => visibleErrors.push(message))
  const original = await owner.ready()
  let rebuilt = false
  owner.subscribe(device => {
    rebuilt = !!device
  })
  unavailable = true
  original.destroy()
  await vi.advanceTimersByTimeAsync(2000)
  owner.setAdapterVisible(false)
  const hiddenAttempts = owner.report().nullAdapters
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
  expect(owner.report().nullAdapters).toBe(hiddenAttempts)
  owner.setAdapterVisible(true)
  await vi.advanceTimersByTimeAsync(10000)
  expect(owner.liveDevice).toBeUndefined()
  expect(rebuilt).toBe(false)
  expect(visibleErrors).toEqual([])
  expect(owner.report().nullAdapters).toBeGreaterThan(5)
  unavailable = false
  await vi.advanceTimersByTimeAsync(1000)
  expect(owner.liveDevice).toBeDefined()
  expect(rebuilt).toBe(true)
  expect(owner.report().restores).toBe(1)
  expect(owner.report().errors.length).toBeGreaterThanOrEqual(5)
})
