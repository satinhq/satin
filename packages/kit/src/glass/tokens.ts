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

// Optical defaults ported from liquid-glass-web-react under the MIT license.
// The map adapts strength to each registered bar's own geometry.
export const GLASS_LENS_STRENGTH = 0.1
export const GLASS_LENS_CHROMATIC_ABERRATION = 0.2
export const GLASS_LENS_BLUR_PX = 0
export const GLASS_LENS_DEPTH_PX = 10
export const GLASS_LENS_CURVATURE = 0.65
export const GLASS_LENS_SPLAY = 1
export const GLASS_LENS_GLOW = 0.1
export const GLASS_LENS_GLOW_SPREAD = 1
export const GLASS_LENS_GLOW_EXPONENT = 1.5
export const GLASS_LENS_EDGE_HIGHLIGHT = 0.25
export const GLASS_LENS_EDGE_WIDTH_PX = 3
export const GLASS_LENS_EDGE_EXPONENT = 1.5
export const GLASS_LENS_SPECULAR = 1
export const GLASS_LENS_SPECULAR_ANGLE_DEG = 45

// The CSS-only fallback stays close to passthrough. It supplies a restrained
// bright material and rim when the foreground displacement gate is unavailable.
export const GLASS_REGULAR_SATURATION = 1.04
export const GLASS_CLEAR_SATURATION = 1
export const GLASS_REGULAR_BRIGHTNESS = 1.02
export const GLASS_CLEAR_BRIGHTNESS = 1
export const GLASS_TINT_RGB = '255 255 255'
export const GLASS_REGULAR_TINT_ALPHA = 0.06
export const GLASS_CLEAR_TINT_ALPHA = 0
export const GLASS_RIM_HIGHLIGHT_ALPHA = 0.25
export const GLASS_RIM_SHADOW_ALPHA = 0.35
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
  lens: Object.freeze({
    blur: GLASS_LENS_BLUR_PX,
    chromaticAberration: GLASS_LENS_CHROMATIC_ABERRATION,
    curvature: GLASS_LENS_CURVATURE,
    depth: GLASS_LENS_DEPTH_PX,
    edgeExponent: GLASS_LENS_EDGE_EXPONENT,
    edgeHighlight: GLASS_LENS_EDGE_HIGHLIGHT,
    edgeWidth: GLASS_LENS_EDGE_WIDTH_PX,
    glow: GLASS_LENS_GLOW,
    glowExponent: GLASS_LENS_GLOW_EXPONENT,
    glowSpread: GLASS_LENS_GLOW_SPREAD,
    specular: GLASS_LENS_SPECULAR,
    specularAngle: GLASS_LENS_SPECULAR_ANGLE_DEG,
    splay: GLASS_LENS_SPLAY,
    strength: GLASS_LENS_STRENGTH,
  }),
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
    highlightAlpha: GLASS_RIM_HIGHLIGHT_ALPHA,
    shadowAlpha: GLASS_RIM_SHADOW_ALPHA,
  }),
  tintRgb: GLASS_TINT_RGB,
  selection: Object.freeze({
    duration: GLASS_SELECTION_DURATION_MS,
    easing: GLASS_SELECTION_EASING,
  }),
})
