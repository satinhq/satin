import { useSyncExternalStore } from 'react'
import { installAppearanceStore, type PreferredColorScheme } from './appearanceStore.ts'

const store = () => installAppearanceStore()
export const readDarkAppearance = () => store().getSnapshot().dark
export const subscribeAppearance = (listener: () => void) => store().subscribe(listener)
export function useDarkAppearance() {
  return useSyncExternalStore(subscribeAppearance, readDarkAppearance, () => false)
}

/** Returns a short log of appearance changes and lifecycle events, for diagnosing appearance
 * after a resume. */
export const readAppearanceDiagnostics = () => store().getDiagnostics()

/** Forces the whole app into `light` or `dark`. `system` or null follows the system again. The
 * override lasts until the page reloads, so store the user's choice with `useAppStorage` and
 * apply it at launch. */
export function preferredColorScheme(scheme: PreferredColorScheme) {
  store().setPreferredColorScheme(scheme)
}
export type { PreferredColorScheme }
