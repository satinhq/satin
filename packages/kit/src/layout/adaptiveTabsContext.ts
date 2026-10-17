import { createContext } from 'react'

export const AdaptiveTabsContext = createContext<{
  height: number
  register: (id: string, height: number) => void
  unregister: (id: string) => void
}>({ height: 0, register() {}, unregister() {} })
