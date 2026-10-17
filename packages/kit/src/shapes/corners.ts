/** A shape for `cornerClipPath` and swipe action faces: a capsule, an ellipse, a rounded rectangle
 * or a custom clip path. Choosing one overrides the framework's default shape. */
export type CornerShape =
  | 'capsule'
  | 'ellipse'
  | Readonly<{ kind: 'custom'; clipPath: string }>
  | Readonly<{
      kind: 'roundedRectangle'
      cornerRadius: number
      cornerStyle?: 'continuous' | 'circular'
    }>

/** Continuous rounded corners measured on iOS 27.0. The
 * straight-edge approach contracts independently on each axis for short boxes;
 * clamping the entire continuous corner to half-height changes its curvature. */
const extent = 1.5286649466
function approach(radius: number, length: number) {
  const progress = Math.max(0, Math.min(1, (length / (2 * radius) - 1) / (extent - 1)))
  return [
    radius * (0.82 + (0.868407011 - 0.82) * progress),
    radius * (0.96 + (1.0884900093 - 0.96) * progress),
    Math.min(radius * extent, length / 2),
  ] as const
}

/** SVG geometry shared by DOM clips and shape consumers. No layout reads. */
export function roundedCornerPath(
  width: number,
  height: number,
  radii: readonly number[],
  style: 'continuous' | 'circular' = 'continuous',
): string {
  if (![width, height, ...radii].every(Number.isFinite) || width < 0 || height < 0)
    throw new RangeError('Corner geometry must contain finite, nonnegative dimensions')
  if (radii.length !== 4 || radii.some(radius => radius < 0))
    throw new RangeError('Four nonnegative corner radii are required')
  const corners = radii.map(radius => Math.min(radius, width / 2, height / 2))
  const commands: string[] = []
  const point = (x: number, y: number) => `${Number(x.toFixed(4))} ${Number(y.toFixed(4))}`
  // Each corner runs from its horizontal edge to its vertical edge. Reflection
  // and traversal reversal keep one measured curve for all four corners.
  const corner = (radius: number, right: boolean, bottom: boolean, reverse: boolean) => {
    const map = (x: number, y: number) => point(right ? width - x : x, bottom ? height - y : y)
    if (radius === 0) {
      commands.push(`${commands.length ? 'L' : 'M'} ${map(0, 0)}`)
      return
    }
    if (style === 'circular') {
      const start = reverse ? map(0, radius) : map(radius, 0)
      const end = reverse ? map(radius, 0) : map(0, radius)
      commands.push(`${commands.length ? 'L' : 'M'} ${start}`, `A ${radius} ${radius} 0 0 1 ${end}`)
      return
    }
    const horizontal = approach(radius, width)
    const vertical = approach(radius, height)
    const inner = 0.0749114007 * radius
    const diagonal = 0.6314939857 * radius
    const controlNear = 0.1690600067 * radius
    const controlFar = 0.3728240132 * radius
    const points = [
      [horizontal[2], 0],
      [horizontal[1], 0],
      [horizontal[0], 0],
      [diagonal, inner],
      [controlFar, controlNear],
      [controlNear, controlFar],
      [inner, diagonal],
      [0, vertical[0]],
      [0, vertical[1]],
      [0, vertical[2]],
    ]
    if (reverse) points.reverse()
    commands.push(`${commands.length ? 'L' : 'M'} ${map(points[0][0], points[0][1])}`)
    for (let index = 1; index < points.length; index += 3) {
      commands.push(
        `C ${points
          .slice(index, index + 3)
          .map(([x, y]) => map(x, y))
          .join(' ')}`,
      )
    }
  }
  corner(corners[1], true, false, false)
  corner(corners[2], true, true, true)
  corner(corners[3], false, true, false)
  corner(corners[0], false, false, true)
  return `${commands.join(' ')} Z`
}

/** Returns a CSS `clip-path` for a shape at an explicit width and height. Radii are in points. */
export function cornerClipPath(shape: CornerShape, width: number, height: number): string {
  if (shape === 'ellipse') return 'ellipse(50% 50% at 50% 50%)'
  if (typeof shape === 'object' && shape.kind === 'custom') return shape.clipPath
  const radius = shape === 'capsule' ? Math.min(width, height) / 2 : shape.cornerRadius
  const style = shape === 'capsule' ? 'circular' : (shape.cornerStyle ?? 'continuous')
  return `path('${roundedCornerPath(width, height, [radius, radius, radius, radius], style)}')`
}
