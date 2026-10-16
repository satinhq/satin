import { createContext } from 'react'

/** Tab visibility pauses framework work without destroying app effects or DOM. */
export const TabActivityContext = createContext(true)
export const TabRegistrationContext = createContext<((retap: () => void) => () => void) | null>(
  null,
)

/** Public app runtime persists the native tab-sidebar preference with the scene. */
export const TabSidebarContext = createContext<{
  expanded: boolean | undefined
  setExpanded: (expanded: boolean) => void
} | null>(null)
