/** An open dialog in the top layer (showModal): painted above the scene, not in its DOM plane.
 * A non-modal dialog (show()) paints in flow, as part of the plane it sits in. */
export const topLayerDialog = (dialog: Element) =>
  (dialog as HTMLDialogElement).open && dialog.matches(':modal')
/** The modal dialog whose top-layer plane paints `element` (null: the page's own planes). */
export function topLayerDialogOf(element: Element) {
  for (
    let dialog = element.closest('dialog');
    dialog;
    dialog = dialog.parentElement?.closest('dialog') ?? null
  )
    if (topLayerDialog(dialog)) return dialog
  return null
}
