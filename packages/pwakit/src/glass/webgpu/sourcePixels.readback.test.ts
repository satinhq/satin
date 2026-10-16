import { afterEach, expect, it, vi } from 'vitest'
import { FrameGraph } from './frameGraph.ts'
import type { LayerDevice } from './layers.ts'
import { pixelImage } from './preparedSourcePixels.ts'
import { SourcePixels, takeSourcePixels } from './sourcePixels.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function workerFixture() {
  const workers: {
    postMessage: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
    onmessage: Worker['onmessage']
    onerror: Worker['onerror']
    onmessageerror: Worker['onmessageerror']
  }[] = []
  const create = () => {
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null as Worker['onmessage'],
      onerror: null as Worker['onerror'],
      onmessageerror: null as Worker['onmessageerror'],
    }
    workers.push(worker)
    return worker
  }
  const reply = (index: number, data: unknown) =>
    workers[index].onmessage!.call(workers[index] as unknown as Worker, { data } as MessageEvent)
  return { workers, create, reply }
}

/** A capture canvas whose 2D context reads back `bytes`. */
function readableCanvas(width: number, height: number, bytes: Uint8ClampedArray) {
  const getImageData = vi.fn(() => ({ width, height, data: bytes }))
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => ({ getImageData })),
  } as unknown as HTMLCanvasElement
  return { canvas, getImageData }
}

it('reads a capture canvas back on the page: no bitmap, no upload worker, and the bytes stay with the image', async () => {
  const { workers, create } = workerFixture()
  const snapshot = vi.fn()
  vi.stubGlobal('createImageBitmap', snapshot)
  const bytes = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])
  const { canvas, getImageData } = readableCanvas(2, 1, bytes)
  const image = pixelImage(2, 1)
  await new SourcePixels(create).prepare(image, canvas)
  expect(getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, 2, 1)
  // createImageBitmap of an accelerated capture canvas is what made WebKit keep a GPU-process
  // image for it: releasing or redrawing the canvas then blocked the main thread for 5 ms/MB.
  expect(snapshot).not.toHaveBeenCalled()
  expect(workers).toHaveLength(0)
  // Not one-use: a device restore uploads the same bytes again (there is no bitmap to fall back on).
  expect(takeSourcePixels(image)).toBe(bytes)
  expect(takeSourcePixels(image)).toBe(bytes)
  image.close()
  expect(takeSourcePixels(image)).toBeUndefined()
})

it('a readback does not depend on the upload worker: it works after the worker has failed', async () => {
  const { create, reply } = workerFixture()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2, height: 1, close() {} })),
  )
  const source = new SourcePixels(create)
  const lost = source.prepare({ width: 2, height: 1, close() {} } as unknown as ImageBitmap)
  await Promise.resolve()
  const rejected = expect(lost).rejects.toThrow('device lost')
  reply(0, { id: 0, error: 'device lost' })
  await rejected
  expect(source.failed).toBe(true)
  const bytes = new Uint8ClampedArray(8)
  const image = pixelImage(2, 1)
  await source.prepare(image, readableCanvas(2, 1, bytes).canvas)
  expect(takeSourcePixels(image)).toBe(bytes)
})

it('a replacement after a failure has its own worker, and a late reply of the failed one changes nothing', async () => {
  const { workers, create, reply } = workerFixture()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2, height: 1, close() {} })),
  )
  const bitmap = () => ({ width: 2, height: 1, close: vi.fn() }) as unknown as ImageBitmap
  const failed = new SourcePixels(create)
  const first = bitmap()
  const lost = failed.prepare(first)
  await Promise.resolve()
  const rejected = expect(lost).rejects.toThrow('device lost')
  reply(0, { id: 0, error: 'device lost' })
  await rejected
  expect(failed.failed).toBe(true)
  expect(workers[0].terminate).toHaveBeenCalledOnce()

  const replacement = new SourcePixels(create)
  expect(replacement.failed).toBe(false)
  const second = bitmap()
  const job = replacement.prepare(second)
  await Promise.resolve()
  expect(workers).toHaveLength(2)
  // The failed worker answers its old job late, with the id the replacement's job also has.
  const stale = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9])
  reply(0, { id: 1, width: 2, height: 1, buffer: stale.buffer })
  expect(takeSourcePixels(first)).toBeUndefined()
  expect(takeSourcePixels(second)).toBeUndefined()
  const fresh = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
  reply(1, { id: 1, width: 2, height: 1, buffer: fresh.buffer })
  await job
  expect(takeSourcePixels(second)).toEqual(fresh)
})

/** A device whose queue takes `writeTexture` as the WebGPU specification does ("validating
 * linear texture data": `bytesPerRow` at least the row's bytes, required beyond one row, and the
 * data long enough for every row at that stride; unlike a buffer copy it need not be a multiple
 * of 256) and whose textures keep the texels written to them, row by row at the given stride. */
function graphFixture() {
  const callbacks: ((device: GPUDevice | undefined) => void)[] = []
  const texels = new WeakMap<object, Uint8Array>()
  let scopes: (GPUError | null)[] = []
  /** The next writeTexture is rejected on the device timeline (reported through the error scope). */
  const reject = { next: false }
  const writeTexture = vi.fn(
    (
      destination: { texture: object },
      data: Uint8Array | Uint8ClampedArray,
      layout: { bytesPerRow?: number; offset?: number },
      [width, height]: number[],
    ) => {
      const rowBytes = width * 4
      const stride = layout.bytesPerRow
      if (height > 1 && stride === undefined) throw new TypeError('bytesPerRow is required')
      if (stride !== undefined && stride < rowBytes) throw new TypeError('bytesPerRow too small')
      const offset = layout.offset ?? 0
      const required = offset + (stride ?? rowBytes) * (height - 1) + rowBytes
      if (data.byteLength < required) throw new DOMException('data too short', 'OperationError')
      if (reject.next) {
        reject.next = false
        scopes[scopes.length - 1] = { message: 'texture is too small' } as GPUError
        return
      }
      const stored = new Uint8Array(rowBytes * height)
      for (let row = 0; row < height; row++) {
        const from = offset + (stride ?? rowBytes) * row
        stored.set(data.subarray(from, from + rowBytes), row * rowBytes)
      }
      texels.set(destination.texture, stored)
    },
  )
  const device = {
    createTexture: vi.fn(() => ({ destroy: vi.fn() })),
    pushErrorScope: () => scopes.push(null),
    popErrorScope: async () => scopes.pop() ?? null,
    queue: { copyExternalImageToTexture: vi.fn(), writeTexture },
  } as unknown as GPUDevice
  const reported: string[] = []
  const owner = {
    liveDevice: device,
    subscribe: (callback: (device: GPUDevice | undefined) => void) => {
      callbacks.push(callback)
      return () => {}
    },
    reportError: (stage: string) => reported.push(stage),
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
    texels: (texture: GPUTexture) => texels.get(texture),
    reject,
    reported,
    change: (next: GPUDevice | undefined) => {
      scopes = []
      callbacks.forEach(callback => callback(next))
    },
  }
}

/** A 3 x 2 capture whose every byte is distinct: a wrong stride shifts or drops a row. */
const capture = () =>
  new Uint8ClampedArray(Array.from({ length: 3 * 2 * 4 }, (_, index) => index + 1))

async function stagedImage(width: number, height: number, bytes: Uint8ClampedArray) {
  const image = pixelImage(width, height)
  await new SourcePixels(() => {
    throw Error('no upload worker for a readback')
  }).prepare(image, readableCanvas(width, height, bytes).canvas)
  return image
}

it('uploads every row of a read-back capture to its texture, again after a device loss, and frees the bytes with its last lease', async () => {
  const { graph, device, change, texels } = graphFixture()
  const bytes = capture()
  const image = await stagedImage(3, 2, bytes)
  const held = graph.image('plane', image)
  const target = graph.target('front', 3, 2, false, held.key)
  graph.upload(held.value, target.value)
  // What the texture holds is the capture, row for row (a stride other than the row's bytes
  // would shift the second row, and one the data cannot fill would be refused by the queue).
  expect([...texels(target.value.texture)!]).toEqual([...bytes])
  change(undefined)
  change(device)
  const restored = graph.target('front', 3, 2, false, held.key)
  expect(restored.value.texture).not.toBe(target.value.texture)
  graph.upload(held.value, restored.value)
  expect([...texels(restored.value.texture)!]).toEqual([...bytes])
  expect(device.queue.copyExternalImageToTexture).not.toHaveBeenCalled()
  held.release()
  restored.release()
  expect(takeSourcePixels(image)).toBeUndefined()
})

it('refuses a capture that is not its image (its bytes would be read at the wrong stride)', async () => {
  // A 3 x 2 canvas staged for a 2 x 3 image: the same byte count, another row length.
  const staging = new SourcePixels(() => {
    throw Error('no upload worker for a readback')
  })
  const image = pixelImage(2, 3)
  await expect(staging.prepare(image, readableCanvas(3, 2, capture()).canvas)).rejects.toThrow(
    '3x2 is not its 2x3 image',
  )
  expect(takeSourcePixels(image)).toBeUndefined()
})

it('bytes that are not the whole image are refused before the queue sees them, and nothing counts as uploaded', async () => {
  const { graph, device, texels } = graphFixture()
  const short = pixelImage(3, 2)
  // Bytes for one row only.
  const { keepSourcePixels } = await import('./preparedSourcePixels.ts')
  keepSourcePixels(short, new Uint8ClampedArray(12))
  const held = graph.image('short', short)
  const target = graph.target('front', 3, 2, false, held.key)
  expect(() => graph.upload(held.value, target.value)).toThrow('are not a 3x2 image')
  expect(device.queue.writeTexture).not.toHaveBeenCalled()
  // Still not uploaded: with the right bytes the same texture is written.
  keepSourcePixels(short, capture())
  graph.upload(held.value, target.value)
  expect([...texels(target.value.texture)!]).toEqual([...capture()])
})

it('a write the device rejects later is reported, and the texture is uploaded again by the next draw of a new capture', async () => {
  const { graph, device, reject, texels, reported } = graphFixture()
  const bytes = capture()
  const image = await stagedImage(3, 2, bytes)
  const held = graph.image('rejected', image)
  const target = graph.target('front', 3, 2, false, held.key)
  reject.next = true
  graph.upload(held.value, target.value)
  // The rejection arrives with the error scope, after the call returned.
  await Promise.resolve()
  await Promise.resolve()
  expect(reported).toEqual(['source upload'])
  expect(texels(target.value.texture)).toBeUndefined()
  // Not marked uploaded: the same texture is written when it is next needed, once (no loop of
  // attempts and reports for a texture the device keeps refusing).
  graph.upload(held.value, target.value)
  expect([...texels(target.value.texture)!]).toEqual([...bytes])
  expect(device.queue.writeTexture).toHaveBeenCalledTimes(2)
})
