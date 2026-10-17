import { afterEach, expect, it, vi } from 'vitest'
import { FrameGraph } from './frameGraph.ts'
import { SourcePixels } from './sourcePixels.ts'
import { keepSourceBands, pixelImage } from './preparedSourcePixels.ts'
import type { LayerDevice } from './layers.ts'
afterEach(() => vi.unstubAllGlobals())
function fixture() {
  const callbacks: ((device: GPUDevice | undefined) => void)[] = []
  const device = {
    createTexture: vi.fn(() => ({ destroy: vi.fn() })),
    queue: { copyExternalImageToTexture: vi.fn(), writeTexture: vi.fn() },
  } as unknown as GPUDevice
  const owner = {
    liveDevice: device,
    subscribe: (callback: (device: GPUDevice | undefined) => void) => {
      callbacks.push(callback)
      return () => {}
    },
  } as unknown as LayerDevice
  vi.stubGlobal('GPUTextureUsage', {
    TEXTURE_BINDING: 1,
    RENDER_ATTACHMENT: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
  })
  return {
    graph: FrameGraph.for(owner),
    device,
    change: (next: GPUDevice | undefined) => callbacks.forEach(cb => cb(next)),
  }
}
it('shares immutable uploads and scratch ownership across presenters until the last lease ends', () => {
  const { graph, device } = fixture(),
    first = { width: 8, height: 4, close: vi.fn() } as unknown as ImageBitmap,
    duplicate = { width: 8, height: 4, close: vi.fn() } as unknown as ImageBitmap
  const a = graph.image('capture-1', first),
    b = graph.image('capture-1', duplicate)
  const x = graph.target('source', 8, 4, false, a.key),
    y = graph.target('source', 8, 4, false, b.key)
  graph.upload(a.value, x.value)
  graph.upload(b.value, y.value)
  expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1)
  expect(graph.report()).toMatchObject({
    gpuBytes: 128,
    retainedBitmapBytes: 128,
    textures: 1,
    images: 1,
  })
  expect(duplicate.close).toHaveBeenCalledTimes(1)
  expect(first.close).not.toHaveBeenCalled()
  a.release()
  x.release()
  expect(graph.report().gpuBytes).toBe(128)
  b.release()
  y.release()
  expect(graph.report()).toMatchObject({ gpuBytes: 0, retainedBitmapBytes: 0 })
  expect(first.close).toHaveBeenCalledTimes(1)
})
it('a lost-generation lease cannot destroy a replacement texture with the same key', () => {
  const { graph, device, change } = fixture(),
    old = graph.target('result', 8, 4)
  change(undefined)
  change(device)
  const replacement = graph.target('result', 8, 4)
  old.release()
  expect(graph.report().gpuBytes).toBe(128)
  expect(replacement.value.texture.destroy).not.toHaveBeenCalled()
  replacement.release()
  expect(graph.report().gpuBytes).toBe(0)
})
it('knows which bitmaps a live lease retains, so borrowers never close shared captures', () => {
  const { graph } = fixture(),
    shared = { width: 8, height: 4, close: vi.fn() } as unknown as ImageBitmap,
    other = { width: 8, height: 4, close: vi.fn() } as unknown as ImageBitmap
  const lease = graph.image('capture-2', shared)
  expect(graph.owns(shared)).toBe(true)
  expect(graph.owns(other)).toBe(false)
  lease.release()
  expect(graph.owns(shared)).toBe(false)
})

it('retains a canonical source through presenter replacement without cloning or closing the shared bitmap', () => {
  const { graph } = fixture()
  const bitmap = { width: 20, height: 10, close: vi.fn() } as unknown as ImageBitmap
  const canonical = graph.image('production:7:front', bitmap)
  const material = graph.image(canonical.key, canonical.value),
    lift = graph.image(canonical.key, canonical.value)
  canonical.release()
  material.release()
  expect(bitmap.close).not.toHaveBeenCalled()
  const replacement = graph.image(lift.key, lift.value)
  lift.release()
  expect(replacement.value).toBe(bitmap)
  expect(bitmap.close).not.toHaveBeenCalled()
  replacement.release()
  expect(bitmap.close).toHaveBeenCalledTimes(1)
})

it('uses staged GPU bytes once and retains the original bitmap for device restoration', async () => {
  const { graph, device, change } = fixture(),
    bitmap = { width: 2, height: 1, close: vi.fn() } as unknown as ImageBitmap
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as Worker['onmessage'],
    onerror: null as Worker['onerror'],
    onmessageerror: null as Worker['onmessageerror'],
  }
  vi.stubGlobal('createImageBitmap', async () => bitmap)
  const preparing = new SourcePixels(() => worker).prepare(bitmap)
  await Promise.resolve()
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
  worker.onmessage!.call(
    worker as unknown as Worker,
    { data: { id: 1, width: 2, height: 1, buffer: bytes.buffer } } as MessageEvent,
  )
  await preparing
  const held = graph.image('ready', bitmap),
    target = graph.target('front', 2, 1, false, held.key)
  graph.upload(bitmap, target.value)
  graph.upload(bitmap, target.value)
  expect(device.queue.writeTexture).toHaveBeenCalledExactlyOnceWith(
    { texture: target.value.texture },
    bytes,
    { bytesPerRow: 8 },
    [2, 1],
  )
  expect(device.queue.copyExternalImageToTexture).not.toHaveBeenCalled()
  change(undefined)
  change(device)
  const restored = graph.target('front', 2, 1, false, held.key)
  graph.upload(bitmap, restored.value)
  expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledExactlyOnceWith(
    { source: bitmap },
    { texture: restored.value.texture, premultipliedAlpha: true, colorSpace: 'srgb' },
    [2, 1],
  )
  expect(bitmap.close).not.toHaveBeenCalled()
  held.release()
  restored.release()
})

it('a texture lease kept across a device loss is never the one a later target hands out', () => {
  // The renderer keeps the glyph texture of ink it may install again (renderer.ts keptImages).
  const { graph, device, change } = fixture()
  const ink = { width: 8, height: 4, close: vi.fn() } as unknown as ImageBitmap
  const image = graph.image('glyph:1', ink)
  const kept = graph.target('glyphs', 8, 4, false, image.key)
  graph.upload(image.value, kept.value)
  change(undefined)
  change(device)
  // The raster that installs the ink again asks for its texture: a new one, uploaded again.
  const fresh = graph.target('glyphs', 8, 4, false, image.key)
  expect(fresh.value.texture).not.toBe(kept.value.texture)
  graph.upload(image.value, fresh.value)
  expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2)
  expect(device.queue.copyExternalImageToTexture).toHaveBeenLastCalledWith(
    { source: ink },
    { texture: fresh.value.texture, premultipliedAlpha: true, colorSpace: 'srgb' },
    [8, 4],
  )
  // Letting the stale lease go leaves the replacement alone.
  kept.release()
  expect(fresh.value.texture.destroy).not.toHaveBeenCalled()
  expect(graph.report().textures).toBe(1)
  fresh.release()
  image.release()
})
it('initializes uncaptured rows transparently without altering captured band pixels', () => {
  const { graph, device } = fixture()
  const image = pixelImage(2, 10)
  const top = new Uint8Array(2 * 2 * 4).fill(1)
  const bottom = new Uint8Array(2 * 3 * 4).fill(2)
  keepSourceBands(image, [
    { row: 1, rows: 2, bytes: top },
    { row: 7, rows: 3, bytes: bottom },
  ])
  const held = graph.image('banded', image),
    target = graph.target('front', 2, 10, false, held.key)
  graph.upload(image, target.value)
  const uploaded = vi.mocked(device.queue.writeTexture).mock.calls[0]![1]
  const expected = new Uint8Array(2 * 10 * 4)
  expected.set(top, 2 * 4)
  expected.set(bottom, 7 * 2 * 4)
  expect(uploaded).toEqual(expected)
  held.release()
})
