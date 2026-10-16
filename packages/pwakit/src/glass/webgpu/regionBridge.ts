import type { KeyboardTranslation } from '../../keyboard/translation.ts'
import {
  presentationGlassMotion,
  presentationGlassContentEpoch,
} from '../../presentation/glassMotion.ts'
import { zoomRestRect } from '../../navigation/zoomGlass.ts'
import { navigationGlassState } from '../../navigation/glassTransition.ts'
import { glassFieldKey, glassUnionDiagnostics } from '../morphField.ts'
import { backdropExclusions, backdropOwner } from './backdropLayers.ts'
import { orderedTopLayerDialogs } from '../../modal/lifecycle.ts'
import { contextSampleInset } from './contextComposite.ts'
import { glassNow, glassTimedAsync, glassTiming } from './profile.ts'
import { toolbarMaterialContent, toolbarMenuContents } from '../toolbarMaterialContext.ts'
import { lagMark, lagTraceEnabled } from './lagTrace.ts'
import { CAPTURE_RELEASE_FALLBACK_MS, releaseCaptureCanvases } from './captureRelease.ts'
import { captureRegionForeground, foregroundGeometry } from './foreground.ts'
import { SupersededImage } from '../../image/resource.ts'
import type { GlassRegionRegistry, GlassRegionRegistration } from '../regionRegistry.ts'
import { GLASS_READINESS_BUDGET_MS, VisibleDeadline } from '../visibleDeadline.ts'
import {
  frameUnion,
  glassPresenterBounds,
  type GlassRegion,
  type GlassScrollSnapshot,
  type PopoverArrow,
} from '../regions.ts'
import type {
  GlassPresenter,
  GlassRendererRequest,
  GlassRendererOperation,
  GlassViewport,
} from '../rendererContract.ts'
import type { WebGPUClient } from './client.ts'
import { reportGlassError } from '../errors.ts'
import { glassFailureCode } from './errorCode.ts'
import { atRest, presentationTravel } from '../presentationFrame.ts'
import { DEMAND_MARGIN_POINTS, regionSampleRect, type SampleRect } from './captureDemand.ts'
import { observePresenterViewport } from './presenterViewport.ts'
import {
  accessoryGlassMotion,
  accessoryReach,
  accessoryWorkerEnabled,
  accessoryInkReady,
  accessoryInkWidth,
} from './accessoryMorph.ts'
import { PRESENTATION_TRACK_EVENT } from '../../presentation/glassMotion.ts'
import {
  GLASS_SHAPE_TRACK_EVENT,
  glassShapeTrack,
  glassApertureInFrame,
} from '../shapeTrackRegistry.ts'
import { shapeTrackClock } from '../shapeTrack.ts'
import { menuTriggerSnapshot, mapTriggerSnapshot } from '../menuTriggerSnapshot.ts'
import type { AccessoryViewportTrack } from './accessoryTrack.ts'
import { hasLayoutAnimation, observeAnimations } from '../../motion/animate.ts'

type RegionReadiness = {
  entry: GlassRegionRegistration
  show: string | undefined
  presented: boolean
  visible: boolean
  deadline: VisibleDeadline
  failed: boolean
}

/** A tab panel that is not the selected one (TabView keeps it laid out, hidden and inert). */
const INACTIVE_TAB = '[data-satin-tab-panel][data-satin-tab-active="false"]'
const TAB_PANEL = '[data-satin-tab-panel]'
/** Markup that decides a region's captured ink: every descendant's tag and
 * attributes (classes, inline styles, SVG geometry), excluding presenter canvases. */
function inkSignature(element: HTMLElement, ignored: readonly string[] = []) {
  let signature = ''
  for (const node of element.querySelectorAll('*')) {
    if (node.tagName === 'CANVAS') continue
    signature += '<' + node.tagName
    for (const attribute of node.attributes)
      if (!ignored.includes(attribute.name))
        signature += ' ' + attribute.name + '=' + attribute.value
  }
  return signature
}
/** A shared toolbar capsule carries every member's ink, including separated DOM siblings. */
async function captureMenuTrigger(
  elements: HTMLElement[],
  bounds: { x: number; y: number; width: number; height: number },
  resolution: number,
  geometry?: readonly ReturnType<typeof foregroundGeometry>[],
) {
  if (elements.length === 1 && !geometry) {
    return captureRegionForeground(elements[0]!, resolution, INK_PADDING, undefined, {
      resting: true,
    })
  }
  const captures = await Promise.all(
    elements.map(async (element, index) => ({
      rect: geometry?.[index]?.bounds ?? layoutRect(element),
      image: await captureRegionForeground(element, resolution, INK_PADDING, undefined, {
        resting: true,
        geometry: geometry?.[index],
      }),
    })),
  )
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((bounds.width + INK_PADDING * 2) * resolution)
  canvas.height = Math.ceil((bounds.height + INK_PADDING * 2) * resolution)
  const context = canvas.getContext('2d')!
  for (const { rect, image } of captures) {
    context.drawImage(image, (rect.x - bounds.x) * resolution, (rect.y - bounds.y) * resolution)
  }
  return canvas
}

/** A viewport rectangle in its layer's coordinates (as a region's `frame`). */
function layerFrame(
  rect: GlassRegion['frame'] | undefined,
  owner: { viewportX: number; viewportY: number; offsetX: number; offsetY: number } | undefined,
) {
  if (!rect) return undefined
  return {
    ...rect,
    x: rect.x - (owner?.viewportX ?? 0) + (owner?.offsetX ?? 0),
    y: rect.y - (owner?.viewportY ?? 0) + (owner?.offsetY ?? 0),
  }
}
/** A trigger's press state changes nothing in its resting glyph. */
const PRESS_STATE_ATTRIBUTES = ['data-satin-press-state', 'data-satin-press-transition']
/** The region's layout box at its current on-screen centre. A transform animation (an alert's
 * scale entrance) moves the element and its presenter canvas together on the compositor; the
 * material keeps its layout size, so the presenter is never re-allocated (or its canvas resized)
 * per animation frame, and the compositor scales the rendered glass with its content. */
function layoutRect(element: HTMLElement) {
  const motion = presentationGlassMotion(element) ?? accessoryGlassMotion(element)
  if (motion) return motion.rect
  const zoom = zoomRestRect(element)
  if (zoom) return zoom
  // Glass nested in a sheet or cover is placed in the presentation's resting frame, with the
  // backdrop of its content (presentationFrame.ts): it travels with them on the compositor.
  const rect = atRest(element.getBoundingClientRect(), presentationTravel(element)),
    style = getComputedStyle(element),
    transform = style.transform
  if (!transform || transform === 'none') return rect
  const m = new DOMMatrixReadOnly(transform),
    sx = Math.hypot(m.a, m.b),
    sy = Math.hypot(m.c, m.d)
  if (!(sx > 0 && sy > 0) || (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6)) return rect
  const width = rect.width / sx,
    height = rect.height / sy
  // A scale about the origin (ox, oy) moves the layout edge by o * (1 - s). A popover grows
  // from its arrow tip, not its centre.
  const [ox, oy] = style.transformOrigin.split(' ').map(Number.parseFloat)
  const originX = Number.isFinite(ox) ? ox! : width / 2,
    originY = Number.isFinite(oy) ? oy! : height / 2
  return {
    x: rect.x - originX * (1 - sx),
    y: rect.y - originY * (1 - sy),
    width,
    height,
  }
}
/** One layout eligibility rule for capture demand, scene/group construction and admission.
 * Hidden retained registrations remain owned, but cannot lead a field or require a draw. */
function sceneRegionRect(entry: GlassRegionRegistration) {
  if (!entry.element.isConnected || entry.element.closest('[data-satin-covered="true"]'))
    return undefined
  const rect = layoutRect(entry.element)
  return rect.width > 0 && rect.height > 0 ? rect : undefined
}
/** A presenter's size as its holder's size plus a fixed margin. The box then follows the holder's
 * layout in the frame the holder changes. A size in points is one refresh old: measured on the
 * iPad, a sheet resized under a finger writes its height after this bridge has measured it, so the
 * glass ended a whole frame's travel (up to 45 pt) short of the sheet's bottom edge and the page
 * showed there. */
function presenterSize(size: number, holderSize: number, followsHolder: boolean) {
  if (!followsHolder) return `${size}px`
  // Layout units are 1/64 pt; the margin is normally two whole sample insets.
  return `calc(100% + ${Math.round((size - holderSize) * 64) / 64}px)`
}
/** Whether a percentage on an absolutely positioned child means this element's measured box:
 * the element is the child's containing block, a box of its own (not an inline run), and has no
 * borders (percentages exclude them). */
function sizesChildren(element: HTMLElement) {
  const style = getComputedStyle(element)
  if (!style.position || style.position === 'static' || style.display === 'inline') return false
  return ![
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ].some(width => parseFloat(width) > 0)
}
/** Distinct menu contents whose ink captures are kept for their next open. */
const INK_CAPTURES_RETAINED = 4
/** Transparent margin around each captured ink image (points). */
const INK_PADDING = 2
/** Field presenters grow their retained envelope in these steps (points). */
const FIELD_ENVELOPE_STEP = 16
/** DOM measurements and transport only. No drawing loop or GPU device here. */
export class RegionBridge {
  private unionWarnings = new Set<string>()
  private registry?: GlassRegionRegistry
  private source?: HTMLElement
  private unsubscribe?: () => void
  private unsubscribeInput?: () => void
  private unsubscribePresentation?: () => void
  private presentationQueued = false
  private frame = 0
  private revision = 0
  /** Scenes posted and not yet answered. A scene is the whole region state, so when the worker
   * falls behind, superseded scenes are merged: only the newest waits for a free slot. */
  private scenesInFlight = 0
  private pendingScene?: GlassRendererRequest
  private sceneValidity = new WeakMap<GlassRendererRequest, () => boolean>()
  private scenePresented = new WeakMap<GlassRendererRequest, (receipt: unknown) => void>()
  private readiness = new Map<HTMLCanvasElement, RegionReadiness>()
  private accessoryAdmissions = new WeakMap<HTMLCanvasElement, AccessoryViewportTrack>()
  private presentationAllowed = true
  private readinessQueued = false
  private queueReadiness() {
    if (this.readinessQueued) return
    this.readinessQueued = true
    queueMicrotask(() => {
      this.readinessQueued = false
      this.syncReadiness()
    })
  }
  private waitForRegion(pending: RegionReadiness) {
    // Presentation entrances already own a VisibleDeadline in holdPresentationForGlass.
    // Take over only after that show has appeared, or for persistent chrome with no show.
    if (pending.visible && !pending.failed && (pending.show === undefined || pending.presented))
      pending.deadline.start()
  }
  private syncReadiness() {
    const entries = this.registry?.values() ?? []
    const registered = new Map(entries.map(entry => [entry.canvas, entry]))
    for (const [canvas, pending] of this.readiness) {
      if (registered.get(canvas)?.id !== pending.entry.id) {
        pending.deadline.cancel()
        this.readiness.delete(canvas)
      }
    }
    for (const entry of entries) {
      const show = entry.canvas.dataset.satinGlassShow
      const rect = accessoryGlassMotion(entry.element)
        ? DOMRect.fromRect(accessoryGlassMotion(entry.element)!.rect)
        : entry.element.getBoundingClientRect()
      const visible =
        entry.element.isConnected &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < innerWidth &&
        rect.top < innerHeight &&
        // A presentation held for its first glass shows nothing yet (presentationFrame.ts).
        !entry.element.closest(
          `${INACTIVE_TAB}, [data-satin-covered="true"], [data-satin-glass-hold]`,
        ) &&
        getComputedStyle(entry.element).visibility !== 'hidden'
      const previous = this.readiness.get(entry.canvas)
      if (previous?.entry.id === entry.id && previous.show === show) {
        // React can replace a descriptor in one commit without replacing its glass owner.
        // Keep both the elapsed budget and the history of an already-revealed show.
        previous.entry = entry
        previous.visible = visible
        previous.deadline.setVisible(visible)
        if (entry.canvas.dataset.satinGlassPresented !== 'true') this.waitForRegion(previous)
        continue
      }
      previous?.deadline.cancel()
      const presented = show !== undefined && entry.canvas.dataset.satinGlassPresentedShow === show
      delete entry.canvas.dataset.satinGlassPresented
      delete entry.canvas.dataset.satinGlassPresentedShow
      const pending = {
        entry,
        show,
        presented,
        visible,
        failed: false,
        deadline: new VisibleDeadline(GLASS_READINESS_BUDGET_MS, () => {
          pending.failed = true
          reportGlassError(
            'readiness-timeout',
            Error(`Glass region ${entry.id} was not presented within 10 s of visible time`),
            'region-presentation',
          )
        }),
      }
      this.readiness.set(entry.canvas, pending)
      pending.deadline.setVisible(visible)
      this.waitForRegion(pending)
    }
  }
  private static readonly SCENES_IN_FLIGHT = 2
  private flushPendingScene() {
    if (this.batch || this.scenesInFlight >= RegionBridge.SCENES_IN_FLIGHT) return
    const next = this.pendingScene
    this.pendingScene = undefined
    if (next) this.postScene(next)
  }
  private sceneDone = () => {
    this.scenesInFlight--
    this.flushPendingScene()
  }
  private postScene(scene: GlassRendererRequest) {
    if (this.sceneValidity.get(scene)?.() === false) return
    if (this.scenesInFlight >= RegionBridge.SCENES_IN_FLIGHT) {
      if (this.pendingScene) glassTiming('region-scene-merged')
      this.pendingScene = scene
      return
    }
    this.scenesInFlight++
    void this.send(scene)
      .then(receipt => this.scenePresented.get(scene)?.(receipt))
      .catch(this.fail)
      .finally(this.sceneDone)
  }
  /** A scene whose reply the caller needs (new presenters): sent now, superseding any queued scene. */
  private async sendScene(scene: GlassRendererRequest) {
    this.scenesInFlight++
    try {
      return await this.send(scene)
    } finally {
      this.sceneDone()
    }
  }
  /** Foreground source revisions. Unique per capture: a refresh superseded between its
   * foreground send and its scene send must not hand the next capture the same key
   * (the worker's frame graph treats a key as immutable content). */
  private foregroundRevision = 0
  private epoch = 0
  private serial = Promise.resolve()
  private canvases = new Map<HTMLCanvasElement, { id: string; layerId: string }>()
  private nextPresenter = 0
  private foregrounds = new WeakMap<HTMLElement, string>()
  private dirtyForegrounds = new WeakSet<HTMLElement>()
  private unsubscribeContent?: () => void
  private deferredForegrounds = new Map<string, () => void>()
  private foregroundInputs = new Map<string, Promise<void>>()

  /** An idle lift is transparent; its labels remain live DOM while layout moves them. Keep
   * the warm ink instead of rasterizing an invisible lens at every intermediate width. */
  private deferIdleForeground(entry: GlassRegionRegistration) {
    const interaction = this.registry?.interactions.get(entry.id)
    if (interaction && interaction.phase !== 'rest') return false
    if (!this.foregrounds.has(entry.element)) return false
    let scope: Element | null = entry.element
    while (scope && !hasLayoutAnimation(scope)) scope = scope.parentElement
    if (!scope) return false
    if (!this.deferredForegrounds.has(entry.id)) {
      const layoutScope = scope
      const unsubscribe = observeAnimations(layoutScope, () => {
        // Reversals replace the run on the same scope before the old promise settles.
        if (hasLayoutAnimation(layoutScope)) return
        unsubscribe()
        this.deferredForegrounds.delete(entry.id)
        this.invalidate()
      })
      this.deferredForegrounds.set(entry.id, unsubscribe)
    }
    return true
  }
  /** Regions seen in an unselected tab, with the panel they were seen in. One stays held after
   * its tab is selected again, until the worker has installed that tab's source preparation
   * (`sourceInstalled`): only then is its own backdrop installed, and only then may it be
   * redrawn. A region moved into another panel is no longer the held one. */
  private heldForTab = new WeakMap<HTMLElement, Element>()
  /** Capture canvases whose bitmap is in a request that has not been sent yet. */
  private consumedCanvases: HTMLCanvasElement[] = []
  /** Release capture canvases once the request that carries their bitmap has resolved. */
  private releaseConsumedCanvases() {
    clearTimeout(this.releaseFallback)
    this.releaseFallback = undefined
    releaseCaptureCanvases(this.consumedCanvases)
  }
  private releaseFallback?: ReturnType<typeof setTimeout>
  /** A worker that never answers the carrying request must not keep the canvases allocated. */
  private armReleaseFallback() {
    this.releaseFallback ??= setTimeout(
      () => this.releaseConsumedCanvases(),
      CAPTURE_RELEASE_FALLBACK_MS,
    )
  }
  /** The regions that sit in tabs that are not selected. A source preparation sends them with its
   * batch: the worker holds them on their own backdrop before the new plane set replaces it, and
   * resumes every other region in the same batch. Reading them changes nothing here. */
  inactiveRegionIds() {
    return (this.registry?.values() ?? [])
      .filter(entry => entry.element.isConnected && !!entry.element.closest(INACTIVE_TAB))
      .map(entry => entry.id)
  }
  /** The selected tab's own backdrop is installed in the worker: its regions stop being held. */
  releaseHeldRegions() {
    for (const entry of this.registry?.values() ?? [])
      if (!entry.element.closest(INACTIVE_TAB)) this.heldForTab.delete(entry.element)
  }
  private sourceRevision?: number
  /** Invalidate in-flight geometry before posting the replacement capture batch. */
  sourceWillChange(revision: number) {
    this.sourceRevision = revision
  }
  /** A source preparation posted its batch (`installed` is the worker's reply to it). Only once
   * the worker has acknowledged it are the selected tab's regions released and their scene sent.
   * If the worker rejects the batch, nothing was installed and nothing was resumed there: the
   * holds stay, so those regions keep the frames they have (the rejection reaches the caller). */
  async sourceInstalled(installed: Promise<unknown>, appearance: 'light' | 'dark') {
    const epoch = this.epoch
    await installed
    if (epoch !== this.epoch) return
    this.releaseHeldRegions()
    await this.sourceChanged(appearance)
  }
  private scrolls = new WeakMap<HTMLElement, string>()
  private nextScroll = 0

  private client: WebGPUClient
  constructor(client: WebGPUClient, appearance: 'light' | 'dark') {
    this.client = client
    this.appearance = appearance
  }
  private batch?: {
    requests: GlassRendererOperation[]
    transfer: Transferable[]
    presented: ((receipt: unknown) => void)[]
  }
  private send = async (request: GlassRendererRequest, transfer: Transferable[] = []) => {
    // Admission is not publication: a cancelled batch must preserve the parked scene.
    if (
      this.batch &&
      ['source', 'scene', 'appearance'].includes(request.type) &&
      request.type !== 'transaction'
    ) {
      this.batch.requests.push(request)
      this.batch.transfer.push(...transfer)
      return
    }
    return this.client.request({ type: 'canonical', request }, transfer, () => {
      // The client reports admission separately from acknowledgement: postMessage
      // exceptions become rejected promises and must not retire the parked scene.
      const scenes = request.type === 'transaction' ? request.requests : [request]
      const pending = this.pendingScene
      if (
        pending?.type === 'scene' &&
        scenes.some(
          operation =>
            operation.type === 'scene' && operation.snapshot.revision >= pending.snapshot.revision,
        )
      )
        this.pendingScene = undefined
    })
  }

  bind(registry: GlassRegionRegistry | undefined, source: HTMLElement) {
    this.unbind()
    this.presentationAllowed = true
    this.foregrounds = new WeakMap()
    this.registry = registry
    this.source = source
    this.unsubscribe = registry?.subscribe(this.invalidate)
    this.unsubscribeContent = registry?.subscribeContent(element => {
      this.foregrounds.delete(element)
      this.dirtyForegrounds.add(element)
    })
    this.unsubscribePresentation = registry?.subscribePresentation(this.invalidatePresentation)
    this.unsubscribeInput = registry?.subscribeInput(interaction => {
      const id = interaction.regionId
      const pending = this.foregroundInputs.get(id)
      const entry = registry?.values().find(entry => entry.id === id)
      const motion = entry && accessoryGlassMotion(entry.element)
      if (motion && entry) this.foregrounds.delete(entry.element)
      const dirty = entry && this.dirtyForegrounds.has(entry.element)
      if (!motion && !dirty && !pending && !this.deferredForegrounds.has(id)) {
        void this.send({ type: 'interaction', interaction }).catch(this.fail)
        return
      }
      // A touch during layout needs ink at the current width before the lens lifts it.
      // Keep a fast press/release pair in order while that one capture is in flight.
      const epoch = this.epoch
      const next = (pending ?? Promise.resolve()).then(async () => {
        if (epoch !== this.epoch) return
        if (motion || dirty || this.deferredForegrounds.has(id)) await this.refresh()
        if (epoch === this.epoch) await this.send({ type: 'interaction', interaction })
      })
      this.foregroundInputs.set(id, next)
      void next.then(() => {
        if (this.foregroundInputs.get(id) === next) this.foregroundInputs.delete(id)
      }, this.fail)
    })
    this.unsubscribeEvents = this.client.onEvent(event => {
      if (event.type === 'presentation-gate') {
        this.presentationAllowed = event.allowed
        if (event.allowed) this.invalidate()
        else {
          this.syncReadiness()
          for (const [canvas, pending] of this.readiness) {
            delete canvas.dataset.satinGlassPresented
            delete canvas.dataset.satinGlassPresentedShow
            this.waitForRegion(pending)
          }
        }
      } else if (event.type === 'accessory-ink') {
        const entry = registry?.values().find(entry => entry.id === event.regionId)
        const motion = entry && accessoryGlassMotion(entry.element)
        if (motion?.track?.epoch === event.epoch) motion.takeInk?.()
      } else if (event.type === 'emerge-settled')
        registry?.emergeSettled(event.regionId, event.generation)
      else if (event.type === 'field-motion') registry?.fieldMotion(event)
      else registry?.emergeInk(event)
    })
    document.addEventListener('scroll', this.scrollInvalidated, true)
    document.addEventListener('touchstart', this.rowContact, { capture: true, passive: true })
    window.addEventListener('resize', this.invalidate)
    window.addEventListener('satin-accessory-motion', this.invalidate)
    window.addEventListener(GLASS_SHAPE_TRACK_EVENT, this.sendShapeTrack)
    window.addEventListener('satin-presentation-motion', this.invalidate)
    window.addEventListener(PRESENTATION_TRACK_EVENT, this.sendPresentationTrack)
    this.invalidate()
  }
  // Cache at contact start, before scrolling. A row's horizontal scroll changes neither
  // distant glass geometry nor its backdrop. Never measure those boxes on each move.
  private rowScrollImpact = new WeakMap<Element, boolean>()
  private rowContact = (event: Event) => {
    const source =
      event.target instanceof Element ? event.target.closest('[data-satin-row-scrub]') : null
    const row = source?.closest('[data-satin-row-actions]')
    if (!source || !row || !this.registry) return
    const bounds = row.getBoundingClientRect()
    const affectsGlass = this.registry.values().some(entry => {
      if (row.contains(entry.element)) return true
      const region = entry.element.getBoundingClientRect()
      const inset = contextSampleInset(entry.descriptor.material.treatment)
      return (
        bounds.left < region.right + inset &&
        bounds.right > region.left - inset &&
        bounds.top < region.bottom + inset &&
        bounds.bottom > region.top - inset
      )
    })
    this.rowScrollImpact.set(source, affectsGlass)
  }
  private scrollInvalidated = (event: Event) => {
    if (event.target instanceof Element && event.target.matches('[data-satin-row-scrub]')) {
      if (this.rowScrollImpact.get(event.target) === false) return
    } else this.rowScrollImpact = new WeakMap()
    this.invalidate()
  }
  private unsubscribeEvents?: () => void
  private viewportObservers = new Map<
    HTMLCanvasElement,
    ReturnType<typeof observePresenterViewport>
  >()
  private viewportPending = new Map<
    string,
    { viewport: GlassViewport; rect: SampleRect; keyboard?: KeyboardTranslation }
  >()
  /** Keep the worker's old sample covered until it acknowledges its new viewport. A source
   * installation can redraw that old viewport before the queued move reaches the worker. */
  private viewportSamples = new Map<string, { viewport: GlassViewport; rect: SampleRect }>()
  private viewportInFlight = new Map<string, { viewport: GlassViewport; rect: SampleRect }>()
  private presenterExtents = new Map<string, { width: number; height: number }>()
  private retainPresenterExtent(id: string, bounds: { width: number; height: number }) {
    const held = this.presenterExtents.get(id)
    this.presenterExtents.set(id, {
      width: Math.max(held?.width ?? 0, bounds.width),
      height: Math.max(held?.height ?? 0, bounds.height),
    })
  }
  private viewportSending = new Set<string>()
  private async updateViewport(
    id: string,
    viewport: GlassViewport,
    rect: SampleRect,
    keyboard?: KeyboardTranslation,
  ) {
    this.viewportPending.set(id, { viewport, rect, keyboard })
    if (this.viewportSending.has(id)) return
    this.viewportSending.add(id)
    const epoch = this.epoch
    try {
      while (epoch === this.epoch) {
        const next = this.viewportPending.get(id)
        if (!next) break
        // Compositor-only movement bypasses scene refresh. Demand its actual scaled canvas
        // envelope before this request, which can draw immediately in the renderer.
        const covering = this.coverage?.(() => this.sampleRects())
        if (covering) await covering
        if (epoch !== this.epoch) return
        if (this.viewportPending.get(id) !== next) continue
        // This request can reach the worker even if a tab rebinds before its reply.
        // Its sample belongs to the retained presenter, not the source binding.
        this.viewportInFlight.set(id, next)
        await this.send({
          type: 'presenter-viewport',
          id,
          viewport: next.viewport,
          keyboard: next.keyboard,
        })
        this.viewportSamples.set(id, next)
        this.viewportInFlight.delete(id)
        if (epoch !== this.epoch) return
        if (this.viewportPending.get(id) === next) this.viewportPending.delete(id)
      }
    } finally {
      this.viewportSending.delete(id)
      const pending = this.viewportPending.get(id)
      if (epoch !== this.epoch && this.registry && pending)
        void this.updateViewport(id, pending.viewport, pending.rect, pending.keyboard).catch(
          this.fail,
        )
    }
  }
  unbind() {
    this.epoch++
    this.unsubscribe?.()
    this.unsubscribeContent?.()
    this.unsubscribeContent = undefined
    this.dirtyForegrounds = new WeakSet()
    this.unsubscribePresentation?.()
    this.unsubscribeInput?.()
    this.unsubscribeEvents?.()
    this.unsubscribeEvents = undefined
    for (const observer of this.viewportObservers.values()) observer.dispose()
    for (const unsubscribe of this.deferredForegrounds.values()) unsubscribe()
    this.deferredForegrounds.clear()
    this.foregroundInputs.clear()
    this.viewportObservers.clear()
    this.viewportPending.clear()
    // The worker's canvases survive source rebinds. Forget their accepted sample
    // only when detach-presenter retires them, or a newer viewport replaces it.
    cancelAnimationFrame(this.frame)
    this.frame = 0
    document.removeEventListener('scroll', this.scrollInvalidated, true)
    document.removeEventListener('touchstart', this.rowContact, true)
    window.removeEventListener('resize', this.invalidate)
    window.removeEventListener('satin-accessory-motion', this.invalidate)
    window.removeEventListener(GLASS_SHAPE_TRACK_EVENT, this.sendShapeTrack)
    window.removeEventListener('satin-presentation-motion', this.invalidate)
    window.removeEventListener(PRESENTATION_TRACK_EVENT, this.sendPresentationTrack)
    this.registry = undefined
    this.navigationHold?.release()
    this.navigationHold = undefined
    for (const pending of this.readiness.values()) pending.deadline.cancel()
    this.readiness.clear()
    this.rowScrollImpact = new WeakMap()
  }
  invalidateSources() {
    this.epoch++
    this.foregrounds = new WeakMap()
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }
  private fail = (error: unknown) =>
    reportGlassError(glassFailureCode('app glass regions', error), error, 'app glass regions')
  private invalidatePresentation = () => {
    this.queueReadiness()
    if (this.presentationQueued || !this.registry || document.hidden) return
    this.presentationQueued = true
    const epoch = this.epoch
    // React may unregister/register several descriptors in one commit. Read only the final
    // committed geometry and keep the existing serial capture/upload ordering.
    queueMicrotask(() => {
      this.presentationQueued = false
      if (epoch !== this.epoch || !this.registry || document.hidden) return
      cancelAnimationFrame(this.frame)
      this.frame = 0
      void this.refresh().catch(this.fail)
    })
  }
  /** A glass element started or ended a shape track: send it now, then refresh as usual. */
  private sendShapeTrack = (event: Event) => {
    const element = (event as CustomEvent<Element>).detail
    const entry = this.registry?.values().find(candidate => candidate.element === element)
    if (!entry) return
    const track = glassShapeTrack(element)
    void this.send({ type: 'region-shape-track', regionId: entry.id, track }).catch(this.fail)
    this.invalidate()
  }
  private sendPresentationTrack = (event: Event) => {
    const element = (event as CustomEvent<Element>).detail
    const entry = this.registry?.values().find(candidate => candidate.element === element)
    const motion = entry && presentationGlassMotion(element)
    if (!entry || !motion?.admitted) return
    void this.send({
      type: 'region-presentation-track',
      regionId: entry.id,
      contentEpoch: motion.contentEpoch,
      track: motion.track,
    }).catch(this.fail)
  }
  invalidate = () => {
    this.queueReadiness()
    this.rowScrollImpact = new WeakMap()
    if (this.frame || !this.registry || document.hidden) return
    const requested = lagTraceEnabled() ? glassNow() : 0
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (lagTraceEnabled())
        lagMark({ stage: 'region-frame-wait', at: requested, ms: glassNow() - requested })
      void this.refresh().catch(this.fail)
    })
  }
  private appearance: 'light' | 'dark'
  /** The source owner's coverage check (`ProductionGlassRuntime.coverFor`): a promise while a
   * capture of rows these regions newly sample is on its way. */
  coverage?: (rects: () => readonly SampleRect[]) => Promise<void> | undefined
  /** Sample rectangles of the regions on screen, in viewport points (captureDemand.ts). */
  sampleRects() {
    const registry = this.registry
    if (!registry) return []
    const frames = new Map<
      GlassRegionRegistration,
      NonNullable<ReturnType<typeof sceneRegionRect>>
    >()
    const entries = registry.values().filter(entry => {
      const frame = sceneRegionRect(entry)
      if (frame) frames.set(entry, frame)
      return !!frame
    })
    const rects: SampleRect[] = entries.flatMap(entry => {
      const motion = presentationGlassMotion(entry.element) ?? accessoryGlassMotion(entry.element)
      const inset = contextSampleInset(entry.descriptor.material.treatment)
      const rect = motion
        ? ([
            motion.sampleRect.x - inset,
            motion.sampleRect.y - inset,
            motion.sampleRect.width + 2 * inset,
            motion.sampleRect.height + 2 * inset,
          ] as const)
        : regionSampleRect(entry.element, entry.descriptor.material.treatment)
      if (!rect) return []
      // An emerging menu samples its trigger-to-panel envelope from the first frame,
      // before a canvas observer or an acknowledged presenter can contribute demand.
      const from = entry.descriptor.emerge?.from
      if (!from) return [rect]
      const left = Math.min(rect[0], from.x - inset)
      const top = Math.min(rect[1], from.y - inset)
      return [
        [
          left,
          top,
          Math.max(rect[0] + rect[2], from.x + from.width + inset) - left,
          Math.max(rect[1] + rect[3], from.y + from.height + inset) - top,
        ] as const,
      ]
    })
    const groups = new Map<string, typeof entries>()
    for (const entry of entries) {
      if (!entry.descriptor.container || entry.element.dataset.satinMenuEmerged === 'true') continue
      const key = glassFieldKey(entry.descriptor)
      const group = groups.get(key) ?? []
      group.push(entry)
      groups.set(key, group)
    }
    // The raster samples the retained field presenter, not just its current members. Blend
    // support, envelope rounding and an earlier position can all extend beyond their bounds.
    for (const group of groups.values()) {
      group.sort((a, b) => a.id.localeCompare(b.id))
      const first = group[0]!
      const container = registry.containers.get(first.descriptor.container!.id)
      if (!container) continue
      const bounds = glassPresenterBounds(
        this.fieldEnvelope(container.element, group),
        contextSampleInset(first.descriptor.material.treatment),
        first.descriptor.emerge,
      )
      rects.push([bounds.x, bounds.y, bounds.width, bounds.height])
    }
    // A scene and a compositor viewport are separate messages. Either can land first:
    // retain each presenter's largest sample size at every accepted/in-flight origin.
    // Merely unioning the old and new rectangles misses an upward-growing menu drawn
    // with its old origin (and the reverse ordering while it shrinks).
    for (const entry of entries) {
      if (entry.descriptor.container) continue
      const bounds = glassPresenterBounds(
        frames.get(entry)!,
        contextSampleInset(entry.descriptor.material.treatment),
        entry.descriptor.emerge,
      )
      for (const canvas of [entry.canvas, entry.overlay]) {
        const presenter = canvas && this.canvases.get(canvas)
        if (presenter) this.retainPresenterExtent(presenter.id, bounds)
      }
    }
    for (const samples of [this.viewportSamples, this.viewportInFlight, this.viewportPending]) {
      for (const [id, { viewport, rect }] of samples) {
        rects.push(rect)
        const extent = this.presenterExtents.get(id)
        if (extent)
          rects.push([
            viewport.x,
            viewport.y,
            extent.width * viewport.scaleX,
            extent.height * viewport.scaleY,
          ])
      }
    }
    return rects
  }
  /** Whether the worker needs the root transmitted backdrop (it arrives with the shared capture). */
  get needsBackdrop() {
    return !!this.registry?.size
  }
  /** Navigation chrome moves horizontally. Its backdrop only needs these viewport
   * rows, including each material's sampling halo. Other glass keeps full capture. */
  navigationCaptureRows(height: number) {
    const entries =
      this.registry
        ?.values()
        .filter(
          e =>
            e.element.isConnected &&
            !e.element.closest('[data-satin-covered="true"],[data-satin-tab-active="false"]'),
        ) ?? []
    // The adaptive top tab bar is fixed during navigation too. Bottom docks use
    // their own source path; arbitrary content glass must retain the full viewport.
    const fixedChrome =
      '[data-satin-navigation-chrome],[data-satin-tab-bar][data-satin-tab-placement="top"]'
    if (
      !entries.length ||
      entries.some(e => !e.element.closest(fixedChrome) || e.descriptor.emerge)
    )
      return { top: 0, height }
    let top = height,
      bottom = 0
    // The canvas halo scales with press/viewport motion. Keep the worker's accepted
    // rectangle and the pending rectangle, as well as current control geometry.
    for (const [, y, , sampleHeight] of this.sampleRects()) {
      top = Math.min(top, y - DEMAND_MARGIN_POINTS)
      bottom = Math.max(bottom, y + sampleHeight + DEMAND_MARGIN_POINTS)
    }
    top = Math.max(0, Math.floor(top))
    bottom = Math.min(height, Math.ceil(bottom))
    return bottom > top ? { top, height: bottom - top } : { top: 0, height }
  }

  /** The root capture changed in the worker (shared slot). Scene and foreground
   * updates apply as one transaction; foregrounds are keyed by their own ink and
   * appearance, so only regions whose ink changed are recaptured. */
  setAppearance(appearance: 'light' | 'dark') {
    if (appearance !== this.appearance) this.invalidateSources()
    this.appearance = appearance
    // Appearance is urgent: do not wait for a source-capture transaction.
    void this.client
      .request({
        type: 'canonical',
        request: {
          type: 'appearance',
          value: appearance,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        },
      })
      .catch(error => reportGlassError(glassFailureCode('appearance', error), error, 'appearance'))
  }
  sourceChanged(appearance: 'light' | 'dark') {
    this.appearance = appearance
    const epoch = this.epoch
    return this.enqueue(async () => {
      if (epoch !== this.epoch) return
      const registry = this.registry
      const snapshotVersion = registry?.snapshotVersion
      const sourceRevision = this.sourceRevision
      const navigationEpoch = this.navigationEpoch
      const batch = (this.batch = {
        requests: [] as GlassRendererOperation[],
        transfer: [] as Transferable[],
        presented: [] as ((receipt: unknown) => void)[],
      })
      let committed = false
      try {
        // The source preparation that sent this refresh holds the capture queue: waiting for
        // another capture here would wait for itself.
        await this.refreshNow(epoch, false)
        if (
          epoch !== this.epoch ||
          registry !== this.registry ||
          snapshotVersion !== registry?.snapshotVersion ||
          sourceRevision !== this.sourceRevision ||
          navigationEpoch !== this.navigationEpoch
        )
          return
        this.batch = undefined
        const receipt = batch.requests.length
          ? await this.send({ type: 'transaction', requests: batch.requests }, batch.transfer)
          : undefined
        committed = true
        if (epoch === this.epoch) for (const acknowledge of batch.presented) acknowledge(receipt)
      } finally {
        // A cancelled refresh has not transferred its bitmaps; recapture them next time.
        if (!committed) {
          for (const request of batch.requests)
            if (request.type === 'source') request.bitmap.close()
          this.foregrounds = new WeakMap()
          this.inkAtlases = new WeakMap()
        }
        this.batch = undefined
        this.flushPendingScene()
        this.releaseConsumedCanvases()
      }
    })
  }
  private enqueue(work: () => Promise<void>) {
    this.serial = this.serial.then(work, work)
    return this.serial
  }
  private navigationEpoch = 0
  private navigationHold?: { promise: Promise<void>; release: () => void }
  holdNavigation() {
    this.navigationEpoch++
    this.navigationHold?.release()
    let release!: () => void
    const hold = {
      promise: new Promise<void>(resolve => {
        release = resolve
      }),
      release: () => release(),
    }
    this.navigationHold = hold
    return () => {
      if (this.navigationHold === hold) this.navigationHold = undefined
      hold.release()
    }
  }
  async refresh() {
    const epoch = this.epoch
    await this.navigationHold?.promise
    // Waiting inside serial would block sourceChanged behind the very scene asking for
    // new source pixels. Keep the source/scene transaction queue free during capture.
    await this.coverage?.(() => this.sampleRects())
    if (epoch !== this.epoch) return
    return this.enqueue(() => this.refreshNow(epoch, false))
  }
  async admitNavigation(key: string) {
    const epoch = this.epoch
    await this.enqueue(async () => {
      if (epoch !== this.epoch) throw new DOMException('Navigation source superseded', 'AbortError')
      this.navigationReceipt = key
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          // A stale snapshot may return before sending a scene. Only a validated draw
          // receipt below can admit motion; every early return must retry.
          this.navigationRetry = true
          await this.refreshNow(epoch, false)
          if (!this.navigationRetry) return
        }
        throw Error(`Navigation ${key} region registrations did not stabilize`)
      } finally {
        this.navigationReceipt = undefined
      }
    })
  }
  private navigationReceipt?: string
  private navigationRetry = false

  /** Captured menu ink by content key, most recent last (see INK_CAPTURES_RETAINED). */
  private inkCaptures = new Map<
    string,
    {
      canvas: HTMLCanvasElement
      layout: {
        key: string
        atlas: { width: number; height: number }
        rows?: { x: number; y: number; width: number; height: number }
        glyph?: { x: number; y: number; width: number; height: number }
      }
    }
  >()
  /** The ink key whose capture failed for an element (not retried until its content changes). */
  private inkFailures = new WeakMap<HTMLElement, string>()
  private inkAtlases = new WeakMap<
    HTMLElement,
    {
      key: string
      atlas: { width: number; height: number }
      rows?: { x: number; y: number; width: number; height: number }
      glyph?: { x: number; y: number; width: number; height: number }
    }
  >()
  /** An emerging menu's ink: its rows and its trigger's glyph, captured once per content change
   * into one foreground atlas (sent as the region's foreground source) and placed each refresh at
   * their live settled rectangles. The glass draws them until the page's rows take over. */
  private async emergeInk(
    entry: ReturnType<GlassRegionRegistry['values']>[number],
    layerId: string,
    current: () => boolean,
  ): Promise<NonNullable<GlassRegion['emerge']>['ink']> {
    const rowsElement = entry.element.querySelector<HTMLElement>('[data-satin-menu-ink]')
    const source = entry.descriptor.emerge?.sourceRegionId
    const triggerMaterial = source
      ? document.querySelector<HTMLElement>(`[data-satin-glass-region-id="${CSS.escape(source)}"]`)
      : null
    const triggerElement = triggerMaterial ? toolbarMaterialContent(triggerMaterial) : null
    const triggerContents = toolbarMenuContents(triggerElement)
    if (!rowsElement && !triggerElement) return undefined
    const apertureTrack = triggerMaterial ? glassShapeTrack(triggerMaterial) : undefined
    const apertureAt = shapeTrackClock()
    const snapshotId = entry.descriptor.emerge?.sourceSnapshot
    const snapshot = triggerMaterial ? menuTriggerSnapshot(triggerMaterial, snapshotId) : undefined
    if (snapshotId !== undefined && !snapshot) return undefined
    const capturedPose =
      snapshot && triggerMaterial
        ? mapTriggerSnapshot(snapshot, layoutRect(triggerMaterial))
        : undefined
    const captureContents = snapshot?.members.map(member => member.element) ?? triggerContents
    const captureCurrent = () =>
      current() &&
      (!triggerMaterial ||
        (triggerMaterial.isConnected &&
          (snapshot
            ? menuTriggerSnapshot(triggerMaterial, snapshotId) === snapshot
            : glassShapeTrack(triggerMaterial) === apertureTrack)))
    const rowsRect = rowsElement ? layoutRect(rowsElement) : undefined,
      triggerRect = triggerElement
        ? (capturedPose?.aperture ??
          (apertureTrack && triggerMaterial
            ? glassApertureInFrame(triggerMaterial, layoutRect(triggerMaterial), apertureAt)
            : layoutRect(triggerContents.length > 1 ? triggerMaterial! : triggerElement)))
        : undefined
    const triggerGeometry =
      capturedPose?.members ??
      (apertureTrack
        ? triggerContents.map(element =>
            foregroundGeometry(element, DOMRect.fromRect(layoutRect(element))),
          )
        : undefined)
    const style = getComputedStyle(entry.element)
    const key = JSON.stringify([
      rowsRect && [rowsRect.width, rowsRect.height, inkSignature(rowsElement!)],
      rowsElement?.textContent,
      triggerRect && [
        triggerRect.width,
        triggerRect.height,
        captureContents.map((element, index) => {
          const rect = triggerGeometry?.[index]?.bounds ?? layoutRect(element)
          return [
            rect.x - triggerRect.x,
            rect.y - triggerRect.y,
            rect.width,
            rect.height,
            inkSignature(element, PRESS_STATE_ATTRIBUTES),
          ]
        }),
      ],
      style.font,
      style.color,
      this.appearance,
    ])
    let atlas = this.inkAtlases.get(entry.element)
    if (this.inkFailures.get(entry.element) === key) return undefined
    // Selection can move a radio check in the same commit that starts closing.
    // Closing must capture that content too; the ink root's inert state is not in the key.
    if (!atlas || atlas.key !== key) {
      const resolution = devicePixelRatio
      // Each open mounts a new panel; unchanged content reuses its capture (13 ms on Catalyst)
      // and only sends it again under the new region.
      let captured = this.inkCaptures.get(key)
      if (!captured) {
        let images: (HTMLCanvasElement | undefined)[]
        try {
          images = await glassTimedAsync('menu-ink-capture', () =>
            Promise.all([
              rowsElement
                ? captureRegionForeground(rowsElement, resolution, INK_PADDING)
                : undefined,
              triggerRect
                ? captureMenuTrigger(captureContents, triggerRect, resolution, triggerGeometry)
                : undefined,
            ]),
          )
        } catch (error) {
          if (!captureCurrent()) return undefined
          // Content the atlas cannot draw must never blank the menu: the morph runs without ink
          // and the page shows its live rows at once.
          this.inkFailures.set(entry.element, key)
          console.warn('Glass menu ink capture failed; showing the live rows.', error)
          const emerge = entry.descriptor.emerge
          if (emerge && !emerge.closing)
            this.registry?.emergeInk({
              type: 'emerge-ink',
              regionId: entry.id,
              generation: emerge.generation,
              phase: 'open-settled',
            })
          return undefined
        }
        if (!captureCurrent()) return undefined
        const [rows, glyph] = images
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, (rows?.width ?? 0) + (glyph?.width ?? 0))
        canvas.height = Math.max(1, rows?.height ?? 0, glyph?.height ?? 0)
        const context = canvas.getContext('2d')!
        if (rows) context.drawImage(rows, 0, 0)
        if (glyph) context.drawImage(glyph, rows?.width ?? 0, 0)
        captured = {
          canvas,
          layout: {
            key,
            atlas: { width: canvas.width / resolution, height: canvas.height / resolution },
            rows: rows && {
              x: 0,
              y: 0,
              width: rows.width / resolution,
              height: rows.height / resolution,
            },
            glyph: glyph && {
              x: (rows?.width ?? 0) / resolution,
              y: 0,
              width: glyph.width / resolution,
              height: glyph.height / resolution,
            },
          },
        }
        this.inkCaptures.delete(key)
        this.inkCaptures.set(key, captured)
        for (const stale of [...this.inkCaptures.keys()].slice(0, -INK_CAPTURES_RETAINED))
          this.inkCaptures.delete(stale)
      }
      const bitmap = await createImageBitmap(captured.canvas)
      if (!captureCurrent()) {
        bitmap.close()
        return undefined
      }
      await this.send(
        {
          type: 'source',
          source: {
            id: `foreground:${entry.id}`,
            regionId: entry.id,
            revision: ++this.foregroundRevision,
            layerId,
            role: 'foreground',
            origin: { x: 0, y: 0 },
            width: bitmap.width / resolution,
            height: bitmap.height / resolution,
            resolution,
          },
          bitmap,
        },
        [bitmap],
      )
      atlas = captured.layout
      if (captureCurrent()) this.inkAtlases.set(entry.element, atlas)
    }
    if (!captureCurrent()) return undefined
    const placed = (
      source: { x: number; y: number; width: number; height: number } | undefined,
      rect: { x: number; y: number } | undefined,
    ) =>
      source && rect
        ? {
            source,
            frame: {
              x: rect.x - INK_PADDING,
              y: rect.y - INK_PADDING,
              width: source.width,
              height: source.height,
            },
          }
        : undefined
    return {
      atlas: atlas.atlas,
      rows: placed(atlas.rows, rowsRect),
      glyph: placed(atlas.glyph, triggerRect),
    }
  }
  private fieldEnvelopes = new WeakMap<
    HTMLElement,
    { x: number; y: number; width: number; height: number }
  >()
  private fieldEnvelope(
    container: HTMLElement,
    entries: ReturnType<GlassRegionRegistry['values']>,
    measuredFrames?: readonly ReturnType<typeof layoutRect>[],
  ) {
    const holder = layoutRect(container)
    const frames = measuredFrames ?? entries.map(entry => layoutRect(entry.element))
    const support =
      (Math.max(0, (entries[0]?.descriptor.container?.spacing ?? 0) - 0.5) *
        Math.max(0, entries.length - 1)) /
      4
    const left = Math.min(...frames.map(frame => frame.x)) - holder.x - support
    const top = Math.min(...frames.map(frame => frame.y)) - holder.y - support
    const right = Math.max(...frames.map(frame => frame.x + frame.width)) - holder.x + support
    const bottom = Math.max(...frames.map(frame => frame.y + frame.height)) - holder.y + support
    const previous = this.fieldEnvelopes.get(container)
    // Grow in whole steps: members following a live layout transition move every frame, and
    // each envelope change reallocates the presenter's sampling storage.
    const step = FIELD_ENVELOPE_STEP
    const x = Math.min(Math.floor(left / step) * step, previous?.x ?? Infinity)
    const y = Math.min(Math.floor(top / step) * step, previous?.y ?? Infinity)
    const envelope = {
      x,
      y,
      width:
        Math.max(
          Math.ceil(right / step) * step,
          previous ? previous.x + previous.width : -Infinity,
        ) - x,
      height:
        Math.max(
          Math.ceil(bottom / step) * step,
          previous ? previous.y + previous.height : -Infinity,
        ) - y,
    }
    // Retain the observed sweep, rather than resize an attachment on every spring sample.
    this.fieldEnvelopes.set(container, envelope)
    return { ...envelope, x: holder.x + x, y: holder.y + y }
  }
  private async refreshNow(epoch: number, waitForCoverage = true) {
    const started = glassNow()
    try {
      await this.refreshScene(epoch, waitForCoverage)
    } catch (error) {
      if (!(error instanceof SupersededImage)) throw error
      // A displayed image retired while foreground ink was being prepared.
      // Keep the accepted scene and retry the current DOM, just like the backdrop.
      this.navigationRetry = true
      this.invalidate()
    } finally {
      glassTiming('region-refresh', started)
    }
  }
  private async refreshScene(epoch: number, waitForCoverage: boolean) {
    const registry = this.registry
    if (!registry) return
    const navigationEpoch = this.navigationEpoch
    const navigationHold = this.navigationHold
    const navigationReceipt = this.navigationReceipt
    const navigationCurrent = () =>
      this.navigationEpoch === navigationEpoch &&
      this.navigationHold === navigationHold &&
      this.navigationReceipt === navigationReceipt
    if (navigationHold && !navigationReceipt) return
    // Glass that samples rows no capture holds yet waits for one: it is never drawn from a
    // backdrop that does not cover it.
    const covering = this.coverage?.(() => this.sampleRects())
    if (covering && !waitForCoverage) {
      if (this.navigationReceipt) {
        void covering.catch(this.fail)
        throw Error(`Navigation ${this.navigationReceipt} has uncovered source rows`)
      }
      // A capture that covers it is scheduled; a refresh of its own waits for that one.
      void covering.then(this.invalidate, this.fail)
      return
    }
    if (covering) {
      await covering
      if (epoch !== this.epoch || registry !== this.registry || !navigationCurrent()) return
    }
    this.syncReadiness()
    const snapshotVersion = registry.snapshotVersion
    const sourceRevision = this.sourceRevision
    const sheetTracks = registry
      .values()
      .map(entry => [entry.element, presentationGlassMotion(entry.element)?.track] as const)
    const accessoryTracks = registry
      .values()
      .map(entry => [entry.element, accessoryGlassMotion(entry.element)?.viewportTrack] as const)
    const motionTracksCurrent = () =>
      sheetTracks.every(([element, track]) => presentationGlassMotion(element)?.track === track) &&
      accessoryTracks.every(
        ([element, track]) => accessoryGlassMotion(element)?.viewportTrack === track,
      )
    const current = () =>
      epoch === this.epoch &&
      registry === this.registry &&
      snapshotVersion === registry.snapshotVersion &&
      sourceRevision === this.sourceRevision &&
      navigationCurrent() &&
      motionTracksCurrent()
    if (!current()) return
    // Presenter registration and foreground capture await the worker. This microtask runs only if
    // the refresh yields to one of them before it submits (see the coverage recheck below).
    let yielded = false
    queueMicrotask(() => {
      yielded = true
    })
    const registered = new Set(
      [...registry.containers.values()]
        .map(c => c.canvas)
        .concat(registry.values().flatMap(e => (e.overlay ? [e.canvas, e.overlay] : [e.canvas]))),
    )
    // An unselected tab's regions stay in the scene, held (see `held` below): their presenters keep
    // the pixels of their own tab instead of being cleared and redrawn over another tab's backdrop.
    const regionRects = new Map<GlassRegionRegistration, ReturnType<typeof layoutRect>>()
    const entries = registry.values().filter(entry => {
      const rect = sceneRegionRect(entry)
      if (!rect) {
        this.foregrounds.delete(entry.element)
        return false
      }
      regionRects.set(entry, rect)
      return true
    })
    // A container canvas is outside each member: CSS opacity alone cannot hide an emerged source.
    // Keep its scene descriptor for trigger ink while the menu owns its material.
    const drawableEntries = entries.filter(
      entry => !entry.descriptor.container || entry.element.dataset.satinMenuEmerged !== 'true',
    )
    const drawableIds = new Set(drawableEntries.map(entry => entry.id))
    const groups = new Map<string, typeof entries>()
    for (const entry of drawableEntries) {
      if (!entry.descriptor.container) continue
      const d = entry.descriptor,
        key = glassFieldKey(d)
      const group = groups.get(key) ?? []
      group.push(entry)
      groups.set(key, group)
    }
    for (const warning of glassUnionDiagnostics(entries.map(entry => entry.descriptor))) {
      if (!this.unionWarnings.has(warning)) {
        this.unionWarnings.add(warning)
        console.warn(warning)
      }
    }
    for (const group of groups.values()) group.sort((a, b) => a.id.localeCompare(b.id))
    const grouped = new Map(
      drawableEntries
        .filter(e => e.descriptor.container)
        .map(entry => [entry.id, [...groups.values()].find(g => g.includes(entry))!]),
    )
    const containerUse = new Set<string>()
    const groupCanvases = new Map<string, HTMLCanvasElement>()
    for (const group of groups.values()) {
      const token = group[0].descriptor.container!.id,
        container = registry.containers.get(token)
      const canvas = container && !containerUse.has(token) ? container.canvas : group[0].canvas
      containerUse.add(token)
      groupCanvases.set(group[0].id, canvas)
    }
    const active = new Set([
        ...groupCanvases.values(),
        ...entries
          .filter(e => !e.descriptor.container)
          .flatMap(e => (e.overlay ? [e.canvas, e.overlay] : [e.canvas])),
      ]),
      scrolls = new Map<string, GlassScrollSnapshot>(),
      regions: GlassRegion[] = []
    if (this.source) {
      const bounds = this.source.getBoundingClientRect()
      scrolls.set('webgpu-source-root', {
        id: 'webgpu-source-root',
        offsetX: this.source.scrollLeft,
        offsetY: this.source.scrollTop,
        viewportX: bounds.x,
        viewportY: bounds.y,
        width: bounds.width,
        height: bounds.height,
      })
    }
    for (const [canvas, presenter] of this.canvases)
      if (!registered.has(canvas)) {
        this.viewportObservers.get(canvas)?.dispose()
        this.viewportObservers.delete(canvas)
        this.viewportPending.delete(presenter.id)
        await this.send({ type: 'detach-presenter', id: presenter.id })
        this.viewportSamples.delete(presenter.id)
        this.presenterExtents.delete(presenter.id)
        this.viewportInFlight.delete(presenter.id)
        this.canvases.delete(canvas)
      }
    const generations = new Map(
      entries.map(entry => [entry.canvas, entry.canvas.dataset.satinGlassShow]),
    )
    const registrations = this.navigationReceipt
      ? new Map(entries.map(entry => [entry, entry.descriptor]))
      : undefined
    const presented: ((receipt: unknown) => void)[] = []
    let presenting = !!this.navigationReceipt
    // One top-layer order for every region in this scene.
    const topLayerDialogs = orderedTopLayerDialogs(document)
    for (const entry of entries) {
      if (!current()) return
      if (!entry.element.isConnected) continue
      const sheetMotion = presentationGlassMotion(entry.element)
      const sheetTrack = sheetMotion?.track
      const accessoryTrack = accessoryGlassMotion(entry.element)?.viewportTrack
      if (accessoryTrack && this.accessoryAdmissions.get(entry.canvas) !== accessoryTrack)
        presenting = true
      if (sheetMotion && !sheetMotion.admitted) presenting = true
      if (entry.canvas.dataset.satinGlassPresented !== 'true') presenting = true
      const inset = contextSampleInset(entry.descriptor.material.treatment)
      const rect = regionRects.get(entry)!
      const generation = generations.get(entry.canvas)
      const readiness = this.readiness.get(entry.canvas)
      if (readiness) this.waitForRegion(readiness)
      presented.push(receipt => {
        // A deferred scene leaves the previous coherent pixels in place. It cannot
        // acknowledge a new show, or revoke the existing show's presentation.
        if (receipt && typeof receipt === 'object' && 'superseded' in receipt && receipt.superseded)
          return
        if (!current() || this.readiness.get(entry.canvas) !== readiness) return
        if (
          !this.presentationAllowed ||
          !receipt ||
          typeof receipt !== 'object' ||
          !('presented' in receipt) ||
          !Array.isArray(receipt.presented) ||
          !receipt.presented.includes(entry.id)
        ) {
          delete entry.canvas.dataset.satinGlassPresented
          delete entry.canvas.dataset.satinGlassPresentedShow
          if (readiness) this.waitForRegion(readiness)
          return
        }
        if (entry.element.isConnected && entry.canvas.dataset.satinGlassShow === generation) {
          if (readiness) {
            readiness.presented = true
            readiness.deadline.cancel()
          }
          entry.canvas.dataset.satinGlassPresented = 'true'
          if (accessoryTrack) this.accessoryAdmissions.set(entry.canvas, accessoryTrack)
          else this.accessoryAdmissions.delete(entry.canvas)
          if (sheetMotion && sheetTrack) sheetMotion.acknowledge(sheetTrack)
          if (generation !== undefined) entry.canvas.dataset.satinGlassPresentedShow = generation
        }
      })
      const requested = entry.descriptor.layer,
        scroll =
          requested?.attachment.kind === 'fixed'
            ? null
            : entry.element.closest<HTMLElement>('[data-satin-scroll]')
      let scrollId: string | undefined
      if (scroll) {
        scrollId = this.scrolls.get(scroll)
        if (!scrollId) {
          scrollId = `webgpu-scroll-${++this.nextScroll}`
          this.scrolls.set(scroll, scrollId)
        }
        const bounds =
          zoomRestRect(scroll) ?? atRest(scroll.getBoundingClientRect(), presentationTravel(scroll))
        scrolls.set(scrollId, {
          id: scrollId,
          offsetX: scroll.scrollLeft,
          offsetY: scroll.scrollTop,
          viewportX: bounds.x,
          viewportY: bounds.y,
          width: bounds.width,
          height: bounds.height,
        })
      }
      const layer = {
        id: requested ? `${requested.id}:${scrollId ?? 'fixed'}` : (scrollId ?? 'glass-fixed'),
        depth: requested?.depth ?? 0,
        attachment: scrollId ? { kind: 'scroll' as const, scrollId } : { kind: 'fixed' as const },
      }
      const owner = scrollId ? scrolls.get(scrollId) : undefined
      if (entry.descriptor.emerge && scrollId) throw Error('Glass emerge requires a fixed layer')
      // An inactive tab keeps its layout (visibility: hidden), so its regions still measure. They
      // are not on screen: the worker keeps their last pixels and does not redraw them. Selected
      // again, a region stays held until its own tab's backdrop is installed.
      const inactive = !!entry.element.closest(INACTIVE_TAB)
      const panel = entry.element.closest(TAB_PANEL)
      if (inactive && panel) this.heldForTab.set(entry.element, panel)
      // Moved into another panel (or out of every panel) since it was held: a different place.
      else if (this.heldForTab.get(entry.element) !== panel) this.heldForTab.delete(entry.element)
      const held = inactive || this.heldForTab.has(entry.element)
      // A held region's ink is captured when it resumes.
      const ink =
        entry.descriptor.emerge && !held
          ? await this.emergeInk(entry, layer.id, current)
          : undefined
      if (!current()) return
      regions.push({
        ...entry.descriptor,
        zoomRoute: (() => {
          const host = entry.element.closest<HTMLElement>('[data-satin-navigator-host]')
          const navigation = host ? navigationGlassState(host) : undefined
          if (!navigation?.active || !navigation.zoom) return undefined
          const index = navigation.routes.findIndex(route => route.motion.contains(entry.element))
          return index >= 0 ? index : undefined
        })(),
        presentationViewportTrack: sheetTrack,
        presentationContentEpoch: presentationGlassContentEpoch(entry.element),
        accessoryViewportTrack: accessoryTrack,
        accessoryTrack: accessoryGlassMotion(entry.element)?.track,
        shapeTrack: glassShapeTrack(entry.element),
        accessoryReach: layerFrame(accessoryReach(entry.element), owner),
        ...(ink && entry.descriptor.emerge ? { emerge: { ...entry.descriptor.emerge, ink } } : {}),
        container: entry.descriptor.container
          ? {
              ...entry.descriptor.container,
              continuous: registry.containers.get(entry.descriptor.container.id)?.continuous,
            }
          : undefined,
        sheetOpaqueMix:
          Number(entry.element.style.getPropertyValue('--satin-sheet-opaque-mix')) || 0,
        popoverArrow: popoverArrow(entry.element, rect),
        ...(entry.element.closest('[data-satin-menu-panel]') ? { inMenuPanel: true } : {}),
        backdropExclusions: backdropExclusions(
          entry.element,
          !!entry.descriptor.material.treatment,
          topLayerDialogs,
        ),
        layer,
        frame: {
          x: rect.x - (owner?.viewportX ?? 0) + (owner?.offsetX ?? 0),
          y: rect.y - (owner?.viewportY ?? 0) + (owner?.offsetY ?? 0),
          width: rect.width,
          height: rect.height,
        },
        ...(held ? { suspended: true } : {}),
      })
      if (!drawableIds.has(entry.id)) continue
      // A region that emerges from a trigger presents over both rectangles (fixed layer: viewport points).
      const group = grouped.get(entry.id)
      if (group && group[0] !== entry) continue
      const container = entry.descriptor.container
        ? registry.containers.get(entry.descriptor.container.id)
        : undefined
      const groupCanvas = groupCanvases.get(entry.id)
      const holder = container ? layoutRect(container.element) : rect
      const canvasHolder = container && groupCanvas === container.canvas ? holder : rect
      const fieldHolder =
        container && group
          ? this.fieldEnvelope(
              container.element,
              group,
              group.map(member => regionRects.get(member)!),
            )
          : holder
      // A held-still accessory canvas covers every place its glass goes (accessoryReach).
      const reach = accessoryReach(entry.element)
      const bounds = glassPresenterBounds(
        reach ? frameUnion(fieldHolder, reach) : fieldHolder,
        inset,
        entry.descriptor.emerge,
      )
      const regionIds = group?.map(e => e.id) ?? [entry.id]
      for (const [canvas, role] of [
        [groupCanvas ?? entry.canvas, 'material'],
        [group ? undefined : entry.overlay, 'lift'],
      ] as const) {
        if (!canvas) continue
        let known = this.canvases.get(canvas)
        if (known && known.layerId !== layer.id)
          throw Error('Unsupported glass presenter layer reassignment')
        if (!known) {
          const id = `app-presenter-${++this.nextPresenter}`,
            presenter: GlassPresenter = {
              id,
              role,
              layerId: layer.id,
              regionIds,
              origin: { x: bounds.x, y: bounds.y },
              ...(group && container ? { fieldOrigin: { x: holder.x, y: holder.y } } : {}),
              width: bounds.width,
              height: bounds.height,
              resolution: devicePixelRatio,
            }
          const offscreen = this.client.documentOwned ? canvas : canvas.transferControlToOffscreen()
          known = { id, layerId: layer.id }
          this.canvases.set(canvas, known)
          this.viewportSamples.set(id, {
            viewport: { x: bounds.x, y: bounds.y, scaleX: 1, scaleY: 1 },
            rect: [bounds.x, bounds.y, bounds.width, bounds.height],
          })
          await this.send(
            { type: 'attach-presenter', presenter, canvas: offscreen },
            this.client.documentOwned ? [] : [offscreen as OffscreenCanvas],
          )
        } else if (group)
          await this.send({
            type: 'update-presenter',
            presenter: {
              id: known.id,
              role,
              layerId: layer.id,
              regionIds,
              origin: { x: bounds.x, y: bounds.y },
              ...(group && container ? { fieldOrigin: { x: holder.x, y: holder.y } } : {}),
              width: bounds.width,
              height: bounds.height,
              resolution: devicePixelRatio,
            },
          })
        this.retainPresenterExtent(known.id, bounds)
        const holderElement =
          container && groupCanvas === container.canvas ? container.element : entry.element
        const followsHolder =
          !accessoryGlassMotion(entry.element) &&
          canvas.parentElement === holderElement &&
          sizesChildren(holderElement)
        const left = `${bounds.x - canvasHolder.x}px`,
          top = `${bounds.y - canvasHolder.y}px`,
          width = presenterSize(bounds.width, canvasHolder.width, followsHolder),
          height = presenterSize(bounds.height, canvasHolder.height, followsHolder)
        // An unchanged box is already the presenter's inline geometry. Rewriting it
        // restyles the canvas without moving a pixel.
        if (
          canvas.style.left !== left ||
          canvas.style.top !== top ||
          canvas.style.width !== width ||
          canvas.style.height !== height
        )
          Object.assign(canvas.style, {
            inset: 'auto',
            left,
            top,
            width,
            height,
            borderRadius: '0',
          })
        canvas.hidden = false
        if (!this.viewportObservers.has(canvas)) {
          const id = this.canvases.get(canvas)!.id
          this.viewportObservers.set(
            canvas,
            observePresenterViewport(canvas, (viewport, sampleRect, keyboard) => {
              void this.updateViewport(id, viewport, sampleRect, keyboard).catch(this.fail)
            }),
          )
        } else this.viewportObservers.get(canvas)!.sample()
      }
      if (group) continue
      const contentChanged = this.dirtyForegrounds.has(entry.element)
      if (
        accessoryGlassMotion(entry.element) &&
        !this.foregroundInputs.has(entry.id) &&
        !contentChanged
      )
        continue
      // A held region's ink is captured when it resumes (with its scene, in one transaction).
      if (held) continue
      // Glass buttons keep their live DOM label above the glass (it dims with the press highlight);
      // only interactive surfaces lift a captured foreground. The ink key is read only then.
      // A segmented selection (the scope bar) draws its labels as this ink, so its lens bends them;
      // its segments look alike in every state, so a selection change is not new ink.
      const accessoryWorker = accessoryWorkerEnabled(entry.element)
      if (
        accessoryWorker &&
        !contentChanged &&
        (accessoryGlassMotion(entry.element) ||
          (accessoryInkWidth(entry.element) ?? 0) > rect.width + 1)
      )
        continue
      const selection = !!entry.descriptor.selection
      if (
        entry.overlay &&
        !entry.descriptor.material.press &&
        !entry.descriptor.material.control &&
        entry.descriptor.material.treatment !== 'contextPreview' &&
        !selection &&
        !accessoryWorker &&
        this.deferIdleForeground(entry)
      )
        continue
      if (
        (entry.overlay && !entry.descriptor.material.press && !entry.descriptor.material.control) ||
        entry.descriptor.material.treatment === 'contextPreview' ||
        selection ||
        accessoryWorker
      ) {
        const font = getComputedStyle(entry.element),
          foregroundKey = JSON.stringify([
            rect.width,
            rect.height,
            entry.element.textContent,
            // A remounted selection is a new region: its ink is sent again under its own id.
            selection ? entry.id : inkSignature(entry.element),
            font.font,
            font.color,
            this.appearance,
          ])
        if (this.foregrounds.get(entry.element) !== foregroundKey) {
          const foreground = await glassTimedAsync('region-foreground', () =>
            captureRegionForeground(entry.element, devicePixelRatio, inset, undefined, {
              accessory: accessoryGlassMotion(entry.element)?.track,
            }),
          )
          // Released on every exit, and only after the request that carries its bitmap has resolved
          // (inside a transaction that is when the transaction has been sent).
          this.consumedCanvases.push(foreground)
          this.armReleaseFallback()
          try {
            if (!current()) return
            if (!entry.element.isConnected) continue
            const bitmap = await createImageBitmap(foreground)
            if (!current()) {
              bitmap.close()
              return
            }
            await this.send(
              {
                type: 'source',
                source: {
                  id: `foreground:${entry.id}`,
                  regionId: entry.id,
                  revision: ++this.foregroundRevision,
                  layerId: layer.id,
                  role: 'foreground',
                  origin: { x: rect.x - inset, y: rect.y - inset },
                  width: bitmap.width / devicePixelRatio,
                  height: bitmap.height / devicePixelRatio,
                  resolution: devicePixelRatio,
                },
                bitmap,
              },
              [bitmap],
            )
            // A superseded refresh must not mark its capture current in the next epoch's map.
            if (current()) {
              this.foregrounds.set(entry.element, foregroundKey)
              this.dirtyForegrounds.delete(entry.element)
              if (accessoryWorker) accessoryInkReady(entry.element, rect.width)
            }
            // The glass now draws the labels: the page's stay live (VoiceOver, selection) but
            // transparent, like a menu's rows under its glass ink.
            if (current() && selection) entry.element.dataset.satinGlassInk = 'true'
          } finally {
            if (!this.batch) this.releaseConsumedCanvases()
          }
        }
      }
    }
    if (!current()) return
    // While the refresh waited, layout can move glass without changing any epoch (Reminders cold
    // launch: WebKit settles 1366 -> 1334 pt and the toolbar rises 32 pt past the 24 pt capture
    // margin). Recheck only that the moved glass is still inside the captured rows; movement
    // within them, and refreshes that never yielded (scroll-driven scenes), cost nothing here.
    const uncovered = yielded ? this.coverage?.(() => this.sampleRects()) : undefined
    if (uncovered) {
      void uncovered.then(this.invalidate, this.fail)
      return
    }
    for (const [canvas] of this.canvases) if (!active.has(canvas)) canvas.hidden = true
    // A scroll-driven scene (every frame while content scrolls under fixed glass) is posted,
    // not awaited: waiting for the worker's reply before the next refresh could run held region
    // glass to ~40 Hz on iPadOS 27. The worker applies scenes in post order either way. A scene
    // that brings a presenter up for the first time is awaited: the element is marked presented
    // (and, e.g., a context menu revealed) only once its glass exists.
    const scene: GlassRendererRequest = {
      type: 'scene',
      snapshot: {
        revision: ++this.revision,
        sourceRevision,
        backdropOwners: topLayerDialogs.map(dialog => backdropOwner(dialog)!),
        regions,
        layers: [...new Map(regions.map(r => [r.layer.id, r.layer])).values()],
        scrolls: [...scrolls.values()],
      },
    }
    let receipt: unknown
    // A parked scene survives a cancelled source update, but never retired DOM ownership or superseded menu motion.
    this.sceneValidity.set(
      scene,
      () =>
        registry === this.registry &&
        snapshotVersion === registry.snapshotVersion &&
        sourceRevision === this.sourceRevision &&
        navigationCurrent() &&
        motionTracksCurrent(),
    )
    this.scenePresented.set(scene, receipt => {
      for (const acknowledge of presented) acknowledge(receipt)
    })
    if (!current()) return
    if (this.batch) await this.send(scene)
    else if (presenting) receipt = await this.sendScene(scene)
    else this.postScene(scene)
    if (!current()) {
      if (this.navigationReceipt) {
        if (epoch !== this.epoch || registry !== this.registry)
          throw new DOMException('Navigation region registration superseded', 'AbortError')
        this.navigationRetry = true
      }
      return
    }
    if (this.navigationReceipt) {
      const live = registry.values().filter(entry => sceneRegionRect(entry) !== undefined)
      if (
        live.length !== registrations?.size ||
        live.some(
          entry =>
            registrations?.get(entry) !== entry.descriptor ||
            generations.get(entry.canvas) !== entry.canvas.dataset.satinGlassShow,
        )
      ) {
        this.navigationRetry = true
        return
      }
      const admitted = receipt as { navigation?: string; presented?: string[] } | undefined
      if (
        admitted?.navigation !== this.navigationReceipt ||
        drawableEntries.some(
          entry => !entry.element.closest(INACTIVE_TAB) && !admitted.presented?.includes(entry.id),
        )
      )
        throw Error(
          `Navigation ${this.navigationReceipt} has no current-source region draw receipt`,
        )
      this.navigationRetry = false
    }
    // Declarative interaction may predate worker subscription on cold launch.
    for (const entry of entries) {
      const input = registry.interactions.get(entry.id)
      if (input && input.phase !== 'rest' && !this.foregroundInputs.has(entry.id))
        await this.send({ type: 'interaction', interaction: input })
    }
    if (this.batch) this.batch.presented.push(...presented)
    else if (presenting) for (const acknowledge of presented) acknowledge(receipt)
  }
}

/** A confirmation popover names its arrow on its glass element (`--satin-popover-arrow`:
 * `top|bottom <x px>` in layout points). The measured frame carries the presentation transform,
 * so the arrow takes the same scale. */
function popoverArrow(element: HTMLElement, rect: { width: number }): PopoverArrow | undefined {
  const [edge, value] = element.style.getPropertyValue('--satin-popover-arrow').trim().split(/\s+/)
  const x = Number.parseFloat(value ?? '')
  if ((edge !== 'top' && edge !== 'bottom') || !Number.isFinite(x) || !element.offsetWidth)
    return undefined
  const scale = rect.width / element.offsetWidth
  return { edge, x: x * scale, scale }
}
