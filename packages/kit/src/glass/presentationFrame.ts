/** How glass reads a presentation that is held for its first glass or travelling on screen.
 *
 * Hold: a presentation waiting for its first glass is hidden by one stylesheet rule keyed on
 * `data-satin-glass-hold`, never by inline styles. The rule clips the held node to nothing: no
 * paint and no hit testing, while layout and computed visibility stay exactly as they will show.
 * Source preparation therefore reads a held presentation directly, with no style change (toggling
 * a stylesheet restyles the whole document: about 216 ms per read on an iPad behind a long thread),
 * and content an author hid inside the presentation stays hidden.
 *
 * Travel: a sheet or cover moves as one rigid layer (its entrance, drag and dismissal are a
 * translation of the presentation's glass layer). Glass nested in the presentation and the
 * presentation's own content planes are placed in that layer's resting frame. The compositor moves
 * them together, so nested glass keeps its pixels while the surface travels, as native glass in a
 * sheet does. The presentation's own material is not nested: it samples the screen below it live. */

const HOLD_ATTRIBUTE = 'data-satin-glass-hold'
const SOURCE_ATTRIBUTE = 'data-satin-glass-source'
const HOLD_RULE = `[${HOLD_ATTRIBUTE}] { clip-path: inset(50%) !important; }`

const holdSheets = new WeakMap<Document, CSSStyleSheet>()

function holdSheet(document: Document) {
  let sheet = holdSheets.get(document)
  if (sheet) return sheet
  // Constructed sheets work under hash-only style-src without a nonce or an
  // unsafe-inline exception. Use the owning realm for embedded documents.
  const Sheet = document.defaultView?.CSSStyleSheet ?? CSSStyleSheet
  sheet = new Sheet()
  sheet.insertRule(HOLD_RULE)
  document.adoptedStyleSheets = [...(document.adoptedStyleSheets ?? []), sheet]
  holdSheets.set(document, sheet)
  return sheet
}

/** Hide `node` until `releaseHold` (or a later hold of another generation). */
export function hold(node: HTMLElement, generation: string) {
  holdSheet(node.ownerDocument)
  node.setAttribute(HOLD_ATTRIBUTE, generation)
}

/** End this generation's hold; a newer generation keeps its own. */
export function releaseHold(node: HTMLElement, generation: string) {
  if (node.getAttribute(HOLD_ATTRIBUTE) !== generation) return
  node.removeAttribute(HOLD_ATTRIBUTE)
  if (node.getAttribute(SOURCE_ATTRIBUTE) === generation) node.removeAttribute(SOURCE_ATTRIBUTE)
}

/** The held presentations a source preparation is about to measure, with their generations. */
export function heldPresentations(document: Document = globalThis.document) {
  return [...document.querySelectorAll<HTMLElement>(`[${HOLD_ATTRIBUTE}]`)].map(
    node => [node, node.getAttribute(HOLD_ATTRIBUTE)!] as const,
  )
}

/** The renderer holds a backdrop measured during these holds: each still-current hold may now
 * wait for its glass to be drawn over it (holdPresentationForGlass). */
export function confirmHeldSources(held: ReturnType<typeof heldPresentations>) {
  for (const [node, generation] of held)
    if (node.isConnected && node.getAttribute(HOLD_ATTRIBUTE) === generation)
      node.setAttribute(SOURCE_ATTRIBUTE, generation)
}

export type Travel = Readonly<{ x: number; y: number; layer?: HTMLElement }>
const AT_REST: Travel = { x: 0, y: 0 }

/** The current travel of the sheet or cover that `element` is nested in (zero when it is the
 * presentation's own surface, outside any presentation, or at rest). */
export function presentationTravel(element: Element): Travel {
  if (typeof element.closest !== 'function') return AT_REST
  const layer = element.closest<HTMLElement>('[data-satin-glass-layer]')
  const surface = element.parentElement?.closest('.satin-presentation-surface')
  if (!layer || !surface || !layer.contains(surface)) return AT_REST
  const dialog = layer.closest('dialog')
  const kind = dialog?.getAttribute('data-satin-presentation')
  if (kind !== 'sheet' && kind !== 'cover') return AT_REST
  const transform = getComputedStyle(layer).transform
  if (!transform || transform === 'none') return AT_REST
  const matrix = new DOMMatrixReadOnly(transform)
  if (!matrix.e && !matrix.f) return AT_REST
  return { x: matrix.e, y: matrix.f, layer }
}

/** A viewport rectangle of something inside the travelling layer, in the layer's resting frame. */
export function atRest<T extends { x: number; y: number; width: number; height: number }>(
  rect: T,
  travel: Travel,
): { x: number; y: number; width: number; height: number } {
  return { x: rect.x - travel.x, y: rect.y - travel.y, width: rect.width, height: rect.height }
}
