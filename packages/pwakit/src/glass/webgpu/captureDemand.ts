import { orderedTopLayerDialogs } from '../../modal/lifecycle.ts'
import { topLayerDialogOf } from '../topLayer.ts'
import { contextSampleInset } from './contextComposite.ts'
import { atRest, presentationTravel } from '../presentationFrame.ts'
import { bandsCover, snapCaptureBand, type CaptureBand, type SampleRect } from './captureBands.ts'

export type { CaptureBand, SampleRect } from './captureBands.ts'

/** Points of slack kept around each sample rectangle: press growth, sub-point layout and spring
 * overshoot stay inside the capture without another preparation. */
export const DEMAND_MARGIN_POINTS = 24

/** A demand window this close to the whole content captures the whole content instead. */
const WHOLE_CONTENT_SHARE = 0.75

/** What a plane that does not scroll is captured for (see `demandWindow`). */
export type PlaneDemand = {
  /** Sample rectangles of every glass surface and region on screen. */
  rects: readonly SampleRect[]
  /** The plane is beneath an open presentation (a sheet, alert or confirmation): glass above it
   * moves over all of it, so it is captured whole. */
  covered: boolean
  /** The plane is captured again anyway (its content changed): a whole capture may shrink. */
  damaged: boolean
}

/** The sample rectangle of an app glass region: its box and its material's sampling halo. */
export function regionSampleRect(element: Element, treatment?: string): SampleRect | undefined {
  // Nested sheet glass samples its resting content plane while CSS moves both.
  // The sheet's own surface has zero nested travel and still samples the page.
  const box = atRest(element.getBoundingClientRect(), presentationTravel(element))
  if (box.width <= 0 || box.height <= 0) return
  const inset = contextSampleInset(treatment)
  return [box.x - inset, box.y - inset, box.width + 2 * inset, box.height + 2 * inset]
}

/** Whether an open presentation (sheet, alert, confirmation) paints above `host`. Glass in it moves
 * over the whole of `host` with the presentation, between preparations. */
export function beneathPresentation(host: Element) {
  const dialogs = orderedTopLayerDialogs(document)
  const own = dialogs.indexOf(topLayerDialogOf(host) as HTMLDialogElement)
  return dialogs
    .slice(own + 1)
    .some(dialog => dialog.open && dialog.hasAttribute('data-satin-presentation'))
}

type HostBox = { left: number; top: number; right: number; bottom: number }

/** Bands closer than this merge into one: one raster and readback is cheaper than two that
 * nearly touch. */
const MERGE_GAP_POINTS = 2 * DEMAND_MARGIN_POINTS

/** The content rows of a plane that does not scroll which glass samples, or undefined for a
 * capture of its whole content.
 *
 * Every sample rectangle that overlaps the host contributes its rows, widened by
 * DEMAND_MARGIN_POINTS; overlapping or nearby rows merge into bands. Unrelated content outside
 * them is never measured, rastered or read back, and a change to it is no change to the
 * capture: capture cost follows the glass, not the page. Bands the plane already holds are kept
 * while they cover the demand (no capture for glass that stays put), and a whole capture is kept
 * until the content changes. Glass that later samples outside the bands makes the region bridge
 * wait for a capture that covers it (`ProductionGlassRuntime.coverFor`); the renderer refuses any
 * sample outside them (`uncoveredRows`). */
export function demandBands(options: {
  host: HostBox
  contentHeight: number
  resolution: number
  demand: PlaneDemand
  current?: readonly CaptureBand[] | 'full'
}): CaptureBand[] | undefined {
  const { host, contentHeight, resolution, demand, current } = options
  if (demand.covered) return undefined
  if (current === 'full' && !demand.damaged) return undefined
  const rows: [number, number][] = []
  for (const [x, y, width, height] of demand.rects) {
    if (x + width <= host.left || x >= host.right) continue
    if (y + height <= host.top || y >= host.bottom) continue
    const top = Math.max(0, y - DEMAND_MARGIN_POINTS - host.top)
    const bottom = Math.min(contentHeight, y + height + DEMAND_MARGIN_POINTS - host.top)
    if (bottom > top) rows.push([top, bottom])
  }
  // No glass over the plane: nothing bounds it (a screen without glass keeps its whole capture).
  if (!rows.length) return undefined
  rows.sort((a, b) => a[0] - b[0])
  const bands: { top: number; bottom: number }[] = []
  for (const [top, bottom] of rows) {
    const last = bands.at(-1)
    if (last && top <= last.bottom + MERGE_GAP_POINTS) last.bottom = Math.max(last.bottom, bottom)
    else bands.push({ top, bottom })
  }
  // Device-pixel rows: a band's edges are whole texels of the capture.
  const snapped = bands.map(band => snapCaptureBand(band, resolution))
  const captured = snapped.reduce((sum, band) => sum + band.bottom - band.top, 0)
  if (captured >= WHOLE_CONTENT_SHARE * contentHeight) return undefined
  if (current && current !== 'full' && bandsCover(current, snapped, resolution)) return [...current]
  return snapped
}
