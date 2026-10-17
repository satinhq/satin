import type { Appearance } from './theme.ts'
import { TAB_PILL_MATERIAL, TAB_BAR_MATERIAL } from './tabMaterialModel.ts'
export { tabGlyphStyle } from './tabGlyphColours.ts'
export const TAB_BAR_LOCAL_CENTRES = Object.freeze([53, 138, 223, 308])
export const TAB_BAR_BLUR_SIGMA = Object.freeze({
  light: TAB_BAR_MATERIAL.light.sigma,
  dark: TAB_BAR_MATERIAL.dark.sigma,
})
export const TAB_SELECTION_HEIGHT = 52
export const TAB_SELECTION_WIDTH = 96

// Effective dense-kernel sigma is explicit in the measured material model.
export function stableTabSelection(appearance: Appearance) {
  return { blurSigmaCssPx: TAB_PILL_MATERIAL[appearance].sigma, materialMix: 1 } as const
}
export function tabSelectionCapsule(
  index: number,
  centres: readonly number[] = TAB_BAR_LOCAL_CENTRES,
  width = TAB_SELECTION_WIDTH,
  height = TAB_SELECTION_HEIGHT,
  centerY = 31,
) {
  const selected = Math.max(0, Math.min(centres.length - 1, Math.round(index)))
  return {
    centerX: centres[selected],
    centerY,
    halfHeight: height / 2,
    halfWidth: width / 2,
    radius: height / 2,
  }
}
