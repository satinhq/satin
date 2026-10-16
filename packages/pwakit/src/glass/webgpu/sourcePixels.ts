import { reportGlassError } from '../errors.ts'
import { glassNow, glassTiming } from './profile.ts'

import { keepSourcePixels, prepared } from './preparedSourcePixels.ts'
export { takeSourcePixels } from './preparedSourcePixels.ts'
type Reply = { id: number; buffer?: ArrayBuffer; width?: number; height?: number; error?: string }
type Transport = Pick<
  Worker,
  'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'
>
/** The pixels of a capture canvas, read back from its 2D context (straight RGBA, rows top first);
 * undefined when `capture` is not a canvas with a 2D context. */
function canvasPixels(capture: ImageBitmapSource) {
  const canvas = capture as Partial<HTMLCanvasElement>
  if (typeof canvas.getContext !== 'function' || !canvas.width || !canvas.height) return undefined
  const context = canvas.getContext('2d')
  if (!context || typeof context.getImageData !== 'function') return undefined
  return context.getImageData(0, 0, canvas.width, canvas.height).data
}

/** Stages the bytes a document-owned renderer uploads for a capture.
 *
 * A capture canvas is read back on the page (`getImageData`): no bitmap is taken from the canvas
 * and nothing leaves the thread. Measured in the Catalyst host for an accelerated 1320 px wide
 * canvas: 21 to 27 ms for 14 MB, 43 ms for 29 MB, 54 to 63 ms for 41 MB, the same pixels as a
 * bitmap of the canvas, and the canvas then costs nothing to redraw or release. The worker path
 * it replaces for canvases (a bitmap copied to a texture and read back in an upload worker) took
 * 136 to 281 ms for the 41 MB capture, during which WebKit presented no frame of the page.
 *
 * The readback returns straight alpha and the renderer uploads premultiplied bytes: the two are
 * the same only for an opaque capture. Backdrop planes are opaque (their fill is,
 * `effectiveBackground`); translucent captures (glyphs, region foregrounds) are never staged here.
 *
 * Any other image (a bitmap with no canvas behind it) goes to the upload worker, which moves the
 * external-image import off the presentation thread without an alpha round trip. */
export class SourcePixels {
  private worker?: Transport
  private next = 0
  private failure?: Error
  private retrying?: Promise<void>
  private pending = new Map<
    number,
    {
      image: ImageBitmap
      resolve: () => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private create: () => Transport
  constructor(
    create: () => Transport = () =>
      new Worker(new URL('./sourcePixels.worker.ts', import.meta.url), {
        type: 'module',
        name: 'satin-source-upload',
      }),
  ) {
    this.create = create
  }
  /** Exhausted upload failures let the production owner replace this source stager.
   * Canvas readbacks remain available because they do not use the worker. */
  get failed() {
    return !!this.failure
  }
  private fail(error: Error) {
    this.failure = error
    this.worker?.terminate()
    this.worker = undefined
    reportGlassError('worker-startup', error, 'source upload worker', undefined, {
      recovering: true,
    })
    for (const job of this.pending.values()) {
      clearTimeout(job.timer)
      job.reject(error)
    }
    this.pending.clear()
  }
  /** Stage `image`'s premultiplied bytes for its upload (`takeSourcePixels`). When `capture` is a
   * canvas it is read back here (see the class comment) and the rest of this comment does not apply.
   *
   * The upload worker needs a bitmap of its own (a transferred bitmap is gone from this thread,
   * and the renderer keeps `image` to restore a lost device). `capture` is what that second bitmap
   * is taken from: pass the canvas `image` was snapshotted from, unchanged since. A second
   * snapshot of the canvas took under 3 ms. Copying the snapshot itself
   * (`createImageBitmap(image)`, the default) blocked the main thread for 5 to 6 ms per megabyte
   * in WebKit (157 ms for a 1320 x 5091 capture in the Catalyst host), more than half of the
   * stage. Measured for captures up to 1320 x 6495; the cause inside WebKit was not sampled. */
  async prepare(image: ImageBitmap, capture: ImageBitmapSource = image) {
    for (let attempt = 0; ; attempt++) {
      try {
        if (this.retrying) await this.retrying
        return await this.prepareOnce(image, capture)
      } catch (error) {
        if (!this.failure) throw error
        if (attempt === 2) {
          reportGlassError('worker-startup', error, 'source upload worker')
          throw new Error(`Source upload worker startup failed: ${String(error)}`, { cause: error })
        }
        // Concurrent uploads share one restart. Each retry clones from the retained
        // source, never from the bitmap already transferred to the failed worker.
        this.retrying ??= new Promise<void>(resolve =>
          setTimeout(resolve, 250 * 2 ** attempt),
        ).then(() => {
          this.failure = undefined
          this.retrying = undefined
        })
        await this.retrying
      }
    }
  }
  private async prepareOnce(image: ImageBitmap, capture: ImageBitmapSource) {
    const readbackStarted = glassNow()
    const pixels = canvasPixels(capture)
    if (pixels) {
      const canvas = capture as HTMLCanvasElement
      // The bytes are uploaded at the image's row length: they must be that image.
      if (canvas.width !== image.width || canvas.height !== image.height)
        throw Error(
          `Glass capture canvas ${canvas.width}x${canvas.height} is not its ${image.width}x${image.height} image`,
        )
      keepSourcePixels(image, pixels)
      glassTiming('source-readback', readbackStarted, `${image.width}x${image.height}`)
      return
    }
    if (this.failure) throw this.failure
    if (!this.worker) {
      try {
        this.worker = this.create()
      } catch (error) {
        this.fail(error instanceof Error ? error : Error(String(error)))
        throw error
      }
      const worker = this.worker
      this.worker.onmessage = event => {
        if (this.worker !== worker) return
        const data = event.data as Reply
        if (data.id === 0 && data.error) {
          this.fail(Error(data.error))
          return
        }
        const job = this.pending.get(data.id)
        if (!job) return
        this.pending.delete(data.id)
        clearTimeout(job.timer)
        if (data.error) {
          job.reject(Error(data.error))
          return
        }
        if (
          !(data.buffer instanceof ArrayBuffer) ||
          data.width !== job.image.width ||
          data.height !== job.image.height ||
          data.buffer.byteLength !== job.image.width * job.image.height * 4
        ) {
          job.reject(Error('Source upload worker returned invalid pixel dimensions'))
          return
        }
        prepared.set(job.image, new Uint8Array(data.buffer))
        job.resolve()
      }
      this.worker.onerror = event => {
        if (this.worker === worker) this.fail(Error(event.message || 'Source upload worker failed'))
      }
      this.worker.onmessageerror = () => {
        if (this.worker === worker)
          this.fail(Error('Source upload worker reply could not be decoded'))
      }
    }
    const started = glassNow(),
      clone = await createImageBitmap(capture)
    if (this.failure) {
      clone.close()
      throw this.failure
    }
    const id = ++this.next
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => this.fail(Error('Source upload worker exceeded 10 seconds')),
          10000,
        )
        this.pending.set(id, { image, resolve, reject, timer })
        try {
          this.worker!.postMessage({ id, bitmap: clone }, [clone])
        } catch (error) {
          clone.close()
          this.pending.delete(id)
          clearTimeout(timer)
          reject(error)
        }
      })
    } finally {
      glassTiming('source-worker-upload', started, `${image.width}x${image.height}`)
    }
  }
}
