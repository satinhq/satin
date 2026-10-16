/** Source captures remember a logical content origin. Only the drawer's motion loop
 * measures that origin; unrelated source preparation (including sheets) never does. */
export type SearchBackdropAnchor = { offset: number }
type Origin = { element: HTMLElement; top: number; offset: number; active: boolean }
const origins = new WeakMap<HTMLElement, Origin>()

function contentTop(host: HTMLElement, element: HTMLElement) {
  return element.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop
}

/** Called before changing the drawer layout, including when retargeting a running spring. */
export function beginSearchBackdrop(host: HTMLElement) {
  refreshSearchBackdrop(host)
  const drawer = host.querySelector('[data-satin-search]')
  for (let node = drawer?.nextElementSibling; node; node = node.nextElementSibling) {
    if (!(node instanceof HTMLElement) || node.hasAttribute('data-satin-search-edge')) continue
    if (node.hidden || getComputedStyle(node).display === 'none') continue
    origins.set(host, {
      active: true,
      element: node,
      top: contentTop(host, node),
      offset: origins.get(host)?.offset ?? 0,
    })
    return
  }
}

/** Called on drawer animation frames and once at completion, never on unrelated frames. */
export function refreshSearchBackdrop(host: HTMLElement) {
  const origin = origins.get(host)
  if (!origin?.active || !origin.element.isConnected || !host.contains(origin.element)) return
  const top = contentTop(host, origin.element)
  origin.offset += top - origin.top
  origin.top = top
}

export function endSearchBackdrop(host: HTMLElement) {
  refreshSearchBackdrop(host)
  const origin = origins.get(host)
  if (origin) origin.active = false
}

export function searchBackdropAnchor(host: HTMLElement): SearchBackdropAnchor | undefined {
  if (!host.hasAttribute('data-satin-searchable')) return
  return { offset: origins.get(host)?.offset ?? 0 }
}

export function searchBackdropScroll(host: HTMLElement, anchor?: SearchBackdropAnchor) {
  return host.scrollTop - (anchor ? (origins.get(host)?.offset ?? 0) - anchor.offset : 0)
}
