import { createContext, useContext } from 'react'
import type {
  GlassAccessibilityPreferences,
  GlassCapabilityDecision,
  GlassRenderTestState,
} from './capability.ts'
import type { GlassVariant } from './tokens.ts'

export type GlassMaterialDiagnostics = Readonly<{
  accessibility: GlassAccessibilityPreferences
  capability: GlassCapabilityDecision
  lensBoost: number
  mapRegenerationCount: number
  renderTest: GlassRenderTestState
}>

export type GlassRegionRegistration = Readonly<{
  element: HTMLElement
  id: string
  radius: number
  variant: GlassVariant
}>

export type GlassMaterialContextValue = Readonly<{
  chromeLayer: HTMLElement | null
  diagnostics: GlassMaterialDiagnostics
  registerRegion: (registration: GlassRegionRegistration) => () => void
}>

export const GlassMaterialContext = createContext<GlassMaterialContextValue | null>(null)

export function useGlassMaterialContext() {
  const value = useContext(GlassMaterialContext)
  if (!value) throw new Error('Glass primitives must be rendered inside SatinRoot.')
  return value
}

export function useGlassMaterialDiagnostics() {
  return useGlassMaterialContext().diagnostics
}
