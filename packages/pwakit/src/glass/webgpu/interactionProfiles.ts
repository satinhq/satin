import type { TabHeldGeometry } from '../lens/tabMotion.ts'

// Native lossless fitting set, 12v/native-stills: all 13 observed tab holds
// have [9.7889447,867.7567146,127.7144342,72.4865708] presentation bounds.
// This corrects only the measured 440pt, four-tab baseline. No timing fit.
export const NATIVE_HELD_TAB: TabHeldGeometry = Object.freeze({
  widthDelta: 20.21443424016636,
  height: 72.48657078495921,
  edgeShift: 6.60383815629875,
  edgeOverflow: 11.211055276381925,
})
// iPadOS 27 regular-width top tab bar, iPad ReplayKit (Oct 11, fit-only cadence): a held
// 85 pt Menus pill becomes a 109.4 pt × 55.5 pt lens centred on its tab, over a 44 pt bar whose
// pills rest at 36 pt. Edge shift and overflow are not yet measured; they keep the phone defaults.
// Evidence: the implementation contract
export const NATIVE_HELD_TOP_TAB: TabHeldGeometry = Object.freeze({
  widthDelta: 24.4,
  height: 55.5,
  edgeShift: 5,
  edgeOverflow: 11,
  minHeight: 36,
})
export function tabHeldGeometry(
  width?: number,
  height?: number,
  dockWidth?: number,
  placement: 'bottom' | 'top' = 'bottom',
) {
  if (placement === 'top') return NATIVE_HELD_TOP_TAB
  return width === 107.5 && height === 54 && dockWidth === 398 ? NATIVE_HELD_TAB : undefined
}
