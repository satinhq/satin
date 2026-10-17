/** A minimum line request never overrides the available editing viewport. */
export function editorHeight(
  contentHeight: number,
  minLines: number,
  lineHeight: number,
  padding: number,
  availableHeight: number,
) {
  const limit = Math.max(lineHeight + padding, availableHeight)
  const minimum = Math.min(limit, Math.max(1, minLines) * lineHeight + padding)
  return Math.min(limit, Math.max(minimum, contentHeight))
}
