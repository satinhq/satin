import { glassFieldDistance, type GlassUnionFrame } from './fieldGeometry.ts'

/** One point in a diagnostic glass outline, in field coordinates. */
export type GlassOutlinePoint = { x: number; y: number }
/** Closed contours, including disconnected members. Coordinates use the frame's
 * local CSS pixels. Diagnostic/export operation: never run it in the render loop.
 * Marching triangles avoid ambiguous saddle cells; roots use the shader's field.
 */
export function glassUnionOutline(frame: GlassUnionFrame, pixelSize = 0.5): GlassOutlinePoint[][] {
  const { members, blendRadius } = frame
  if (
    !Number.isFinite(pixelSize) ||
    pixelSize <= 0 ||
    pixelSize > 1 ||
    !Number.isFinite(blendRadius) ||
    blendRadius < 0 ||
    members.length > 16
  )
    throw Error(
      'Glass outline requires 0 < pixelSize <= 1, nonnegative blend radius, and at most 16 members.',
    )
  if (!members.length) return []
  for (const s of members)
    if (
      !Object.values(s).every(Number.isFinite) ||
      s.halfWidth <= 0 ||
      s.halfHeight <= 0 ||
      s.radius < 0 ||
      s.radius > Math.min(s.halfWidth, s.halfHeight)
    )
      throw Error('Invalid glass field member.')
  const padding = (blendRadius * (members.length - 1)) / 4 + pixelSize * 2
  const x0 =
    Math.floor((Math.min(...members.map(s => s.centerX - s.halfWidth)) - padding) / pixelSize) *
    pixelSize
  const y0 =
    Math.floor((Math.min(...members.map(s => s.centerY - s.halfHeight)) - padding) / pixelSize) *
    pixelSize
  const nx =
    Math.ceil((Math.max(...members.map(s => s.centerX + s.halfWidth)) + padding - x0) / pixelSize) +
    1
  const ny =
    Math.ceil(
      (Math.max(...members.map(s => s.centerY + s.halfHeight)) + padding - y0) / pixelSize,
    ) + 1
  if (nx * ny > 4_000_000) throw Error('Glass outline grid exceeds its diagnostic work budget.')
  const distance = (x: number, y: number) => glassFieldDistance(x, y, members, blendRadius)
  const values = new Float64Array(nx * ny)
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++)
      values[y * nx + x] = distance(x0 + x * pixelSize, y0 + y * pixelSize)
  const points = new Map<string, GlassOutlinePoint>(),
    edges = new Map<string, string[]>()
  const crossing = (a: number, b: number) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`
    if (!points.has(key)) {
      const ax = x0 + (a % nx) * pixelSize,
        ay = y0 + Math.floor(a / nx) * pixelSize
      const bx = x0 + (b % nx) * pixelSize,
        by = y0 + Math.floor(b / nx) * pixelSize
      let lo = 0,
        hi = 1
      for (let i = 0; i < 16; i++) {
        const t = (lo + hi) / 2
        if (distance(ax + (bx - ax) * t, ay + (by - ay) * t) < 0 === values[a]! < 0) lo = t
        else hi = t
      }
      const t = (lo + hi) / 2
      points.set(key, { x: ax + (bx - ax) * t, y: ay + (by - ay) * t })
    }
    return key
  }
  const triangle = (a: number, b: number, c: number) => {
    const hits: string[] = []
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ])
      if (values[u!]! < 0 !== values[v!]! < 0) hits.push(crossing(u!, v!))
    if (hits.length === 2) {
      const [u, v] = hits as [string, string]
      edges.set(u, [...(edges.get(u) ?? []), v])
      edges.set(v, [...(edges.get(v) ?? []), u])
    }
  }
  for (let y = 0; y < ny - 1; y++)
    for (let x = 0; x < nx - 1; x++) {
      const a = y * nx + x,
        b = a + 1,
        c = b + nx,
        d = a + nx
      triangle(a, b, c)
      triangle(a, c, d)
    }
  const seen = new Set<string>(),
    contours: GlassOutlinePoint[][] = []
  for (const start of edges.keys()) {
    if (seen.has(start)) continue
    const contour: GlassOutlinePoint[] = []
    let current = start,
      previous = ''
    do {
      seen.add(current)
      contour.push(points.get(current)!)
      const next = edges.get(current)!.find(k => k !== previous)!
      previous = current
      current = next
    } while (current !== start && !seen.has(current))
    if (current !== start) throw Error('Glass outline produced an open contour.')
    contour.push(contour[0]!)
    contours.push(contour)
  }
  return contours
}
