// EXPERIMENTAL, PRIVATE. The nearest experimental drawer, for toolbar controls.

import { createContext, useContext } from 'react'

export type ExperimentalDrawerHandle = Readonly<{
  open: boolean
  show(): void
  hide(): void
  toggle(): void
  /** Accessible name for a toolbar control. */
  label: 'Hide sidebar' | 'Show sidebar'
}>

export const DrawerHandleContext = createContext<ExperimentalDrawerHandle | undefined>(undefined)

/** The nearest experimental drawer, for a toolbar control. */
export function useExperimentalDrawer() {
  return useContext(DrawerHandleContext)
}
