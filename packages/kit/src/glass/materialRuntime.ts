import { glassFailureCode } from './webgpu/errorCode.ts'
import { ProductionGlassRuntime } from './webgpu/production.ts'
import type { FallbackGlassRuntime } from './fallback/runtime.ts'
import type { RuntimeOptions } from './renderSpecs.ts'
import {
  completeGlassFallbackRecovery,
  reportGlassError,
  glassFallbackRequired,
  subscribeGlassFallback,
  watchGlassTransportRecovery,
} from './errors.ts'
import { GLASS_READINESS_BUDGET_MS, VisibleDeadline } from './visibleDeadline.ts'
import { recordGraphicsEvent } from '../graphicsProbe.ts'

type Runtime = ProductionGlassRuntime | FallbackGlassRuntime
let ownerSequence = 0

/** One live material owner. Replacement preparation never owns visible material or input. */
export class GlassMaterialRuntime {
  private active!: Runtime
  private activeOptions!: RuntimeOptions
  private fallback = false
  private disposed = false
  private demoting = false
  private generation = 0
  private revision = 0
  private token = String(++ownerSequence)
  private unsubscribe = () => {}
  private stopRecovery = () => {}
  private cancelRecovery = () => {}
  private options: RuntimeOptions
  private constructor(options: RuntimeOptions) {
    this.options = options
  }
  static async create(options: RuntimeOptions, backend: 'fallback' | 'webgpu') {
    const owner = new GlassMaterialRuntime(options)
    await owner.start(backend)
    return new Proxy({} as Runtime, {
      get: (_target, key) => {
        if (key === 'dispose' || key === 'detach') return () => owner.dispose()
        const value = Reflect.get(owner.active, key)
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => owner.invoke(key, args)
      },
    })
  }
  private async start(backend: 'fallback' | 'webgpu') {
    this.activeOptions = this.options
    if (backend === 'fallback') await this.installFallback()
    else {
      try {
        this.active = await ProductionGlassRuntime.create(this.options)
      } catch (error) {
        if (!glassFallbackRequired())
          reportGlassError(
            glassFailureCode('production glass startup', error),
            error,
            'production glass startup',
          )
        if (!glassFallbackRequired()) throw error
        await this.installFallback()
      }
    }
    this.unsubscribe = subscribeGlassFallback(() => {
      if (glassFallbackRequired() && !this.fallback && !this.demoting) void this.installFallback()
    })
    if (glassFallbackRequired() && !this.fallback) await this.installFallback()
  }
  private mask() {
    document.documentElement.dataset.satinMaterialRecovery = this.token
  }
  private unmask() {
    if (document.documentElement.dataset.satinMaterialRecovery === this.token)
      delete document.documentElement.dataset.satinMaterialRecovery
    if (document.documentElement.dataset.satinMaterialRecoveryShow === this.token)
      delete document.documentElement.dataset.satinMaterialRecoveryShow
  }
  private async installFallback() {
    this.demoting = true
    this.generation++
    this.stopRecovery()
    const previous = this.active
    const previousOptions = this.activeOptions
    const options = this.options
    const { FallbackGlassRuntime } = await import('./fallback/runtime.ts')
    if (this.disposed) return
    // Keep retained GPU pixels until CSS can be attached in this same update.
    previous?.dispose(previousOptions)
    this.mask()
    const material = await FallbackGlassRuntime.create(options)
    if (this.disposed) {
      material.dispose()
      return
    }
    this.active = material
    this.activeOptions = options
    this.fallback = true
    this.demoting = false
    if (glassFallbackRequired())
      this.stopRecovery = watchGlassTransportRecovery(() => this.recover())
  }
  private async recover() {
    if (this.disposed || !this.fallback) return false
    const generation = ++this.generation
    const revision = this.revision
    const current = () =>
      !this.disposed &&
      this.fallback &&
      this.generation === generation &&
      this.revision === revision &&
      this.options.elements.contentHost.isConnected &&
      document.visibilityState === 'visible'
    let candidate: ProductionGlassRuntime | undefined
    let promoted = false
    let accept!: () => void
    let reject!: (error: unknown) => void
    const presented = new Promise<void>((resolve, fail) => {
      accept = resolve
      reject = fail
    })
    // Attach the rejection handler before creation can synchronously report an error.
    const deadline = new VisibleDeadline(GLASS_READINESS_BUDGET_MS, () =>
      reject(Error('Glass recovery presentation timed out')),
    )
    const options: RuntimeOptions = {
      ...this.options,
      recovery: true,
      onPresented: ready => {
        if (promoted) this.options.onPresented?.(ready)
        else if (ready) accept()
      },
      onSourceReady: source => {
        if (promoted) this.options.onSourceReady?.(source)
      },
      onPresentationError: (error, rebuilding) => {
        if (promoted) this.options.onPresentationError?.(error, rebuilding)
        else if (!rebuilding) reject(error)
      },
      onTabActivated: index => {
        if (promoted) this.options.onTabActivated?.(index)
      },
      onTabSelected: index => {
        if (promoted) this.options.onTabSelected?.(index)
      },
    }
    recordGraphicsEvent('glass-recovery', {
      phase: 'attempt',
      host: this.options.elements.contentHost.dataset.satinScreen,
    })
    this.cancelRecovery = () => reject(Error('Glass recovery owner disposed'))
    deadline.start()
    const creation = ProductionGlassRuntime.create(options).then(runtime => {
      candidate = runtime
      if (!current()) runtime.dispose(options)
      return runtime
    })
    try {
      // create() resolving, adapter acquisition, and CSS presentation cannot satisfy this receipt.
      await Promise.all([creation, presented])
      if (!current()) return false
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (!current() || !candidate) return false
      // Give the submitted GPU layers one rendering opportunity while CSS is
      // still mounted. The following update retires CSS without an uncovered frame.
      document.documentElement.dataset.satinMaterialRecoveryShow = this.token
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (!current() || !candidate) {
        if (document.documentElement.dataset.satinMaterialRecoveryShow === this.token)
          delete document.documentElement.dataset.satinMaterialRecoveryShow
        return false
      }
      const material = this.active
      this.active = candidate
      this.activeOptions = options
      promoted = true
      this.fallback = false
      this.stopRecovery()
      // The prior update submitted this host's GPU frame. Expose it and retire CSS
      // synchronously in this rendering update; React never replaces this owner.
      material.dispose()
      candidate.activateRecovery()
      this.unmask()
      completeGlassFallbackRecovery()
      recordGraphicsEvent('glass-recovery', {
        phase: 'presented',
        host: options.elements.contentHost.dataset.satinScreen,
      })
      return true
    } catch {
      recordGraphicsEvent('glass-recovery', { phase: 'failed' })
      return false
    } finally {
      deadline.cancel()
      if (!promoted) {
        this.generation++
        candidate?.dispose(options)
      }
    }
  }
  private invoke(key: PropertyKey, args: unknown[]) {
    const prior = this.options
    if (key === 'updateGeometry')
      this.options = { ...prior, geometry: { ...prior.geometry, ...(args[0] as object) } }
    else if (key === 'setTabSelection')
      this.options = {
        ...prior,
        geometry: { ...prior.geometry, tabBarSelectedIndex: args[0] as number | undefined },
      }
    else if (key === 'commitAppearance' || key === 'setAppearance')
      this.options = { ...prior, appearance: args[0] as RuntimeOptions['appearance'] }
    else if (key === 'retargetContent' || key === 'setContentHost')
      this.options = {
        ...prior,
        elements: {
          ...prior.elements,
          scroller: args[0] as HTMLDivElement,
          contentHost: (args[1] ?? args[0]) as HTMLDivElement,
        },
      }
    if (
      this.options !== prior &&
      (JSON.stringify(prior.geometry) !== JSON.stringify(this.options.geometry) ||
        prior.appearance !== this.options.appearance ||
        prior.elements.contentHost !== this.options.elements.contentHost ||
        prior.elements.scroller !== this.options.elements.scroller)
    )
      this.revision++
    if (['tabPointerDown', 'selectTabAnimated', 'setScroll'].includes(String(key))) this.revision++
    return Reflect.get(this.active, key).apply(this.active, args)
  }
  private dispose() {
    this.disposed = true
    this.generation++
    this.unsubscribe()
    this.stopRecovery()
    this.cancelRecovery()
    this.active?.dispose(this.activeOptions)
    this.unmask()
  }
}
