import { observeAnimations } from '../../motion/animate.ts'
import { windowCoversScrollport } from '../captureWindow.ts'
import { bandsCover } from './captureBands.ts'
import type { NavigationGlassState } from '../../navigation/glassTransition.ts'
import type { Appearance } from '../lens/theme.ts'
import type { RuntimeGeometry } from '../renderSpecs.ts'
import {
  captureProductionGlyphs,
  measureProductionSource,
  productionSourceKey,
  rasterNavigationAtlas,
  type MeasuredSource,
} from './capture.ts'
import { navigationTrack } from './navigationTracks.ts'
import { zoomGlassMotion } from '../../navigation/zoomGlass.ts'
import type { ProductionGlassRuntime } from './production.ts'
import { textKey, type PlaneEntry } from './productionPlanes.ts'
import { prepareInitialNavigationSource } from './productionPrepare.ts'
import { glassNow, glassTiming } from './profile.ts'

type NavigationRoute = NavigationGlassState['routes'][number]
/** One route's cell of the navigation atlas: a GPU copy from a resident plane, or a fresh raster. */
type AtlasCell =
  | { plane: string; dx: number; dy: number; sx: number; sy: number; w: number; h: number }
  | { image: ImageBitmap; dx: number; dy: number }
  | { canvas: HTMLCanvasElement | OffscreenCanvas; dx: number; dy: number }

/** Navigation glass: while a navigator transition runs, the dock samples an atlas of every
 * route in the transition, posed by the transition's track. Serialized with source preparation. */
export async function prepareNavigation(
  runtime: ProductionGlassRuntime,
  state: NavigationGlassState,
) {
  runtime.navigationRelease?.()
  const release = state.active ? runtime.appRegions.holdNavigation() : undefined
  runtime.navigationRelease = release
  if (state.active) {
    runtime.preparedSignature = ''
    runtime.menuCancel()
    runtime.pointer = false
    runtime.tabInput('reset', runtime.options.geometry.tabBarSelectedIndex ?? 0, true)
  }
  runtime.navigationRoutes = state.active ? state.routes : []
  runtime.scheduleEdges()
  runtime.navigationActive = state.active
  const revision = ++runtime.navigationRevision
  if (!state.active) {
    runtime.navigationObserver?.disconnect()
    runtime.navigationAnimations?.()
    if (runtime.navigationInput)
      document.removeEventListener('scroll', runtime.navigationInput, true)
    runtime.navigationInput = undefined
    cancelAnimationFrame(runtime.navigationFrame)
    runtime.schedulePrepare()
    return
  }
  if (state.routes.length < 2) {
    release?.()
    return
  }
  const routes = state.routes
  if (routes.length > 8) {
    release?.()
    runtime.navigationRelease = undefined
    throw Error('Navigation composite exceeds the supported 8 simultaneous route sources')
  }
  const current = () =>
    revision === runtime.navigationRevision && runtime.attached && runtime.navigationActive
  const queued = glassNow()
  // Serialized with source preparation; failures of superseded navigations are not errors.
  const run = async () => {
    try {
      await installNavigationAtlas(runtime, routes, revision, current, queued, state.zoom)
    } catch (error) {
      if (current()) throw error
    } finally {
      release?.()
    }
  }
  runtime.serial = runtime.serial.then(run, run)
  return runtime.serial
}

async function installNavigationAtlas(
  runtime: ProductionGlassRuntime,
  routes: NavigationGlassState['routes'],
  revision: number,
  current: () => boolean,
  queued: number,
  zoom = false,
  fullCoverage = false,
) {
  if (!current()) return
  const started = glassNow()
  const geometry = runtime.options.geometry
  const appearance = runtime.options.appearance
  const resolution = devicePixelRatio
  glassTiming('navigation-queue', queued)
  // A stack without a dock has no navigation atlas consumer: nothing is measured or composed.
  const spec = runtime.specs.get('dock')
  const regions = runtime.appRegions.needsBackdrop
  if (!spec && !regions) return
  if (regions && !runtime.contentPlane) {
    await prepareInitialNavigationSource(runtime, current)
    if (!current()) return
    if (!runtime.contentPlane)
      throw Error('Navigation glass regions have no installed content plane')
  }
  const dark = appearance === 'dark'
  const cellWidth = Math.round(geometry.width * resolution)
  const atlasWidth = Math.round(geometry.width * resolution * routes.length)
  const atlasHeight = Math.round(geometry.height * resolution)
  // Routes whose capture is resident in the worker (the installed content plane, or a route
  // retained when a push covered it) are copied into the atlas on the GPU: no measurement,
  // raster, bitmap or upload on this thread in the frames that start the motion. Only a route
  // never captured (the destination of a push) is rasterized, into its own cell.
  const captureRows =
    spec || zoom || fullCoverage
      ? { top: 0, height: geometry.height }
      : runtime.appRegions.navigationCaptureRows(geometry.height)
  const text = textKey()
  const resident = routes.map(route =>
    residentRouteCapture(runtime, route, appearance, text, resolution),
  )
  const missing = routes.flatMap((_, i) => (resident[i] ? [] : [i]))
  const measured = await Promise.all(
    missing.map(i => measureProductionSource(routes[i].source, true)),
  )
  glassTiming('navigation-measure', started, () => `${missing.length}/${routes.length}`)
  if (!current()) return
  const scrolls = routes.map(route => route.source.scrollTop)
  const signature = JSON.stringify([
    captureRows,
    routeSetSignature(resident, measured, missing, scrolls, geometry, resolution, dark),
  ])
  // A republished, unchanged route set keeps its installed atlas (no raster, copy or upload).
  const reuse =
    runtime.installedNavigation?.signature === signature
      ? runtime.installedNavigation.key
      : undefined
  const key = reuse ?? `navigation:${++runtime.navigationCapture}`
  const atlasStarted = glassNow()
  const cells: AtlasCell[] = []
  if (!reuse)
    for (const i of routes.keys()) {
      const entry = resident[i]
      if (entry) {
        cells.push(residentAtlasCell(entry, i, cellWidth, atlasHeight, scrolls[i], resolution))
      } else {
        // A fresh canvas per rastered route, handed over with transferToImageBitmap (an ownership
        // transfer). Re-rastering one shared canvas while an earlier snapshot of it was still
        // referenced made the GPU process copy the whole backing store (CoreGraphics copy-on-write,
        // CA::CG::AccelDataProvider::detach): 56-59 ms that held the first frames of a back swipe
        // taking over a push, whose atlas rasters both routes (Catalyst Time Profiler, Oct 4).
        const transferable = typeof OffscreenCanvas !== 'undefined'
        const target = transferable ? new OffscreenCanvas(1, 1) : runtime.atlasCanvas
        const canvas = await rasterNavigationAtlas(
          target,
          [{ measured: measured[missing.indexOf(i)], scrollTop: scrolls[i] }],
          geometry.width,
          captureRows.height,
          resolution,
          dark,
          captureRows.top,
        )
        const position = { dx: i * cellWidth, dy: Math.round(captureRows.top * resolution) }
        if (canvas instanceof OffscreenCanvas)
          cells.push({ image: canvas.transferToImageBitmap(), ...position })
        else cells.push({ image: await createImageBitmap(canvas), ...position })
        if (!current()) {
          closeCellImages(cells)
          return
        }
      }
    }
  glassTiming('navigation-atlas', atlasStarted, () =>
    reuse ? 'reused' : `${cells.filter(cell => 'plane' in cell).length} gpu`,
  )
  // Chrome glyphs: the installed dock ink when it is still current, captured only otherwise.
  const glyphsStarted = glassNow()
  let glyphKey = runtime.glyphs.get('dock')?.key
  const images: { slot: string; key: string; image: ImageBitmap }[] = []
  if (spec && !glyphKey) {
    const glyphCanvas = await captureProductionGlyphs(
      runtime.options.elements.chrome.dock,
      spec,
      resolution,
      runtime.atlasGlyphs,
    )
    glyphKey = `navigation-glyphs:${++runtime.navigationGlyphs}`
    images.push({
      slot: 'navigation-glyphs',
      key: glyphKey,
      image: await createImageBitmap(glyphCanvas),
    })
  }
  glassTiming('navigation-glyphs', glyphsStarted, images.length ? 'captured' : 'installed')
  if (!current()) {
    closeCellImages(cells)
    for (const entry of images) entry.image.close()
    return
  }
  const coversCurrentDemand = () => {
    const demand = runtime.appRegions.navigationCaptureRows(geometry.height)
    return bandsCover(
      [{ top: captureRows.top, bottom: captureRows.top + captureRows.height }],
      [{ top: demand.top, bottom: demand.top + demand.height }],
      resolution,
    )
  }
  // Registration and canvas geometry may change while pixels/glyphs are prepared.
  // Retry once with the whole viewport so changing demand cannot keep recapturing bands.
  if (regions && !coversCurrentDemand()) {
    closeCellImages(cells)
    for (const entry of images) entry.image.close()
    return installNavigationAtlas(runtime, routes, revision, current, queued, zoom, true)
  }
  runtime.installedNavigation = { signature, key }
  const sent: Promise<unknown>[] = []
  if (images.length)
    sent.push(
      runtime.post(
        { type: 'source-images', revision: runtime.nextTransport(), images },
        images.map(entry => entry.image),
      ),
    )
  if (!reuse)
    sent.push(
      runtime.post(
        {
          type: 'navigation-atlas',
          revision: runtime.nextTransport(),
          key,
          width: atlasWidth,
          height: atlasHeight,
          background: dark ? [0, 0, 0, 1] : [242 / 255, 242 / 255, 247 / 255, 1],
          cells,
        },
        cells.flatMap(cell => ('image' in cell ? [cell.image] : [])),
      ),
    )
  // No completion fence: the track below starts the worker's frame loop, whose first frame
  // presents this install together with the other chrome surfaces.
  if (spec)
    sent.push(
      runtime.post({
        type: 'source',
        revision: runtime.nextTransport(),
        settle: false,
        setup: {
          spec,
          appearance,
          navigationAtlas: routes.length,
          navigationCoverage: {
            width: geometry.width,
            height: geometry.height,
            rows: [{ top: captureRows.top, bottom: captureRows.top + captureRows.height }],
          },
          sourceKey: key,
          contentLayer: runtime.contentPlane,
          glyphKey,
          width: geometry.width,
          height: geometry.height,
          resolution,
        },
        sentAt: performance.timeOrigin + performance.now(),
      }),
    )
  try {
    await Promise.all(sent)
  } catch (error) {
    runtime.installedNavigation = undefined
    throw error
  }
  if (!current()) return
  if (regions && !coversCurrentDemand())
    return installNavigationAtlas(runtime, routes, revision, current, queued, zoom, true)
  glassTiming('navigation-prepared', started)
  // Paused tracks have their real entrance pose. Install that atlas and draw the current
  // region scene before allowing the navigation owner to start its shared motion epoch.
  const pose = navigationTrack(routes, performance.now()).poses[0]
  await runtime.post({
    type: 'navigation-pose',
    key,
    at: performance.timeOrigin + performance.now(),
    pose,
  })
  const rows = [{ top: captureRows.top, bottom: captureRows.top + captureRows.height }]
  if (regions) {
    await runtime.post({
      type: 'navigation-regions',
      prepare: true,
      rows,
      key,
      routes: routes.length,
      contentLayer: runtime.contentPlane!,
      width: geometry.width,
      height: geometry.height,
    })
    if (!current()) return
    runtime.navigationCoverage = { key, rows, width: geometry.width, height: geometry.height }
    runtime.coverageInstalled()
    await runtime.appRegions.admitNavigation(key)
  }
  if (!current()) return
  followNavigationMotion(runtime, routes, revision, key, zoom)
}

/** A resident capture is used only while it matches the page: same appearance, text size and
 * resolution, same layout width, and no DOM damage inside it since it was captured. */
function residentRouteCapture(
  runtime: ProductionGlassRuntime,
  route: NavigationRoute,
  appearance: Appearance,
  text: string,
  resolution: number,
) {
  const id = runtime.planeIds.get(route.source)
  if (!id || !route.source.isConnected) return undefined
  const installed = runtime.planes.get(id)
  const installedCurrent =
    installed &&
    !runtime.damaged.has(id) &&
    installed.appearance === appearance &&
    installed.text === text
  const entry = installed
    ? installedCurrent
      ? installed
      : undefined
    : runtime.resident.usable(id, appearance, text)
  // A banded capture holds only the rows its glass sampled: a route cell needs every row.
  const matchesLayout =
    entry &&
    !entry.bands &&
    entry.resolution === resolution &&
    Math.abs(route.source.offsetWidth - entry.width) <= 1 &&
    (!entry.window ||
      windowCoversScrollport(
        entry.window,
        route.source.scrollTop,
        route.source.clientHeight,
        route.source.scrollHeight,
      ))
  return matchesLayout ? entry : undefined
}

/** Everything the atlas shows: each route's capture identity, origin and scroll, and the viewport. */
function routeSetSignature(
  resident: readonly (Pick<PlaneEntry, 'key' | 'origin'> | undefined)[],
  measured: readonly MeasuredSource[],
  missing: readonly number[],
  scrolls: readonly number[],
  geometry: RuntimeGeometry,
  resolution: number,
  dark: boolean,
) {
  return JSON.stringify([
    resident.map((entry, i) => [
      entry
        ? entry.key
        : productionSourceKey(
            measured[missing.indexOf(i)],
            geometry.width,
            geometry.height,
            resolution,
            dark,
          ),
      entry?.origin,
      scrolls[i],
    ]),
    geometry.width,
    geometry.height,
    resolution,
    dark,
  ])
}

/** The GPU copy of a resident route's capture into its atlas cell (device px). */
function residentAtlasCell(
  entry: Pick<PlaneEntry, 'key' | 'origin' | 'width'>,
  index: number,
  cellWidth: number,
  atlasHeight: number,
  scrollTop: number,
  resolution: number,
): AtlasCell {
  const top = Math.max(0, entry.origin.y)
  const dy = Math.round(top * resolution)
  const dx = index * cellWidth + Math.max(0, Math.round(entry.origin.x * resolution))
  return {
    plane: `${entry.key}:front`,
    dx,
    dy,
    sx: 0,
    sy: Math.max(0, Math.round((scrollTop + top - entry.origin.y) * resolution)),
    w: Math.min(cellWidth, Math.round(entry.width * resolution)),
    h: atlasHeight - dy,
  }
}

function closeCellImages(cells: readonly AtlasCell[]) {
  for (const cell of cells) if ('image' in cell) cell.image.close()
}

/** Post the transition's track (or its single pose) to the worker, again on every scroll and route
 * style change, and on the next frame while a route animation is still pending. */
function followNavigationMotion(
  runtime: ProductionGlassRuntime,
  routes: NavigationGlassState['routes'],
  revision: number,
  key: string,
  zoom = false,
) {
  const submit = () => {
    if (revision !== runtime.navigationRevision || !runtime.attached) return
    // Zoom cleanup precedes Navigator's settled DOM commit. In that gap the entering
    // route has the slide's parked translateX(100%) again. Keep the accepted zoom track
    // through its endpoint instead of publishing that unrelated pose over the atlas.
    if (
      zoom &&
      !routes.some(route => zoomGlassMotion(route.motion) || zoomGlassMotion(route.screen))
    )
      return
    try {
      const track = navigationTrack(routes, performance.now())
      if (track.duration <= 1)
        runtime.fire({ type: 'navigation-pose', key, at: track.epoch, pose: track.poses[0] })
      else runtime.fire({ type: 'navigation-track', key, track })
      const animationPending = routes.some(route =>
        [...route.screen.getAnimations(), ...route.motion.getAnimations()].some(
          animation => animation.pending,
        ),
      )
      if (animationPending && !runtime.navigationFrame)
        runtime.navigationFrame = requestAnimationFrame(() => {
          runtime.navigationFrame = 0
          submit()
        })
    } catch (error) {
      runtime.fail('navigation timing', error)
    }
  }
  if (runtime.navigationInput) document.removeEventListener('scroll', runtime.navigationInput, true)
  runtime.navigationInput = submit
  document.addEventListener('scroll', submit, { capture: true, passive: true })
  runtime.navigationObserver?.disconnect()
  runtime.navigationObserver = new MutationObserver(submit)
  runtime.navigationAnimations?.()
  const observers = routes
    .flatMap(route => [route.screen, route.motion, route.dim])
    .map(element => observeAnimations(element, () => queueMicrotask(submit)))
  runtime.navigationAnimations = () => observers.forEach(stop => stop())
  for (const route of routes)
    for (const element of [route.screen, route.motion, route.dim])
      runtime.navigationObserver.observe(element, { attributes: true, attributeFilter: ['style'] })
  submit()
}
