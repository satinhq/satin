import { afterEach, expect, it, vi } from 'vitest'
import { FrameGraph } from './frameGraph.ts'
import { copyNavigationAtlasCells } from './navigationAtlasCopy.ts'
import type { LayerDevice } from './layers.ts'

afterEach(() => vi.unstubAllGlobals())

it('keeps a newly allocated retained-plane texture alive until its copy is submitted', () => {
  vi.stubGlobal('GPUTextureUsage', {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  })
  const textures: { destroyed: boolean }[] = []
  const copied: { destroyed: boolean }[] = []
  const device = {
    createTexture: () => {
      const texture = {
        destroyed: false,
        createView: () => ({}),
        destroy: () => {
          texture.destroyed = true
        },
      }
      textures.push(texture)
      return texture
    },
    createCommandEncoder: () => ({
      beginRenderPass: () => ({ end() {} }),
      copyTextureToTexture: (source: { texture: { destroyed: boolean } }) => {
        copied.push(source.texture)
      },
      finish: () => ({}),
    }),
    queue: {
      copyExternalImageToTexture: vi.fn(),
      submit: vi.fn(() => {
        expect(copied).toHaveLength(1)
        expect(copied[0].destroyed).toBe(false)
      }),
    },
  } as unknown as GPUDevice
  const owner = { liveDevice: device, subscribe: () => () => {} } as unknown as LayerDevice
  const graph = FrameGraph.for(owner)
  const image = graph.image('covered-route', { width: 8, height: 8, close() {} } as ImageBitmap)
  const atlas = graph.target('front', 8, 8, false, 'atlas')
  copyNavigationAtlasCells(
    device,
    graph,
    {
      type: 'navigation-atlas',
      revision: 1,
      key: 'atlas',
      width: 8,
      height: 8,
      background: [1, 1, 1, 1],
      cells: [{ plane: image.key, sx: 0, sy: 0, dx: 0, dy: 0, w: 8, h: 8 }],
    },
    atlas,
  )
  expect(device.queue.submit).toHaveBeenCalledOnce()
  expect(textures[1].destroyed).toBe(true)
  atlas.release()
  image.release()
})

// A region can retain an older atlas after the shared navigation slot is replaced.
it('retains GPU-composed pixels while their virtual image is leased across suspension', () => {
  vi.stubGlobal('GPUTextureUsage', {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  })
  const texture = { createView: () => ({}), destroy: vi.fn() }
  const device = { createTexture: () => texture } as unknown as GPUDevice
  const owner = { liveDevice: device, subscribe: () => () => {} } as unknown as LayerDevice
  const graph = FrameGraph.for(owner)
  const atlas = graph.virtual('navigation:old:front', 8, 8)
  const region = graph.retain(atlas.key)
  const target = graph.target('front', 8, 8, false, atlas.key)
  graph.markUploaded(target.value)
  atlas.release()
  target.release()
  expect(texture.destroy).not.toHaveBeenCalled()
  const resumed = graph.target('front', 8, 8, false, region.key)
  graph.upload(region.value, resumed.value)
  resumed.release()
  region.release()
  expect(texture.destroy).toHaveBeenCalledOnce()
})
