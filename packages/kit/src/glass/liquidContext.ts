import type { GlassRegionRegistry } from './regionRegistry.ts'
import { createContext } from 'react'
import type { TabBarProps, TabItemFrame } from './TabBar.tsx'
export type RegisteredTabBar = TabBarProps &
  Readonly<{
    tint?: string
    insetHost?: HTMLElement
    intrinsicWidth?: boolean
    /** 'top': the regular-width iPad bar, laid out by `itemFrames` inside `insetHost`. */
    placement?: 'bottom' | 'top'
    itemFrames?: readonly TabItemFrame[]
  }>

export type MaterialEffectRegistration = Readonly<{
  /** The one glass renderer. */
  backend?: 'webgpu' | 'fallback'
  regions?: GlassRegionRegistry
  ready: boolean
  preparingSources?: boolean
  preparedScreenKey?: string
  preparedAt?: number
  preparedSources?: ReadonlyMap<string, number>
  registerTabs: (id: string, tabs: RegisteredTabBar | undefined) => void
}>
export const MaterialEffectContext = createContext<MaterialEffectRegistration | null>(null)
