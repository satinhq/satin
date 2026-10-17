import { SCROLL_INSERTION_MOTION } from '../../scroll/insertionMotion.ts'
import { KEYBOARD_CARRIER_MOTION } from '../../safe-area/keyboardCarrierGeometry.ts'
import { keyboardBackdrop } from './keyboardBackdrop.ts'
import { observeNativeScroll, type NativeScrollSnapshot } from '../../scroll/nativeScroll.ts'
import { GLASS_READINESS_BUDGET_MS, VisibleDeadline } from '../visibleDeadline.ts'
import { searchBackdropScroll } from '../../search/searchBackdrop.ts'
import { SupersededImage } from '../../image/resource.ts'
import { atRest, presentationTravel } from '../presentationFrame.ts'
import { watchPresentationBackdrop } from './presentationBackdrop.ts'
import { backdropExclusions } from './backdropLayers.ts'
import { GLASS_SOURCE_DAMAGE_EVENT } from '../sourceDamage.ts'
import { watchRegionBackdrop } from './regionBackdrop.ts'
import { SourcePixels } from './sourcePixels.ts'
import {
  LENS_REACH_POINTS,
  captureWindowExhausted,
  grownExtent,
  windowCoversScrollport,
  type CaptureWindow,
} from '../captureWindow.ts'
import { glassNow, glassTiming, glassProfile } from './profile.ts'
import { lagMark, lagMarks, lagTraceEnabled, lagTraceRequested, setLagTrace } from './lagTrace.ts'
import type { RegionTrack } from './productionTracks.ts'
import { RegionBridge } from './regionBridge.ts'
import { glassFailureCode } from './errorCode.ts'
import { onScrollJump } from '../../scroll/scrollJump.ts'
import { KeptGlyphs } from './keptGlyphs.ts'
import { pinnedTopCovers, type PinnedTop } from './productionPinnedTop.ts'
import { ResidentPlanes } from './residentPlanes.ts'
import { REGULAR_TRIGGER_MATERIAL, regularTriggerRegime } from '../regularTriggerMaterial.ts'
import { WebGPUClient } from './client.ts'
import { reportGlassError, getGlassErrors } from '../errors.ts'
import {
  createRenderSpecs,
  type RuntimeOptions,
  type RuntimeGeometry,
  type SurfaceRenderSpec,
  type LensMode,
} from '../renderSpecs.ts'
import type { Appearance } from '../lens/theme.ts'
import type { ScreenId } from '../lens/Scene.tsx'
import { readScrollEdges } from './scrollEdgeBackdrop.ts'
import { sampleMenuMotion } from '../lens/menuMotion.ts'
import type { MenuGestureDecision } from '../../menu/menuGesture.ts'
import { nearestTab } from '../lens/tabMotion.ts'
import {
  observeNavigationGlass,
  type NavigationGlassState,
} from '../../navigation/glassTransition.ts'
import { WorkerMinimize } from './minimize.ts'
import { resumeDebugEnabled, showResumeOverlay, type ResumeReadout } from './resumeOverlay.ts'
import type { RestorePath } from '../lens/tabRestoreMotion.ts'
import { TabMinimizeIntent } from '../lens/tabMinimizeMotion.ts'
import type { WebGPURequest as Request } from '../worker/protocol.ts'
import { MenuSurfaceGuard, type MenuSurfaceStage } from './menuSurfaceGuard.ts'
import {
  TRIGGER_CONTEXT_X,
  TRIGGER_CONTEXT_Y,
  type MaterialContext,
  type PlaneEntry,
  type PlaneWindowHint,
} from './productionPlanes.ts'
import { prepareSources } from './productionPrepare.ts'
import { uncoveredSourceRows } from './captureBands.ts'
import { beneathPresentation, type SampleRect } from './captureDemand.ts'
import { prepareNavigation } from './productionNavigation.ts'
import { placeCanvas, type CanvasViewport } from './productionViewport.ts'

/** Last scroll anywhere in the document (capture listener, installed once). */
const SCROLL_IDLE_MS = 150
/** Visible time a held menu run may wait for its surface to be installed and acknowledged before the missing glass is an error. */
const MENU_SURFACE_BUDGET_MS = 10000
/** A navigator transition (any layout, including split panes), a presentation in motion
 * (entrance, drag, release) or the bottom inset chain following the keyboard. Backdrop captures are deferred until it settles: a capture of a
 * moving scene is stale by the time it uploads, and it would run on the main thread in the
 * frames that start the motion. Presented menu morphs use the same policy; a pending
 * menu still needs its initial capture. Glass over motion samples the installed planes. */
const sceneInMotion = (host?: HTMLElement) =>
  !!document.querySelector(
    '[data-satin-transition-active="true"],[data-satin-presentation-moving],[data-satin-keyboard-moving],' +
      '[data-satin-menu-phase="closing"],' +
      '[data-satin-menu-phase="open"][data-satin-menu-rows="glass"]',
  ) || !!host?.hasAttribute('data-satin-search-moving')
/** Resident bytes for covered routes' and unselected tabs' captures (image + texture each) and
 * cached material context readbacks. Sized so that a phone keeps the planes of a tab bar's other
 * tabs when one of them is a long list: a grown capture window (1320 x 8192 px, 43 MB, 86 MB
 * resident) and three single-viewport planes (15 MB, 30 MB resident each). With the 80 MB this
 * replaced, a long list's plane was dropped whenever its tab was left, and entering that tab
 * again showed its content 1.8 times later than any other tab's (100 ms against 56 ms in the
 * Catalyst host; 59 ms with everything resident). Those planes are 148 MB (149 MB with a list
 * at the canvas ceiling); the rest is for the material contexts they made (2 to 5 MB each, a few
 * per tab): at 160 MB they fitted with 0.4 MB to spare, and once a context was a little larger
 * every return from the list tab recomposed one that had just been evicted. It is a ceiling, not
 * an allocation: an app whose tabs are single viewports keeps about 30 MB per tab. See
 * ResidentPlanes. */
export const RESIDENT_BYTES = 176e6
/** An entry window grows once the scene has been idle this long after its capture: late enough
 * for the tab bar's selection travel (about 520 ms) to have ended. */
const WINDOW_GROW_IDLE_MS = 700
/** A scroll speed older than this is no longer a speed (the scroll has stopped). */
const SCROLL_SPEED_STALE_MS = 120
/** Longest a region refresh waits for a capture of rows its glass newly samples. Past it the scene
 * is sent anyway and the renderer reports the uncovered sample as a GlassError. */
/** Pointers that are down, and since when: a touch may start a scroll, so an entry window does
 * not grow under one. A pointer whose release was never seen stops counting after a while. */
const pointersDown = new Map<number, number>()
const POINTER_HELD_STALE_MS = 15000
if (typeof document !== 'undefined') {
  const release = (event: Event) => pointersDown.delete((event as PointerEvent).pointerId)
  document.addEventListener(
    'pointerdown',
    event => pointersDown.set(event.pointerId, performance.now()),
    { capture: true, passive: true },
  )
  document.addEventListener('pointerup', release, { capture: true, passive: true })
  document.addEventListener('pointercancel', release, { capture: true, passive: true })
}
const pointerHeld = () => {
  const now = performance.now()
  for (const [id, since] of pointersDown) {
    if (now - since < POINTER_HELD_STALE_MS) return true
    pointersDown.delete(id)
  }
  return false
}
/** App-lifetime worker. Reuses the semantic controls and measured geometry.
 *
 * Source preparation (productionPrepare.ts) and navigation glass (productionNavigation.ts) are
 * functions over this runtime; members they use carry no access modifier. None of it is public API. */
export class ProductionGlassRuntime {
  private static shared?: Promise<ProductionGlassRuntime>
  client = new WebGPUClient()
  sourcePixels = new SourcePixels()
  /** A source staging whose upload worker failed (its GPU device was lost, or a reply never came)
   * stays failed. The bounded retry of a preparation replaces it, so glass recovers without a
   * reload: the failed instance rejected its own jobs when it failed and terminated its worker,
   * so nothing of it can reach the replacement. */
  replaceFailedSourcePixels() {
    if (this.sourcePixels.failed) this.sourcePixels = new SourcePixels()
  }
  appRegions: RegionBridge
  options: RuntimeOptions
  canvas: HTMLCanvasElement
  liftCanvas = document.createElement('canvas')
  /** The menu trigger's lift presents on its own small canvas, apart from the dock's band. */
  menuLiftCanvas = document.createElement('canvas')
  /** The menu surface's own canvas, sized to its envelope. On one full-screen chrome canvas with
   * the dock, every glass frame presented a whole-screen drawable, which WebKit commits from the
   * worker slowly enough to block the worker thread (0-27 ms message delays on iPadOS 27 while
   * scrolling: glass at ~40 Hz). Each chrome canvas now covers only what it draws. */
  menuCanvas = document.createElement('canvas')
  /** Installed lift canvas extents, [x,y,w,h] CSS px: a band around each lift, never the full screen. */
  liftViewports = new Map<string, string>()
  liftAttached = false
  specs = new Map<string, SurfaceRenderSpec>()
  context?: MaterialContext
  revision = 0
  private transportRevision = 0
  serial = Promise.resolve()
  attached = true
  private damageFrame = 0
  private pendingDamage = new Map<Node, boolean>()
  private observer?: MutationObserver
  /** Scroll-edge strength/visibility changes (scroll-driven styles, excluded from damage). */
  private edgeObserver?: MutationObserver
  private edgeFrame = 0
  installedEdges = ''
  resize?: ResizeObserver
  private unsubscribeAppearance?: () => void
  private unsubscribe?: () => void
  navigationObserver?: MutationObserver
  navigationInput?: () => void
  navigationFrame = 0
  navigationRevision = 0
  appearanceInstall?: { revision: number; value: Appearance }
  /** Holds the outgoing painted frame until the new tab's complete source/scene is installed. */
  contentInstall?: number
  private prepareFrame = 0
  private menuPointer?: number
  pointer = false
  private pointerX = 0
  private pointerStart = 0
  private pointerIndex = 0
  private minimize = new TabMinimizeIntent()
  minimizeDom?: WorkerMinimize
  navigationRoutes: NavigationGlassState['routes'] = []
  navigationActive = false
  private navigationState?: NavigationGlassState
  private navigationCoveragePreparation?: Promise<void>
  navigationAnimations?: () => void
  navigationRelease?: () => void
  navigationCoverage?: {
    key: string
    width: number
    height: number
    rows: readonly { top: number; bottom: number }[]
  }
  private events: unknown[] = []
  record(event: unknown) {
    this.events.push(event)
    if (this.events.length > 300) this.events.shift()
  }
  regionIds = new Map<string, string>()
  // Source pipeline state. Canvases are reused across revisions: every capture is
  // copied into its ImageBitmap at creation, so reuse never aliases a sent image.
  private sourceCanvas = document.createElement('canvas')
  glyphCanvases = new Map<string, HTMLCanvasElement>()
  atlasCanvas: HTMLCanvasElement | OffscreenCanvas = document.createElement('canvas')
  atlasGlyphs = document.createElement('canvas')
  /** Pixel identity of the capture installed in the worker's `content` slot. */
  installedSource?: { signature: string; key: string; revision: number }
  /** Installed backdrop planes by id: capture signature and worker image key. */
  planes = new Map<string, PlaneEntry>()
  planeIds = new WeakMap<HTMLElement, string>()
  private nextPlane = 0
  /** Each plane's main-thread capture canvas and the signature it currently holds. */
  planeCanvases = new Map<string, { canvas: HTMLCanvasElement; signature?: string }>()
  /** Planes that left the set (a route covered by a push) but stay resident in the worker, so a
   * pop back composes from them: no raster, bitmap, transfer or upload at the end of the pop. */
  resident = new ResidentPlanes<MaterialContext>(RESIDENT_BYTES)
  planeBytes = new Map<string, number>()
  /** Installed planes with DOM damage since their capture (a pending, possibly deferred, preparation):
   * a navigation atlas never copies them from the GPU. */
  damaged = new Set<string>()
  /** The material context is composed here (its read areas are kept by the context). */
  contextCanvas = document.createElement('canvas')
  /** Sample rectangles of every glass surface and region, read once per preparation when first
   * needed: what a plane that does not scroll is captured for (captureDemand.ts). */
  captureDemand: () => readonly SampleRect[] = () => []
  /** Region refreshes waiting for a capture that covers their glass (`coverFor`). */
  private coverageWaiters: (() => void)[] = []
  /** Content changes do not cancel a preparation; its commit only clears damage it captured. */
  damageGenerations = new Map<string, number>()
  /** Include newly discovered planes while their first capture is still in flight. */
  preparingPlaneHosts = new Map<string, HTMLElement>()
  preparingPinnedWindows = new Map<string, CaptureWindow>()
  preparingPlaneWindows = new Map<string, Pick<PlaneEntry, 'host' | 'window' | 'width'>>()
  lastText?: string
  /** Last scroll inside this scene (its planes and scroller), for the scroll-idle capture hold. */
  private lastScrollAt = -Infinity
  private scrolled = () => {
    this.lastScrollAt = performance.now()
  }
  private scrollScopes: HTMLElement[] = []
  coveredSince = 0
  coveredRetry = 0
  private scrollIdle = 0
  /** Scroll listeners of the committed planes (the navigation scroller reports through `scroll`). */
  planeScrolls = new Map<HTMLElement, () => void>()
  scrollerPlane?: string
  /** Plane that holds the navigation source (navigation motion and route atlases apply to it). */
  contentPlane?: string
  planeId(host: HTMLElement) {
    let id = this.planeIds.get(host)
    if (!id) {
      id = `plane-${++this.nextPlane}`
      this.planeIds.set(host, id)
    }
    if (this.preparing) this.preparingPlaneHosts.set(id, host)
    return id
  }
  captureRevision = 0
  /** Loaded fonts change ink even when the computed CSS font and size are unchanged. */
  fontGeneration = 0
  navigationCapture = 0
  navigationGlyphs = 0
  installedNavigation?: { signature: string; key: string }
  private fontsChanged = () => this.damageFontSources()
  private damageFontSources() {
    this.fontGeneration++
    const ids = new Set([
      ...this.planes.keys(),
      ...this.preparingPlaneHosts.keys(),
      ...this.pinnedTops.keys(),
    ])
    for (const id of ids) this.markPlaneDamaged(id)
    this.dropRetained()
    // Ink kept from before the fonts loaded was drawn with the fallback font.
    this.keptGlyphs.reset()
    this.invalidatePinnedTops([...ids])
    this.schedulePrepare()
  }
  /** Forget every retained plane (and cached context) here and in the worker. */
  dropRetained() {
    const keys = this.resident.clear().map(key => `${key}:front`)
    if (keys.length)
      this.fire({
        type: 'source-images',
        revision: this.nextTransport(),
        images: [],
        unretain: keys,
      })
  }
  /** Chrome glyph images installed in the worker's `glyph:<id>` slots. */
  glyphs = new Map<SurfaceRenderSpec['id'], { signature: string; key: string }>()
  glyphRevision = 0
  /** Glyph ink the renderer keeps for reuse after its slot took other ink. */
  keptGlyphs = new KeptGlyphs()
  /** Surfaces whose new ink the last preparation put off by one revision (inkForRevision). */
  deferredInk = new Set<string>()
  /** Each long list's capture of its top, kept while its own window is further down
   * (productionPinnedTop.ts): a jump to the top lands on it. */
  pinnedTops = new Map<string, PinnedTop>()
  /** The image of each installed plane capture that was read back in this document: its bytes
   * are still on the page, so the rows of a window that leaves the top can be kept. */
  planeImages = new Map<string, ImageBitmap>()
  /** Pinned-top slots the renderer may still hold after a failed batch: released by the next. */
  pinnedOrphans = new Set<string>()
  private unsubscribeRegionBackdrop?: () => void
  private unsubscribePresentationBackdrop?: () => void
  private unsubscribeScrollJump?: () => void
  private unsubscribeNativeScroll?: () => void
  /** Everything the last committed preparation sent; equal means nothing to send. */
  preparedSignature = ''
  contextGeometry = ''
  incompleteCaptures = new Map<string, number>()
  private menuTracks = new Map<string, RegionTrack>()
  preparing?: Promise<void>
  prepareAgain = false
  resumePending = false
  lifecycleHidden = false
  resumeAt = 0
  private resumeFrame = 0
  private constructor(options: RuntimeOptions) {
    this.client.deferResume = true
    this.appRegions = new RegionBridge(this.client, options.appearance)
    this.appRegions.coverage = rects => this.coverFor(rects)
    this.options = options
    this.owner = options
    this.canvas = options.elements.band.canvas
    ProductionGlassRuntime.ownMenuShadow(options)
  }
  /** The menu kernel draws the menu's shadow (fitted to native, bounded by the drawable top);
   * the DOM shadow plate would draw a second, larger one. */
  private static ownMenuShadow(options: RuntimeOptions) {
    if (options.elements.menu) options.elements.menu.shadow.hidden = true
  }
  static async create(options: RuntimeOptions): Promise<ProductionGlassRuntime> {
    if (this.shared) {
      const runtime = await this.shared
      if (runtime.client.status().failed) {
        runtime.teardown()
        runtime.client.close()
        this.shared = undefined
        return this.create(options)
      }
      runtime.rebind(options)
      await runtime.prepare()
      return runtime
    }
    this.shared = (async () => {
      const runtime = new ProductionGlassRuntime(options)
      try {
        await runtime.initialize()
        return runtime
      } catch (error) {
        // A rejected create never reaches the React owner's cleanup. Retire its
        // listeners and captures here before a release app mounts CSS material.
        runtime.teardown()
        runtime.client.close()
        this.shared = undefined
        throw error
      }
    })()
    return this.shared
  }
  fail(stage: string, error: unknown, rebuilding = false) {
    const reported = reportGlassError(glassFailureCode(stage, error), error, stage, undefined, {
      recovering: rebuilding,
    })
    if (!reported.transient) this.options.onPresentationError?.(error, rebuilding)
  }
  private send(request: Request, transfer: Transferable[] = []) {
    return this.client.request(request, transfer)
  }
  fire(request: Request) {
    void this.send(request).catch(error => this.fail(request.type, error))
  }
  private async initialize() {
    await this.client.init(
      this.canvas,
      devicePixelRatio,
      true,
      true,
      () => this.options.currentAppearance?.() ?? this.options.appearance,
      // Renderer placement is independent of retained accessory ink. OffscreenCanvas
      // presentation has a separate WebKit cost and must be measured on its own.
      document.documentElement.hasAttribute('data-satin-experimental-glass-worker')
        ? 'worker'
        : 'document',
    )
    if (lagTraceRequested()) {
      setLagTrace(true)
      this.fire({ type: 'lag-trace', enabled: true })
    }
    this.mount()
    await this.client.attachLayer(this.menuCanvas, {
      id: 'menu',
      depth: 1,
      attachment: { kind: 'fixed' },
    })
    await this.client.attachLayer(this.liftCanvas, {
      id: 'chrome-lift',
      depth: 50,
      attachment: { kind: 'fixed' },
    })
    await this.client.attachLayer(this.menuLiftCanvas, {
      id: 'menu-lift',
      depth: 50,
      attachment: { kind: 'fixed' },
    })
    this.liftAttached = true
    this.bind()
    await document.fonts.ready
    await this.prepare()
  }
  private mount() {
    const { band } = this.options.elements
    const geometry = this.options.geometry
    band.rimClip.style.display = 'none'
    band.frame.style.cssText = `position:absolute;left:0;top:0;width:${geometry.width}px;height:${geometry.height}px;pointer-events:none`
    for (const element of [band.clip, band.base, band.track])
      element.style.cssText =
        'position:absolute;inset:0;overflow:visible;clip-path:none;transform:none'
    this.canvas.style.cssText = `position:absolute;left:0;top:0;width:${geometry.width}px;height:${geometry.height}px;pointer-events:none`
    if (!this.client.documentOwned) {
      this.canvas.style.objectFit = 'contain'
      this.canvas.style.objectPosition = 'left bottom'
    }
    this.canvas.dataset.satinWebgpu = 'production'
    // Chrome canvases start as one pixel; each preparation places them on the band their surfaces
    // reach. A remount (geometry change, rebind) keeps the band the worker is drawing for until the
    // next preparation lays it out again: collapsing it here hid the tab bar and menu glass until then
    // (and a preparation waits out any motion in progress).
    const place = (canvas: HTMLCanvasElement, layerId: string) => {
      const viewport = this.liftViewports.get(layerId)
      if (!viewport) return false
      placeCanvas(canvas, JSON.parse(viewport) as CanvasViewport)
      return true
    }
    if (!place(this.canvas, 'chrome')) this.canvas.style.width = this.canvas.style.height = '1px'
    this.menuCanvas.style.cssText =
      'position:absolute;left:0;top:0;width:1px;height:1px;pointer-events:none'
    place(this.menuCanvas, 'menu')
    this.menuCanvas.dataset.satinWebgpu = 'menu'
    this.canvas.after(this.menuCanvas)
    // Lift canvases start empty and full-layer; each preparation places them on the band its lift can reach.
    for (const [canvas, kind] of [
      [this.liftCanvas, 'chrome'],
      [this.menuLiftCanvas, 'menu'],
    ] as const) {
      canvas.style.cssText = `position:absolute;left:0;top:0;width:${geometry.width}px;height:${geometry.height}px;pointer-events:none;z-index:50`
      place(canvas, `${kind}-lift`)
      canvas.dataset.satinGlassLift = kind
      this.canvas.closest('[data-satin-liquid]')?.append(canvas)
    }
    const shell = this.canvas.closest<HTMLElement>('[data-satin-liquid]')
    if (shell) shell.style.visibility = 'visible'
    this.fire({
      type: 'tab-config',
      centres: geometry.tabBarCentres,
      width: geometry.tabBarPillWidth,
      widths: geometry.tabBarPillWidths,
      height: geometry.tabBarPillHeight,
      centerY: geometry.tabBarPillCenterY,
      dockWidth: geometry.dockWidth,
      placement: geometry.tabBarPlacement,
      selected: geometry.tabBarSelectedIndex ?? 0,
      sharedLift: true,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    if (resumeDebugEnabled()) showResumeOverlay()
    ;(globalThis as unknown as { __SATIN_WEBGPU__: unknown }).__SATIN_WEBGPU__ = {
      lensDebug: (view: import('./lensDebug.ts').LensDebugView) =>
        this.client.request({ type: 'lens-debug', view }),
      profile: glassProfile,
      /** Registered DOM regions, for per-frame ownership probes without GPU readback. */
      regions: () =>
        this.options.regions?.values().map(entry => ({
          id: entry.id,
          toolbarSlot: entry.element.dataset.satinToolbarGlass,
          connected: entry.element.isConnected,
        })) ?? [],
      lagTrace: () => lagMarks(),
      /** Diagnostic readback of a layer canvas ({width, height, pixels}, bottom row first). */
      snapshot: (layerId?: string) => this.client.request({ type: 'snapshot', layerId }),
      report: () => this.client.request({ type: 'report' }),
      /** Resume diagnostics: the minimize transaction and accessory run as the page holds
       * them, and the renderer's tracks and presenters (two presenters for one region would
       * draw one canvas alternately). */
      resume: () => this.resumeReadout(),
      loseDeviceForTest: () => this.client.request({ type: 'lose-context' }),
      forceNullAdaptersForTest: (attempts: number) =>
        this.client.request({ type: 'force-null-adapters', attempts }),
      status: () => ({
        ...this.client.status(),
        attached: this.attached,
        appearance: this.options.appearance,
        revision: this.revision,
        appearanceInstall: this.appearanceInstall,
        preparing: !!this.preparing,
        prepareAgain: this.prepareAgain,
        navigationActive: this.navigationActive,
        lifecycleHidden: this.lifecycleHidden,
      }),
      source: (y: number) => this.sourceProbe(y),
      errors: () => getGlassErrors().filter(error => !error.transient),
      events: () => this.events,
      diagnosticStage: (stage: 'source' | 'composed') =>
        this.client.request({ type: 'stage', stage, level: 0 }),
      trigger: () => this.triggerValues(this.options.elements.scroller.scrollTop),
      /** What planes that do not scroll were last captured for (captureDemand.ts). */
      captureDemand: () => ({
        rects: this.captureDemand(),
        planes: [...this.planes].map(([id, entry]) => ({
          id,
          window: entry.window ?? null,
          bands: entry.bands ?? null,
          covered: beneathPresentation(entry.host),
          scrolls: entry.host.scrollHeight > entry.host.clientHeight + 0.5,
          damaged: this.damaged.has(id),
        })),
      }),
      /** Bounded capture diagnostics: each installed plane's window, recentres and outruns. */
      captureWindows: () => ({
        ...this.captureWindows,
        planes: [...this.planes].map(([id, entry]) => ({
          id,
          window: entry.window ?? null,
          height: entry.height,
          pinnedTop: this.pinnedTops.get(id)
            ? {
                bottom: this.pinnedTops.get(id)!.window.bottom,
                stale: this.pinnedTops.get(id)!.stale,
              }
            : null,
        })),
      }),
    }
  }
  private rebind(options: RuntimeOptions) {
    this.teardown()
    this.owner = options
    this.resumePending = true
    options.elements.band.canvas.replaceWith(this.canvas)
    this.options = {
      ...options,
      elements: { ...options.elements, band: { ...options.elements.band, canvas: this.canvas } },
    }
    this.attached = true
    ProductionGlassRuntime.ownMenuShadow(this.options)
    this.mount()
    this.client.resume()
    this.bind()
    // The last region parks the page-lifetime worker. Rebinding is a resume even
    // when the document never hid; use the same retained-frame/appearance path.
    this.handleVisibility()
  }
  private bindAppearance() {
    this.unbindAppearance()
    const synchronize = () => {
      this.setAppearance(this.options.currentAppearance?.() ?? this.options.appearance)
    }
    this.unsubscribeAppearance = this.options.subscribeAppearance?.(synchronize)
    synchronize()
  }
  private unbindAppearance() {
    this.unsubscribeAppearance?.()
    this.unsubscribeAppearance = undefined
  }
  private bind(retained?: WorkerMinimize) {
    this.bindAppearance()
    this.options.elements.menu?.trigger.addEventListener('pointerdown', this.menuDown)
    this.options.elements.menu?.trigger.addEventListener('pointermove', this.menuMove)
    document.addEventListener('pointerup', this.menuUp, true)
    document.addEventListener('pointercancel', this.menuUp, true)
    window.addEventListener('blur', this.menuCancel)
    this.appRegions.bind(this.options.regions, this.options.elements.contentHost)
    window.addEventListener(KEYBOARD_CARRIER_MOTION, this.keyboardGeometry)
    window.addEventListener(SCROLL_INSERTION_MOTION, this.keyboardGeometry)
    this.unsubscribeRegionBackdrop =
      this.options.regions &&
      watchRegionBackdrop(this.options.regions, () => {
        // A held first show is preparation, not motion. Normal scheduling
        // still defers if another screen or presentation is actually moving.
        this.schedulePrepare()
      })
    const host = this.options.elements.scroller
    this.minimizeDom =
      retained ??
      new WorkerMinimize(
        this.options,
        path => this.restoreMinimizingTabBar(path),
        {
          begin: x => {
            this.tabPointerDown(x, this.options.geometry.tabBarSelectedIndex ?? 0)
          },
          move: x => this.tabPointerMove(x),
          end: cancelled => this.tabPointerUp(cancelled),
        },
        track => this.track('dock', track.specs, track.duration, track.at),
      )
    this.unsubscribeNativeScroll = observeNativeScroll(host, snapshot =>
      this.scroll(snapshot.event, snapshot),
    )
    host.addEventListener('satin:search-geometry', this.searchGeometry)
    host.addEventListener('pointerdown', this.begin, { passive: true })
    document.addEventListener('pointerup', this.endContact, true)
    host.addEventListener('scrollend', this.endScrollGesture, { passive: true })
    document.addEventListener('visibilitychange', this.visibility, true)
    window.addEventListener('pagehide', this.visibility, true)
    window.addEventListener('pageshow', this.visibility)
    document.fonts.addEventListener('loadingdone', this.fontsChanged)
    // Every backdrop plane of the scene can hold images (not only the navigation content host):
    // a photo decoding after its plane was captured must recapture it.
    this.loadTarget =
      this.options.elements.contentHost.closest<HTMLElement>('[data-satin-scene-paint-layer]') ??
      this.options.elements.contentHost
    this.loadTarget.addEventListener('load', this.sourceLoaded, true)
    this.loadTarget.addEventListener(GLASS_SOURCE_DAMAGE_EVENT, this.sourceLoaded, true)
    // Class/style/src changes can repaint the source without a childList change; the
    // damage key keeps a no-op mutation to one layout measurement.
    // Every plane of the scene can change, not only the navigation source. Chrome, tab bar
    // and scroll-edge updates (scroll-driven styles) are presentation, never backdrop damage.
    const scene =
      this.options.elements.contentHost.closest<HTMLElement>('[data-satin-scene-paint-layer]') ??
      this.options.elements.contentHost
    this.unsubscribePresentationBackdrop = watchPresentationBackdrop(document.body, () =>
      this.schedulePrepare(),
    )
    const presentation =
      'canvas,[data-satin-navigation-chrome],[data-satin-navigation-edge-host],[data-satin-tab-bar],[data-satin-search],[data-satin-role="chrome"]:not([data-satin-root])'
    const damage = (record: MutationRecord) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement
      return !!target && !target.closest(presentation)
    }
    this.observer = new MutationObserver(records => {
      for (const record of records) {
        if (!damage(record)) continue
        // A removed node has no current box. Conservatively damage its former plane.
        this.queueMutationDamage(record)
      }
    })
    // The launch reveal changes which planes are visible (hidden panes count as visible under a hidden root).
    const root = scene.closest('[data-satin-root]')
    // The keyboard's motion flag is the root's: a preparation deferred during it runs as it ends.
    if (root)
      this.observer.observe(root, {
        attributes: true,
        attributeFilter: ['data-satin-launch', 'data-satin-keyboard-moving'],
      })
    // Motion flags (a navigator's transition, a moving presentation) end with an attribute change:
    // a preparation deferred during that motion runs then.
    this.observer.observe(scene, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'src',
        'hidden',
        'data-satin-covered',
        'data-satin-sidebar-hidden',
        'data-satin-transition-active',
        'data-satin-presentation-moving',
        'data-satin-search-moving',
        'data-satin-search-presented',
      ],
    })
    this.edgeObserver = new MutationObserver(records => {
      if (
        records.some(
          record =>
            (record.target instanceof Element &&
              record.target.matches(
                '[data-satin-scroll-edge],[data-satin-navigation-edge-host]',
              )) ||
            record.type === 'childList',
        )
      )
        this.scheduleEdges(scene)
    })
    this.edgeObserver.observe(scene, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'data-satin-scroll-edge-visible'],
    })
    this.unsubscribeScrollJump = onScrollJump((element, top) =>
      top <= 0 ? this.prepareScrollToTop(element as HTMLElement) : undefined,
    )
    this.resize = new ResizeObserver(() => this.schedulePrepare())
    this.resize.observe(host)
    // Scroll-idle hold: only scrolling inside this scene (its planes, its scroller) defers captures.
    this.scrollScopes = [...new Set([scene, this.options.elements.scroller])]
    for (const scope of this.scrollScopes)
      scope.addEventListener('scroll', this.scrolled, { capture: true, passive: true })
    const navigator =
      host.closest<HTMLElement>('[data-satin-navigator-host]') ??
      host.closest<HTMLElement>('[data-satin-screen-container]')?.parentElement
    if (navigator)
      this.unsubscribe = observeNavigationGlass(navigator, state => {
        // A superseded image means the routes changed under the capture: capture them again.
        const prepare = (): Promise<void> =>
          this.navigation(state).catch(error =>
            error instanceof SupersededImage
              ? prepare()
              : (() => {
                  this.fail('navigation source', error)
                  throw error
                })(),
          )
        return prepare()
      })
  }
  private menuDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || this.navigationActive) return
    this.menuPointer = event.pointerId
    this.fire({
      type: 'surface-input',
      id: 'menu-lift',
      phase: 'pressed',
      at: performance.timeOrigin + performance.now(),
    })
  }
  private menuMove = (event: PointerEvent) => {
    if (this.menuPointer !== event.pointerId) return
    const bounds = this.options.elements.menu?.trigger.getBoundingClientRect()
    if (!bounds) return
    this.fire({
      type: 'surface-input',
      id: 'menu-lift',
      phase: 'dragging',
      at: performance.timeOrigin + performance.now(),
      x: event.clientX - bounds.left,
    })
  }
  private menuUp = (event: PointerEvent) => {
    if (this.menuPointer !== event.pointerId) return
    this.menuPointer = undefined
    this.fire({
      type: 'surface-input',
      id: 'menu-lift',
      phase: event.type === 'pointercancel' ? 'rest' : 'releasing',
      at: performance.timeOrigin + performance.now(),
    })
  }
  menuCancel = () => {
    if (this.menuPointer === undefined) return
    this.menuPointer = undefined
    this.fire({
      type: 'surface-input',
      id: 'menu-lift',
      phase: 'rest',
      at: performance.timeOrigin + performance.now(),
    })
  }
  /** Retiming, reversal and endpoint commit republish the carrier, not a page capture. */
  private keyboardGeometry = () => {
    const layers = [...this.planes].flatMap(([id, entry]) => {
      const keyboard = keyboardBackdrop(entry.host, entry.keyboardAnchor)
      return keyboard
        ? [
            {
              id,
              key: `${entry.key}:front`,
              keyboard,
              scroll: {
                x: entry.host.scrollLeft,
                y: searchBackdropScroll(entry.host, entry.searchAnchor),
              },
            },
          ]
        : []
    })
    if (layers.length) this.fire({ type: 'backdrop-keyboard', layers })
  }
  private searchGeometryWaiting = false
  searchGeometry = (event?: Event) => {
    if (this.searchGeometryWaiting) return
    const sendCurrent = () => {
      if (!this.attached) return
      const id = this.scrollerPlane
      const entry = id ? this.planes.get(id) : undefined
      if (!id || !entry?.searchAnchor) return
      const y = searchBackdropScroll(entry.host, entry.searchAnchor)
      if (!event && y === entry.host.scrollTop) return
      this.fire({ type: 'backdrop-scroll', id, x: entry.host.scrollLeft, y })
    }
    // The drawer moves captured content without a DOM scroll. That changes the rows
    // every stationary glass region samples just as a presenter move does.
    const covering = this.coverFor(() => this.appRegions.sampleRects())
    if (!covering) return sendCurrent()
    this.searchGeometryWaiting = true
    void covering
      .then(() => {
        this.searchGeometryWaiting = false
        sendCurrent()
      })
      .catch(error => {
        this.searchGeometryWaiting = false
        this.fail('search backdrop coverage', error)
      })
  }
  private minimizePointer?: number
  private begin = (event: PointerEvent) => {
    this.minimizePointer = event.pointerId
    this.minimize.beginGesture(this.options.elements.scroller.scrollTop)
  }
  private endContact = (event: PointerEvent) => {
    if (event.pointerId !== this.minimizePointer) return
    this.minimizePointer = undefined
    this.minimize.endContact(this.options.elements.scroller.scrollTop)
  }
  private endScrollGesture = () => {
    this.minimizePointer = undefined
    this.minimize.endGesture()
  }
  /** Lag trace: numbers this scroller's scroll events (the worker reports which one each frame used). */
  private scrollSequence = 0
  private scroll = (event?: Event, snapshot?: NativeScrollSnapshot) => {
    const traced = lagTraceEnabled()
    const started = traced ? glassNow() : 0
    const host = this.options.elements.scroller
    const top = snapshot?.top ?? host.scrollTop
    const left = snapshot?.left ?? host.scrollLeft
    const scrollRange = snapshot
      ? snapshot.contentHeight - snapshot.height
      : host.scrollHeight - host.clientHeight
    if (this.scrollerPlane) this.followWindow(this.scrollerPlane, host)
    const trigger = this.triggerValues(top)
    const triggerDone = traced ? glassNow() : 0
    this.fire({
      type: 'source-scroll',
      y: top,
      trigger,
      layer: this.scrollerPlane,
      x: left,
      ...(traced ? { sequence: ++this.scrollSequence } : {}),
    })
    this.searchGeometry()
    const direction = this.minimize.observe(top, scrollRange, this.options.geometry.tabBarPlacement)
    if (direction) this.minimizeTrack(direction)
    if (traced)
      lagMark({
        stage: 'scroll-event',
        at: started,
        ms: glassNow() - started,
        sequence: this.scrollSequence,
        values: {
          eventAt: event ? performance.timeOrigin + event.timeStamp : null,
          y: top,
          triggerMs: triggerDone - started,
          minimize: direction ?? null,
        },
      })
  }
  /** Each plane host's last scroll offset, when it was read and the speed between the last two. */
  private scrollSpeeds = new WeakMap<HTMLElement, { top: number; at: number; velocity: number }>()
  /** Record a scroll of `host`; returns its speed in points per second (signed, 0 when stale). */
  private scrollSpeed(host: HTMLElement) {
    const at = performance.now()
    const top = host.scrollTop
    const last = this.scrollSpeeds.get(host)
    const elapsed = last ? at - last.at : Infinity
    const velocity =
      last && elapsed > 0 && elapsed < SCROLL_SPEED_STALE_MS
        ? ((top - last.top) / elapsed) * 1000
        : 0
    this.scrollSpeeds.set(host, { top, at, velocity })
    return velocity
  }
  /** Planes whose entry window may grow at the next preparation (the scene has been idle). */
  growPlanes = new Set<string>()
  private growTimer = 0
  /** A recentre was requested: the next preparation must run now, scrolling or not. */
  pendingRecentre = false
  /** Bounded capture: recentres started, and every time a scroll left the window before its
   * recentre was installed (how far, in points, and how fast). Diagnostics only. */
  captureWindows = {
    recentres: 0,
    grows: 0,
    outruns: [] as { plane: string; by: number; velocity: number; at: number; forMs?: number }[],
  }
  private outrunSince = new Map<string, number>()
  /** What a plane's capture window is chosen from (see measurePlane). */
  windowHint(id: string, host: HTMLElement): PlaneWindowHint {
    const installed = this.planes.get(id)
    const text = this.lastText ?? ''
    // A resident capture that cannot be used as it is (stale, another appearance) is captured
    // again: as an entry, not at the extent it had grown to.
    const held = installed ?? this.resident.usable(id, this.options.appearance, text)
    const last = this.scrollSpeeds.get(host)
    const moving = last && performance.now() - last.at < SCROLL_SPEED_STALE_MS
    const captureDemand = this.captureDemand
    return {
      current: held ? (held.window ?? 'full') : undefined,
      bands: held?.bands,
      grow: this.growPlanes.has(id),
      velocity: moving ? last.velocity : 0,
      // A plane that does not scroll is captured for the rows its glass samples.
      ...(host.scrollHeight <= host.clientHeight + 0.5 &&
      !host.closest('[data-satin-keyboard-carrier]')
        ? {
            demand: {
              // Whole captures return before consulting demand. Do not measure every glass
              // region when a covering presentation or an unchanged full capture fixes the range.
              get rects() {
                return captureDemand?.() ?? []
              },
              covered: beneathPresentation(host),
              damaged: !held || this.damaged.has(id),
            },
          }
        : {}),
    }
  }
  /** Undefined when the installed captures hold every row `rects` sample; otherwise a capture that
   * does is scheduled now, and the promise resolves once the renderer has acknowledged one (or
   * within the shared visible readiness budget, without authorizing an uncovered draw). */
  coverFor(sampled: () => readonly SampleRect[]) {
    // A whole settled capture may still be replaced by a cropped navigation atlas.
    if (!this.navigationCoverage && ![...this.planes.values()].some(entry => entry.bands)) return
    const missing = this.uncoveredPlane(sampled())
    if (!missing) return
    const started = performance.now()
    this.record({ kind: 'coverage-wait', at: started, plane: missing })
    this.prepareCoverage()
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        // A completed capture may have sampled geometry from before the keyboard's next
        // step. Only acknowledge coverage of today's demand, not merely a source upload.
        if (this.attached && this.uncoveredPlane(sampled())) {
          this.coverageWaiters.push(check)
          this.prepareCoverage()
          return
        }
        deadline.cancel()
        this.record({ kind: 'coverage-installed', at: performance.now(), plane: missing })
        resolve()
      }
      // Capture intentionally waits for Search/presentation layout motion before measuring.
      // Its queue and that motion are part of glass preparation, not a 500 ms renderer fault.
      // Success still requires this waiter's live-demand check after a source acknowledgement.
      const deadline = new VisibleDeadline(GLASS_READINESS_BUDGET_MS, () => {
        this.coverageWaiters = this.coverageWaiters.filter(waiter => waiter !== check)
        this.record({ kind: 'coverage-timeout', at: performance.now(), plane: missing })
        reject(
          Error(
            `Capture coverage was not installed for ${missing} within the visible readiness budget`,
          ),
        )
      })
      this.coverageWaiters.push(check)
      deadline.start()
    })
  }
  private prepareCoverage() {
    if (!this.navigationActive || !this.navigationState) {
      this.schedulePrepare(false, true)
      return
    }
    // A settled-source capture cannot enlarge the active atlas. Serialize a new
    // atlas from the same route set, holding new region/viewport draws until it lands.
    if (this.navigationCoveragePreparation) return
    const preparation = this.navigation(this.navigationState)
    this.navigationCoveragePreparation = preparation
    void preparation
      .catch(error => this.fail('navigation coverage', error))
      .finally(() => {
        if (this.navigationCoveragePreparation === preparation)
          this.navigationCoveragePreparation = undefined
        this.coverageInstalled()
      })
  }
  /** Region glass is waiting for a capture of rows no capture holds yet. */
  get coverageWaiting() {
    return this.coverageWaiters.length > 0
  }
  /** A source batch was acknowledged (or refused): waiting region refreshes check again. */
  coverageInstalled() {
    const waiters = this.coverageWaiters
    this.coverageWaiters = []
    for (const waiter of waiters) waiter()
  }
  /** The first installed plane whose bands do not hold every row `rects` sample there. */
  private uncoveredPlane(rects: readonly SampleRect[]) {
    for (const [id, entry] of this.planes) {
      const navigation = id === this.contentPlane ? this.navigationCoverage : undefined
      if ((!entry.bands && !navigation) || !entry.host.isConnected) continue
      // Glass in a presentation above the plane moves over all of it (a sheet's own material
      // samples everything under the sheet): only a whole capture covers it.
      if (beneathPresentation(entry.host)) return id
      // Captures and nested glass share the presentation's resting frame. Its
      // offscreen entrance must not hide missing rows from this admission check.
      const box = atRest(entry.host.getBoundingClientRect(), presentationTravel(entry.host))
      for (const [x, y, width, height] of rects) {
        if (x + width <= box.x || x >= box.x + box.width) continue
        const top = Math.max(y, box.y)
        const bottom = Math.min(y + height, box.y + box.height)
        if (bottom <= top) continue
        if (
          uncoveredSourceRows(
            [x, y, width, height],
            {
              origin: {
                ...entry.origin,
                y:
                  entry.origin.y +
                  (keyboardBackdrop(entry.host, entry.keyboardAnchor)?.offsetY ?? 0),
              },
              scroll: { y: searchBackdropScroll(entry.host, entry.searchAnchor) },
              height: entry.height,
              resolution: entry.resolution,
              clip: [box.x, box.y, box.width, box.height],
              rows: entry.bands,
            },
            navigation,
          )
        )
          return id
      }
    }
    return undefined
  }
  /** A scroll of a windowed plane: recentre before the scrollport reaches the window's edge, and
   * record when it got there first. The scroll itself is always forwarded to the renderer. */
  followWindow(id: string, host: HTMLElement) {
    const window = this.planes.get(id)?.window
    const velocity = this.scrollSpeed(host)
    if (!window) return
    // The scrollport as it is now: a window is never judged by the height it was captured with.
    const viewport = host.clientHeight
    const scrollTop = Math.max(0, Math.min(host.scrollTop, host.scrollHeight - viewport))
    this.noteOutrun(id, window, host, scrollTop, velocity)
    if (captureWindowExhausted(window, scrollTop, host.scrollHeight, velocity, viewport)) {
      if (!this.pendingRecentre) this.captureWindows.recentres++
      this.pendingRecentre = true
      this.schedulePrepare(true, true)
    }
  }
  private noteOutrun(
    id: string,
    window: CaptureWindow,
    host: HTMLElement,
    scrollTop: number,
    velocity: number,
  ) {
    const at = performance.now()
    const viewport = host.clientHeight
    const contentHeight = host.scrollHeight
    if (
      windowCoversScrollport(window, scrollTop, viewport, contentHeight) ||
      // At the top of the list the pinned window has the pixels (a jump to the top).
      pinnedTopCovers(this.pinnedTops.get(id), scrollTop, viewport, contentHeight)
    ) {
      this.endOutrun(id, at)
      return
    }
    // How far what glass can sample (the scrollport and the lens reach) lies outside the window.
    const needTop = Math.max(0, scrollTop - LENS_REACH_POINTS)
    const needBottom = Math.min(contentHeight, scrollTop + viewport + LENS_REACH_POINTS)
    const by = Math.max(window.top - needTop, needBottom - window.bottom)
    const outruns = this.captureWindows.outruns
    if (!this.outrunSince.has(id)) {
      this.outrunSince.set(id, at)
      outruns.push({ plane: id, by, velocity, at })
      if (outruns.length > 200) outruns.shift()
      glassTiming('window-outrun', glassNow(), () => `${id} by ${Math.round(by)}pt`)
    } else {
      const current = outruns.at(-1)
      if (current && current.plane === id) current.by = Math.max(current.by, by)
    }
  }
  /** The plane's window covers its scrollport again (a recentre was installed, or it scrolled back). */
  endOutrun(id: string, at = performance.now()) {
    const since = this.outrunSince.get(id)
    if (since === undefined) return
    this.outrunSince.delete(id)
    const current = this.captureWindows.outruns.findLast(outrun => outrun.plane === id)
    if (current) current.forMs = at - since
  }
  /** Whether a plane's window is smaller than a grown window of its content would be. */
  private windowCanGrow(entry: PlaneEntry) {
    if (!entry.window) return false
    const largest = grownExtent({ viewport: entry.host.clientHeight, resolution: entry.resolution })
    const extent = entry.window.bottom - entry.window.top
    return extent < Math.min(entry.host.scrollHeight, largest) - 1 / 64
  }
  /** Whether a plane's window has left the top of its list without a current capture of the top
   * (the next idle preparation, or a jump to the top, captures one). */
  needsPinnedTop(id: string, entry: PlaneEntry) {
    if (!this.client.documentOwned || !entry.window || entry.window.top <= 0) return false
    const pinned = this.pinnedTops.get(id)
    return !pinned || pinned.stale
  }
  /** Request pixels opportunistically. Scroll ownership stays with the initiating tap. */
  prepareScrollToTop(element: HTMLElement): undefined {
    const id = this.planeIds.get(element)
    const entry = id ? this.planes.get(id) : undefined
    if (id && entry && this.attached && this.needsPinnedTop(id, entry))
      this.schedulePrepare(true, true)
    return undefined
  }
  private invalidatePinnedTops(ids: string[]) {
    if (!ids.length) return
    for (const id of ids) {
      const pinned = this.pinnedTops.get(id)
      if (pinned) pinned.stale = true
    }
    this.fire({
      type: 'source-images',
      revision: this.nextTransport(),
      images: [],
      removePinned: ids,
      release: ids.map(id => `plane:${id}:top`),
    })
  }
  private queueMutationDamage(record: MutationRecord) {
    // textContent replaces text children inside a live element. Its box is still available;
    // treating those records as detached elements defeats spatial damage filtering.
    const replacesText =
      record.addedNodes.length > 0 &&
      [...record.addedNodes, ...record.removedNodes].every(node => node.nodeType === Node.TEXT_NODE)
    this.queueSourceDamage(
      record.target,
      (record.removedNodes.length > 0 && !replacesText) ||
        (record.type === 'attributes' && ['class', 'style'].includes(record.attributeName ?? '')),
    )
    // A detached plane host is no longer contained by the mutation parent.
    for (const node of record.removedNodes) {
      if (node instanceof Element) this.queueSourceDamage(node, true)
    }
  }
  /** Coalesce mutation records and image loads before reading layout, once per target per frame. */
  private queueSourceDamage(target: Node, removed = false) {
    const element = target instanceof Element ? target : target.parentElement
    const key = element ?? target
    this.pendingDamage.set(key, removed || this.pendingDamage.get(key) === true)
    if (this.damageFrame) return
    this.damageFrame = requestAnimationFrame(() => {
      this.damageFrame = 0
      const damageStarted = glassNow()
      const pending = this.pendingDamage
      this.pendingDamage = new Map()
      const boxes = new Map<Element, DOMRect>()
      const styles = new Map<Element, CSSStyleDeclaration>()
      const pins = new Set<string>()
      let damaged = false
      for (const [node, removed] of pending) {
        damaged = this.damageSource(node, removed, boxes, styles, pins) || damaged
      }
      if (pins.size) this.invalidatePinnedTops([...pins])
      glassTiming(
        'source-damage',
        damageStarted,
        () => `targets=${pending.size}, pins=${pins.size}`,
      )
      if (damaged) this.schedulePrepare()
    })
  }
  /** Skip only proven downstream damage. Above-window reflow can change every captured row. */
  damageSource(
    target: Node,
    removed = false,
    boxes = new Map<Element, DOMRect>(),
    styles = new Map<Element, CSSStyleDeclaration>(),
    pendingPins?: Set<string>,
  ) {
    this.resident.damage(target)
    const element = target instanceof Element ? target : target.parentElement
    const box = (node: Element) => {
      let rect = boxes.get(node)
      if (!rect) {
        rect = node.getBoundingClientRect()
        boxes.set(node, rect)
      }
      return rect
    }
    const style = (node: Element) => {
      let value = styles.get(node)
      if (!value) {
        value = getComputedStyle(node)
        styles.set(node, value)
      }
      return value
    }
    const belongs = (host: Element) => host.contains(target) || !!element?.contains(host)
    const changes = (host: HTMLElement, window: CaptureWindow | undefined) => {
      if (removed || !element || element.contains(host) || !window) return true
      try {
        const hostRect = box(host)
        const below = (node: Element) => {
          const rect = box(node)
          const top = rect.top - hostRect.top + host.scrollTop
          return (
            [rect.top, rect.left, rect.width, rect.height, top, window.bottom].every(
              Number.isFinite,
            ) &&
            rect.width > 0 &&
            rect.height > 0 &&
            top >= window.bottom
          )
        }
        if (!below(element)) return true
        // Every enclosing layout must flow from the top. Unknown layouts are damage.
        for (let node: Element | null = element; node; node = node.parentElement) {
          const value = style(node)
          const display = value.display
          const flex = display === 'flex' || display === 'inline-flex'
          const positioned =
            !['', 'static'].includes(value.position) &&
            !(
              value.position === 'relative' &&
              ['', 'auto'].includes(value.top) &&
              ['', 'auto'].includes(value.bottom)
            )
          const normal = ['block', 'flow-root', 'list-item', 'inline', 'inline-block'].includes(
            display,
          )
          if (
            (!normal && !flex) ||
            (flex &&
              (value.flexDirection !== 'column' ||
                !['', 'normal', 'start', 'flex-start'].includes(value.justifyContent) ||
                !['', 'nowrap'].includes(value.flexWrap))) ||
            positioned ||
            !['', 'normal', 'start', 'flex-start'].includes(value.alignContent) ||
            !['', 'none'].includes(value.transform) ||
            !['', 'none'].includes(value.float) ||
            !['', 'auto', '1'].includes(value.columnCount) ||
            !['', 'auto'].includes(value.columnWidth) ||
            !['', 'horizontal-tb'].includes(value.writingMode) ||
            !['', '0'].includes(value.order) ||
            !['', 'none'].includes(value.boxShadow) ||
            !['', 'none'].includes(value.textShadow) ||
            !['', 'none'].includes(value.filter)
          )
            return true
          if (flex) {
            // Flexible siblings can redistribute height above a changed downstream row.
            for (const child of node.children) {
              const childStyle = style(child)
              if (
                !['', '0'].includes(childStyle.flexGrow) ||
                !['0'].includes(childStyle.flexShrink)
              )
                return true
            }
          }
          for (const pseudo of ['::before', '::after']) {
            const content = getComputedStyle(node, pseudo).content
            if (!['', 'none', 'normal'].includes(content)) return true
          }
          if (node === host) break
        }
        // A descendant can paint above its parent's border box. Do not infer its bounds.
        for (const descendant of element.querySelectorAll('*')) {
          const value = style(descendant)
          if (
            !below(descendant) ||
            !['', 'static'].includes(value.position) ||
            !['', 'none'].includes(value.transform) ||
            !['', 'none'].includes(value.boxShadow) ||
            !['', 'none'].includes(value.textShadow) ||
            !['', 'none'].includes(value.filter)
          )
            return true
        }
        return false
      } catch {
        // Unmeasurable or disconnected geometry cannot prove that damage is downstream.
        return true
      }
    }
    const affected = new Set<string>()
    const pins = pendingPins ?? new Set<string>()
    for (const [id, entry] of this.planes) {
      if (!belongs(entry.host)) continue
      const pinned = this.pinnedTops?.get(id)
      const pinChanged = !!pinned && !pinned.stale && changes(entry.host, pinned.window)
      if (changes(entry.host, entry.window) || pinChanged) affected.add(id)
      if (pinChanged) pins.add(id)
    }
    for (const [id, host] of this.preparingPlaneHosts) {
      if (!belongs(host)) continue
      if (changes(host, this.preparingPlaneWindows?.get(id)?.window)) affected.add(id)
    }
    for (const [id, window] of this.preparingPinnedWindows ?? []) {
      const host =
        this.preparingPlaneWindows?.get(id)?.host ??
        this.planes.get(id)?.host ??
        this.preparingPlaneHosts.get(id)
      if (host && belongs(host) && changes(host, window)) {
        affected.add(id)
        pins.add(id)
      }
    }
    for (const id of affected) this.markPlaneDamaged(id)
    // The frame batch detaches each affected pin once, including provisional pins.
    if (!pendingPins && pins.size) this.invalidatePinnedTops([...pins])
    return affected.size > 0
  }
  private markPlaneDamaged(id: string) {
    this.damaged.add(id)
    this.damageGenerations.set(id, (this.damageGenerations.get(id) ?? 0) + 1)
  }
  /** Release both committed pins and slots left behind by an interrupted preparation. */
  releasePinnedTops() {
    this.invalidatePinnedTops([...new Set([...this.pinnedTops.keys(), ...this.pinnedOrphans])])
    this.pinnedTops.clear()
    this.pinnedOrphans.clear()
  }
  /** A preparation committed: its windows are installed. Outruns they end are closed, and the
   * entry windows it left grow once the scene has been idle. */
  windowsCommitted() {
    this.growPlanes.clear()
    for (const [id, entry] of this.planes) {
      const host = entry.host
      const viewport = host.clientHeight
      const scrollTop = Math.max(0, Math.min(host.scrollTop, host.scrollHeight - viewport))
      const covered =
        !entry.window ||
        windowCoversScrollport(entry.window, scrollTop, viewport, host.scrollHeight) ||
        pinnedTopCovers(this.pinnedTops.get(id), scrollTop, viewport, host.scrollHeight)
      if (covered) this.endOutrun(id)
    }
    clearTimeout(this.growTimer)
    this.growTimer = 0
    const idleWork = [...this.planes].some(
      ([id, entry]) => this.windowCanGrow(entry) || this.needsPinnedTop(id, entry),
    )
    if (!this.attached || !idleWork) return
    this.growTimer = setTimeout(() => this.growWindows(), WINDOW_GROW_IDLE_MS) as unknown as number
  }
  private growWindows() {
    if (!this.attached || document.hidden || this.lifecycleHidden) return
    const busy =
      pointerHeld() ||
      this.pointer ||
      this.navigationActive ||
      !!this.minimizeDom?.active ||
      sceneInMotion(this.options.elements?.scroller) ||
      performance.now() - this.lastScrollAt < WINDOW_GROW_IDLE_MS
    if (busy) {
      this.growTimer = setTimeout(() => this.growWindows(), 200) as unknown as number
      return
    }
    for (const [id, entry] of this.planes)
      if (this.windowCanGrow(entry) || this.needsPinnedTop(id, entry)) this.growPlanes.add(id)
    if (!this.growPlanes.size) return
    this.captureWindows.grows++
    this.schedulePrepare()
  }
  private loadTarget?: HTMLElement
  private sourceLoaded = (event: Event) => {
    if (event.target instanceof Node) this.queueSourceDamage(event.target)
  }
  /** Post the bars' scroll edges when their strength or visibility changes (one message per frame at most). */
  scheduleEdges(
    scene = this.options.elements.contentHost.closest<HTMLElement>(
      '[data-satin-scene-paint-layer]',
    ) ?? this.options.elements.contentHost,
  ) {
    if (this.edgeFrame || !this.attached) return
    this.edgeFrame = requestAnimationFrame(() => {
      this.edgeFrame = 0
      if (!this.attached || !this.installedSource) return
      const edges = readScrollEdges(
        scene,
        this.options.appearance === 'dark',
        this.navigationRoutes,
      )
      const key = JSON.stringify(edges)
      if (key === this.installedEdges) return
      this.installedEdges = key
      this.fire({ type: 'backdrop-edges', edges })
    })
  }
  /** Hidden: cancel capture work while retaining the last frame and its source planes.
   * Visible: retint and present retained sources immediately, then refresh captures. */
  private visibility = (event?: Event) => this.handleVisibility(event)
  handleVisibility(event?: Event) {
    const hidden = event?.type === 'pagehide' || document.hidden
    const changed = hidden !== this.lifecycleHidden
    this.lifecycleHidden = hidden
    if (lagTraceEnabled())
      lagMark({
        stage: 'glass-lifecycle',
        at: glassNow(),
        values: {
          event: event?.type ?? 'rebind',
          hidden,
          changed,
          preparing: !!this.preparing,
          revision: this.revision,
        },
      })
    // Browser lifecycle signals can describe one transition twice. Keep an in-flight
    // source refresh and its frame deadline; appearance arrivals still synchronize.
    // An explicit rebind has no event and must restore the page-lifetime renderer.
    if (event && !changed) {
      if (!hidden) this.setAppearance(this.options.currentAppearance?.() ?? this.options.appearance)
      return
    }
    cancelAnimationFrame(this.resumeFrame)
    this.resumeFrame = 0
    if (this.lifecycleHidden) {
      this.lifecycleCounts.hidden++
      // Nothing moves across a suspension: the tab bar's minimize transaction and the bottom
      // accessory's run end at their committed layout now (the renderer settles its tracks
      // at the same end), so the first resumed frame has one pose from one owner.
      this.minimizeDom?.settle()
      // Keep the last correctly tinted frame and its sources throughout suspension.
      this.revision++
      this.appRegions.invalidateSources()
      this.resumePending = true
      this.dropRetained()
      this.installedNavigation = undefined
      this.preparedSignature = ''
      return
    }
    this.lifecycleCounts.visible++
    this.resumeAt = glassNow()
    if (this.contentInstall !== undefined) {
      this.contentInstall = this.nextTransport()
      this.fire({ type: 'content-begin', revision: this.contentInstall })
    }
    this.setAppearance(this.options.currentAppearance?.() ?? this.options.appearance)
    // Hide invalidates an unfinished capture's worker epoch. Re-arm its barrier
    // even when the held appearance is unchanged, so the fresh capture can release it.
    if (this.appearanceInstall && this.appearanceInstall.revision !== this.revision) {
      this.appearanceInstall = { revision: this.revision, value: this.options.appearance }
      this.fire({ type: 'appearance-begin', revision: this.revision })
      this.appRegions.setAppearance(this.options.appearance)
    }
    // Present retained planes now. The worker retints them while suspended before
    // its first submission; source recapture never controls canvas visibility.
    this.fire({ type: 'visible', visible: true })
    // WebKit restores viewport metrics after visibility. Refresh the source envelope
    // in the background once those metrics have settled.
    this.resumeFrame = requestAnimationFrame(() => {
      this.resumeFrame = requestAnimationFrame(() => {
        this.resumeFrame = 0
        this.schedulePrepare()
      })
    })
  }
  /** Lifecycle transitions this page has handled (resume readout). */
  private lifecycleCounts = { hidden: 0, visible: 0 }
  async resumeReadout(): Promise<ResumeReadout> {
    const report = (await this.client.request({ type: 'report' })) as {
      visible?: boolean
      loop?: { tracks?: unknown }
      regionPresenters?: unknown[][]
    }
    const presenters = new Map<string, number>()
    for (const [region, role] of report.regionPresenters ?? [])
      presenters.set(`${region}:${role}`, (presenters.get(`${region}:${role}`) ?? 0) + 1)
    return {
      lifecycle: {
        hides: this.lifecycleCounts.hidden,
        resumes: this.lifecycleCounts.visible,
        hidden: this.lifecycleHidden,
      },
      compact: this.minimize.compact,
      minimize: this.minimizeDom?.readout() ?? null,
      renderer: {
        visible: report.visible ?? null,
        tracks: report.loop?.tracks ?? null,
        duplicatePresenters: [...presenters].filter(([, count]) => count > 1),
        presenters: report.regionPresenters?.length ?? 0,
      },
    }
  }
  /** A source change during tab-bar minimize/restore is applied when the motion finishes
   * (its track schedules a preparation): reinstalling every surface mid-motion stalled worker frames. */
  schedulePrepare(afterMinimize = false, windowRecentre = false) {
    if (!afterMinimize && this.minimizeDom?.active) return
    if (
      this.prepareFrame ||
      this.resumeFrame ||
      !this.attached ||
      document.hidden ||
      this.lifecycleHidden ||
      this.navigationActive
    )
      return
    if (!windowRecentre && sceneInMotion(this.options.elements?.scroller)) {
      glassTiming('prepare-deferred-motion')
      return
    }
    // Scrolling: a capture (tens of ms of raster, readback and upload) would land in the scroll's
    // frames. Planes follow scroll on the GPU; damage from the gesture (a row's press highlight,
    // a scroll-driven style) is captured once scrolling has been idle for SCROLL_IDLE_MS.
    const sinceScroll = performance.now() - this.lastScrollAt
    // The pending tab still shows its outgoing frame. Its layout/scroll restoration
    // cannot defer the source that admits the destination by another idle interval.
    if (!windowRecentre && this.contentInstall === undefined && sinceScroll < SCROLL_IDLE_MS) {
      clearTimeout(this.scrollIdle)
      this.scrollIdle = setTimeout(
        () => this.schedulePrepare(afterMinimize),
        SCROLL_IDLE_MS - sinceScroll + 5,
      ) as unknown as number
      glassTiming('prepare-deferred-scroll')
      return
    }
    const requested = lagTraceEnabled() ? glassNow() : 0
    this.prepareFrame = requestAnimationFrame(() => {
      this.prepareFrame = 0
      // A menu can start after damage queued this frame. Keep its morph clear of
      // optional captures, while still admitting a capture required for coverage.
      if (!windowRecentre && sceneInMotion(this.options.elements?.scroller)) return
      if (lagTraceEnabled()) glassTiming('prepare-frame-wait', requested)
      void this.prepare().catch(error => this.fail('source preparation', error))
    })
  }
  currentSpecs() {
    return this.restMenu(
      createRenderSpecs(
        this.options.geometry,
        this.options.appearance,
        'none',
        undefined,
        this.options.menuEnabled,
        sampleMenuMotion('close', 10, this.options.appearance, true),
      )
        .map(spec => ({
          ...spec,
          tabSelection: spec.tabSelection ? { ...spec.tabSelection, glyphLayers: true } : undefined,
          backdropExclusions: backdropExclusions(this.options.elements.contentHost, false),
        }))
        .filter(spec =>
          spec.id === 'dock'
            ? this.options.geometry.tabBarSelectedIndex !== undefined
            : spec.id === 'right' && this.options.menuEnabled,
        ),
    )
  }
  menuResting() {
    return this.options.menuEnabled
  }
  /** The trigger surface as bar glass: the menu envelope (constant storage through the
   * morph) with the trigger's current outline, at `opacity` over the menu surface. */
  barTrigger(right: SurfaceRenderSpec, opacity: number): SurfaceRenderSpec {
    return {
      ...right,
      id: 'region:bar-trigger',
      materialProfile: 'chrome',
      restHidden: undefined,
      returningTrigger: undefined,
      menuTintMix: undefined,
      recipeMix: undefined,
      materialMix: 1,
      opacity,
      shape: { blendRadius: 0, rimAlpha: 1, whiteMix: 0, first: right.shape.first },
    }
  }
  /** The resting (closed) menu surface, independent of the menu's current state. */
  closedMenuSpec() {
    return createRenderSpecs(
      this.options.geometry,
      this.options.appearance,
      'none',
      undefined,
      true,
      sampleMenuMotion('close', 10, this.options.appearance, true),
    )
      .map(spec => ({
        ...spec,
        backdropExclusions: backdropExclusions(this.options.elements.contentHost, false),
      }))
      .find(spec => spec.id === 'right')
  }
  private restMenu(specs: readonly SurfaceRenderSpec[]) {
    return specs.map(spec =>
      spec.id !== 'right'
        ? spec
        : {
            ...spec,
            recipeMix: Math.max(0, Math.min(1, spec.materialMix * (spec.menuTintMix ?? 1))),
            ...(this.menuResting() ? { restHidden: true } : {}),
          },
    )
  }
  /** Transport sequence: assigned when a source message is posted, so the worker
   * sees strictly increasing revisions and never has to reject a stale one. */
  post(request: Request, transfer: Transferable[] = []) {
    return this.send(request, transfer)
  }
  nextTransport() {
    return ++this.transportRevision
  }
  /** One preparation at a time (productionPrepare.ts). */
  private prepare() {
    return prepareSources(this)
  }
  /** Diagnostic: the installed capture's extent and its colour at viewport row `y` (CSS px, x centre). */
  private sourceProbe(y: number) {
    const canvas = this.planeCanvases.get(this.contentPlane ?? '')?.canvas ?? this.sourceCanvas
    const resolution = devicePixelRatio
    const top = this.options.elements.contentHost.getBoundingClientRect().top
    const row = Math.round((y + this.options.elements.scroller.scrollTop) * resolution)
    const ctx = canvas.getContext('2d')
    const pixel =
      ctx && row >= 0 && row < canvas.height
        ? [...ctx.getImageData(Math.floor(canvas.width / 2), row, 1, 1).data]
        : null
    return {
      installed: this.installedSource?.key,
      hostTop: top,
      width: canvas.width / resolution,
      height: canvas.height / resolution,
      row,
      pixel,
    }
  }
  triggerValues(scroll: number) {
    const spec = this.currentSpecs().find(candidate => candidate.id === 'right')
    if (!spec || !this.context) return
    const context = this.context.sample(
      spec.frameX + TRIGGER_CONTEXT_X,
      spec.frameY + TRIGGER_CONTEXT_Y + scroll,
      REGULAR_TRIGGER_MATERIAL.radiusPt,
      scroll,
      scroll + this.options.geometry.height,
    )
    if (!context) return
    const appearance = this.options.appearance
    const regime = regularTriggerRegime(context.luminance, appearance)
    const response = REGULAR_TRIGGER_MATERIAL.models[`${appearance}-${regime}`]
    return {
      context: [...context.rgb, context.deviation],
      response: response.slice(0, 4),
      chroma: response[4],
      regime,
    }
  }
  private track(id: string, specs: SurfaceRenderSpec[], duration: number, at = performance.now()) {
    const region = this.regionIds.get(id)
    // Menu runs are validated here, before the region map: a region is registered when its install is
    // posted, and outlives a disable. Only an enabled, acknowledged surface runs unguarded.
    if (
      (id === 'right' || id === 'region:bar-trigger') &&
      !this.menuRunAllowed(id, specs, duration, at, !!region)
    )
      return
    if (!region) return
    this.specs.set(id, specs.at(-1)!)
    const trigger = (spec: SurfaceRenderSpec) =>
      `${(spec.frameX + spec.shape.first.centerX).toFixed(1)},${(spec.frameY + spec.shape.first.centerY).toFixed(1)}`
    glassTiming(
      'region-track',
      glassNow(),
      () => `${id} ${duration.toFixed(0)}ms ${trigger(specs[0])}→${trigger(specs.at(-1)!)}`,
    )
    const track = { id: region, epoch: performance.timeOrigin + at, duration, specs }
    if (id === 'right' || id === 'region:bar-trigger') this.menuTracks.set(id, track)
    this.fire({ type: 'region-track', track })
  }
  /** A source install replaces a surface's spec in the worker. The menu surfaces' specs are
   * read when a prepare starts, but installed after its captures: a menu run that was live
   * at any point since then owns them (installing the stale snapshot after the run ended
   * left the open panel, or a stale trigger bubble, presented). */
  /** Menu runs that find no installed surface: held until it is installed and acknowledged, else a loud glass error. */
  menuSurface = new MenuSurfaceGuard(
    MENU_SURFACE_BUDGET_MS,
    () => this.menuStage,
    error => this.fail('menu surface', error),
  )
  menuStage: MenuSurfaceStage = 'prepare'
  /** True once the worker has acknowledged the install of the menu surface of the current enable
   * generation (a disable, teardown or rebind starts a new generation). */
  menuReady = false
  menuGeneration = 0
  /** Whether a menu run may be sent to its surface now. Opening the menu while its surface is disabled
   * is the error, once per run (the trigger's track belongs to the same run); gestures are bound only
   * while the menu is enabled, and closing a menu that never showed has nothing to draw. A run before
   * the surface is acknowledged is guarded until it is: sent to the worker when its install is already
   * posted, else kept for the preparation that installs it. */
  private menuRunAllowed(
    id: 'right' | 'region:bar-trigger',
    specs: SurfaceRenderSpec[],
    duration: number,
    at: number,
    registered: boolean,
  ) {
    if (!this.options.menuEnabled) {
      return false
    }
    if (this.menuReady) return true
    this.menuSurface.start()
    if (registered) return true
    this.specs.set(id, specs.at(-1)!)
    this.menuTracks.set(id, {
      id: id === 'right' ? 'menu' : 'bar-trigger',
      epoch: performance.timeOrigin + at,
      duration,
      specs,
    })
    this.schedulePrepare()
    return false
  }
  menuTrackSince(id: 'right' | 'region:bar-trigger', since: number) {
    const track = this.menuTracks.get(id)
    return track && track.epoch + track.duration >= since ? track : undefined
  }
  tabInput(event: 'down' | 'move' | 'up' | 'select' | 'reset', index: number, cancelled = false) {
    this.fire({
      type: 'tab-input',
      event,
      index,
      x: this.pointerX,
      at: performance.timeOrigin + performance.now(),
      cancelled,
    })
  }
  tabPointerDown(x: number, index: number) {
    if (this.pointer || this.navigationActive) return false
    this.pointer = true
    this.pointerX = x
    this.pointerStart = x
    this.pointerIndex = index
    this.tabInput('down', index)
    return true
  }
  tabPointerMove(x: number) {
    this.pointerX = x
    this.tabInput('move', this.pointerIndex)
  }
  tabPointerUp(cancelled = false) {
    this.pointer = false
    const previous = this.options.geometry.tabBarSelectedIndex ?? 0
    const index = cancelled
      ? previous
      : Math.abs(this.pointerX - this.pointerStart) > 3
        ? nearestTab(this.pointerX, this.options.geometry.tabBarCentres)
        : this.pointerIndex
    this.tabInput('up', previous, cancelled)
    if (!cancelled) this.commitTabSelection(index)
  }
  selectTabAnimated(index: number) {
    this.tabInput('select', index)
    this.commitTabSelection(index)
  }
  private commitTabSelection(index: number) {
    const traced = lagTraceEnabled()
    const started = traced ? glassNow() : 0
    const changed = this.options.geometry.tabBarSelectedIndex !== index
    if (changed && !this.options.consumerMode) {
      this.options = {
        ...this.options,
        geometry: { ...this.options.geometry, tabBarSelectedIndex: index },
      }
    }
    // The incoming tab must not inherit the outgoing content's scroll-idle hold.
    if (changed) this.lastScrollAt = -Infinity
    this.options.onTabActivated?.(index)
    const activated = traced ? glassNow() : 0
    if (changed && !this.options.consumerMode) this.options.onTabSelected?.(index)
    if (traced)
      lagMark({
        stage: 'tab-commit',
        at: started,
        ms: glassNow() - started,
        values: { index, changed, activateMs: activated - started },
      })
  }
  setTabSelection(index: number | undefined) {
    if (index === undefined) return
    this.options = {
      ...this.options,
      geometry: { ...this.options.geometry, tabBarSelectedIndex: index },
    }
    this.minimizeDom?.update(this.options)
    if (!this.pointer) this.tabInput('reset', index)
  }
  private minimizeTrack(direction: 'collapse' | 'restore', path: RestorePath = 'tap') {
    const spec = this.currentSpecs().find(candidate => candidate.id === 'dock')
    if (!spec || !this.minimizeDom) return
    glassTiming('minimize-track', glassNow(), direction)
    // Minimize owns selection geometry until restore completes. Retire an earlier tap's
    // lens so it cannot repaint the committed capsule from a second animation clock.
    if (!this.pointer) this.tabInput('reset', this.options.geometry.tabBarSelectedIndex ?? 0, true)
    const track = this.minimizeDom.start(direction, spec, path)
    this.track('dock', track.specs, track.duration, track.at)
    void track.finished.then(() => {
      if (performance.now() >= track.at + track.duration - 50) this.schedulePrepare(true)
    })
  }
  restoreMinimizingTabBar(path: RestorePath = 'tap') {
    if (!this.minimize.compact) return false
    this.minimize.restore(this.options.elements.scroller.scrollTop)
    this.minimizeTrack('restore', path)
    return true
  }
  private navigation(state: NavigationGlassState) {
    this.navigationState = state
    return prepareNavigation(this, state)
  }
  updateGeometry(next: Partial<RuntimeGeometry>) {
    const previous = this.options.geometry
    this.options = { ...this.options, geometry: { ...previous, ...next } }
    this.minimizeDom?.update(this.options)
    if (previous.tabBarPlacement !== this.options.geometry.tabBarPlacement) {
      this.minimize.rebase(this.options.elements.scroller.scrollTop)
      if (this.options.geometry.tabBarPlacement === 'top') this.restoreMinimizingTabBar()
    }
    if (
      JSON.stringify({ ...previous, tabBarSelectedIndex: 0 }) !==
      JSON.stringify({ ...this.options.geometry, tabBarSelectedIndex: 0 })
    ) {
      this.revision++
      this.mount()
      this.schedulePrepare()
    } else if (previous.tabBarSelectedIndex !== this.options.geometry.tabBarSelectedIndex) {
      // Async initialization can finish after tab restoration, without changing any dimensions.
      // Synchronize the worker's pill too, while retaining its in-flight selection motion.
      this.setTabSelection(this.options.geometry.tabBarSelectedIndex)
    }
  }
  retargetContent(scroller: HTMLDivElement, contentHost: HTMLDivElement) {
    if (
      scroller === this.options.elements.scroller &&
      contentHost === this.options.elements.contentHost
    )
      return
    if (
      scroller.closest('[data-satin-tab-panel]') !==
      this.options.elements.scroller.closest('[data-satin-tab-panel]')
    ) {
      this.contentInstall = this.nextTransport()
      this.fire({ type: 'content-begin', revision: this.contentInstall })
    }
    // Only the content changed: the tab bar keeps its minimize state and running motion. Disposing
    // the DOM minimize here cancelled the tab ink's keyframes while the worker's capsule track ran
    // on (glass collapsed, icons left floating at their expanded positions).
    const minimize = this.minimize
    const minimizeDom = this.minimizeDom
    this.minimizeDom = undefined
    this.teardown()
    this.minimize = minimize
    minimize.rebase(scroller.scrollTop)
    this.options = {
      ...this.options,
      elements: { ...this.options.elements, scroller, contentHost },
    }
    this.attached = true
    this.bind(minimizeDom)
    this.schedulePrepare()
    glassTiming(
      'retarget',
      glassNow(),
      () =>
        `${scroller.id || scroller.className} minimizing:${minimizeDom?.active ?? false} compact:${minimize.compact}`,
    )
  }
  setContentHost(host: HTMLDivElement) {
    this.retargetContent(this.options.elements.scroller, host)
  }
  setAppearance(appearance: Appearance) {
    if (appearance === this.options.appearance) return
    this.options = { ...this.options, appearance }
    // A queued preparation may wait for motion or scrolling. Invalidate the
    // current capture now so it cannot commit the previous appearance meanwhile.
    this.revision++
    if (!this.lifecycleHidden && !document.hidden) {
      this.appearanceInstall = { revision: this.revision, value: appearance }
      this.fire({ type: 'appearance-begin', revision: this.revision })
      this.appRegions.setAppearance(appearance)
    }
    this.dropRetained()
    this.schedulePrepare()
  }
  commitAppearance(appearance: Appearance) {
    this.setAppearance(appearance)
  }
  setScroll(offset: number) {
    this.options.elements.scroller.scrollTop = offset
    this.scroll()
  }
  setScreen(screen: ScreenId) {
    this.options = { ...this.options, screen }
    this.schedulePrepare()
  }
  setMenuEnabled(enabled: boolean, _resetOwner = false) {
    this.options = { ...this.options, menuEnabled: enabled }
    // The menu's registration ended: a run still waiting for its first surface is for a menu that no longer exists.
    // A removed menu is closed: the frames its gesture binding sends while tearing down are not menu runs.
    if (!enabled) {
      this.menuSurface.cancel()
      this.menuReady = false
      this.menuGeneration++
      if (!this.regionIds.has('right')) {
        this.menuTracks.delete('right')
        this.menuTracks.delete('region:bar-trigger')
      }
    }
    this.schedulePrepare()
  }
  regionDiagnostics() {
    return undefined
  }
  setBridgeEnabled(_enabled: boolean) {}
  setGlassEnabled(enabled: boolean) {
    if (!enabled) throw Error('WebGPU glass cannot degrade to a substitute')
  }
  setLensMode(mode: LensMode) {
    if (mode !== 'reference-regular')
      throw Error('Production WebGPU currently exposes the material regular material')
  }
  setMarkers(_enabled: boolean) {}
  setVelocityFadeEnabled(_enabled: boolean) {}
  setDragProgress(_progress: number) {
    throw Error('Use production navigation gestures for the WebGPU renderer')
  }
  startLiquidMotion(_repeats?: number, _speed?: number): void {
    throw Error('Use production tab interaction for the WebGPU renderer')
  }
  startMenuCadence(_repeats?: number, _speed?: number): void {
    throw Error('Use production menu interaction for the WebGPU renderer')
  }
  setMenuHandoffProbe(_hold: boolean) {}
  setMenuPreparationProbe(_milliseconds: number) {}
  setMenuCase(name: string) {
    this.record({ kind: 'menu-case', name })
  }
  recordMenuInteraction(event: string, phase: string) {
    this.record({ event, phase })
  }
  recordMenuDecision(decision: MenuGestureDecision) {
    this.record(decision)
  }
  recordMenuSelection(index: number, event: unknown, source?: string) {
    this.record({ index, event, source })
  }
  recordMenuInput(_event: Event) {}
  recordMenuTouch(_phase: string, _event: PointerEvent) {}
  resetMetrics() {
    this.events = []
  }
  exportFrameTrace(_includeBuffers = true) {
    return { backend: 'webgpu', events: this.events, errors: getGlassErrors() }
  }
  benchmarkRestingMaterials(): Record<string, unknown> {
    throw Error('Use __SATIN_WEBGPU__.report() and the worker benchmark protocol')
  }
  exportDiagnosticBuffers() {
    throw Error('WebGPU buffers require asynchronous diagnostic readback')
  }
  /** The options of the create() call that owns this shared runtime now. A StrictMode or remount
   * sequence can create twice while initialization is pending: the cancelled first caller's
   * release must not tear down the runtime the second caller has already rebound. */
  private owner?: RuntimeOptions
  /** Releases the runtime for `owner` (every caller passes its create() options); a stale owner is ignored. */
  detach(owner?: RuntimeOptions) {
    if (owner && owner !== this.owner) return
    this.teardown()
  }
  private teardown() {
    this.unbindAppearance()
    if (this.minimizeDom && (this.minimizeDom.active || this.minimize.compact)) {
      const dock = this.currentSpecs().find(spec => spec.id === 'dock')
      const region = this.regionIds.get('dock')
      if (dock && region) this.fire({ type: 'region-spec', id: region, spec: dock })
    }
    cancelAnimationFrame(this.resumeFrame)
    this.resumeFrame = 0
    this.preparedSignature = ''
    this.revision++
    this.navigationRevision++
    this.menuCancel()
    this.options.elements.menu?.trigger.removeEventListener('pointerdown', this.menuDown)
    this.options.elements.menu?.trigger.removeEventListener('pointermove', this.menuMove)
    document.removeEventListener('pointerup', this.menuUp, true)
    document.removeEventListener('pointercancel', this.menuUp, true)
    window.removeEventListener('blur', this.menuCancel)
    this.unsubscribePresentationBackdrop?.()
    this.unsubscribePresentationBackdrop = undefined
    this.unsubscribeRegionBackdrop?.()
    this.unsubscribeRegionBackdrop = undefined
    window.removeEventListener(KEYBOARD_CARRIER_MOTION, this.keyboardGeometry)
    window.removeEventListener(SCROLL_INSERTION_MOTION, this.keyboardGeometry)
    this.appRegions.unbind()
    this.minimize = new TabMinimizeIntent()
    this.minimizeDom?.dispose()
    this.minimizeDom = undefined
    this.navigationActive = false
    this.attached = false
    this.coverageInstalled()
    cancelAnimationFrame(this.prepareFrame)
    this.prepareFrame = 0
    clearTimeout(this.growTimer)
    this.growTimer = 0
    this.observer?.disconnect()
    cancelAnimationFrame(this.damageFrame)
    this.damageFrame = 0
    this.pendingDamage?.clear()
    this.edgeObserver?.disconnect()
    cancelAnimationFrame(this.edgeFrame)
    this.edgeFrame = 0
    this.navigationObserver?.disconnect()
    this.navigationAnimations?.()
    this.navigationRelease?.()
    cancelAnimationFrame(this.navigationFrame)
    this.navigationFrame = 0
    if (this.navigationInput) document.removeEventListener('scroll', this.navigationInput, true)
    this.navigationInput = undefined
    this.resize?.disconnect()
    this.unsubscribe?.()
    this.unsubscribeScrollJump?.()
    this.unsubscribeScrollJump = undefined
    this.releasePinnedTops()
    this.loadTarget?.removeEventListener('load', this.sourceLoaded, true)
    this.loadTarget?.removeEventListener(GLASS_SOURCE_DAMAGE_EVENT, this.sourceLoaded, true)
    this.loadTarget = undefined
    this.unsubscribeNativeScroll?.()
    this.unsubscribeNativeScroll = undefined
    this.options.elements.scroller.removeEventListener('satin:search-geometry', this.searchGeometry)
    this.options.elements.scroller.removeEventListener('pointerdown', this.begin)
    document.removeEventListener('pointerup', this.endContact, true)
    this.minimizePointer = undefined
    this.options.elements.scroller.removeEventListener('scrollend', this.endScrollGesture)
    document.removeEventListener('visibilitychange', this.visibility, true)
    window.removeEventListener('pagehide', this.visibility, true)
    window.removeEventListener('pageshow', this.visibility)
    document.fonts.removeEventListener('loadingdone', this.fontsChanged)
    for (const scope of this.scrollScopes) scope.removeEventListener('scroll', this.scrolled, true)
    this.scrollScopes = []
    this.menuSurface.cancel()
    this.menuReady = false
    this.menuGeneration++
  }
  dispose(owner?: RuntimeOptions) {
    if (owner && owner !== this.owner) return
    this.teardown()
    void this.client.park().catch(error => this.fail('park', error))
  }
}
