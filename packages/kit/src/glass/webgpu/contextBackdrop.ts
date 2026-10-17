import { backdropOwner } from './backdropLayers.ts'

/** Prepare the dim before revealing a context menu, including speculative hold preparation.
 * Only menu rasters sample this overlay; the displayed popover dims the other controls. */
export function contextBackdrop(document: Document) {
  const hosts = document.querySelectorAll<HTMLElement>('[data-satin-context-backdrop-active]')
  const host = hosts[hosts.length - 1]
  if (!host) return undefined
  return {
    owner: backdropOwner(host),
    alpha: document.documentElement.dataset.satinAppearance === 'dark' ? 0.48 : 0.2,
  }
}
