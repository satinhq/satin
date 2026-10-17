import { glassDeviceLimits } from './deviceLimits.ts'
// No 2D getImageData: unpremultiply/premultiply changes translucent edge bytes.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; bitmap: ImageBitmap }>) => void) | null
  postMessage: (value: unknown, transfer?: Transferable[]) => void
}
let gpu: Promise<GPUDevice> | undefined,
  serial = Promise.resolve()
function device() {
  return (gpu ??= (async () => {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw Error('Source upload worker has no WebGPU adapter')
    const result = await adapter.requestDevice({ requiredLimits: glassDeviceLimits(adapter) })
    result.lost.then(info =>
      scope.postMessage({
        id: 0,
        error: `Source upload device lost: ${info.reason} ${info.message}`,
      }),
    )
    result.addEventListener('uncapturederror', event =>
      scope.postMessage({
        id: 0,
        error: `Source upload GPU error: ${(event as GPUUncapturedErrorEvent).error.message}`,
      }),
    )
    return result
  })())
}
scope.onmessage = ({ data: { id, bitmap } }) => {
  serial = serial.then(async () => {
    let texture: GPUTexture | undefined,
      buffer: GPUBuffer | undefined,
      mapped = false
    try {
      const gpu = await device(),
        width = bitmap.width,
        height = bitmap.height,
        pitch = Math.ceil((width * 4) / 256) * 256
      texture = gpu.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT,
      })
      gpu.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture, premultipliedAlpha: true, colorSpace: 'srgb' },
        [width, height],
      )
      buffer = gpu.createBuffer({
        size: pitch * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      })
      const encoder = gpu.createCommandEncoder()
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: pitch }, [width, height])
      gpu.queue.submit([encoder.finish()])
      await buffer.mapAsync(GPUMapMode.READ)
      mapped = true
      const source = new Uint8Array(buffer.getMappedRange()),
        bytes = new Uint8Array(width * height * 4)
      for (let y = 0; y < height; y++)
        bytes.set(source.subarray(y * pitch, y * pitch + width * 4), y * width * 4)
      scope.postMessage({ id, width, height, buffer: bytes.buffer }, [bytes.buffer])
    } catch (error) {
      scope.postMessage({ id, error: String(error) })
    } finally {
      if (mapped) buffer?.unmap()
      buffer?.destroy()
      texture?.destroy()
      bitmap.close()
    }
  })
}
export {}
