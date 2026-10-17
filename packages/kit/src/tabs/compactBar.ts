/** The rendered tab bar owns restoration; TabView owns selection and retained destinations. */
const restorers = new WeakMap<Element, () => void>()

export function registerCompactTabBar(chrome: Element, restore: () => void) {
  restorers.set(chrome, restore)
  return () => {
    if (restorers.get(chrome) === restore) restorers.delete(chrome)
  }
}

export function restoreCompactTabBar(chrome: Element | null) {
  if (chrome) restorers.get(chrome)?.()
}

/** Rendered glass chrome can live outside TabView. Its tab panels identify the owner. */
export function tabBottomChrome(dock: Element): HTMLElement | undefined {
  for (const tab of dock.querySelectorAll('[role="tab"][aria-controls]')) {
    const panel = dock.ownerDocument.getElementById(tab.getAttribute('aria-controls')!)
    const owner = panel?.closest('[data-satin-tab-view]')
    const chrome = owner?.querySelector<HTMLElement>('[data-satin-tab-bottom-chrome="phone"]')
    if (chrome) return chrome
  }
  // Standalone internal specimens do not register panels. Never choose an arbitrary owner.
  const candidates = dock
    .closest('[data-satin-root]')
    ?.querySelectorAll<HTMLElement>('[data-satin-tab-bottom-chrome="phone"]')
  return candidates?.length === 1 ? candidates[0] : undefined
}
