import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'

function createSearchEnvironment() {
  let searching = false
  let dismiss = () => {}
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => searching,
    dismiss: () => dismiss(),
    update(presented: boolean, action: () => void) {
      dismiss = action
      if (searching === presented) return
      searching = presented
      for (const listener of listeners) listener()
    },
  }
}

export const SearchEnvironmentContext = createContext<ReturnType<
  typeof createSearchEnvironment
> | null>(null)
const subscribeNever = () => () => {}
const notSearching = () => false
const dismissNothing = () => {}

/** Whether the enclosing searchable screen is in search mode, including after submission. */
export function useIsSearching() {
  const environment = useContext(SearchEnvironmentContext)
  return useSyncExternalStore(
    environment?.subscribe ?? subscribeNever,
    environment?.snapshot ?? notSearching,
    notSearching,
  )
}

/** Leave the enclosing search mode, clear its query, and dismiss its keyboard. */
export function useDismissSearch() {
  return useContext(SearchEnvironmentContext)?.dismiss ?? dismissNothing
}

export function SearchEnvironment({ children }: { children: ReactNode }) {
  const [environment] = useState(createSearchEnvironment)
  return (
    <SearchEnvironmentContext.Provider value={environment}>
      {children}
    </SearchEnvironmentContext.Provider>
  )
}
