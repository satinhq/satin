/** Row actions reserve interior contacts; the first 20 points of the navigation
 * pane remain Back's edge-start region. This is an input policy, not a spring. */
export const ROW_BACK_EDGE_WIDTH = 20

/** Controls declare their available drag directions before contact. Row actions
 * additionally share their edge-start exception with both navigation input paths. */
export function horizontalDragBlocksBack(target: Element, clientX?: number) {
  const owner = target.closest('[data-satin-horizontal-drag]')
  if (clientX !== undefined && owner?.matches('[data-satin-row-swipe="true"]')) {
    const pane = owner.closest('[data-satin-pane], [data-satin-navigator-host]')
    const left = pane?.getBoundingClientRect().left
    return left === undefined || clientX < left || clientX >= left + ROW_BACK_EDGE_WIDTH
  }
  const direction = owner?.getAttribute('data-satin-horizontal-drag')
  return direction === 'both' || direction === 'right'
}
