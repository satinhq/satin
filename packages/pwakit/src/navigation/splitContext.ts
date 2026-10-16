import { createContext, useContext } from 'react'
import type { ScreenEntry } from './types.ts'

export type SplitSelection = Readonly<{
  mode: 'stack' | 'split'
  /** Internal one-shot launch ownership, consumed by Sidebar. */
  claimInitialSelection?: () => boolean
  entry: ScreenEntry | undefined
  identity: string | undefined
}>

export const SplitContext = createContext<SplitSelection | undefined>(undefined)

/** Entry identity owns navigation/scroll; identity is the registry's semantic row key. */
export function useSplitSelection(): SplitSelection {
  const selection = useContext(SplitContext)
  if (!selection) throw new Error('useSplitSelection must be called inside NavigatorHost.')
  return selection
}
