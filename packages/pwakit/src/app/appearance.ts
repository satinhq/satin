import { useSyncExternalStore } from 'react'
import { installAppearanceStore, type PreferredColorScheme } from './appearanceStore.ts'

const store = () => installAppearanceStore()
export const readDarkAppearance = () => store().getSnapshot().dark
export const subscribeAppearance = (listener: () => void) => store().subscribe(listener)
export function useDarkAppearance() {
  return useSyncExternalStore(subscribeAppearance, readDarkAppearance, () => false)
}

/** Bounded trait and lifecycle log for installed-runtime resume diagnostics. */
export const readAppearanceDiagnostics = () => store().getDiagnostics()

/** Set this installed scene's appearance. System or null resumes the retained system trait.
 * Store a user's choice with useAppStorage; the override itself lasts for this document. */
export function preferredColorScheme(scheme: PreferredColorScheme) {
  store().setPreferredColorScheme(scheme)
}
export type { PreferredColorScheme }
