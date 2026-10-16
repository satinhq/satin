import { TabMotion } from '../lens/tabMotion.ts'
import type { Appearance } from '../lens/theme.ts'
import type { RuntimeGeometry, SurfaceRenderSpec } from '../renderSpecs.ts'
import type { SharedSourceImage, WebGPURequest as Request } from '../worker/protocol.ts'
import type { ProductionGlassRuntime } from './production.ts'
import {
  visiblePlaneSetKey,
  type MaterialContext,
  type Plane,
  type PlaneCapture,
} from './productionPlanes.ts'
import { sampleRegion, type RegionTrack } from './productionTracks.ts'

// The commit and transport half of a source preparation (productionPrepare.ts): installing the
// captured plane set in the runtime's bookkeeping and building the worker install requests.

/** Install this preparation's plane set: new captures and restored retained planes take their
 * slots, unchanged planes follow their viewport origin, and planes that left the set are kept
 * resident when the budget allows. Returns the worker slot changes for the batch and the capture
 * canvases that are no longer needed. */
export function commitPlaneSet(
  runtime: ProductionGlassRuntime,
  prepared: {
    planes: readonly Plane[]
    contentPlane: Plane
    captures: ReadonlyMap<string, PlaneCapture>
    reused: ReadonlySet<string>
    capture: { context: MaterialContext } | undefined
    contextKey: string
    geometry: RuntimeGeometry
    resolution: number
    appearance: Appearance
    text: string
    damageGenerations?: ReadonlyMap<string, number>
  },
) {
  const { planes, contentPlane, captures, reused, capture, contextKey, geometry } = prepared
  const { resolution, appearance, text } = prepared
  const clearCapturedDamage = (id: string) => {
    if ((runtime.damageGenerations?.get(id) ?? 0) === (prepared.damageGenerations?.get(id) ?? 0))
      runtime.damaged.delete(id)
    else runtime.prepareAgain = true
  }
  if (capture) runtime.context = capture.context
  const entryGeometry = (plane: Plane) => ({
    origin: { ...plane.origin },
    window: plane.window,
    bands: plane.bands,
    width: plane.width,
    height: plane.height,
    resolution,
    host: plane.host,
    searchAnchor: plane.measured.searchAnchor,
    keyboardAnchor: plane.measured.keyboardAnchor,
    appearance,
    text,
  })
  const unretain: string[] = []
  const restore: { slot: string; key: string }[] = []
  for (const [id, { signature }] of captures) {
    runtime.planes.set(id, {
      signature,
      key: `backdrop:${id}:${++runtime.captureRevision}`,
      revision: runtime.captureRevision,
      ...entryGeometry(planes.find(plane => plane.id === id)!),
    })
    clearCapturedDamage(id)
    // A retained plane captured again (its content changed while covered): the worker frees the old image and texture.
    const old = runtime.resident.recaptured(id)
    if (old) unretain.push(`${old}:front`)
  }
  for (const id of reused) {
    const { imageBytes, ...plane } = runtime.resident.take(id)!
    runtime.planeBytes.set(id, imageBytes)
    runtime.planes.set(id, {
      ...plane,
      ...entryGeometry(planes.find(candidate => candidate.id === id)!),
    })
    clearCapturedDamage(id)
    restore.push({ slot: `plane:${id}`, key: `${plane.key}:front` })
  }
  // Unchanged planes follow their current viewport origin (a navigation atlas copies from it).
  for (const plane of planes) {
    const entry = runtime.planes.get(plane.id)
    if (entry) Object.assign(entry, entryGeometry(plane))
  }
  if (capture)
    runtime.contextGeometry = visiblePlaneSetKey(planes, runtime.planes, contentPlane, geometry)
  const removed = [...runtime.planes.keys()].filter(id => !planes.some(plane => plane.id === id))
  // Keep removed planes resident (newest last) when their host is still in the document and their
  // capture is current; the budget then evicts orphaned, stale and oldest entries.
  const retain: string[] = []
  const droppedCanvases: HTMLCanvasElement[] = []
  for (const id of removed) {
    const entry = runtime.planes.get(id)!
    runtime.planes.delete(id)
    const imageBytes = runtime.planeBytes.get(id) ?? Infinity
    if (!runtime.damaged.delete(id) && runtime.resident.retain(id, { ...entry, imageBytes }))
      retain.push(`${entry.key}:front`)
    // The capture canvas is not kept for a retained plane (the worker holds its image). The
    // caller releases it once this batch is posted (see releaseCaptureCanvas).
    const dropped = runtime.planeCanvases.get(id)
    if (dropped) droppedCanvases.push(dropped.canvas)
    runtime.planeCanvases.delete(id)
    runtime.planeBytes.delete(id)
    runtime.damageGenerations?.delete(id)
  }
  for (const key of runtime.resident.settle(contextKey).map(key => `${key}:front`)) {
    const index = retain.indexOf(key)
    if (index >= 0) retain.splice(index, 1)
    else unretain.push(key)
  }
  runtime.installedSource = { ...runtime.planes.get(contentPlane.id)! }
  runtime.contentPlane = contentPlane.id
  return { removed, retain, restore, unretain, droppedCanvases }
}

/** The batch's images: new plane captures, then new chrome glyphs, then glyph slots that take a
 * kept image again (by key, with no image). */
export function sourceImages(
  runtime: ProductionGlassRuntime,
  captures: ReadonlyMap<string, PlaneCapture>,
  glyphs: ReadonlyMap<SurfaceRenderSpec['id'], ImageBitmap>,
  keptGlyphs: Iterable<SurfaceRenderSpec['id']> = [],
): SharedSourceImage[] {
  return [
    ...[...captures].map(([id, { bitmap }]) => ({
      slot: `plane:${id}`,
      key: `${runtime.planes.get(id)!.key}:front`,
      image: bitmap,
    })),
    ...[...glyphs].map(([id, image]) => ({
      slot: `glyph:${id}`,
      key: runtime.glyphs.get(id)!.key,
      image,
    })),
    ...[...keptGlyphs].map(id => ({ slot: `glyph:${id}`, key: runtime.glyphs.get(id)!.key })),
  ]
}

/** The source install of every chrome surface on its layer (and its lift overlay), in transport
 * order. A menu run in flight since the preparation started owns the menu surfaces' specs. */
export function surfaceInstalls(
  runtime: ProductionGlassRuntime,
  specs: readonly SurfaceRenderSpec[],
  batch: {
    menuTrack: RegionTrack | undefined
    barTrack: RegionTrack | undefined
    now: number
    appearance: Appearance
    sourceKey: string
    contentLayer: string
    sourceScrollY: number
    trigger: ReturnType<ProductionGlassRuntime['triggerValues']>
    geometry: RuntimeGeometry
    resolution: number
  },
) {
  const { menuTrack, barTrack, now, appearance, sourceKey, contentLayer, trigger } = batch
  const { geometry, resolution } = batch
  const installs: Request[] = []
  for (const listed of specs) {
    const spec = listed.id === 'right' && menuTrack ? sampleRegion(menuTrack, now) : listed
    const setup = {
      spec,
      appearance,
      sourceKey,
      contentLayer,
      sourceScrollY: batch.sourceScrollY,
      glyphKey: runtime.glyphs.get(spec.id)!.key,
      trigger,
      width: geometry.width,
      height: geometry.height,
      resolution,
    }
    const id = spec.id === 'dock' ? 'chrome' : spec.id === 'right' ? 'menu' : spec.id
    runtime.regionIds.set(spec.id, id)
    if (spec.id === 'dock')
      installs.push({
        type: 'source',
        revision: runtime.nextTransport(),
        setup,
        sentAt: performance.timeOrigin + performance.now(),
      })
    else if (spec.id === 'right')
      installs.push({
        type: 'layer-source',
        revision: runtime.nextTransport(),
        layerId: 'menu',
        setup,
      })
    else
      installs.push({
        type: 'layer-source',
        revision: runtime.nextTransport(),
        layerId: 'chrome',
        regionId: id,
        setup,
      })
    // The menu trigger's press lift sits over the bar-glass trigger (its base), like every glass button.
    if (runtime.liftAttached)
      installs.push({
        type: 'layer-source',
        revision: runtime.nextTransport(),
        layerId: spec.id === 'right' ? 'menu-lift' : 'chrome-lift',
        setup: {
          ...setup,
          ...(spec.id === 'right'
            ? {
                spec: runtime.barTrigger(runtime.closedMenuSpec() ?? listed, 1),
                trigger: undefined,
              }
            : { spec }),
          liftOverlay: true,
          lift: {
            amount: 0,
            source: spec.id === 'dock' ? 'composed' : 'transmissive',
            optics: new TabMotion().optics(),
          },
        },
      })
    runtime.specs.set(spec.id, spec)
    // The trigger is bar glass: the same material and path as the back button (native
    // toolbar buttons share one material). It rests at the CLOSED menu geometry whatever
    // the menu's current state, and fades over the menu surface as the morph takes over.
    if (spec.id === 'right') {
      runtime.regionIds.set('region:bar-trigger', 'bar-trigger')
      const restingTrigger = () =>
        runtime.barTrigger(runtime.closedMenuSpec() ?? listed, runtime.menuResting() ? 1 : 0)
      installs.push({
        type: 'layer-source',
        revision: runtime.nextTransport(),
        layerId: 'chrome',
        regionId: 'bar-trigger',
        setup: {
          ...setup,
          spec: barTrack ? sampleRegion(barTrack, now) : restingTrigger(),
          trigger: undefined,
        },
      })
    }
  }
  return installs
}

/** Follow every committed plane's scroll (a GPU offset, never a recapture) and its size. */
export function syncPlaneScrolls(
  runtime: ProductionGlassRuntime,
  planes: readonly Plane[],
  scroller: HTMLElement,
) {
  runtime.scrollerPlane = planes.find(plane => plane.host === scroller)?.id
  for (const [host, listener] of runtime.planeScrolls)
    if (!planes.some(plane => plane.host === host)) {
      host.removeEventListener('scroll', listener)
      runtime.resize?.unobserve(host)
      runtime.planeScrolls.delete(host)
    }
  for (const plane of planes) {
    if (plane.host === scroller || runtime.planeScrolls.has(plane.host)) continue
    const host = plane.host
    const id = plane.id
    const listener = () => {
      runtime.followWindow(id, host)
      runtime.fire({ type: 'backdrop-scroll', id, x: host.scrollLeft, y: host.scrollTop })
    }
    host.addEventListener('scroll', listener, { passive: true })
    runtime.resize?.observe(host)
    runtime.planeScrolls.set(host, listener)
  }
}
