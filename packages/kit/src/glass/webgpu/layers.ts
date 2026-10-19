/// <reference types="@webgpu/types" />
import { glassDeviceLimits } from './deviceLimits.ts'
import type { GlassCanvas } from '../rendererContract.ts'
import { glassNow, glassTiming, glassTimedAsync } from './profile.ts'
import { lagTraceEnabled } from './lagTrace.ts'
import { gpuScope, registerGPUReporter } from './errors.ts'
import type { GlassLayer } from '../regions.ts'
import type { GlassPresenter } from '../rendererContract.ts'
export type { GlassLayer } from '../regions.ts'
type Layer = {
  model: GlassLayer
  presenter?: GlassPresenter
  canvas: GlassCanvas
  context: GPUCanvasContext
}

/** Page-lifetime device owner. Canvas contexts are cheap presentation endpoints,
 * never a reason to allocate another device. Resources can cross all layers. */
export class LayerDevice {
  private readonly onError: (stage: string, message: string, reason?: string) => void
  private readonly onAdapterRecovery: (pending: boolean) => void
  constructor(
    onError: (stage: string, message: string, reason?: string) => void = (stage, message) =>
      console.error(`[Satin glass: ${stage}] ${message}`),
    onAdapterRecovery: (pending: boolean) => void = () => {},
  ) {
    this.onError = onError
    this.onAdapterRecovery = onAdapterRecovery
  }
  readonly faults: string[] = []
  reportError(stage: string, error: unknown, reason?: string) {
    const message = error instanceof Error ? error.message : String(error)
    this.rememberError(`${stage}: ${message}`)
    this.onError(stage, message, reason)
  }
  private rememberError(message: string) {
    this.errors.push(message)
    if (this.errors.length > 100) this.errors.shift()
  }
  private device?: GPUDevice
  private starting?: Promise<GPUDevice>
  private layers = new Map<string, Layer>()
  private attaching = new Set<string>()
  private listeners = new Set<(device: GPUDevice | undefined) => void>()
  private lossTimes: number[] = []
  private retryWake?: () => void
  private adapterVisible = true
  private stopped = false
  private adapterPending = false
  private recovering = false
  private recoveryBlockedUntil = 0
  private recoveryTimer?: ReturnType<typeof setTimeout>
  private recoveryFailures = 0
  private forcedNullAdapters = 0
  private lastLoss?: { reason: string; message: string }
  readonly stats = {
    deviceRequests: 0,
    deviceLosses: 0,
    restores: 0,
    canvasContexts: 0,
    nullAdapters: 0,
    forcedNullAdapters: 0,
  }
  readonly errors: string[] = []
  readonly format: GPUTextureFormat = 'rgba8unorm'
  get liveDevice() {
    return this.device
  }
  subscribe(listener: (device: GPUDevice | undefined) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  async ready(): Promise<GPUDevice> {
    if (this.device) return this.device
    if (Date.now() < this.recoveryBlockedUntil) {
      this.scheduleRecovery()
      throw Error('Glass device recovery is cooling down')
    }
    if (this.starting) return this.starting
    this.starting = this.acquire()
    try {
      return await this.starting
    } catch (error) {
      const failedDevice = this.liveDevice
      this.device = undefined
      if (this.recovering) {
        for (const listener of this.listeners) {
          try {
            listener(undefined)
          } catch {
            /* Keep the original reconstruction failure. */
          }
        }
      }
      failedDevice?.destroy()
      if (!this.stopped) {
        this.reportError(this.recovering ? 'device recreation' : 'device acquisition', error)
        if (this.recovering) {
          this.recoveryFailures++
          this.scheduleRecovery()
        }
      }
      throw error
    } finally {
      this.starting = undefined
    }
  }
  /** Availability follows the document, independently of a parked presentation. */
  setAdapterVisible(visible: boolean) {
    this.adapterVisible = visible
    this.retryWake?.()
    if (!visible) {
      clearTimeout(this.recoveryTimer)
      this.recoveryTimer = undefined
    } else if (this.recovering && !this.starting && !this.device) this.scheduleRecovery()
  }
  stop() {
    this.stopped = true
    clearTimeout(this.recoveryTimer)
    this.retryWake?.()
  }
  /** Foreground signals wake the single acquisition already in flight. */
  retryAdapter() {
    if (this.device || this.stopped || !this.adapterVisible) return
    if (Date.now() < this.recoveryBlockedUntil) {
      this.scheduleRecovery()
      return
    }
    if (this.starting) {
      this.retryWake?.()
      return
    }
    return this.ready()
  }
  private scheduleRecovery() {
    if (this.stopped || !this.adapterVisible || this.recoveryTimer) return
    const delay = Math.max(
      this.recoveryBlockedUntil - Date.now(),
      Math.min(1000 * 2 ** this.recoveryFailures, 30_000),
    )
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined
      void this.retryAdapter()?.catch(() => {
        /* ready records and schedules the next attempt. */
      })
    }, delay)
  }
  private async waitUntilVisible() {
    while (!this.adapterVisible && !this.stopped) {
      await new Promise<void>(resolve => {
        this.retryWake = resolve
      })
      this.retryWake = undefined
    }
    if (this.stopped) throw Error('Glass renderer stopped during adapter acquisition')
  }
  forceNullAdaptersForTest(attempts: number) {
    if (!Number.isInteger(attempts) || attempts < 0 || attempts > 100)
      throw Error('Null-adapter attempts must be an integer between 0 and 100')
    this.forcedNullAdapters = attempts
  }
  private async requestAdapter(): Promise<GPUAdapter> {
    // Startup retains its bounded capability probe. A lost device keeps retrying:
    // presentation deadlines report a real outage without abandoning reconstruction.
    const delays = [100, 250, 500, 1000]
    for (let attempt = 0; this.recovering || attempt <= delays.length; attempt++) {
      while (!this.adapterVisible && !this.stopped) {
        await new Promise<void>(resolve => {
          this.retryWake = resolve
        })
        this.retryWake = undefined
      }
      if (this.stopped) throw Error('Glass renderer stopped during adapter acquisition')
      const adapter = await glassTimedAsync('requestAdapter', () => {
        if (this.forcedNullAdapters > 0) {
          this.forcedNullAdapters--
          this.stats.forcedNullAdapters++
          return Promise.resolve(null)
        }
        return navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      }).catch(error => {
        throw Error(`requestAdapter rejected: ${String(error)}`)
      })
      if (adapter) return adapter
      this.stats.nullAdapters++
      if (lagTraceEnabled()) glassTiming('adapter-null', glassNow(), String(attempt + 1))
      // Transient failures stay in diagnostic history. Only an exhausted burst
      // reaches the terminal error channel and its user-visible alert.
      this.rememberError('device acquisition: navigator.gpu.requestAdapter returned null')
      if (!this.recovering && attempt === delays.length) break
      await new Promise<void>(resolve => {
        const finish = () => {
          clearTimeout(timer)
          this.retryWake = undefined
          resolve()
        }
        const timer = setTimeout(finish, delays[Math.min(attempt, delays.length - 1)])
        this.retryWake = finish
      })
    }
    throw Error('navigator.gpu.requestAdapter returned null after five attempts')
  }
  private async acquire() {
    if (!navigator.gpu) throw Error('navigator.gpu is unavailable in the glass renderer')
    const adapter = await this.requestAdapter()
    const requiredFeatures: GPUFeatureName[] = adapter.features?.has('timestamp-query')
      ? ['timestamp-query']
      : []
    const requiredLimits = glassDeviceLimits(adapter)
    this.stats.deviceRequests++
    const device = await glassTimedAsync('requestDevice', () =>
      adapter.requestDevice({
        requiredFeatures,
        requiredLimits,
      }),
    ).catch(error => {
      // Only a platform capability rejection permits development fallback. Validation,
      // allocation, shader and transport failures must remain loud on capable devices.
      const unsupportedFeature = error instanceof TypeError && requiredFeatures.length > 0
      const unsupportedLimit =
        error instanceof DOMException &&
        error.name === 'OperationError' &&
        Object.keys(requiredLimits).some(limit => error.message.includes(limit))
      if (
        unsupportedFeature ||
        unsupportedLimit ||
        (error instanceof DOMException && error.name === 'NotSupportedError')
      )
        throw Error(
          `GlassCapabilityUnavailable: required WebGPU features or limits: ${String(error)}`,
        )
      throw Error(`requestDevice rejected: ${String(error)}`)
    })
    // requestDevice may resolve after a quick re-background. Do not rebuild or
    // announce readiness against a suspended presentation generation.
    try {
      await this.waitUntilVisible()
    } catch (error) {
      device.destroy()
      throw error
    }
    this.device = device
    this.faults.length = 0
    registerGPUReporter(device, (stage, error) => {
      if (this.device !== device) return
      this.faults.push(`${stage}: ${String(error)}`)
      this.reportError(stage, error)
    })
    device.addEventListener('uncapturederror', event => {
      if (this.device !== device) return
      this.reportError('uncapturederror', `${event.error.constructor.name}: ${event.error.message}`)
    })
    for (const layer of this.layers.values()) this.configure(layer, device)
    void device.lost.then(async info => {
      if (this.device !== device) return
      if (lagTraceEnabled()) glassTiming('device-lost', glassNow(), info.reason)
      this.device = undefined
      this.stats.deviceLosses++
      this.lastLoss = { reason: info.reason, message: info.message }
      const now = Date.now()
      this.lossTimes = this.lossTimes.filter(at => now - at < 60_000)
      this.lossTimes.push(now)
      this.recovering = true
      this.adapterPending = true
      this.onAdapterRecovery(true)
      let invalidationError: unknown
      for (const listener of this.listeners) {
        try {
          listener(undefined)
        } catch (error) {
          invalidationError ??= error
        }
      }
      if (invalidationError) {
        this.reportError('device recreation', invalidationError)
        this.scheduleRecovery()
        return
      }
      // WebKit can report destroyed for an unexpected loss as well.
      if (this.lossTimes.length > 3) {
        this.recoveryBlockedUntil = this.lossTimes[0]! + 60_000
        this.scheduleRecovery()
        this.reportError('device recreation', 'Glass device repeatedly lost during recovery')
        return
      }
      // Initial acquisition must settle before requesting its replacement.
      await this.starting
      void this.ready().catch(() => {
        /* ready records the terminal failure. */
      })
    })
    if (this.recovering) {
      // Every canvas is configured above; graph, raster and region subscribers
      // reconstruct in registration order before presentation can resume.
      for (const listener of this.listeners) listener(device)
      this.stats.restores++
      this.recoveryFailures = 0
      clearTimeout(this.recoveryTimer)
      this.recoveryTimer = undefined
      this.recovering = false
      if (lagTraceEnabled()) glassTiming('device-restored')
    }
    if (this.adapterPending) {
      this.adapterPending = false
      this.onAdapterRecovery(false)
    }
    return device
  }
  private configure(layer: Layer, device: GPUDevice) {
    gpuScope(device, `configure canvas ${layer.model.id}`, () =>
      layer.context.configure({
        device,
        format: this.format,
        alphaMode: 'premultiplied',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      }),
    )
  }
  async attach(model: GlassLayer, canvas: GlassCanvas, presenter?: GlassPresenter) {
    const id = presenter?.id ?? model.id
    if (presenter && presenter.layerId !== model.id)
      throw Error('Presenter does not belong to its glass layer')
    if (this.layers.has(id) || this.attaching.has(id))
      throw Error(`Glass presenter ${id} already attached`)
    if (
      !model.id ||
      !Number.isFinite(model.depth) ||
      (model.attachment.kind === 'scroll' && !model.attachment.scrollId)
    )
      throw Error('Invalid glass layer')
    this.attaching.add(id)
    try {
      const device = await this.ready()
      for (const existing of this.layers.values())
        if (
          existing.model.id === model.id &&
          JSON.stringify(existing.model) !== JSON.stringify(model)
        )
          throw Error('Conflicting glass layer definition')
      const context = canvas.getContext('webgpu')
      if (!context) throw Error('Offscreen WebGPU context unavailable')
      const layer = { model, presenter, canvas, context }
      this.layers.set(id, layer)
      this.stats.canvasContexts++
      this.configure(layer, device)
      return context
    } finally {
      this.attaching.delete(id)
    }
  }
  detach(id: string) {
    const layer = this.layers.get(id)
    if (!layer) return
    layer.context.unconfigure()
    this.layers.delete(id)
  }
  loseForTest() {
    this.device?.destroy()
  }
  report() {
    return {
      ...this.stats,
      adapterRecoveryPending: this.adapterPending,
      adapterVisible: this.adapterVisible,
      lastLoss: this.lastLoss,
      activeCanvases: this.layers.size,
      presentationBackingBytes: [...this.layers.values()].reduce(
        (n, l) => n + l.canvas.width * l.canvas.height * 4,
        0,
      ),
      layers: [...new Map([...this.layers.values()].map(l => [l.model.id, l.model])).values()],
      presenters: [...this.layers.entries()].map(
        ([id, l]) => l.presenter ?? { id, layerId: l.model.id },
      ),
      errors: [...this.errors],
    }
  }
}
