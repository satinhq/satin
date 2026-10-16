/** The search scope bar's segment geometry, shared by the page (where a drag commits) and the
 * renderer (where the thumb is drawn). The pill sits 4 pt inside the 36 pt bar, 28 pt tall; the
 * lifted lens is 42 pt tall, centred on the bar (measured scope thumb: 59 px at 1.406 px/pt). */
export const SCOPE_THUMB = {
  inset: 4,
  height: 28,
  lensHeight: 42,
} as const

/** Region-local centres of `count` equal segments inside the bar's inset. */
export function segmentCentres(width: number, count: number) {
  const segment = (width - 2 * SCOPE_THUMB.inset) / Math.max(1, count)
  return Array.from({ length: count }, (_, index) => SCOPE_THUMB.inset + segment * (index + 0.5))
}

/** The segment whose centre is nearest region-local `x` (where a released drag commits). */
export function nearestSegment(x: number, width: number, count: number) {
  const centres = segmentCentres(width, count)
  return centres.reduce(
    (best, centre, index) => (Math.abs(centre - x) < Math.abs(centres[best] - x) ? index : best),
    0,
  )
}
