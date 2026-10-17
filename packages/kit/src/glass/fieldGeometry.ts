/** Geometry in frame-local CSS pixels; independent of any renderer. */
export type GlassFieldMember = {
  centerX: number
  centerY: number
  halfWidth: number
  halfHeight: number
  radius: number
}
/** A diagnostic glass union outline and its bounds in field coordinates. */
export type GlassUnionFrame = { members: readonly GlassFieldMember[]; blendRadius: number }
/** Sequential native frames bracket contact at 4.50–5.04, 9.23–10.57,
 * 18.53–20.94, 36.56–41.92 pt. See phase-morph-engine-notes.md.
 * Polynomial smooth-min joins equal members at gap = k/2. */
export function glassBlendRadius(spacing: number) {
  if (!Number.isFinite(spacing) || spacing < 0)
    throw Error('Glass container spacing must be finite and nonnegative.')
  return Math.max(0, spacing - 0.5)
}
export function roundedRectDistance(x: number, y: number, s: GlassFieldMember) {
  const qx = Math.abs(x - s.centerX) - s.halfWidth + s.radius,
    qy = Math.abs(y - s.centerY) - s.halfHeight + s.radius
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - s.radius
}
export function smoothMinimum(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
// Fitted against native 2-pt-gap necks (20/32/45.33/61.33 pt).
// Opposing normals retain full reach; parallel normals preserve member edges.
// The angle scales the blend radius itself (a spatially varying smooth minimum), which keeps
// the union C1 across the members' bisector. Scaling only the correction term left part of
// min()'s kink: a V-shaped waist and a lighting seam (native, merge-sweep-40: a U-shaped waist).
export const GLASS_BLEND_ANGLE_POWER = 1
/** One smooth-union step: the running field `d` (normal `n`) with member distance `b` (normal `nb`). */
export function glassFieldJoin(
  d: number,
  n: readonly [number, number],
  b: number,
  nb: readonly [number, number],
  blendRadius: number,
): { distance: number; normal: readonly [number, number] } {
  const angle = Math.pow(
    Math.max(0, Math.min(1, (1 - n[0] * nb[0] - n[1] * nb[1]) / 2)),
    GLASS_BLEND_ANGLE_POWER,
  )
  const k = blendRadius * angle
  if (k <= 1e-4) return b < d ? { distance: b, normal: nb } : { distance: d, normal: n }
  const h = Math.max(k - Math.abs(d - b), 0) / k
  const weight = Math.max(0, Math.min(1, 0.5 + (d - b) / (2 * k)))
  const nx = n[0] * (1 - weight) + nb[0] * weight,
    ny = n[1] * (1 - weight) + nb[1] * weight,
    length = Math.hypot(nx, ny)
  return {
    distance: Math.min(d, b) - h * h * k * 0.25,
    normal: length ? [nx / length, ny / length] : [0, 0],
  }
}
export function roundedRectNormal(
  x: number,
  y: number,
  s: GlassFieldMember,
): readonly [number, number] {
  const dx = x - s.centerX,
    dy = y - s.centerY,
    qx = Math.abs(dx) - s.halfWidth + s.radius,
    qy = Math.abs(dy) - s.halfHeight + s.radius
  let nx = Math.max(qx, 0) * Math.sign(dx),
    ny = Math.max(qy, 0) * Math.sign(dy)
  if (qx <= 0 && qy <= 0) {
    nx = qx >= qy ? Math.sign(dx) : 0
    ny = qx >= qy ? 0 : Math.sign(dy)
  }
  const length = Math.hypot(nx, ny)
  return length ? [nx / length, ny / length] : [0, 0]
}
/** Returns the signed distance to the diagnostic glass union in points. */
export function glassFieldDistance(
  x: number,
  y: number,
  members: readonly GlassFieldMember[],
  blendRadius: number,
) {
  let d = Infinity,
    n: readonly [number, number] = [0, 0]
  for (const s of members) {
    const b = roundedRectDistance(x, y, s),
      nb = roundedRectNormal(x, y, s)
    if (!Number.isFinite(d)) {
      d = b
      n = nb
      continue
    }
    const joined = glassFieldJoin(d, n, b, nb, blendRadius)
    d = joined.distance
    n = joined.normal
  }
  return d
}
