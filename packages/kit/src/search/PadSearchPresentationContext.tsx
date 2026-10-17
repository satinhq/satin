import { createContext } from 'react'

/** Internal coordination between a retained search destination and its owning tab bar. */
export const PadSearchPresentationContext = createContext<{
  owner: string | null
  setOwner: (owner: string | null) => void
} | null>(null)
export const PadSearchTabContext = createContext<string | null>(null)
