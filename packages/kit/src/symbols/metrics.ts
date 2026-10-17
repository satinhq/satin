import type { SymbolGlyph, SymbolScale, SymbolWeight } from './types.ts'

// icons-eval: circle diameter 1 em; cap-height midline 0.356 em above baseline.
export const symbolMetrics = Object.freeze({
  grid: 56,
  circleDiameter: 47.8126,
  sourceRingStroke: 3.9844,
  capMidline: 0.356,
  scales: { small: 0.8, medium: 1, large: 1.2 },
  // Regular/semibold are measured targets; intermediate/extreme weights interpolate/extrapolate.
  ringStroke: {
    ultraLight: 0.045,
    thin: 0.055,
    light: 0.07,
    regular: 0.085,
    medium: 0.0975,
    semibold: 0.11,
    bold: 0.125,
    heavy: 0.14,
    black: 0.155,
  },
})
export function symbolWeightForFont(weight: string | number): SymbolWeight {
  const numeric = weight === 'normal' ? 400 : weight === 'bold' ? 700 : Number(weight)
  const weights: SymbolWeight[] = [
    'ultraLight',
    'thin',
    'light',
    'regular',
    'medium',
    'semibold',
    'bold',
    'heavy',
    'black',
  ]
  return weights[
    Math.max(0, Math.min(8, Math.round((Number.isFinite(numeric) ? numeric : 400) / 100) - 1))
  ]!
}
export function symbolGeometry(
  scale: SymbolScale = 'medium',
  opticalSize = symbolMetrics.grid / symbolMetrics.circleDiameter,
  baseline: number = symbolMetrics.capMidline,
) {
  const size = opticalSize * symbolMetrics.scales[scale]
  return { size, verticalAlign: baseline - size / 2 }
}
export function symbolNormalization(glyph: SymbolGlyph, weight: SymbolWeight) {
  return (
    glyph.normalization?.[weight] ??
    glyph.normalization?.[
      symbolMetrics.ringStroke[weight] >= symbolMetrics.ringStroke.semibold ? 'semibold' : 'regular'
    ]
  )
}
export function symbolNormalizationTransform(glyph: SymbolGlyph, weight: SymbolWeight) {
  const geometry = symbolNormalization(glyph, weight)
  return geometry
    ? `matrix(${geometry.scaleX} 0 0 ${geometry.scaleY} ${geometry.translateX} ${geometry.translateY})`
    : undefined
}
/** Stroke expands both contour edges. A negative result erodes through an SVG mask. */
export function symbolOutlineOffset(weight: SymbolWeight) {
  return (
    symbolMetrics.ringStroke[weight] * symbolMetrics.circleDiameter - symbolMetrics.sourceRingStroke
  )
}
