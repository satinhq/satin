import { createContext } from 'react'

/** The nearest sheet tracks active navigators separately from their visible title ownership. */
export const SheetChromeContext = createContext<((ownsTitle?: boolean) => () => void) | null>(null)
