/** The keyboard overlap and viewport dimensions in points. */
export type KeyboardGeometry = Readonly<{
  height: number
  visible: boolean
  viewportHeight: number
  offsetTop: number
  layoutHeight: number
}>
export function keyboardGeometry(
  layoutHeight: number,
  visualHeight: number,
  offsetTop: number,
  scale: number,
  engaged: boolean,
): KeyboardGeometry {
  // Zoom is not keyboard occlusion. Hardware keyboards produce zero occlusion.
  const height =
    engaged && Math.abs(scale - 1) < 0.01 ? Math.max(0, layoutHeight - visualHeight) : 0
  return {
    height,
    visible: height > 0,
    viewportHeight: Math.max(0, layoutHeight - height),
    offsetTop: height > 0 ? Math.max(0, offsetTop) : 0,
    layoutHeight,
  }
}
export function revealDelta(
  fieldTop: number,
  fieldBottom: number,
  surfaceTop: number,
  surfaceBottom: number,
  viewportBottom: number,
  gap = 12,
) {
  const top = Math.max(0, surfaceTop) + gap
  const bottom = Math.min(surfaceBottom, viewportBottom) - gap
  if (fieldTop < top) return fieldTop - top
  // Tall editors reveal their top; the native textarea owns caret scrolling.
  if (fieldBottom - fieldTop > bottom - top) return fieldTop - top
  return Math.max(0, fieldBottom - bottom)
}
