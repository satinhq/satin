import type { LiquidMotionMode } from './liquidMotion.ts'
import type { ReferenceBackgroundMode } from './referenceBackground.ts'

export type ContentPage = 'drag' | 'settings' | ReferenceBackgroundMode

/** Backdrops change what is behind the tabs, not whether the tabs exist.
 * Explicit optical probes can still request bare glass. The separate drag
 * and liquid specimens retain their original presentation.
 */
export function tabPresentation(page: ContentPage, motion: LiquidMotionMode, override?: boolean) {
  if (motion !== 'none') return { visible: false, reason: 'liquid-specimen' } as const
  if (page === 'settings') return { visible: true, reason: 'settings' } as const
  if (override !== undefined) return { visible: override, reason: 'explicit-probe' } as const
  return {
    visible: page !== 'drag',
    reason: page === 'drag' ? 'drag-specimen' : 'backdrop',
  } as const
}

export function tabProbeOverride(search: string): boolean | undefined {
  const value = new URLSearchParams(search).get('tabbar')
  return value === '1' ? true : value === '0' ? false : undefined
}
