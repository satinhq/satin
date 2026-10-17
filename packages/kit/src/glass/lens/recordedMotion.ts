import type { MenuMorphDirection } from './menuMorphMotion.ts'
/** Shape-preserving interpolation with a C1 correction for an interrupted run. */
export function recordedMotion<K extends string>(
  axes: readonly K[],
  fit: Record<MenuMorphDirection, number[][]>,
) {
  const zero = () => Object.fromEntries(axes.map(k => [k, 0])) as Record<K, number>
  const value = (row: number[]) =>
    Object.fromEntries(axes.map((k, i) => [k, row[i + 1]])) as Record<K, number>
  const slopes = (knots: number[][], column: number) => {
    const h = knots.slice(1).map((k, i) => (k[0] - knots[i][0]) / 1000),
      d = h.map((v, i) => (knots[i + 1][column] - knots[i][column]) / v)
    return knots.map((_, i) => {
      if (i === 0 || i === knots.length - 1 || d[i - 1] * d[i] <= 0) return 0
      const a = 2 * h[i] + h[i - 1],
        b = h[i] + 2 * h[i - 1]
      return (a + b) / (a / d[i - 1] + b / d[i])
    })
  }
  const tangents = {
    open: axes.map((_, i) => slopes(fit.open, i + 1)),
    close: axes.map((_, i) => slopes(fit.close, i + 1)),
  }
  return (
    direction: MenuMorphDirection,
    ms: number,
    from = value(fit[direction][0]),
    velocity = zero(),
  ) => {
    const knots = fit[direction],
      duration = knots.at(-1)![0] / 1000
    if (ms >= duration * 1000) return { pose: value(knots.at(-1)!), velocity: zero() }
    const elapsed = Math.max(0, ms),
      right = Math.max(
        1,
        knots.findIndex(k => k[0] >= elapsed),
      ),
      a = knots[right - 1],
      b = knots[right]
    const span = (b[0] - a[0]) / 1000,
      t = (elapsed - a[0]) / (b[0] - a[0]),
      t2 = t * t,
      t3 = t2 * t,
      u = elapsed / (duration * 1000),
      pose = zero(),
      speed = zero()
    axes.forEach((axis, index) => {
      const v0 = a[index + 1],
        v1 = b[index + 1],
        m0 = tangents[direction][index][right - 1],
        m1 = tangents[direction][index][right],
        correction = from[axis] - knots[0][index + 1]
      pose[axis] =
        (2 * t3 - 3 * t2 + 1) * v0 +
        (t3 - 2 * t2 + t) * span * m0 +
        (-2 * t3 + 3 * t2) * v1 +
        (t3 - t2) * span * m1 +
        correction * (1 - 3 * u * u + 2 * u * u * u) +
        velocity[axis] * duration * u * (1 - u) * (1 - u)
      speed[axis] =
        ((6 * t2 - 6 * t) * v0 +
          (3 * t2 - 4 * t + 1) * span * m0 +
          (-6 * t2 + 6 * t) * v1 +
          (3 * t2 - 2 * t) * span * m1) /
          span +
        (correction * (-6 * u + 6 * u * u)) / duration +
        velocity[axis] * (1 - 4 * u + 3 * u * u)
    })
    return { pose, velocity: speed }
  }
}
