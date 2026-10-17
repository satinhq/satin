import { topLayerDialogOf } from '../topLayer.ts'
import { orderedTopLayerDialogs } from '../../modal/lifecycle.ts'
import { atRest, presentationTravel, type Travel } from '../presentationFrame.ts'
/** Main-thread discovery of the screen-space backdrop planes. No pane names, no
 * "primary" heuristics: every visible scroll container is a plane, and so is every
 * visible screen (or presentation's content) that has no scroll container of its own.
 * A held or travelling presentation is discovered in its resting frame
 * (presentationFrame.ts). Nested scroll containers
 * belong to their parent's capture. Planes are ordered back to front by paint order
 * (document order within the scene, then open dialogs, which paint in the top layer). */
type Rect = [number, number, number, number]

const dialogOwners = new WeakMap<Element, string>()
let nextDialogOwner = 0
function dialogOwner(dialog: Element) {
  let owner = dialogOwners.get(dialog)
  if (!owner) {
    owner = `dialog-backdrop-${++nextDialogOwner}`
    dialogOwners.set(dialog, owner)
  }
  return owner
}
/** Ownership survives recaptures; the same dialog must never become its own backdrop. */
export function backdropOwner(element: Element) {
  const dialog = topLayerDialogOf(element)
  return dialog ? dialogOwner(dialog) : undefined
}
/** Presentation materials sample below their top-layer dialog. Smaller controls may
 * sample their dialog's content, but never a later dialog above them.
 * `dialogs` is the scene's top-layer order. Callers that refresh many regions
 * pass one list; a single lookup reads it itself. */
export function backdropExclusions(
  element: Element,
  presentation: boolean,
  dialogs: readonly HTMLDialogElement[] = orderedTopLayerDialogs(document),
) {
  const index = dialogs.indexOf(topLayerDialogOf(element) as HTMLDialogElement)
  return dialogs.slice(index < 0 ? 0 : index + (presentation ? 0 : 1)).map(dialogOwner)
}
/** Hidden by an element of its own subtree (a collapsed sidebar, an inactive pane).
 * Visibility inherited from above `root` (the launch cover hides the whole scene until
 * glass is ready) does not count: the backdrop must be prepared before that reveal.
 * While the scene is hidden from above, a subtree's own hiding is indistinguishable
 * from inheritance, so it counts as visible; the reveal re-prepares. */
const invisible = (element: Element) =>
  /^(hidden|collapse)$/.test(getComputedStyle(element).visibility)
function hiddenWithin(element: Element, root: Element, visibility: boolean) {
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
    // Covered screens and hidden subtrees do not paint. Inert only disables input;
    // a modal presenter remains visible beneath the dialog and its chrome still samples it.
    if (node.getAttribute('data-satin-covered') === 'true' || node.hasAttribute('hidden'))
      return true
    const parent = node.parentElement
    if (visibility && invisible(node) && (!parent || !invisible(parent))) return true
  }
  return false
}
function visible(element: Element, root: Element, visibility = true) {
  if (!element.isConnected) return false
  const rect = atRest(element.getBoundingClientRect(), presentationTravel(element))
  const right = rect.x + rect.width,
    bottom = rect.y + rect.height
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    right <= 0 ||
    bottom <= 0 ||
    rect.x >= innerWidth ||
    rect.y >= innerHeight
  )
    return false
  return !hiddenWithin(element, root, visibility)
}
function hostsIn(root: Element) {
  const scrolls = [...root.querySelectorAll<HTMLElement>('[data-satin-scroll]')].filter(element =>
    visible(element, root),
  )
  const outer = scrolls.filter(
    element => !scrolls.some(other => other !== element && other.contains(element)),
  )
  const screens = [
    ...root.querySelectorAll<HTMLElement>(
      '[data-satin-screen-container][data-satin-covered="false"]',
    ),
  ].filter(screen => visible(screen, root) && !outer.some(scroll => screen.contains(scroll)))
  // A presentation's content is always a plane, under its own scroll views: the presentation's
  // surface is the backdrop of its glass everywhere, never the screen below it (its capture leaves
  // the nested scroll views to their own planes).
  const presentations = [
    ...root.querySelectorAll<HTMLElement>('[data-satin-presentation-content]'),
  ].filter(content => visible(content, root))
  // A screen nested inside a scroll container (a nested navigator) is part of that capture.
  const planes = [
    ...outer,
    ...screens.filter(
      screen =>
        !outer.some(scroll => scroll.contains(screen)) &&
        !screens.some(other => other !== screen && other.contains(screen)) &&
        !presentations.some(content => content.contains(screen)),
    ),
    ...presentations,
  ]
  return planes.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )
}
/** Planes of the scene (its active tab panel) followed by open modal dialogs. `content` (the
 * navigation source) is included when nothing discovered covers it and it is not
 * hidden within the scene (a collapsed sidebar can still be the navigation source). */
export function discoverBackdropHosts(scene: Element, content?: HTMLElement) {
  const scope = scene.querySelector('[data-satin-tab-active="true"]') ?? scene
  const hosts = hostsIn(scope)
  if (
    content &&
    visible(content, scope) &&
    !hosts.some(host => host === content || host.contains(content) || content.contains(host))
  ) {
    hosts.push(content)
    hosts.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  }
  // Modal dialogs paint in the top layer, above the scene, wherever they sit in the DOM. A
  // non-modal dialog (show()) paints in flow, as part of the plane it sits in.
  const dialogs = orderedTopLayerDialogs(document)
  const inDialog = (host: Element) => dialogs.some(dialog => dialog.contains(host))
  return [...hosts.filter(host => !inDialog(host)), ...dialogs.flatMap(dialog => hostsIn(dialog))]
}
const clipping = (overflow: string) => /^(hidden|clip|scroll|auto)$/.test(overflow)
const overflowX = (style: CSSStyleDeclaration) => style.overflowX || style.overflow,
  overflowY = (style: CSSStyleDeclaration) => style.overflowY || style.overflow
const clips = (style: CSSStyleDeclaration) =>
  clipping(overflowX(style)) || clipping(overflowY(style))
/** How close to a screen edge (points) a plane's clip must come to count as reaching it. */
const SCREEN_EDGE_TOLERANCE = 0.5
/** Viewport rectangle the plane is visible through: its box, every clipping ancestor and the
 * viewport. Inside a travelling presentation, the box and the clips that travel with it are read
 * in the presentation's resting frame. */
export function backdropClip(
  host: HTMLElement,
  travel: Travel = presentationTravel(host),
): Rect | undefined {
  const resting = (element: Element) => {
    const rect = element.getBoundingClientRect()
    return travel.layer?.contains(element) ? atRest(rect, travel) : rect
  }
  // A presentation's content plane backs its whole surface (the grabber band included).
  const box = resting(
    (host.hasAttribute('data-satin-presentation-content') &&
      host.closest('.satin-presentation-surface')) ||
      host,
  )
  let x0 = Math.max(0, box.x),
    y0 = Math.max(0, box.y),
    x1 = Math.min(innerWidth, box.x + box.width),
    y1 = Math.min(innerHeight, box.y + box.height)
  for (
    let element = host.parentElement;
    element && element !== document.documentElement;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element)
    // Boxless ancestors cannot clip a descendant plane, regardless of computed overflow.
    if (style.display === 'contents' || !clips(style)) continue
    const r = resting(element)
    if (clipping(overflowX(style))) {
      x0 = Math.max(x0, r.x)
      x1 = Math.min(x1, r.x + r.width)
    }
    if (clipping(overflowY(style))) {
      y0 = Math.max(y0, r.y)
      y1 = Math.min(y1, r.y + r.height)
    }
  }
  if (x1 <= x0 || y1 <= y0) return undefined
  // Nothing composes beyond the screen, so a plane reaching a screen edge continues past it:
  // glass sampling margins there read the plane's own off-screen content, as a single capture did.
  // A clipping ancestor can end a sub-pixel short of the screen (a mount laid out at 955.98 of
  // 956 pt). Read exactly, that kept the plane from continuing below the screen, and glass near
  // that edge blurred the page background into its lower half.
  const far = 1e5
  if (x0 <= SCREEN_EDGE_TOLERANCE) x0 = -far
  if (y0 <= SCREEN_EDGE_TOLERANCE) y0 = -far
  if (x1 >= innerWidth - SCREEN_EDGE_TOLERANCE) x1 = far
  if (y1 >= innerHeight - SCREEN_EDGE_TOLERANCE) y1 = far
  return [x0, y0, x1 - x0, y1 - y0]
}
const parse = (color: string) => {
  const m = color.match(/rgba?\(([^)]+)\)/)
  if (!m) return [0, 0, 0, 0]
  const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean)
  return [Number(r) / 255, Number(g) / 255, Number(b) / 255, Number(a)]
}
/** Opaque colour a plane's empty area shows: its own and its ancestors' backgrounds
 * composited front to back, over the page background. Straight RGB, alpha 1. */
export function effectiveBackground(
  host: HTMLElement,
  page: readonly [number, number, number],
): [number, number, number, number] {
  let r = 0,
    g = 0,
    b = 0,
    a = 0
  for (
    let element: HTMLElement | null = host;
    element && a < 0.999;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element)
    // A presentation surface drawn by its glass material names its resting tone (styles.css).
    const surfaceTone =
      element.classList.contains('satin-presentation-surface') &&
      style.getPropertyValue('--satin-presentation-backdrop').trim()
    const [cr, cg, cb, ca] = parse(
      surfaceTone && parse(style.backgroundColor)[3] === 0 ? surfaceTone : style.backgroundColor,
    )
    if (ca <= 0) continue
    // Premultiplied front-to-back "under" accumulation.
    const k = (1 - a) * ca
    r += k * cr
    g += k * cg
    b += k * cb
    a += k
  }
  const k = 1 - a
  return [r + k * page[0], g + k * page[1], b + k * page[2], 1]
}
export const cssColor = (fill: readonly number[]) =>
  `rgb(${fill
    .slice(0, 3)
    .map(v => Math.round(v * 255))
    .join(' ')})`
