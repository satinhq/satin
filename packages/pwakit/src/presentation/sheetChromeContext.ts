import { createContext } from 'react'

/** The nearest sheet keeps its accessible label while a navigator owns visible chrome. */
export const SheetChromeContext = createContext<(() => () => void) | null>(null)
