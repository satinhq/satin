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

/** Returns the split view's mode and the entry shown in its detail column. It throws outside a
 * split view. */
export function useSplitSelection(): SplitSelection {
  const selection = useContext(SplitContext)
  if (!selection) throw new Error('useSplitSelection must be called inside NavigatorHost.')
  return selection
}
