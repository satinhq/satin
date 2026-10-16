/** A fitted (viewport-fit=auto) iPhone page cannot paint above its top edge, which sits
 * just below the status bar where the navigation bar's buttons begin. Native menu and
 * lift motion may reach a few points higher (into the status band); ours would be cut
 * flat there. Shapes are given in frame-local points whose frame starts at page y =
 * `frameY`; the drawable top is page y = 0. */
type VerticalShape = { centerY: number; halfHeight: number }
/** Shorten a shape from the top so it never crosses the drawable top (bottom kept):
 * a menu panel's spring overshoot, which native lets reach 1-4 pt into the status band. */
export function trimShapeTop<T extends VerticalShape>(shape: T, frameY: number): T {
  const minTop = -frameY,
    top = shape.centerY - shape.halfHeight
  if (top >= minTop) return shape
  const bottom = shape.centerY + shape.halfHeight,
    halfHeight = Math.max(0, (bottom - minTop) / 2)
  return { ...shape, centerY: minTop + halfHeight, halfHeight }
}
/** Move a shape down just enough to keep its top on the drawable area (size kept):
 * a pressed button's lift lens, which grows about its own centre. */
export function lowerShapeTop<T extends VerticalShape>(shape: T, frameY: number): T {
  const minCenter = shape.halfHeight - frameY
  return shape.centerY >= minCenter ? shape : { ...shape, centerY: minCenter }
}
