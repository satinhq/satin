import { createContext } from 'react'
import type { AxisLayoutClass, LayoutClass } from './layoutClass.ts'

/** A presentation selects navigation panes from its own available width. */
export const NavigationLayoutContext = createContext<AxisLayoutClass | undefined>(undefined)

/** A presentation's own size classes, which the environment hooks report inside it. */
export const PresentationLayoutClassContext = createContext<LayoutClass | undefined>(undefined)
