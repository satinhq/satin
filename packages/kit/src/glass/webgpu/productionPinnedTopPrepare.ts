import type { Appearance } from '../lens/theme.ts'
import type { SharedSourceImage } from '../worker/protocol.ts'
import { cssColor } from './backdropLayers.ts'
import { rasterProductionSource } from './capture.ts'
import { releaseCaptureCanvas } from './captureRelease.ts'
import { keepSourcePixels, pixelImage, takeSourcePixels } from './preparedSourcePixels.ts'
import type { ProductionGlassRuntime } from './production.ts'
import { cropTopRows, planPinnedTop, type PinnedTop } from './productionPinnedTop.ts'
import {
  measurePlane,
  type Plane,
  type PlaneCapture,
  type PlaneCaptureFrame,
} from './productionPlanes.ts'
import { traceStage, traceStageStart } from './profile.ts'

/** What one source revision changes about pinned tops: applied with its commit. */
export type PinnedTopChanges = {
  /** New pinned images, for the batch (slot `plane:<id>:top`). */
  images: SharedSourceImage[]
  /** Slots of pinned tops that are no longer kept. */
  release: string[]
  /** The pinned tops after the commit. */
  next: Map<string, PinnedTop>
  /** Snapshot separately from the preparation revision: damage invalidates only this pin. */
  generations: Map<string, number>
}

const slot = (id: string) => `plane:${id}:top`

/** Check immediately before the synchronous commit, after all preparation awaits have finished. */
export function discardChangedPinnedTops(
  runtime: ProductionGlassRuntime,
  changes: PinnedTopChanges,
  opened: ImageBitmap[],
) {
  for (const [id, generation] of changes.generations) {
    if ((runtime.damageGenerations?.get(id) ?? 0) === generation) continue
    changes.next.delete(id)
    const index = changes.images.findIndex(source => source.slot === slot(id))
    if (index >= 0) {
      const [{ image }] = changes.images.splice(index, 1)
      if (image) {
        const openedIndex = opened.indexOf(image)
        if (openedIndex >= 0) opened.splice(openedIndex, 1)
        image.close()
      }
    }
    if (!changes.release.includes(slot(id))) changes.release.push(slot(id))
  }
}

/** Decide and make each plane's pinned top for this revision (productionPinnedTop.ts): crop the
 * capture a window is leaving, capture the top from the page when the preparation may, or let a
 * pinned top go. Nothing of the runtime is changed here; the commit takes `next`. */
export async function preparePinnedTops(
  runtime: ProductionGlassRuntime,
  planes: readonly Plane[],
  captures: ReadonlyMap<string, PlaneCapture>,
  frame: PlaneCaptureFrame,
  text: string,
  capturedGenerations?: ReadonlyMap<string, number>,
): Promise<PinnedTopChanges> {
  const changes: PinnedTopChanges = {
    images: [],
    release: [],
    next: new Map(),
    generations: new Map(),
  }
  // A renderer in a worker takes bitmaps, which cannot be cropped or kept as bytes here.
  if (!runtime.client.documentOwned) return changes
  const { resolution, appearance } = frame
  for (const id of runtime.pinnedOrphans) changes.release.push(slot(id))
  for (const [id] of runtime.pinnedTops)
    if (!planes.some(plane => plane.id === id && !plane.hidden)) changes.release.push(slot(id))
  for (const plane of planes) {
    if (plane.hidden) continue
    changes.generations.set(plane.id, runtime.damageGenerations?.get(plane.id) ?? 0)
    const existing = runtime.pinnedTops.get(plane.id)
    const installed = captures.has(plane.id) ? runtime.planes.get(plane.id) : undefined
    const outgoingImage = installed ? runtime.planeImages.get(plane.id) : undefined
    const outgoingBytes = outgoingImage ? takeSourcePixels(outgoingImage) : undefined
    const viewport = Math.max(1, plane.host.clientHeight)
    const plan = planPinnedTop({
      window: plane.window,
      viewport,
      contentHeight: plane.contentHeight,
      resolution,
      width: plane.width,
      appearance,
      text,
      existing,
      outgoing: installed && {
        // A capture of the whole content holds the top as a window from 0 does.
        window: installed.window ?? { top: 0, bottom: installed.height, viewport },
        width: installed.width,
        resolution: installed.resolution,
        appearance: installed.appearance,
        text: installed.text,
        damaged: runtime.damaged.has(plane.id),
        hasBytes: !!outgoingBytes,
      },
      mayCapture: runtime.growPlanes.has(plane.id),
    })
    if (plan.action === 'none') continue
    if (plan.action === 'keep') {
      changes.next.set(plane.id, existing!)
      continue
    }
    if (plan.action === 'release') {
      changes.release.push(slot(plane.id))
      continue
    }
    const started = traceStageStart()
    let image: ImageBitmap
    if (plan.action === 'crop') {
      // Cropping keeps the older plane's pixels, not the page state at this pin's start.
      if (capturedGenerations)
        changes.generations.set(plane.id, capturedGenerations.get(plane.id) ?? 0)
      const rows = Math.min(outgoingImage!.height, Math.round(plan.window.bottom * resolution))
      image = pixelImage(outgoingImage!.width, rows)
      keepSourcePixels(image, cropTopRows(outgoingBytes!, outgoingImage!.width, rows))
    } else image = await capturePinnedTop(runtime, plane, plan.window, frame, appearance)
    traceStage('pinned-top', started, () => `${plan.action} ${image.width}x${image.height}`)
    const key = `backdrop:${plane.id}:top:${++runtime.captureRevision}`
    changes.images.push({ slot: slot(plane.id), key: `${key}:front`, image })
    changes.next.set(plane.id, {
      key,
      window: plan.window,
      width: plane.width,
      resolution,
      appearance,
      text,
      stale: plan.action === 'crop' && plan.stale,
    })
  }
  return changes
}

/** Capture the first `window.bottom` points of a plane's content from the page. */
async function capturePinnedTop(
  runtime: ProductionGlassRuntime,
  plane: Plane,
  window: PinnedTop['window'],
  frame: PlaneCaptureFrame,
  appearance: Appearance,
) {
  runtime.preparingPinnedWindows ??= new Map()
  runtime.preparingPinnedWindows.set(plane.id, window)
  const top = await measurePlane(plane.host, frame, () => plane.id, false, undefined, window)
  if (!top) throw Error(`Glass pinned top: ${plane.id} is clipped out of the screen`)
  const canvas = document.createElement('canvas')
  try {
    await rasterProductionSource(
      canvas,
      top.measured,
      top.width,
      top.height,
      frame.resolution,
      appearance === 'dark',
      cssColor(top.fill),
    )
    const image = pixelImage(canvas.width, canvas.height)
    await runtime.sourcePixels.prepare(image, canvas)
    return image
  } finally {
    releaseCaptureCanvas(canvas)
  }
}
