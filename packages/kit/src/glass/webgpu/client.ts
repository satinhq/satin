import type { GlassRegionEvent } from '../rendererContract.ts'
import {
  glassNow,
  glassTiming,
  receiveGlassFrames,
  receiveGlassTiming,
  setGlassTimingSink,
} from './profile.ts'
import { motionPreparationEnabled, recordMotionPreparation } from '../../motionProbe.ts'
import { installGlassErrorAlert } from '../errorAlert.ts'
import { glassFailureCode } from '../webgpu/errorCode.ts'
import { reportGlassError, setGlassAdapterRecovery } from '../errors.ts'
import { GLASS_READINESS_BUDGET_MS, VisibleDeadline } from '../visibleDeadline.ts'
import type { GlassLayer } from './layers.ts'
import { PageFrameHost } from './frameClock.ts'
import type { Envelope, Request } from '../worker/protocol.ts'
import { readDarkAppearance } from '../../app/appearance.ts'

export class WebGPUClient {
  private transport?: {
    postMessage: (data: Envelope, transfer?: Transferable[]) => void
    terminate: () => void
  }
  private local?: ReturnType<typeof import('./renderer.ts').createWebGPURenderer>
  get documentOwned() {
    return !!this.local
  }
  private nextId = 0
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      at: number
      operation: string
    }
  >()
  private presentationAllowed: boolean | undefined
  /** Does not wait for the renderer queue, so a stalled request remains diagnosable. */
  status() {
    return {
      execution: this.documentOwned ? 'document' : 'worker',
      presentationAllowed: this.presentationAllowed,
      failed: this.failed?.message,
      pending: [...this.pending].map(([id, request]) => ({
        id,
        operation: request.operation,
        ageMs: glassNow() - request.at,
      })),
    }
  }
  private adapterDeadline?: VisibleDeadline
  private failed?: Error
  private startingTransport = false
  private frames = new PageFrameHost()
  private webgpu = false
  private currentAppearance: () => 'dark' | 'light' = () =>
    readDarkAppearance() ? 'dark' : 'light'
  /** Production commits visibility only after remeasuring and replacing sources. */
  deferResume = false
  /** Unsolicited worker events (a region's close morph ended). */
  private eventListeners = new Set<(event: GlassRegionEvent) => void>()
  onEvent(listener: (event: GlassRegionEvent) => void) {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }
  backend: 'webgpu' = 'webgpu'
  private visibility = (event?: Event) => {
    const visible = event?.type !== 'pagehide' && document.visibilityState === 'visible'
    if (visible)
      void this.request({ type: 'retry-adapter' }).catch(() => {
        // The device owner reports an exhausted burst once, with its history.
      })
    if (!visible || !this.deferResume)
      void this.request({ type: 'visible', visible }).catch(error => {
        reportGlassError(glassFailureCode('worker control', error), error, 'worker control')
      })
    if (!visible) this.frames.cancel()
  }
  readonly work: { at: number; ms: number }[] = []

  async init(
    canvas: HTMLCanvasElement,
    resolution: number,
    worker: boolean,
    webgpu = false,
    appearance: () => 'light' | 'dark' = () => (readDarkAppearance() ? 'dark' : 'light'),
    execution: 'worker' | 'document' = 'worker',
  ): Promise<void> {
    installGlassErrorAlert()
    setGlassTimingSink(
      event =>
        recordMotionPreparation(() => ({
          kind: 'webgpu-timing',
          ...event,
          epoch: event.at,
          at: event.at - performance.timeOrigin,
        })),
      motionPreparationEnabled,
    )
    glassTiming('client-start')
    try {
      for (let attempt = 0; ; attempt++) {
        this.startingTransport = true
        try {
          await this.initialize(canvas, resolution, worker, webgpu, appearance, execution)
          break
        } catch (error) {
          const code = glassFailureCode('renderer initialization', error)
          const retryable =
            this.startingTransport &&
            ['worker-startup', 'readiness-timeout', 'device-request'].includes(code)
          if (!retryable || attempt === 2) throw error
          this.close()
          this.failed = undefined
          await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt))
        } finally {
          this.startingTransport = false
        }
      }
    } catch (error) {
      reportGlassError(
        glassFailureCode('renderer initialization', error),
        error,
        'renderer initialization',
      )
      throw error
    }
  }
  private async initialize(
    canvas: HTMLCanvasElement,
    resolution: number,
    worker: boolean,
    webgpu: boolean,
    appearance: () => 'light' | 'dark',
    execution: 'worker' | 'document',
  ): Promise<void> {
    this.currentAppearance = appearance
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
    this.webgpu = webgpu
    if (worker) {
      const receive = (event: MessageEvent) => {
        if (this.frames.receive(event.data, data => this.transport!.postMessage(data))) return
        const {
          id,
          value,
          error,
          glassError,
          glassProfile,
          glassFrames,
          glassEvent,
          appearanceRefresh,
          appearanceRevision,
        } = event.data
        if (typeof event.data.adapterRecovery === 'boolean') {
          const pending = event.data.adapterRecovery
          setGlassAdapterRecovery(pending)
          if (pending && !this.adapterDeadline) {
            // Settled regions may have cancelled their own deadlines before loss.
            // Retain one budget through duplicate loss signals and hidden time.
            this.adapterDeadline = new VisibleDeadline(GLASS_READINESS_BUDGET_MS, () => {
              reportGlassError(
                'readiness-timeout',
                'Glass device was not reconstructed within 10 s of visible time',
                'device recovery',
              )
            })
            this.adapterDeadline.start()
          } else if (!pending) {
            this.adapterDeadline?.cancel()
            this.adapterDeadline = undefined
          }
          return
        }
        if (appearanceRefresh) {
          void this.request({
            type: 'canonical',
            appearanceRevision,
            request: {
              type: 'appearance',
              value: appearance(),
              reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            },
          }).catch(error => {
            reportGlassError(
              glassFailureCode('appearance restoration', error),
              error,
              'appearance restoration',
            )
          })
          return
        }
        if (glassEvent) {
          if (glassEvent.type === 'presentation-gate') this.presentationAllowed = glassEvent.allowed
          for (const listener of this.eventListeners) listener(glassEvent)
          return
        }
        if (glassFrames) {
          receiveGlassFrames(glassFrames)
          recordMotionPreparation(() => ({
            kind: 'webgpu-frames',
            at: performance.now(),
            summaries: glassFrames,
          }))
          return
        }
        if (glassProfile) {
          receiveGlassTiming(glassProfile)
          recordMotionPreparation(() => ({
            kind: 'webgpu-timing',
            ...glassProfile,
            epoch: glassProfile.at,
            at: glassProfile.at - performance.timeOrigin,
          }))
          return
        }
        if (glassError) {
          reportGlassError(
            glassError.code,
            glassError.message,
            glassError.stage,
            glassError.reason,
            this.startingTransport ? { recovering: true } : undefined,
          )
          return
        }
        const request = this.pending.get(id)
        this.pending.delete(id)
        if (error) request?.reject(new Error(error))
        else request?.resolve(value)
      }
      glassTiming(execution === 'document' ? 'renderer-create' : 'worker-create')
      if (execution === 'document') {
        const { createWebGPURenderer } = await import('./renderer.ts')
        const renderer = createWebGPURenderer(data =>
          queueMicrotask(() => receive(new MessageEvent('message', { data }))),
        )
        this.local = renderer
        this.transport = {
          postMessage: data => renderer.receive({ data } as MessageEvent<Envelope>),
          terminate: () => renderer.stop(),
        }
      } else {
        let transport: Worker
        try {
          transport = new Worker(new URL('./entry.worker.ts', import.meta.url), {
            type: 'module',
            name: 'satin-glass-webgpu',
          })
        } catch (error) {
          throw new Error(`Worker startup: ${String(error)}`, { cause: error })
        }
        transport.onmessage = receive
        transport.onerror = event =>
          this.failTransport(
            new Error(`Worker startup/runtime: ${event.message || 'Glass worker failed'}`),
            'worker startup/runtime',
          )
        transport.onmessageerror = () =>
          this.failTransport(
            Error('Glass worker message could not be deserialized'),
            'worker transport',
          )
        this.transport = {
          postMessage: (data, transfer = []) => transport.postMessage(data, transfer),
          terminate: () => transport.terminate(),
        }
      }
      // The transport is page-lived, including while release fallback is presented.
      // Keep availability signals bound when presentation is parked.
      document.addEventListener('visibilitychange', this.adapterVisibility, true)
      window.addEventListener('pagehide', this.adapterVisibility, true)
      window.addEventListener('pageshow', this.adapterVisibility)
      window.addEventListener('focus', this.adapterVisibility)
      if (webgpu) {
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
          // init owns the bounded startup retry and terminal report.
          this.transport?.terminate()
          for (const pending of this.pending.values()) pending.reject(this.failed)
          this.pending.clear()
          throw this.failed
        } finally {
          clearTimeout(timeout)
        }
      }
      this.startingTransport = false
      const offscreen = this.local ? canvas : canvas.transferControlToOffscreen()
      await this.request(
        {
          type: 'init',
          canvas: offscreen,
          resolution,
          appearance: appearance(),
          presentationLeadMs: Number(
            document.documentElement.getAttribute('data-satin-experimental-glass-lead-ms') ?? 0,
          ),
        },
        this.local ? [] : [offscreen as OffscreenCanvas],
      )
    } else {
      throw Error('WebGPU requires an owned renderer transport')
    }
    this.bindLifecycle()
  }
  private failTransport(error: Error, stage: string) {
    this.adapterDeadline?.cancel()
    this.failed = error
    if (!this.startingTransport) reportGlassError(glassFailureCode(stage, error), error, stage)
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
  async attachLayer(canvas: HTMLCanvasElement, layer: GlassLayer) {
    if (!this.webgpu) throw Error('Additional presentation canvases require WebGPU')
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
    const offscreen = this.local ? canvas : canvas.transferControlToOffscreen()
    return this.request(
      { type: 'attach-layer', layer, canvas: offscreen },
      this.local ? [] : [offscreen as OffscreenCanvas],
    )
  }
  request(
    request: Request,
    transfer: Transferable[] = [],
    admitted?: () => void,
  ): Promise<unknown> {
    if (this.failed) return Promise.reject(this.failed)
    if (request.type === 'visible' && request.visible) {
      // Read at dispatch, after the appearance store's visibility handler. Never
      // infer a resume material from the hidden-time media query or worker state.
      request = {
        ...request,
        appearance: this.currentAppearance(),
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      }
    }
    const id = ++this.nextId,
      at = glassNow()
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        at,
        operation:
          request.type === 'canonical' ? `canonical:${request.request.type}` : request.type,
        resolve: value => {
          glassTiming('rpc', at, () =>
            request.type === 'canonical' ? 'canonical:' + request.request.type : request.type,
          )
          resolve(value)
        },
        reject: error => {
          glassTiming('rpc', at, request.type, error)
          reject(error)
        },
      })
      try {
        this.transport!.postMessage({ id, request, postedAt: glassNow() }, transfer)
        admitted?.()
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
    this.transport!.postMessage({ id: 0, request })
    this.work.push({ at, ms: performance.now() - start })
    if (this.work.length > 2400) this.work.shift()
  }
  private adapterVisibility = (event: Event) => {
    if (this.failed) return
    const visible = event.type !== 'pagehide' && document.visibilityState === 'visible'
    this.adapterDeadline?.setVisible(visible)
    void this.request({ type: 'adapter-visibility', visible }).catch(() => {
      // Transport failures already enter the terminal diagnostic channel.
    })
  }
  private focus = () => {
    if (document.visibilityState === 'visible')
      void this.request({ type: 'retry-adapter' }).catch(() => {
        // The device owner reports terminal acquisition failures.
      })
  }
  private bindLifecycle() {
    // Capture hide before the appearance store's bubble listener can publish.
    document.addEventListener('visibilitychange', this.visibility, true)
    window.addEventListener('pagehide', this.visibility, true)
    window.addEventListener('pageshow', this.visibility)
    window.addEventListener('focus', this.focus)
  }
  resume() {
    this.bindLifecycle()
    this.visibility()
  }
  /** Dispose a failed transport before constructing its replacement. */
  close() {
    this.frames.cancel()
    this.adapterDeadline?.cancel()
    this.adapterDeadline = undefined
    document.removeEventListener('visibilitychange', this.visibility, true)
    window.removeEventListener('pagehide', this.visibility, true)
    window.removeEventListener('pageshow', this.visibility)
    window.removeEventListener('focus', this.focus)
    document.removeEventListener('visibilitychange', this.adapterVisibility, true)
    window.removeEventListener('pagehide', this.adapterVisibility, true)
    window.removeEventListener('pageshow', this.adapterVisibility)
    window.removeEventListener('focus', this.adapterVisibility)
    this.transport?.terminate()
    this.transport = undefined
    this.local = undefined
    for (const pending of this.pending.values()) pending.reject(Error('Glass transport retired'))
    this.pending.clear()
  }
  park() {
    this.frames.cancel()
    document.removeEventListener('visibilitychange', this.visibility, true)
    window.removeEventListener('pagehide', this.visibility, true)
    window.removeEventListener('pageshow', this.visibility)
    window.removeEventListener('focus', this.focus)
    return this.request({ type: 'visible', visible: false })
    // Preserve the page-lifetime worker and device.
  }
}
