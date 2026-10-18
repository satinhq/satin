/** Owns the document colour sampled by the opaque system strip. The generated
 * head supplies launch appearance until the page supplies its composited top. */
export type StatusColor = {
  setBase(color: string): void
  setPage(color: string): void
  releasePage(): void
}

declare global {
  interface Window {
    __SATIN_STATUS_COLOR__?: StatusColor
  }
}

/** Self-contained because the pre-React head embeds this function. */
export function installStatusColor(): StatusColor {
  if (window.__SATIN_STATUS_COLOR__) return window.__SATIN_STATUS_COLOR__
  let base = ''
  let page: string | undefined
  const applied = new WeakMap<HTMLElement, string>()
  const publish = () => {
    const color = page ?? base
    if (!color) return
    // Publish the requested strip colour through the document background. The
    // installed fixed-shell case still requires physical repaint qualification;
    // correct DOM colours alone do not prove that the system strip repainted.
    for (const element of [document.documentElement, document.body]) {
      if (!element || applied.get(element) === color) continue
      element.style.setProperty('background-color', color, 'important')
      applied.set(element, color)
    }
    const meta = document.getElementById('satin-theme-color') as HTMLMetaElement | null
    if (meta && color && meta.content !== color) meta.content = color
  }
  // The head runs before body exists. Apply the same owner once parsing ends.
  document.addEventListener('DOMContentLoaded', publish, { once: true })
  const controller: StatusColor = {
    setBase(color) {
      base = color
      publish()
    },
    setPage(color) {
      page = color
      publish()
    },
    releasePage() {
      page = undefined
      publish()
    },
  }
  window.__SATIN_STATUS_COLOR__ = controller
  return controller
}
