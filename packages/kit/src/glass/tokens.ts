export type GlassVariant = 'regular' | 'clear'

export const GLASS_BAR_HEIGHT_PX = 54
export const GLASS_TAB_BAR_HEIGHT_PX = 60
export const GLASS_TAB_BAR_INLINE_INSET_PX = 16
// UIKit's iOS 27 floating tab platter ends 21 pt above the physical screen
// bottom. This is a screen-edge offset, not extra padding above WebKit's
// reported safe-area inset; UIKit deliberately occupies the bottom safe area.
export const GLASS_TAB_BAR_BOTTOM_GAP_PX = 21
// Rough-edges native reference: compact phone platter occupies y376–420 in a 440 pt screen.
export const GLASS_COMPACT_TAB_BAR_HEIGHT_PX = 44
export const GLASS_COMPACT_TAB_BAR_BOTTOM_GAP_PX = 20
export const GLASS_CONTROL_SIZE_PX = 44

// The CSS-only fallback stays close to passthrough. It supplies a restrained
// bright material and rim when the foreground displacement gate is unavailable.
export const GLASS_REGULAR_SATURATION = 1.04
export const GLASS_CLEAR_SATURATION = 1
export const GLASS_REGULAR_BRIGHTNESS = 1.02
export const GLASS_CLEAR_BRIGHTNESS = 1
export const GLASS_TINT_RGB = '255 255 255'
export const GLASS_REGULAR_TINT_ALPHA = 0.06
export const GLASS_CLEAR_TINT_ALPHA = 0
export const GLASS_BAR_EDGE_HIGHLIGHT_ALPHA = 0.25
export const GLASS_BAR_SHADOW_ALPHA = 0.2
export const GLASS_SELECTION_DURATION_MS = 300
export const GLASS_SELECTION_EASING = 'cubic-bezier(0.2, 0.82, 0.2, 1)'

export const glassTokens = Object.freeze({
  barHeight: GLASS_BAR_HEIGHT_PX,
  tabBarHeight: GLASS_TAB_BAR_HEIGHT_PX,
  tabBarInlineInset: GLASS_TAB_BAR_INLINE_INSET_PX,
  tabBarBottomGap: GLASS_TAB_BAR_BOTTOM_GAP_PX,
  controlSize: GLASS_CONTROL_SIZE_PX,
  regular: Object.freeze({
    brightness: GLASS_REGULAR_BRIGHTNESS,
    saturation: GLASS_REGULAR_SATURATION,
    tintAlpha: GLASS_REGULAR_TINT_ALPHA,
  }),
  clear: Object.freeze({
    brightness: GLASS_CLEAR_BRIGHTNESS,
    saturation: GLASS_CLEAR_SATURATION,
    tintAlpha: GLASS_CLEAR_TINT_ALPHA,
  }),
  rim: Object.freeze({
    barEdgeHighlightAlpha: GLASS_BAR_EDGE_HIGHLIGHT_ALPHA,
    barShadowAlpha: GLASS_BAR_SHADOW_ALPHA,
  }),
  tintRgb: GLASS_TINT_RGB,
  selection: Object.freeze({
    duration: GLASS_SELECTION_DURATION_MS,
    easing: GLASS_SELECTION_EASING,
  }),
})
