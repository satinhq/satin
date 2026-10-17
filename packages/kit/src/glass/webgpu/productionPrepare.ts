import { uncoveredCapturePlane } from './productionPlanes.ts'
import { SupersededImage } from '../../image/resource.ts'
import { contextBackdrop } from './contextBackdrop.ts'
import { tabGlyphContextStyle } from '../lens/tabGlyphColours.ts'
import type { Appearance } from '../lens/theme.ts'
import type { RuntimeGeometry, RuntimeOptions, SurfaceRenderSpec } from '../renderSpecs.ts'
import type { WebGPURequest as Request } from '../worker/protocol.ts'
import { cssColor, discoverBackdropHosts } from './backdropLayers.ts'
import { confirmHeldSources, heldPresentations } from '../presentationFrame.ts'
import { captureIncomplete, captureProductionGlyphs, rasterProductionSource } from './capture.ts'
import { CAPTURE_CONTEXT } from './captureContext.ts'
import {
  releaseCaptureCanvas,
  releaseCaptureCanvases,
  releaseCaptureCanvasesAfter,
} from './captureRelease.ts'
import { captureRegionForeground } from './foreground.ts'
import { inkForRevision } from './keptGlyphs.ts'
import { discardChangedPinnedTops, preparePinnedTops } from './productionPinnedTopPrepare.ts'
import { keepSourceBands, pixelImage, takeSourceBands } from './preparedSourcePixels.ts'
import type { ProductionGlassRuntime } from './production.ts'
import {
  backdropLayers,
  composeMaterialContext,
  findVisibleContentPlane,
  materialContextAreas,
  measurePlane,
  TAB_CONTEXT_RADIUS,
  planeDiagnostics,
  planeSetContextKey,
  textKey,
  visiblePlaneSetKey,
  type MaterialContext,
  type Plane,
  type PlaneEntry,
  type PlaneCapture,
  type PlaneCaptureFrame,
} from './productionPlanes.ts'
import {
  commitPlaneSet,
  sourceImages,
  surfaceInstalls,
  syncPlaneScrolls,
} from './productionInstalls.ts'
import { placeSurfaceCanvases } from './productionViewport.ts'
import { glassNow, glassTiming, traceStage, traceStageStart } from './profile.ts'
import { lagTraceEnabled } from './lagTrace.ts'
import { readScrollEdges } from './scrollEdgeBackdrop.ts'
import type { CaptureBand, SampleRect } from './captureDemand.ts'

type RuntimeElements = RuntimeOptions['elements']

export async function commitPreparedContent(
  runtime: Pick<ProductionGlassRuntime, 'contentInstall' | 'post'>,
  current: () => boolean,
) {
  if (!current()) return false
  const revision = runtime.contentInstall
  if (revision === undefined) return true
  const receipt = await runtime.post({ type: 'content-commit', revision })
  if (!current()) return false
  if (
    !receipt ||
    typeof receipt !== 'object' ||
    !('accepted' in receipt) ||
    receipt.accepted !== true ||
    !('revision' in receipt) ||
    receipt.revision !== revision
  )
    throw Error(`WebGPU content commit rejected for revision ${revision}`)
  if (runtime.contentInstall === revision) runtime.contentInstall = undefined
  return true
}

/** A stale commit acknowledgement must retain the barrier record for resume. */
export async function commitPreparedAppearance(
  runtime: Pick<ProductionGlassRuntime, 'appearanceInstall' | 'post'>,
  appearance: Appearance,
  current: () => boolean,
) {
  if (!current()) return false
  const appearanceInstall = runtime.appearanceInstall
  if (appearanceInstall?.value !== appearance) return current()
  const acknowledgement = await runtime.post({
    type: 'appearance-commit',
    revision: appearanceInstall.revision,
  })
  if (!current()) return false
  if (
    !acknowledgement ||
    typeof acknowledgement !== 'object' ||
    !('accepted' in acknowledgement) ||
    acknowledgement.accepted !== true ||
    !('revision' in acknowledgement) ||
    acknowledgement.revision !== appearanceInstall.revision
  ) {
    // A current capture rejection is a protocol failure, not successful preparation.
    // The preparation owner reports it and bounds its same-renderer rebuild to one retry.
    throw new Error(`WebGPU appearance commit rejected for revision ${appearanceInstall.revision}`)
  }
  if (runtime.appearanceInstall === appearanceInstall) runtime.appearanceInstall = undefined
  return true
}

/** One preparation at a time. Requests during a run coalesce into one follow-up run,
 * so continuous DOM updates cannot starve the glass of a committed source. */
export async function prepareSources(runtime: ProductionGlassRuntime) {
  if (runtime.preparing) {
    runtime.prepareAgain = true
    if (lagTraceEnabled()) glassTiming('prepare-coalesced')
    return runtime.preparing
  }
  const revision = ++runtime.revision
  if (lagTraceEnabled()) glassTiming('prepare-requested', glassNow(), String(revision))
  const navigationRevision = runtime.navigationRevision
  // This run measures every plane at its scroll offset now: it serves any recentre asked so far.
  runtime.pendingRecentre = false
  // Superseded work (hidden, detached, navigation, geometry) is dropped quietly at every await.
  const current = () =>
    runtime.attached &&
    revision === runtime.revision &&
    navigationRevision === runtime.navigationRevision &&
    !runtime.navigationActive &&
    !document.hidden &&
    !runtime.lifecycleHidden
  // A real failure is reported loudly, then the same renderer rebuilds every source once.
  const run = async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await prepareRevision(runtime, revision, current)
        } catch (error) {
          if (!current()) return
          // An image changed source mid-capture: measure the page again, without waiting for
          // the abandoned decode.
          if (error instanceof SupersededImage) {
            runtime.prepareAgain = true
            return
          }
          if (attempt) throw error
          runtime.fail('source preparation; rebuilding same WebGPU renderer', error, true)
          runtime.replaceFailedSourcePixels()
          glassTiming('source-rebuild')
        }
      }
    } finally {
      clearPreparation(runtime)
    }
  }
  runtime.serial = runtime.serial.then(run, run)
  runtime.preparing = runtime.serial.finally(() => {
    runtime.preparing = undefined
    if (runtime.prepareAgain) {
      runtime.prepareAgain = false
      // A recentre that arrived during this run must not wait for the scroll to end.
      runtime.schedulePrepare(runtime.pendingRecentre, runtime.pendingRecentre)
    }
  })
  return runtime.preparing
}

function clearPreparation(runtime: ProductionGlassRuntime) {
  runtime.preparingPlaneHosts.clear()
  runtime.preparingPlaneWindows?.clear()
  runtime.preparingPinnedWindows?.clear()
  runtime.menuStage = 'prepare'
}

/** A stack may mount its first glass region during a push. The navigation job already
 * owns the serial queue, so initialize its backdrop here rather than scheduling a
 * preparation behind ourselves. Later navigation revisions still invalidate this work. */
export async function prepareInitialNavigationSource(
  runtime: ProductionGlassRuntime,
  current: () => boolean,
) {
  try {
    await prepareRevision(runtime, ++runtime.revision, current)
  } finally {
    clearPreparation(runtime)
  }
}

/** Capture what changed (backdrop planes, material context, chrome glyphs) and install it in the
 * worker, then (re)install every chrome surface on its layer. */
async function prepareRevision(
  runtime: ProductionGlassRuntime,
  revision: number,
  current: () => boolean,
) {
  const started = glassNow()
  if (!current()) return
  const damageGenerations = new Map(runtime.damageGenerations)
  const fontGeneration = runtime.fontGeneration ?? 0
  const menuGeneration = runtime.menuGeneration
  runtime.menuStage = 'raster'
  const { geometry, appearance, elements } = runtime.options
  const resolution = devicePixelRatio
  const dark = appearance === 'dark'
  const text = textKey()
  // Dynamic Type changed: every resident capture was laid out at the old size.
  if (runtime.lastText !== undefined && runtime.lastText !== text) runtime.dropRetained()
  runtime.lastText = text
  // Right after a navigation the content host can still be the covered route until the
  // retarget commit hands over the new top: preparing now would capture a stale content
  // plane and be redone. Wait briefly for the retarget (it schedules its own preparation).
  if (
    runtime.contentPlane &&
    (!elements.contentHost.isConnected ||
      elements.contentHost.closest('[data-satin-covered="true"]'))
  ) {
    runtime.coveredSince ||= performance.now()
    if (performance.now() - runtime.coveredSince < 250) {
      glassTiming('prepare-deferred-retarget', started)
      clearTimeout(runtime.coveredRetry)
      runtime.coveredRetry = setTimeout(() => runtime.schedulePrepare(), 260) as unknown as number
      return
    }
  }
  runtime.coveredSince = 0
  clearTimeout(runtime.coveredRetry)
  const opened: ImageBitmap[] = []
  /** Capture canvases of planes that left the plane set in this revision's commit. */
  const droppedCanvases: HTMLCanvasElement[] = []
  try {
    // Screen-space backdrop: every visible scroll container (and every static screen)
    // is a plane with its own content-space capture; the worker composes them per glass.
    const scene =
      elements.contentHost.closest<HTMLElement>('[data-satin-scene-paint-layer]') ?? document.body
    const page = dark ? ([0, 0, 0] as const) : ([242 / 255, 242 / 255, 247 / 255] as const)
    const frame: PlaneCaptureFrame = {
      page,
      resolution,
      appearance,
      covering: runtime.coverageWaiting,
    }
    const planeId = (host: HTMLElement) => runtime.planeId(host)
    const windowHint = (id: string, host: HTMLElement) => runtime.windowHint(id, host)
    runtime.preparingPlaneWindows ??= new Map()
    const captureChosen = (id: string, capture: Pick<PlaneEntry, 'host' | 'window' | 'width'>) =>
      runtime.preparingPlaneWindows.set(id, capture)
    // Read only if a plane that does not scroll is measured (windowHint): it reads every region's box.
    let demand: SampleRect[] | undefined
    runtime.captureDemand = () => (demand ??= sampleDemand(runtime))
    const planes: Plane[] = []
    // Presentations held for their first glass while these planes are measured: once the renderer
    // holds this backdrop, their nested glass may be drawn over it (presentationFrame.ts).
    const held = heldPresentations()
    for (const host of discoverBackdropHosts(scene, elements.contentHost)) {
      const found = await measurePlane(
        host,
        frame,
        planeId,
        false,
        windowHint,
        undefined,
        captureChosen,
      )
      if (!current()) return dropped(runtime, revision)
      if (found) planes.push(found)
    }
    // Navigation motion applies to the plane that holds the navigation source. A hidden
    // source (a collapsed sidebar) still backs the chrome's navigation input, but is not
    // part of the screen: with nothing visible the backdrop is the page background alone.
    const visibleContent = findVisibleContentPlane(planes, elements.contentHost)
    const contentPlane =
      visibleContent ??
      (await measurePlane(
        elements.contentHost,
        frame,
        planeId,
        true,
        windowHint,
        undefined,
        captureChosen,
      ))!
    if (!current()) return dropped(runtime, revision)
    if (!visibleContent) planes.push(contentPlane)
    const captures = new Map<string, PlaneCapture>()
    const reused = new Set<string>()
    let capture: { context: MaterialContext } | undefined
    const overlay = contextBackdrop(scene.ownerDocument)
    const overlayKey = JSON.stringify(overlay ?? null)
    const contextKey = planeSetContextKey(planes, contentPlane, geometry, page) + overlayKey
    for (const plane of planes) {
      if (
        !runtime.damaged.has(plane.id) &&
        runtime.planes.get(plane.id)?.signature === plane.signature &&
        runtime.context
      )
        continue
      const retained = runtime.resident.usable(plane.id, appearance, text)
      if (!runtime.damaged.has(plane.id) && retained?.signature === plane.signature) {
        reused.add(plane.id)
        continue
      }
      const domStarted = glassNow()
      const source = await rasterPlane(runtime, plane, resolution, dark)
      const bitmap = await planeImage(
        runtime,
        source,
        plane.bands && { bands: plane.bands, resolution },
      )
      opened.push(bitmap)
      runtime.planeBytes.set(plane.id, imageBytes(bitmap))
      glassTiming('dom-source', domStarted, plane.id)
      // A photo that has not drawn yet: this capture is used, but it is not current (its signature
      // never matches), and another preparation follows until the photo is in.
      if (captureIncomplete(source)) {
        const attempts = (runtime.incompleteCaptures.get(plane.id) ?? 0) + 1
        runtime.incompleteCaptures.set(plane.id, attempts)
        if (attempts > 20)
          throw Error(
            `Glass capture: a photo in ${plane.id} did not draw into the backdrop in 20 captures`,
          )
        runtime.prepareAgain = true
        captures.set(plane.id, {
          bitmap,
          signature: `incomplete:${attempts}:${plane.signature}`,
        })
      } else {
        runtime.incompleteCaptures.delete(plane.id)
        captures.set(plane.id, { bitmap, signature: plane.signature })
      }
      if (!current()) return dropped(runtime, revision, opened)
    }
    if (reused.size) glassTiming('planes-retained', started, () => [...reused].join(','))
    // The top of a long list whose window is further down (productionPinnedTop.ts).
    const pinned = await preparePinnedTops(
      runtime,
      planes,
      captures,
      frame,
      text,
      damageGenerations,
    )
    for (const entry of pinned.images) if (entry.image) opened.push(entry.image)
    if (!current()) return dropped(runtime, revision, opened)
    // The context is also rebuilt when only the visible plane SET changed (a popped page's plane
    // leaving): reusing it kept the popped page's context and tab ink regime. Geometry alone (a
    // sheet or route moving) does not rebuild it: that readback cost frames during motion.
    const contextGeometry =
      visiblePlaneSetKey(planes, runtime.planes, contentPlane, geometry) + overlayKey
    const cached = !captures.size && reused.size ? runtime.resident.context(contextKey) : undefined
    let contextBytes = 0
    const contextUnchanged =
      !reused.size && contextGeometry === runtime.contextGeometry && runtime.context
    if (!captures.size && (cached || contextUnchanged)) {
      glassTiming('capture-reused', started)
      if (cached) capture = { context: cached }
    } else {
      // A plane whose canvas no longer holds its capture (it shared storage, or it returned from
      // retention) is re-rastered for this readback only; the worker keeps its upload.
      for (const plane of planes)
        if (!plane.hidden && runtime.planeCanvases.get(plane.id)?.signature !== plane.signature) {
          await rasterPlane(runtime, plane, resolution, dark)
          if (!current()) return dropped(runtime, revision, opened)
        }
      const composed = composeMaterialContext(
        runtime.contextCanvas,
        planes,
        runtime.planeCanvases,
        contentPlane,
        geometry,
        frame,
        materialContextAreas(runtime.currentSpecs(), elements.scroller, geometry.height),
        overlay?.alpha,
      )
      capture = { context: composed.context }
      contextBytes = composed.bytes
    }
    if (capture && contextBytes)
      runtime.resident.storeContext(contextKey, capture.context, contextBytes)
    const context = capture?.context ?? runtime.context!
    const baseSpecs = runtime.currentSpecs()
    const specs = baseSpecs.map(spec =>
      spec.id === 'dock' && runtime.minimizeDom ? runtime.minimizeDom.current(spec) : spec,
    )
    const dock = specs.find(spec => spec.id === 'dock')
    if (dock) applyTabGlyphContext(dock, elements, context, geometry, appearance)
    // Glyph ink is keyed by the controls' own content and computed paint; unchanged glyphs keep
    // their worker slot. Which ink this revision installs: inkForRevision.
    const backdropChanges = captures.size > 0 || reused.size > 0
    const deferredInk = new Set<string>()
    const glyphSignatures = new Map(
      specs.map(spec => {
        const signature = `${fontGeneration}:${glyphSignature(spec, elements, appearance, resolution, geometry)}`
        const ink = inkForRevision({
          signature,
          installed: runtime.glyphs.get(spec.id),
          kept: !!runtime.keptGlyphs.find(spec.id, signature),
          transformed: !!runtime.minimizeDom?.inkTransformed,
          backdropChanges,
          deferredBefore: runtime.deferredInk.has(spec.id),
        })
        if (ink.deferred) deferredInk.add(spec.id)
        return [spec.id, ink.signature] as const
      }),
    )
    runtime.deferredInk = deferredInk
    if (deferredInk.size) runtime.prepareAgain = true
    const glyphs = new Map<SurfaceRenderSpec['id'], ImageBitmap>()
    /** Slots whose new ink the renderer still keeps: installed by key, nothing is captured. */
    const keptGlyphs = new Map<SurfaceRenderSpec['id'], string>()
    for (const spec of specs) {
      const signature = glyphSignatures.get(spec.id)!
      if (runtime.glyphs.get(spec.id)?.signature === signature) continue
      const kept = runtime.keptGlyphs.find(spec.id, signature)
      if (kept) {
        keptGlyphs.set(spec.id, kept)
        continue
      }
      const glyphStarted = glassNow()
      let canvas = runtime.glyphCanvases.get(spec.id)
      if (!canvas) {
        canvas = document.createElement('canvas')
        runtime.glyphCanvases.set(spec.id, canvas)
      }
      let glyphCanvas: HTMLCanvasElement
      if (spec.id === 'right' && elements.menu) {
        // The menu surface's glyph layer is its trigger ink alone (tab glyphs never apply).
        glyphCanvas = canvas
        const pixelWidth = Math.ceil(spec.sampleWidth * resolution)
        const pixelHeight = Math.ceil(spec.sampleHeight * resolution)
        if (glyphCanvas.width !== pixelWidth || glyphCanvas.height !== pixelHeight) {
          glyphCanvas.width = pixelWidth
          glyphCanvas.height = pixelHeight
        }
        const ink = await captureRegionForeground(elements.menu.trigger, resolution, 0)
        try {
          drawMenuTriggerInk(glyphCanvas, ink, spec, resolution, pixelWidth, pixelHeight)
        } finally {
          releaseCaptureCanvas(ink)
        }
      } else
        glyphCanvas = await captureProductionGlyphs(elements.chrome.dock, spec, resolution, canvas)
      const bitmap = await createImageBitmap(glyphCanvas)
      opened.push(bitmap)
      glyphs.set(spec.id, bitmap)
      glassTiming('chrome-glyphs', glyphStarted, spec.id)
      if (!current()) return dropped(runtime, revision, opened)
    }
    // Plane geometry (origin, clip, fill, order) decides composition even when no capture changed.
    const planeGeometry = planes.map(plane => [
      plane.id,
      plane.signature,
      plane.origin,
      plane.clip,
      plane.fill,
    ])
    const preparedSignature = JSON.stringify([
      planeGeometry,
      contentPlane.id,
      baseSpecs,
      appearance,
      runtime.liftAttached,
      runtime.appRegions.needsBackdrop,
      [...glyphSignatures],
    ])
    if (
      !captures.size &&
      !glyphs.size &&
      !keptGlyphs.size &&
      !pinned.images.length &&
      !pinned.release.length &&
      !runtime.resumePending &&
      preparedSignature === runtime.preparedSignature
    ) {
      // Nothing the worker holds would change; only app regions may need a scene refresh.
      // The worker acknowledged exactly this prepared state: a menu surface in it is ready.
      if (
        baseSpecs.some(spec => spec.id === 'right') &&
        menuGeneration === runtime.menuGeneration &&
        runtime.options.menuEnabled
      ) {
        runtime.menuReady = true
        runtime.menuSurface.cancel()
      }
      // The renderer already holds this tab's backdrop: its regions need not stay held.
      runtime.appRegions.releaseHeldRegions()
      confirmHeldSources(held)
      runtime.coverageInstalled()
      await runtime.appRegions.sourceChanged(appearance)
      if (!(await commitPreparedAppearance(runtime, appearance, current))) return
      if (!(await commitPreparedContent(runtime, current))) return
      runtime.options.onSourceReady?.(elements.scroller)
      runtime.windowsCommitted()
      glassTiming('production-reused', started, () =>
        JSON.stringify({
          tab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim(),
          planes: planes.map(planeDiagnostics),
        }),
      )
      runtime.record({
        kind: 'prepared',
        revision,
        at: performance.now(),
        regions: specs.map(spec => spec.id),
        capture: 'reused',
        planes: planes.map(plane => plane.id),
        planeInfo: planes.map(planeDiagnostics),
      })
      return
    }
    if (!current()) return dropped(runtime, revision, opened)
    if (fontGeneration !== (runtime.fontGeneration ?? 0)) runtime.prepareAgain = true
    // Measurement and readback awaited while Search (or any glass) could move. Never
    // install obsolete bands and rely on a later coverage acknowledgement to repair them.
    const uncovered = uncoveredCapturePlane(planes, sampleDemand(runtime), resolution)
    if (uncovered) {
      runtime.prepareAgain = true
      runtime.pendingRecentre = true
      return dropped(runtime, revision, opened, `capture demand moved: ${uncovered}`)
    }
    const commitStarted = traceStageStart()
    // Commit: one synchronous block, so nothing (navigation included) can interleave
    // its own source messages between this revision's transport numbers.
    // Regions of unselected tabs are held on their own backdrop; the selected tab's resume.
    const suspendedRegions = runtime.appRegions.inactiveRegionIds()
    discardChangedPinnedTops(runtime, pinned, opened)
    const committed = commitPlaneSet(runtime, {
      planes,
      contentPlane,
      captures,
      reused,
      capture,
      contextKey,
      geometry,
      resolution,
      appearance,
      text,
      damageGenerations,
    })
    const { removed, retain, restore, unretain } = committed
    droppedCanvases.push(...committed.droppedCanvases)
    const installed = runtime.installedSource!
    const batch = runtime.nextTransport()
    // A slot that takes other ink leaves its own with the renderer (KeptGlyphs), to come back to.
    const keep: string[] = []
    const unkeep: string[] = []
    const installedGlyphs = () => [...runtime.glyphs.values()].map(glyph => glyph.key)
    for (const id of [...glyphs.keys(), ...keptGlyphs.keys()]) {
      const outgoing = runtime.glyphs.get(id)
      const signature = glyphSignatures.get(id)!
      const key = keptGlyphs.get(id) ?? `production-glyph:${id}:${++runtime.glyphRevision}`
      runtime.glyphs.set(id, { signature, key })
      runtime.keptGlyphs.used(id, signature)
      const kept = runtime.keptGlyphs.replace(id, outgoing, installedGlyphs())
      keep.push(...kept.keep)
      unkeep.push(...kept.unkeep)
    }
    // The captures whose bytes stay on the page, and the pinned tops this revision leaves.
    for (const id of [...removed, ...reused]) runtime.planeImages.delete(id)
    for (const [id, { bitmap }] of captures) runtime.planeImages.set(id, bitmap)
    runtime.pinnedTops = pinned.next
    runtime.pinnedOrphans.clear()
    const images = [...sourceImages(runtime, captures, glyphs, keptGlyphs.keys()), ...pinned.images]
    const layers = backdropLayers(planes, runtime.planes, resolution, runtime.pinnedTops)
    if (overlay) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')
      if (!context) throw Error('Context backdrop has no 2D context')
      context.fillStyle = `rgb(0 0 0 / ${overlay.alpha})`
      context.fillRect(0, 0, 1, 1)
      const image = await createImageBitmap(canvas)
      opened.push(image)
      if (!current()) return dropped(runtime, revision, opened)
      const key = `context-backdrop:${overlayKey}`
      images.push({ slot: 'context-backdrop', key, image })
      layers.push({
        id: 'context-backdrop',
        key,
        owner: overlay.owner,
        menuOverlay: true,
        width: geometry.width,
        height: geometry.height,
        resolution: 1,
        origin: { x: 0, y: 0 },
        scroll: { x: 0, y: 0 },
        clip: [0, 0, geometry.width, geometry.height],
        fill: [0, 0, 0, overlay.alpha],
      })
    }
    opened.length = 0
    syncPlaneScrolls(runtime, planes, elements.scroller)
    // The finished navigation's atlas is no longer sampled: rasters that still show it hold their own leases.
    const release = [
      ...(runtime.installedNavigation ? ['navigation', 'navigation-glyphs'] : []),
      ...removed.map(id => `plane:${id}`),
      ...pinned.release,
      ...(!overlay ? ['context-backdrop'] : []),
    ]
    runtime.installedNavigation = undefined
    const edges = readScrollEdges(scene, dark)
    runtime.installedEdges = JSON.stringify(edges)
    runtime.appRegions.sourceWillChange(batch)
    const sent: Promise<unknown>[] = [
      runtime.post(
        {
          type: 'source-images',
          revision: batch,
          images,
          release,
          keep,
          unkeep,
          layers,
          suspendedRegions,
          edges,
          retain,
          restore,
          unretain,
          backdrop: runtime.appRegions.needsBackdrop
            ? {
                regions: true,
                key: `${installed.key}:front`,
                revision: installed.revision,
                appearance,
                reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
                resolution,
              }
            : { regions: false },
        },
        images.flatMap(entry => (entry.image ? [entry.image] : [])),
      ),
    ]
    // Only accepted source batches release a held presentation. Coverage waiters also retry
    // after rejection so cancellation and the bounded coverage deadline remain live.
    const navigationCoverage = runtime.navigationCoverage
    sent[0]!.then(
      () => {
        if (!runtime.navigationActive && runtime.navigationCoverage === navigationCoverage)
          runtime.navigationCoverage = undefined
        confirmHeldSources(held)
        runtime.coverageInstalled()
      },
      () => runtime.coverageInstalled(),
    )
    // The regions' scene follows the renderer's acknowledgement of the batch above; if the renderer
    // rejects it, held regions stay held (RegionBridge.sourceInstalled).
    sent.push(runtime.appRegions.sourceInstalled(sent[0], appearance))
    const trigger = runtime.triggerValues(elements.scroller.scrollTop)
    const installs: Request[] = placeSurfaceCanvases(
      baseSpecs,
      geometry,
      {
        chrome: runtime.canvas,
        menu: runtime.menuCanvas,
        chromeLift: runtime.liftCanvas,
        menuLift: runtime.menuLiftCanvas,
      },
      runtime.liftAttached,
      runtime.liftViewports,
    )
    const menuTrack = runtime.menuTrackSince('right', started)
    const barTrack = runtime.menuTrackSince('region:bar-trigger', started)
    const now = glassNow()
    runtime.record({
      kind: 'prepare-menu',
      revision,
      started: Math.round(started - performance.timeOrigin),
      tracked: !!menuTrack,
    })
    installs.push(
      ...surfaceInstalls(runtime, specs, {
        menuTrack,
        barTrack,
        now,
        appearance,
        sourceKey: installed.key,
        contentLayer: contentPlane.id,
        sourceScrollY: elements.scroller.scrollTop,
        trigger,
        geometry,
        resolution,
      }),
    )
    // One GPU fence and one present for the whole batch: per-install fences serialized
    // the worker queue for tens of milliseconds and starved concurrent motion frames.
    installs.forEach((install, i) => {
      const last = i === installs.length - 1
      sent.push(runtime.post(last ? install : ({ ...install, settle: false } as Request)))
    })
    // Queued after the installs: a run that ended while they were in flight still settles on its end state.
    for (const track of [menuTrack, barTrack])
      if (track) runtime.fire({ type: 'region-track', track })
    sent.push(runtime.post({ type: 'source-scroll', y: elements.scroller.scrollTop }))
    runtime.searchGeometry()
    // Visibility restoration already presented retained planes. This completes only
    // the background source refresh.
    const resuming = runtime.resumePending
    // A held menu run waits until the worker has acknowledged its surface's install, not only until it is posted.
    const installsMenu = specs.some(spec => spec.id === 'right')
    // A new menu surface install is pending until the worker acknowledges it.
    if (installsMenu) {
      runtime.menuStage = 'install-ack'
      runtime.menuReady = false
    }
    traceStage('prepare-commit-post', commitStarted)
    // Released once the worker has acknowledged (or rejected) the batch. The release is a
    // synchronous GPU-process round trip that waits behind whatever the GPU process is doing: 80 ms
    // while the worker was still uploading this batch (which also held back the new tab's first
    // paint), 1-2 ms once it is idle. A worker that never answers must not keep them allocated:
    // they are released after a fallback delay. A failure before this point releases them in the
    // catch below.
    const acknowledged = Promise.all(sent)
    releaseCaptureCanvasesAfter(acknowledged, droppedCanvases)
    const acknowledgeStarted = traceStageStart()
    await acknowledged
    traceStage('prepare-acknowledge', acknowledgeStarted)
    if (!current()) return
    if (!(await commitPreparedAppearance(runtime, appearance, current))) return
    if (!(await commitPreparedContent(runtime, current))) return
    if (installsMenu && menuGeneration === runtime.menuGeneration && runtime.options.menuEnabled) {
      runtime.menuReady = true
      runtime.menuSurface.cancel()
    }
    if (resuming) {
      runtime.resumePending = false
      glassTiming('resume-ready', runtime.resumeAt || started)
    }
    runtime.preparedSignature = preparedSignature
    runtime.windowsCommitted()
    glassTiming('production-prepared', started, () =>
      JSON.stringify({
        tab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim(),
        planes: planes.map(planeDiagnostics),
      }),
    )
    runtime.options.onSourceReady?.(elements.scroller)
    runtime.options.onPresented?.(true)
    runtime.record({
      kind: 'prepared',
      revision,
      at: performance.now(),
      regions: specs.map(spec => spec.id),
      capture: captures.size ? [...captures.keys()].join(',') : 'unchanged',
      planes: planes.map(plane => plane.id),
      planeInfo: planes.map(planeDiagnostics),
    })
  } catch (error) {
    // A failed transfer leaves the worker's slots unknown: the next revision resends everything.
    for (const bitmap of opened) bitmap.close()
    releaseCaptureCanvases(droppedCanvases)
    runtime.installedSource = undefined
    runtime.planes.clear()
    runtime.dropRetained()
    for (const id of runtime.pinnedTops.keys()) runtime.pinnedOrphans.add(id)
    runtime.pinnedTops.clear()
    runtime.planeImages.clear()
    runtime.glyphs.clear()
    runtime.keptGlyphs.reset()
    runtime.preparedSignature = ''
    throw error
  }
}

/** The image of a plane's capture canvas that the renderer installs.
 *
 * A document-owned renderer gets the canvas's bytes, read back on the page (SourcePixels.prepare):
 * no bitmap is taken from the canvas. A bitmap of an accelerated canvas made the canvas cost about
 * 5 ms per megabyte to release or redraw, and staging that bitmap in the upload worker held back
 * every frame of the page meanwhile; with neither, a capture is done inside the animation frame
 * that started it, before the frame's paint. A worker-owned renderer still gets a bitmap, which is
 * what crosses to its thread. */
async function planeImage(
  runtime: ProductionGlassRuntime,
  source: HTMLCanvasElement,
  banded?: { bands: readonly CaptureBand[]; resolution: number },
) {
  if (!runtime.client.documentOwned) {
    const bitmapStarted = traceStageStart()
    const bitmap = await createImageBitmap(source)
    traceStage('capture-bitmap', bitmapStarted, () => `${bitmap.width}x${bitmap.height}`)
    return bitmap
  }
  const pixelsStarted = traceStageStart()
  const image = pixelImage(source.width, source.height)
  if (banded) {
    // Only the bands were drawn and need readback; FrameGraph initializes upload gaps.
    const context = source.getContext('2d', CAPTURE_CONTEXT)
    if (!context)
      throw Error(`Glass capture canvas ${source.width}x${source.height} has no 2D context`)
    const readbackStarted = glassNow()
    keepSourceBands(
      image,
      banded.bands.map(band => {
        const row = Math.max(0, Math.floor(band.top * banded.resolution))
        const rows = Math.min(source.height, Math.ceil(band.bottom * banded.resolution)) - row
        return { row, rows, bytes: context.getImageData(0, row, source.width, rows).data }
      }),
    )
    glassTiming('source-readback', readbackStarted, () => `${source.width}x${source.height} banded`)
    traceStage('source-pixels', pixelsStarted, () => `${image.width}x${image.height} banded`)
    return image
  }
  await runtime.sourcePixels.prepare(image, source)
  traceStage('source-pixels', pixelsStarted, () => `${image.width}x${image.height}`)
  return image
}

/** Bytes a plane's image keeps on the page: its bands, or all of it. */
function imageBytes(image: ImageBitmap) {
  const bands = takeSourceBands(image)
  return bands
    ? bands.reduce((sum, band) => sum + band.bytes.byteLength, 0)
    : image.width * image.height * 4
}

/** Raster a plane into its reusable main-thread canvas. */
async function rasterPlane(
  runtime: ProductionGlassRuntime,
  plane: Plane,
  resolution: number,
  dark: boolean,
) {
  let entry = runtime.planeCanvases.get(plane.id)
  if (!entry) {
    entry = { canvas: document.createElement('canvas') }
    runtime.planeCanvases.set(plane.id, entry)
  }
  const canvas = await rasterProductionSource(
    entry.canvas,
    plane.measured,
    plane.width,
    plane.height,
    resolution,
    dark,
    cssColor(plane.fill),
  )
  entry.signature = plane.signature
  return canvas
}

/** Each tab's glyph colours follow the material context under its slot of the dock. */
function applyTabGlyphContext(
  dock: SurfaceRenderSpec,
  elements: RuntimeElements,
  context: MaterialContext,
  geometry: RuntimeGeometry,
  appearance: Appearance,
) {
  const tabs = [...elements.chrome.dock.querySelectorAll<HTMLElement>('[role="tab"]')]
  tabs.forEach((tab, i) => {
    const sample = context.sample(
      dock.frameX + 10.5 + ((dock.frameWidth - 20) / tabs.length) * (i + 0.5),
      dock.frameY + dock.frameHeight / 2 + elements.scroller.scrollTop,
      TAB_CONTEXT_RADIUS,
      elements.scroller.scrollTop,
      elements.scroller.scrollTop + geometry.height,
    )
    if (!sample) return
    const tint = getComputedStyle(tab).getPropertyValue('--satin-tab-tint').trim()
    for (const [property, value] of Object.entries(
      tabGlyphContextStyle(appearance, sample.rgb, tint),
    ))
      tab.style.setProperty(property, value)
  })
}

/** Everything a surface's glyph ink depends on: its controls' content and computed paint, the
 * sample envelope and the trigger outline (menu) or tab centres (dock). */
export function glyphSignature(
  spec: SurfaceRenderSpec,
  elements: RuntimeElements,
  appearance: Appearance,
  resolution: number,
  geometry: RuntimeGeometry,
) {
  const host =
    spec.id === 'dock' ? elements.chrome.dock : (elements.menu?.trigger ?? elements.chrome.right)
  const controls =
    spec.id === 'dock' ? [...host.querySelectorAll<HTMLElement>('[role="tab"]')] : [host]
  const first = spec.shape.first
  return JSON.stringify([
    appearance,
    resolution,
    geometry.width,
    geometry.height,
    spec.sampleWidth,
    spec.sampleHeight,
    spec.sampleInsetX,
    spec.sampleInsetY,
    spec.id === 'right'
      ? [first.centerX, first.centerY, first.halfWidth, first.halfHeight]
      : geometry.tabBarCentres,
    controls.map(control => {
      const style = getComputedStyle(control)
      return [
        control.textContent,
        [...control.querySelectorAll('svg')].map(svg => svg.outerHTML),
        style.font,
        style.color,
        style.getPropertyValue('--tab-selected-icon'),
        style.getPropertyValue('--tab-selected-label'),
        inkBoxes(control),
      ]
    }),
  ])
}

/** The boxes of a control that its ink capture paints (captureRegionForeground draws every
 * descendant that has a background): where each is, its colour, corner radius and mask. A dot
 * badge is one of them and has no text, so the text of the control does not tell it. */
function inkBoxes(control: HTMLElement) {
  const origin = control.getBoundingClientRect()
  const sixtyFourth = (value: number) => Math.round(value * 64) / 64
  const boxes: unknown[] = []
  for (const child of control.querySelectorAll<HTMLElement>('*')) {
    if (child.closest('svg') || child.tagName === 'CANVAS') continue
    const style = getComputedStyle(child)
    const colour = style.backgroundColor
    if (!colour || colour === 'rgba(0, 0, 0, 0)' || colour === 'transparent') continue
    const rect = child.getBoundingClientRect()
    boxes.push([
      sixtyFourth(rect.left - origin.left),
      sixtyFourth(rect.top - origin.top),
      sixtyFourth(rect.width),
      sixtyFourth(rect.height),
      colour,
      style.borderRadius,
      style.opacity,
      style.visibility,
      style.maskImage || style.webkitMaskImage || '',
    ])
  }
  return boxes
}

/** Draw the menu trigger's captured ink at the trigger's place in the surface's sample envelope. */
function drawMenuTriggerInk(
  glyphCanvas: HTMLCanvasElement,
  ink: CanvasImageSource,
  spec: SurfaceRenderSpec,
  resolution: number,
  pixelWidth: number,
  pixelHeight: number,
) {
  const first = spec.shape.first
  const context = glyphCanvas.getContext('2d', CAPTURE_CONTEXT)!
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, pixelWidth, pixelHeight)
  context.scale(resolution, resolution)
  context.drawImage(
    ink,
    spec.sampleInsetX + first.centerX - first.halfWidth,
    spec.sampleInsetY + first.centerY - first.halfHeight,
    first.halfWidth * 2,
    first.halfHeight * 2,
  )
}

/** The sample rectangle of every glass surface on screen, in viewport points: the chrome surfaces
 * (`raster.ts` backdropRect) and the app regions. */
function sampleDemand(runtime: ProductionGlassRuntime): SampleRect[] {
  const chrome = runtime
    .currentSpecs()
    .map(
      spec =>
        [
          spec.frameX - spec.sampleInsetX,
          spec.frameY - spec.sampleInsetY,
          spec.sampleWidth,
          spec.sampleHeight,
        ] as const,
    )
  return [...chrome, ...runtime.appRegions.sampleRects()]
}

/** Superseded work: close the bitmaps it opened and record the drop. */
function dropped(
  runtime: ProductionGlassRuntime,
  revision: number,
  opened: ImageBitmap[] = [],
  reason?: string,
) {
  for (const bitmap of opened) bitmap.close()
  opened.length = 0
  runtime.record({ kind: 'superseded', revision, at: performance.now(), reason })
}
