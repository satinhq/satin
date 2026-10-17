/** Press feedback belongs to the live DOM, not to the retained scene image.
 * Do not turn one pointer's pressed/return state into a complete GPU rebuild.
 * Content, class/style, geometry and accessibility visibility changes still
 * invalidate the image. Navigation separately owns source handoff.
 */
export function changesMirrorSource(record: Pick<MutationRecord, 'type' | 'attributeName'>) {
  return (
    record.type !== 'attributes' ||
    (record.attributeName !== 'data-satin-press-state' &&
      record.attributeName !== 'data-satin-press-transition')
  )
}
