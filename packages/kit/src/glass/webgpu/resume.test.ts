import { expect, it, vi } from 'vitest'
import { WebGPURaster } from './raster.ts'
import { FrameGraph } from './frameGraph.ts'
import type { LayerDevice } from './layers.ts'
import { TAB_BAR_BLUR_SIGMA } from '../lens/tabSelectionMaterial.ts'
import type { RasterSetup } from '../worker/protocol.ts'
function fixture() {
  const raster = new WebGPURaster(),
    allocate = vi.fn(),
    upload = vi.fn(),
    draw = vi.fn(),
    release = vi.fn()
  Object.assign(raster, {
    setup: { spec: { sampleWidth: 100, sampleHeight: 60 } } as RasterSetup,
    allocate,
    upload,
    draw,
    release,
  })
  return { raster, allocate, upload, draw, release }
}
it('retains the last canvas on hide and prepares new envelope storage without presenting until commit', () => {
  const { raster, allocate, upload, draw, release } = fixture()
  raster.setVisible(false)
  expect(release).toHaveBeenCalledTimes(1)
  expect(draw).not.toHaveBeenCalled()
  raster.updateSpec({ ...raster.spec!, sampleWidth: 180, sampleHeight: 90 })
  expect(allocate).not.toHaveBeenCalled()
  expect(draw).not.toHaveBeenCalled()
  raster.setVisible(true, true)
  expect(allocate).toHaveBeenCalledOnce()
  expect(upload).toHaveBeenCalledOnce()
  expect(draw).not.toHaveBeenCalled()
  raster.draw(0)
  expect(draw).toHaveBeenCalledOnce()
})
it('reprepares a changed envelope from retained sources and rejects invalid dimensions', () => {
  const { raster, allocate, upload } = fixture()
  raster.updateSpec({ ...raster.spec!, sampleWidth: 180, sampleHeight: 90 })
  expect(allocate).toHaveBeenCalledOnce()
  expect(upload).toHaveBeenCalledOnce()
  expect(() => raster.updateSpec({ ...raster.spec!, sampleHeight: NaN })).toThrow(
    'Invalid glass sampling envelope',
  )
})

it('retints the retained chrome setup before a deferred first draw', () => {
  const { raster, draw } = fixture()
  Object.assign(raster, {
    setup: {
      appearance: 'light',
      spec: { id: 'dock', sampleWidth: 100, sampleHeight: 60, tabSelection: {} },
    },
  })
  raster.setVisible(false)
  raster.setAppearance('dark')
  raster.setVisible(true, true)
  expect(draw).not.toHaveBeenCalled()
  expect(raster.spec?.blurSigmaCssPx).toBe(TAB_BAR_BLUR_SIGMA.dark)
  expect((raster as unknown as { setup: RasterSetup }).setup.appearance).toBe('dark')
})
it('restores device resources without drawing before the page appearance reply', () => {
  const { raster, allocate, upload, draw } = fixture()
  let restore: ((device: GPUDevice | undefined) => void) | undefined
  const owner = {
    liveDevice: {},
    subscribe: (callback: typeof restore) => {
      restore = callback
      return () => {}
    },
  } as unknown as LayerDevice
  const graph = vi.spyOn(FrameGraph, 'for').mockReturnValue({} as FrameGraph)
  Object.assign(raster, { useDevice: vi.fn() })
  try {
    ;(raster as unknown as { bindDevice(owner: LayerDevice): void }).bindDevice(owner)
    restore?.({} as GPUDevice)
    expect(allocate).toHaveBeenCalledOnce()
    expect(upload).toHaveBeenCalledOnce()
    expect(draw).not.toHaveBeenCalled()
  } finally {
    graph.mockRestore()
  }
})

it('blocks retained and restored presentation at the raster gate before acquiring a drawable', () => {
  const raster = new WebGPURaster()
  const acquire = vi.fn(() => {
    throw Error('must not acquire a drawable')
  })
  Object.assign(raster, { device: { createCommandEncoder: acquire } })
  raster.setSubmissionGate(() => false)
  raster.draw(0)
  raster.clear()
  expect(acquire).not.toHaveBeenCalled()
})

it('preserves explicit non-tab material tint when held appearance changes', () => {
  const { raster } = fixture()
  const tint = [0.1, 0.2, 0.3, 0.4]
  Object.assign(raster, {
    setup: { appearance: 'light', spec: { sampleWidth: 100, sampleHeight: 60, tint } },
  })
  raster.setAppearance('dark')
  expect(raster.spec?.tint).toEqual(tint)
  expect((raster as unknown as { setup: RasterSetup }).setup.appearance).toBe('dark')
})

it('releases actual graph texture leases on hide while retaining source bitmap ownership', () => {
  const destroy = vi.fn()
  const close = vi.fn()
  vi.stubGlobal('GPUTextureUsage', {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  })
  const device = { createTexture: () => ({ destroy }), queue: { copyExternalImageToTexture() {} } }
  const owner = { liveDevice: device, subscribe: () => () => {} } as unknown as LayerDevice
  const graph = FrameGraph.for(owner)
  const bitmap = { width: 8, height: 4, close } as unknown as ImageBitmap
  const texture = graph.target('retained', 8, 4)
  const image = graph.image('retained-bitmap', bitmap)
  const { raster } = fixture()
  delete (raster as unknown as { release?: unknown }).release
  Object.assign(raster, {
    textureLeases: [texture],
    imageLeases: [image],
    passes: { destroy() {} },
  })
  raster.setVisible(false)
  expect(destroy).toHaveBeenCalledOnce()
  expect(close).not.toHaveBeenCalled()
  expect(graph.report()).toMatchObject({ textures: 0, images: 1 })
  raster.dispose()
  expect(destroy).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
  vi.unstubAllGlobals()
})
