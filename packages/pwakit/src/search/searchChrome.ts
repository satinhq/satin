import type { NavigatorStore } from '../navigation/store.ts'

/* The shared navigation bar and its edge host over a screen's scroll view. Same lookup as the
 * drawer's (SearchDrawer.tsx), which keeps a private copy until reference adopts this module. */
export function navigationChromeOf(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const header = node.querySelector<HTMLElement>(':scope > [data-satin-navigation-chrome]')
    if (header) {
      const edge = node.querySelector<HTMLElement>(':scope > [data-satin-navigation-edge-host]')
      return { header, edge }
    }
  }
  return { header: null, edge: null }
}

export const subscribeNever = () => () => {}

/** A screen entering, settled or leaving over this one in its pane (a split sidebar has none). */
export function stackedOver(
  navigator: NavigatorStore | undefined,
  key: string | undefined,
  scroller: HTMLElement | null,
) {
  if (!navigator || !key) return false
  const pane = scroller?.closest<HTMLElement>('[data-satin-screen-container]')?.dataset.satinPane
  if (pane === 'sidebar') return false
  const entries = navigator.getState().entries
  const index = entries.findIndex(entry => entry.key === key)
  return index >= 0 && index < entries.length - 1
}

/** This screen's own title layer and toolbar in the shared bar. */
export function ownBarParts(header: HTMLElement | null, key: string | undefined) {
  if (!header || !key) return []
  const parts = header.querySelectorAll<HTMLElement>(
    '[data-satin-navigation-title-key], [data-satin-entry-toolbar]',
  )
  return [...parts].filter(
    part => (part.dataset.satinNavigationTitleKey ?? part.dataset.satinEntryToolbar) === key,
  )
}
