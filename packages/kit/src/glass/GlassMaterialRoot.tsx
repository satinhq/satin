import { reportGlassError } from './errors.ts'
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { type GlassAccessibilityPreferences } from './capability.ts'
import { GlassMaterialContext, type GlassRegionRegistration } from './context.ts'
import { MaterialEffectRoot } from './MaterialEffectRoot.tsx'

export type GlassDisplacementPolicy = 'auto' | 'disabled'
function readAccessibilityPreferences(): GlassAccessibilityPreferences {
  return {
    increasedContrast: matchMedia('(prefers-contrast: more)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
  }
}
/** The app paint layer remains untouched. Liquid regions own their retained image. */
export function GlassMaterialRoot({
  children,
  displacement,
  prepared = true,
  onLaunchReady,
}: PropsWithChildren<{
  displacement: GlassDisplacementPolicy
  /** Lazy renderer modules wait for the verified offline bundle on first install. */
  prepared?: boolean
  onLaunchReady?: (ready: boolean) => void
}>) {
  const scene = useRef<HTMLDivElement>(null)
  const [chromeLayer, setChromeLayer] = useState<HTMLDivElement | null>(null)
  const renderTest = 'passed' as const
  const [accessibility, setAccessibility] = useState(readAccessibilityPreferences)
  useEffect(() => {
    const queries = [
      '(prefers-contrast: more)',
      '(prefers-reduced-motion: reduce)',
      '(prefers-reduced-transparency: reduce)',
    ].map(value => matchMedia(value))
    const refresh = () => setAccessibility(readAccessibilityPreferences())
    queries.forEach(query => query.addEventListener('change', refresh))
    return () => queries.forEach(query => query.removeEventListener('change', refresh))
  }, [])
  useEffect(() => {
    if (displacement === 'disabled')
      reportGlassError(
        'unsupported-configuration',
        'glassDisplacement="disabled" is no longer supported. Glass cannot degrade to CSS.',
        'configuration',
      )
  }, [displacement])
  const capability = useMemo(
    () => ({ state: 'displacement' as const, reason: 'renderer-required' as const }),
    [],
  )
  const registerRegion = useCallback((_registration: GlassRegionRegistration) => () => {}, [])
  const diagnostics = useMemo(
    () => ({ accessibility, capability, renderTest, lensBoost: 1, mapRegenerationCount: 0 }),
    [accessibility, capability.reason, capability.state, renderTest],
  )
  const context = useMemo(
    () => ({ chromeLayer, diagnostics, registerRegion }),
    [chromeLayer, diagnostics, registerRegion],
  )
  return (
    <GlassMaterialContext value={context}>
      <div
        ref={scene}
        data-satin-glass-capability={capability.state}
        data-satin-scene-paint-layer="true"
      >
        <MaterialEffectRoot
          scene={scene}
          chrome={chromeLayer}
          enabled={prepared && capability.state === 'displacement'}
          capabilitySettled={prepared}
          onLaunchReady={onLaunchReady}
        >
          {children}
        </MaterialEffectRoot>
      </div>
      <div
        ref={setChromeLayer}
        data-satin-glass-capability={capability.state}
        data-satin-glass-chrome-layer="true"
        data-satin-glass-contrast={accessibility.increasedContrast ? 'more' : 'standard'}
        data-satin-glass-motion={accessibility.reducedMotion ? 'reduced' : 'full'}
        data-satin-glass-transparency={accessibility.reducedTransparency ? 'reduced' : 'full'}
      />
    </GlassMaterialContext>
  )
}
