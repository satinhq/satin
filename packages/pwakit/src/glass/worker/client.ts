import { readDarkAppearance } from '../../app/appearance.ts'
import { installGlassErrorAlert } from '../errorAlert.ts'
import { glassFailureCode } from '../webgpu/errorCode.ts'
import { reportGlassError } from '../errors.ts'
import type { GlassLayer } from '../webgpu/layers.ts'
import { PageFrameHost } from '../webgpu/frameClock.ts'
import type { Request } from './protocol.ts'

export class WorkerGlassClient {
  private worker?: Worker
  private nextId = 0
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private failed?: Error
  private frames = new PageFrameHost()
  backend = 'webgpu' as const
  private visibility = () => {
    const visible = document.visibilityState === 'visible'
    void this.request({ type: 'visible', visible }).catch(error => {
      reportGlassError(glassFailureCode('worker control', error), error, 'worker control')
    })
    if (!visible) this.frames.cancel()
  }
  readonly work: { at: number; ms: number }[] = []

  async init(canvas: HTMLCanvasElement, resolution: number): Promise<void> {
    installGlassErrorAlert()
    try {
      await this.initialize(canvas, resolution)
    } catch (error) {
      reportGlassError(
        glassFailureCode('renderer initialization', error),
        error,
        'renderer initialization',
      )
      throw error
    }
  }
  private async initialize(canvas: HTMLCanvasElement, resolution: number): Promise<void> {
    // 7b: do not create the page context before visibility plus one frame.
    if (document.visibilityState !== 'visible')
      await new Promise<void>(resolve => {
        const listener = () => {
          if (document.visibilityState === 'visible') {
            document.removeEventListener('visibilitychange', listener)
            resolve()
          }
        }
        document.addEventListener('visibilitychange', listener)
      })
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    this.worker = new Worker(new URL('../webgpu/entry.worker.ts', import.meta.url), {
      type: 'module',
      name: 'satin-glass-webgpu',
    })
    this.worker.onerror = event => {
      this.failed = new Error(event.message || 'Glass worker failed')
      reportGlassError(
        glassFailureCode('worker startup/runtime', this.failed),
        this.failed,
        'worker startup/runtime',
      )
      for (const request of this.pending.values()) request.reject(this.failed)
      this.pending.clear()
    }
    this.worker.onmessageerror = () => {
      this.failed = Error('Glass worker message could not be deserialized')
      reportGlassError(
        glassFailureCode('worker transport', this.failed),
        this.failed,
        'worker transport',
      )
      for (const request of this.pending.values()) request.reject(this.failed)
      this.pending.clear()
    }
    this.worker.onmessage = event => {
      if (this.frames.receive(event.data, data => this.worker!.postMessage(data))) return
      const { id, value, error, glassError } = event.data
      if (glassError) {
        reportGlassError(glassError.code, glassError.message, glassError.stage, glassError.reason)
        return
      }
      const request = this.pending.get(id)
      this.pending.delete(id)
      if (error) request?.reject(new Error(error))
      else request?.resolve(value)
    }
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.request({ type: 'capability' }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(Error('WebGPU startup exceeded 2.5 seconds')), 2500)
        }),
      ])
      this.backend = 'webgpu'
    } catch (error) {
      this.failed = error instanceof Error ? error : Error(String(error))
      reportGlassError(
        glassFailureCode('WebGPU startup', this.failed),
        this.failed,
        'WebGPU startup',
      )
      this.worker.terminate()
      for (const pending of this.pending.values()) pending.reject(this.failed)
      this.pending.clear()
      throw this.failed
    } finally {
      clearTimeout(timeout)
    }
    const offscreen = canvas.transferControlToOffscreen()
    await this.request(
      {
        type: 'init',
        canvas: offscreen,
        resolution,
        appearance: readDarkAppearance() ? 'dark' : 'light',
      },
      [offscreen],
    )
    document.addEventListener('visibilitychange', this.visibility)
  }
  async attachLayer(canvas: HTMLCanvasElement, layer: GlassLayer) {
    canvas.style.position = 'absolute'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = String(layer.depth)
    canvas.dataset.satinGlassLayer = layer.id
    canvas.dataset.satinGlassAttachment = layer.attachment.kind
    if (layer.attachment.kind === 'scroll') {
      const container = canvas.closest('[data-satin-scroll-container]')
      if (container?.getAttribute('data-satin-scroll-container') !== layer.attachment.scrollId)
        throw Error('Scroll glass canvas must be mounted inside its declared scroll container')
    }
    const offscreen = canvas.transferControlToOffscreen()
    return this.request({ type: 'attach-layer', layer, canvas: offscreen }, [offscreen])
  }
  request(request: Request, transfer: Transferable[] = []): Promise<unknown> {
    if (this.failed) return Promise.reject(this.failed)
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.worker!.postMessage({ id, request }, transfer)
      } catch (error) {
        this.pending.delete(id)
        reportGlassError(glassFailureCode('worker transport', error), error, 'worker transport')
        reject(error)
      }
    })
  }
  pose(x: number, at: number) {
    const start = performance.now(),
      request: Request = { type: 'pose', x, at }
    this.worker!.postMessage({ id: 0, request })
    this.work.push({ at, ms: performance.now() - start })
    if (this.work.length > 2400) this.work.shift()
  }
  park() {
    this.frames.cancel()
    document.removeEventListener('visibilitychange', this.visibility)
    return this.request({ type: 'visible', visible: false })
    // Do not terminate and recreate a glass worker within the same page.
  }
}
