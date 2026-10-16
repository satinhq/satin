import { morphFieldUniforms } from '../morphField.ts'
import { REFERENCE_REGULAR_TINT_PRESETS } from '../lens/referenceRegularTint.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { POPOVER_ARROW_HEIGHT } from '../regions.ts'
import type { Appearance } from '../lens/theme.ts'
import { shaders } from './shaders.ts'
import type { Values } from './passes.ts'

const knots = [30, 29, 27, 18, 11, 7, 4.5, 2.5, 1.2, 0.5, 0, 0, 0, 0, 0, 0]
const gaussian = Array.from({ length: 7 }, (_, index) => Math.exp(-0.5 * (index * 0.5) ** 2))
const gaussianTotal = gaussian[0] + 2 * gaussian.slice(1).reduce((sum, value) => sum + value, 0)
export const presentationWeights = [
  gaussian.slice(0, 4).map(value => value / gaussianTotal),
  [...gaussian.slice(4).map(value => value / gaussianTotal), 0],
] as const

/** These are the same fitted 12e sigma values used by DirectPresentGlass. */
export function presentationSigma(treatment: NonNullable<SurfaceRenderSpec['treatment']>) {
  return treatment === 'sheet'
    ? 9.915343789421998
    : treatment === 'alert' || treatment === 'confirmation'
      ? 13.537168999150673
      : 1.6
}

/* Uniforms for the generated native reference lens, without importing Pixi into the worker. */
export function presentationBlurUniforms(
  spec: SurfaceRenderSpec,
  axis: readonly [number, number],
): Values {
  if (!spec.treatment) throw Error('Missing presentation treatment')
  const first = spec.shape.first,
    second = spec.shape.second ?? first
  const width = spec.sampleWidth,
    height = spec.sampleHeight
  const shape = (s: typeof first) => [
    spec.sampleInsetX + s.centerX,
    spec.sampleInsetY + s.centerY,
    s.halfWidth,
    s.halfHeight,
  ]
  return {
    ...morphFieldUniforms(spec),
    uBottomCorner: [first.bottomRadius ?? 0, Number(first.bottomRadius !== undefined), 0, 0],
    uInputSize: [width, height, 1 / width, 1 / height],
    uInputClamp: [0.5 / width, 0.5 / height, 1 - 0.5 / width, 1 - 0.5 / height],
    uResolution: [width, height],
    uSurfaceCenter: [
      spec.sampleInsetX + spec.frameWidth / 2,
      spec.sampleInsetY + spec.frameHeight / 2,
    ],
    uHalfSize: [spec.frameWidth / 2, spec.frameHeight / 2],
    uAxis: axis,
    uSpacing: presentationSigma(spec.treatment) * 0.5,
    uCornerRadius: first.radius,
    uShapeA: shape(first),
    uShapeB: shape(second),
    uShapeRadii: [first.radius, second.radius],
    uShapeParams: [
      spec.shape.second ? 2 : 1,
      spec.shape.blendRadius,
      spec.shape.whiteMix,
      spec.shape.rimAlpha,
    ],
    uWeightsA: presentationWeights[0],
    uWeightsB: presentationWeights[1],
    uContinuousMenu: 0,
    uCoverageWidth: 0.75,
  }
}

export function presentationUniforms(spec: SurfaceRenderSpec, appearance: Appearance): Values {
  if (!spec.treatment) throw Error('Missing presentation treatment')
  const first = spec.shape.first,
    second = spec.shape.second ?? first
  const inputWidth = spec.sampleWidth,
    inputHeight = spec.sampleHeight
  const shape = (s: typeof first) => [
    spec.sampleInsetX + s.centerX,
    spec.sampleInsetY + s.centerY,
    s.halfWidth,
    s.halfHeight,
  ]
  const tint = REFERENCE_REGULAR_TINT_PRESETS[appearance]
  const neutral = Object.fromEntries(
    shaders.presentation.uniforms
      .filter(
        name =>
          name.startsWith('uGlass') ||
          name.startsWith('uTriggerRim') ||
          name.startsWith('uTriggerContext') ||
          name.startsWith('uTriggerResponse') ||
          name.startsWith('uTriggerChroma') ||
          name.startsWith('uTriggerRegime') ||
          name.startsWith('uTriggerEnabled'),
      )
      .map(name => [name, 0]),
  )
  return {
    ...morphFieldUniforms(spec),
    uBottomCorner: [first.bottomRadius ?? 0, Number(first.bottomRadius !== undefined), 0, 0],
    ...neutral,
    uInputSize: [inputWidth, inputHeight, 1 / inputWidth, 1 / inputHeight],
    uInputClamp: [0.5 / inputWidth, 0.5 / inputHeight, 1 - 0.5 / inputWidth, 1 - 0.5 / inputHeight],
    uResolution: [spec.sampleWidth, spec.sampleHeight],
    uSurfaceCenter: [
      spec.sampleInsetX + spec.frameWidth / 2,
      spec.sampleInsetY + spec.frameHeight / 2,
    ],
    uHalfSize: [spec.frameWidth / 2, spec.frameHeight / 2],
    uRadius: first.radius,
    uMotionMix: 1,
    uShapeA: shape(first),
    uShapeB: shape(second),
    uShapeRadii: [first.radius, second.radius],
    uShapeParams: [
      spec.shape.second ? 2 : 1,
      spec.shape.blendRadius,
      spec.shape.whiteMix,
      spec.shape.rimAlpha,
    ],
    uMaterialTint: [1, 1, 1, 0],
    uMaterialGain: spec.variant === 'clear' ? 1.12 : 1,
    uSheetTreatment:
      spec.treatment === 'sheet'
        ? 1 + (spec.sheetOpaqueMix ?? 0)
        : spec.treatment === 'expandedSheet'
          ? 2
          : spec.treatment === 'alert'
            ? 3
            : spec.treatment === 'confirmation'
              ? 4
              : 0,
    uSheetDark: appearance === 'dark' ? 1 : 0,
    uFoldMarkerEnabled: 0,
    uProfile: [2, 1, 0, spec.variant === 'clear' ? 4 : 5],
    uKnotsA: knots.slice(0, 4),
    uKnotsB: knots.slice(4, 8),
    uKnotsC: knots.slice(8, 12),
    uKnotsD: knots.slice(12, 16),
    uTintEnabled: spec.variant === 'regular' ? 1 : 0,
    uMenuMaterialMix: 0,
    uReturningTrigger: [0, 0, 0, 0],
    uRimBand: 0.75,
    uMenuAppearance: appearance === 'dark' ? 1 : 0,
    uTintLuminancesA: tint.luminances.slice(0, 4),
    uTintLuminancesB: [tint.luminances[4], 0, 0, 0],
    uTintGainsA: tint.gains.slice(0, 4),
    uTintGainsB: [tint.gains[4], 0, 0, 0],
    uTintMixesA: tint.whiteMixes.slice(0, 4),
    uTintMixesB: [tint.whiteMixes[4], 0, 0, 0],
    uTriggerResponse: [1, 0, 1, 0],
    uTriggerChroma: 1,
    uContinuousMenu: 0,
    uCoverageWidth: 0.75,
    uDiagnosticOutput: 0,
    uPopoverArrow: popoverArrowUniform(spec),
  }
}

/* Tip x, tip y (sample coordinates), pointing sign (1 down, -1 up), scale (0: none). Native's
 * arrow is 14 pt tall below or above the body (native reference reference), scaled with it while it presents. */
export function popoverArrowUniform(spec: SurfaceRenderSpec) {
  const arrow = spec.popoverArrow
  if (!arrow || spec.treatment !== 'confirmation') return [0, 0, 0, 0]
  const bottom = arrow.edge === 'bottom'
  const height = POPOVER_ARROW_HEIGHT * arrow.scale
  return [
    spec.sampleInsetX + arrow.x,
    spec.sampleInsetY + (bottom ? spec.frameHeight + height : -height),
    bottom ? 1 : -1,
    arrow.scale,
  ]
}
