import { PadSearchBarMotion } from '../../search/padSearchBarMotion.ts'
import { getGlassErrors } from '../errors.ts'
import {
  createRenderSpecs,
  type RuntimeOptions,
  type RuntimeGeometry,
  type SurfaceRenderSpec,
  type LensMode,
} from '../renderSpecs.ts'
import { TabMotion, TAB_INTERACTIVE_MOTION } from '../lens/tabMotion.ts'
import { TabMinimizeIntent } from '../lens/tabMinimizeMotion.ts'
import type { RestorePath } from '../lens/tabRestoreMotion.ts'
import type { ScreenId } from '../lens/Scene.tsx'
import { tabHeldGeometry } from '../webgpu/interactionProfiles.ts'
import { WorkerMinimize } from '../webgpu/minimize.ts'
import { FallbackMaterial } from './material.ts'
import { FallbackRegions } from './regions.ts'
import { FallbackCanvasOwnership } from './canvasOwnership.ts'

/** Material replacement only: semantic controls and measured motion keep their existing owners. */
export class FallbackGlassRuntime {
  private canvases = new FallbackCanvasOwnership()
  private regions: FallbackRegions
  private dock: FallbackMaterial
  private thumb: FallbackMaterial
  private padSearch?: PadSearchBarMotion
  private minimize = new TabMinimizeIntent()
  private minimizeDom: WorkerMinimize
  private tab = new TabMotion(TAB_INTERACTIVE_MOTION)
  private unsubscribeAppearance?: () => void
  private tabFrame = 0
  private tabPressed = false
  private pointer?: number
  private disposed = false
  private options: RuntimeOptions
  private constructor(options: RuntimeOptions) {
    this.options = options
    Object.assign(globalThis, {
      __SATIN_GLASS_RENDERER__: { backend: 'fallback', errors: getGlassErrors },
    })
    const band = options.elements.band
    const shell = band.canvas.closest('[data-satin-liquid]')
    this.canvases.update([
      band.canvas,
      band.rimCanvas,
      ...(shell?.querySelectorAll<HTMLCanvasElement>(
        'canvas[data-satin-webgpu],canvas[data-satin-glass-lift]',
      ) ?? []),
    ])
    this.regions = new FallbackRegions(options.regions, options.appearance)
    this.dock = new FallbackMaterial(options.elements.chrome.dock)
    this.thumb = new FallbackMaterial(options.elements.chrome.dock)
    this.dock.element.style.zIndex = '-2'
    this.thumb.element.style.zIndex = '-1'
    this.minimizeDom = new WorkerMinimize(
      options,
      path => this.restoreMinimizingTabBar(path),
      {
        begin: x => this.tabPointerDown(x, this.options.geometry.tabBarSelectedIndex ?? 0),
        move: x => this.tabPointerMove(x),
        end: cancelled => this.tabPointerUp(cancelled),
      },
      track => this.playMinimizeTrack(track),
    )
    this.bindScroll()
    this.unsubscribeAppearance = options.subscribeAppearance?.(() =>
      this.commitAppearance(options.currentAppearance?.() ?? options.appearance),
    )
    this.updateGeometry({})
  }
  static async create(options: RuntimeOptions) {
    const runtime = new FallbackGlassRuntime(options)
    await document.fonts.ready
    // Let committed CSS material reach a rendering opportunity before releasing the launch cover.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    if (!runtime.disposed) {
      options.onSourceReady?.(options.elements.contentHost)
      options.onPresented?.(true)
    }
    return runtime
  }
  private bindScroll() {
    const host = this.options.elements.scroller
    host.addEventListener('scroll', this.scroll, { passive: true })
    host.addEventListener('pointerdown', this.begin, { passive: true })
    host.addEventListener('scrollend', this.endScroll)
    document.addEventListener('pointerup', this.endContact, true)
  }
  private unbindScroll() {
    const host = this.options.elements.scroller
    host.removeEventListener('scroll', this.scroll)
    host.removeEventListener('pointerdown', this.begin)
    host.removeEventListener('scrollend', this.endScroll)
    document.removeEventListener('pointerup', this.endContact, true)
  }
  private begin = (event: PointerEvent) => {
    this.pointer = event.pointerId
    this.minimize.beginGesture(this.options.elements.scroller.scrollTop)
  }
  private endContact = (event: PointerEvent) => {
    if (event.pointerId !== this.pointer) return
    this.pointer = undefined
    this.minimize.endContact(this.options.elements.scroller.scrollTop)
  }
  private endScroll = () => this.minimize.endGesture()
  private scroll = () => {
    const host = this.options.elements.scroller
    const direction = this.minimize.observe(
      host.scrollTop,
      host.scrollHeight - host.clientHeight,
      this.options.geometry.tabBarPlacement,
    )
    if (direction) this.minimizeTrack(direction)
  }
  private dockSpec() {
    const spec = createRenderSpecs(this.options.geometry, this.options.appearance).find(
      spec => spec.id === 'dock',
    )!
    // Chrome's DOM host already owns the viewport placement.
    return { ...spec, opacity: 1, frameX: 0, frameY: 0 }
  }
  private minimizeTrack(direction: 'collapse' | 'restore', path: RestorePath = 'tap') {
    const track = this.minimizeDom.start(direction, this.dockSpec(), path)
    this.playMinimizeTrack(track)
  }
  private playMinimizeTrack(track: { specs: SurfaceRenderSpec[]; duration: number; at: number }) {
    void this.dock.play(track.specs, track.duration, track.at, this.options.appearance)
    void this.thumb.play(
      track.specs.map(spec => this.thumbSpec(spec)),
      track.duration,
      track.at,
      this.options.appearance,
    )
  }
  restoreMinimizingTabBar(path: RestorePath = 'tap') {
    if (!this.minimize.compact) return false
    this.minimize.restore(this.options.elements.scroller.scrollTop)
    this.minimizeTrack('restore', path)
    return true
  }
  private thumbSpec(spec: SurfaceRenderSpec): SurfaceRenderSpec {
    const capsule = spec.tabSelection?.capsule ?? spec.shape.first
    return {
      ...spec,
      opacity: spec.tabSelection?.materialMix ?? 0,
      shape: { ...spec.shape, first: capsule, members: undefined, second: undefined },
      variant: 'clear',
      tint: [1, 1, 1, this.options.appearance === 'dark' ? 0.12 : 0.32],
    }
  }
  private paintTabs() {
    const spec = this.minimizeDom.current(this.dockSpec())
    this.dock.element.hidden = this.options.geometry.tabBarSelectedIndex === undefined
    this.thumb.element.hidden = this.dock.element.hidden
    this.dock.paint(spec, this.options.appearance)
    const selection =
      !this.minimizeDom.inkTransformed && spec.tabSelection
        ? { ...spec, tabSelection: { ...spec.tabSelection, capsule: this.tab.capsule() } }
        : spec
    this.thumb.paint(this.thumbSpec(selection), this.options.appearance)
  }
  updateGeometry(next: Partial<RuntimeGeometry>) {
    const previousOpacity = this.options.geometry.tabBarOpacity
    const previousPlacement = this.options.geometry.tabBarPlacement
    this.options = { ...this.options, geometry: { ...this.options.geometry, ...next } }
    const geometry = this.options.geometry
    if (previousPlacement === 'top' && geometry.tabBarOpacity !== undefined && previousOpacity !== geometry.tabBarOpacity) {
      (this.padSearch ??= new PadSearchBarMotion()).start(this.options.elements.chrome.dock, 1 - geometry.tabBarOpacity, this.dockSpec())
    }
    this.tab.configure(
      geometry.tabBarCentres,
      geometry.tabBarPillWidth,
      geometry.tabBarPillHeight,
      geometry.dockWidth,
      {
        selected: geometry.tabBarSelectedIndex ?? 0,
        centerY: geometry.tabBarPillCenterY,
        parameters: TAB_INTERACTIVE_MOTION,
        heldGeometry: tabHeldGeometry(
          geometry.tabBarPillWidth,
          geometry.tabBarPillHeight,
          geometry.dockWidth,
          geometry.tabBarPlacement,
        ),
        widths: geometry.tabBarPillWidths,
      },
    )
    this.minimizeDom.update(this.options)
    if (previousPlacement !== geometry.tabBarPlacement) {
      this.minimize.rebase(this.options.elements.scroller.scrollTop)
      if (geometry.tabBarPlacement === 'top') this.restoreMinimizingTabBar()
    }
    if (!this.minimizeDom.active) this.paintTabs()
  }
  setTabSelection(index: number | undefined) {
    this.updateGeometry({ tabBarSelectedIndex: index })
  }
  private sampleTab(now = performance.now()) {
    this.tab.sample(now, matchMedia('(prefers-reduced-motion: reduce)').matches)
  }
  private scheduleTab() {
    if (this.tabFrame || this.disposed) return
    this.tabFrame = requestAnimationFrame(now => {
      this.tabFrame = 0
      this.sampleTab(now)
      // Sample only the live model. Precomputing a track would advance its position and
      // velocity into the future before the next pointer event could interrupt it.
      if (!this.minimizeDom.inkTransformed) {
        const base = this.dockSpec()
        this.thumb.paint(
          this.thumbSpec({
            ...base,
            tabSelection: { ...base.tabSelection!, capsule: this.tab.capsule() },
          }),
          this.options.appearance,
        )
      }
      if (this.tab.needsFrame) this.scheduleTab()
    })
  }
  private commitTab(index: number) {
    const changed = this.options.geometry.tabBarSelectedIndex !== index
    this.options = {
      ...this.options,
      geometry: { ...this.options.geometry, tabBarSelectedIndex: index },
    }
    this.options.onTabActivated?.(index)
    if (changed) this.options.onTabSelected?.(index)
  }
  selectTabAnimated(index: number) {
    this.sampleTab()
    this.tab.select(index, performance.now())
    this.commitTab(index)
    this.scheduleTab()
  }
  tabPointerDown(x: number, index: number) {
    if (this.tabPressed) return false
    this.sampleTab()
    this.tabPressed = this.tab.down(x, index, performance.now())
    this.scheduleTab()
    return this.tabPressed
  }
  tabPointerMove(x: number) {
    if (!this.tabPressed) return
    this.sampleTab()
    this.tab.move(x)
    this.scheduleTab()
  }
  tabPointerUp(cancelled = false) {
    if (!this.tabPressed) return
    this.sampleTab()
    this.tabPressed = false
    const selected = this.tab.up(
      performance.now(),
      cancelled,
      this.options.geometry.tabBarSelectedIndex ?? 0,
    )
    if (!cancelled && selected !== undefined) this.commitTab(selected)
    this.scheduleTab()
  }
  retargetContent(scroller: HTMLDivElement, contentHost: HTMLDivElement) {
    if (
      scroller === this.options.elements.scroller &&
      contentHost === this.options.elements.contentHost
    )
      return
    this.unbindScroll()
    this.options = {
      ...this.options,
      elements: { ...this.options.elements, scroller, contentHost },
    }
    this.bindScroll()
    this.options.onSourceReady?.(contentHost)
  }
  setContentHost(host: HTMLDivElement) {
    this.retargetContent(host, host)
  }
  setAppearance(appearance: 'light' | 'dark') {
    this.options = { ...this.options, appearance }
    this.regions.setAppearance(appearance)
    this.paintTabs()
  }
  commitAppearance(appearance: 'light' | 'dark') {
    this.setAppearance(appearance)
  }
  setScroll(offset: number) {
    this.options.elements.scroller.scrollTop = offset
  }
  setScreen(_screen: ScreenId) {}
  setBridgeEnabled(_enabled: boolean) {}
  setGlassEnabled(enabled: boolean) {
    if (!enabled) throw Error('Fallback glass cannot be disabled')
  }
  setLensMode(_mode: LensMode) {}
  setMarkers(_enabled: boolean) {}
  setVelocityFadeEnabled(_enabled: boolean) {}
  setDragProgress(_progress: number) {
    throw Error('Use production navigation gestures')
  }
  startLiquidMotion(_repeats?: number, _speed?: number) {
    throw Error('Use production glass regions')
  }
  regionDiagnostics() {
    return undefined
  }
  resetMetrics() {}
  exportFrameTrace(_includeBuffers = true) {
    return { backend: 'fallback', events: [], errors: getGlassErrors() }
  }
  benchmarkRestingMaterials(): Record<string, unknown> {
    throw Error('CSS material needs Web Inspector profiling')
  }
  exportDiagnosticBuffers(): never {
    throw Error('CSS material has no GPU diagnostic buffers')
  }
  detach(owner?: RuntimeOptions) {
    this.dispose(owner)
  }
  dispose(_owner?: RuntimeOptions) {
    this.padSearch?.dispose()
    if (this.disposed) return
    this.disposed = true
    this.unbindScroll()
    cancelAnimationFrame(this.tabFrame)
    this.unsubscribeAppearance?.()
    this.minimizeDom.dispose()
    this.regions.dispose()
    this.canvases.dispose()
    this.dock.dispose()
    this.thumb.dispose()
  }
}
