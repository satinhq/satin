import {
  CONTROL_SPECULAR,
  CONTROL_INTERIOR_SHADE,
  controlRimUniform,
  controlSizeResponse,
  controlBoundarySizeResponse,
  controlShadowScale,
  controlOpticalScale,
  controlTransmission,
} from './controlRim.ts'
import { touchLightUniforms } from './touchLight.ts'
import { morphFieldUniforms } from '../morphField.ts'
import lightingFit from './lensLightingFit.json'
import { TAB_MOTION_FIT } from '../lens/tabMotionFit.ts'
import { tabInkBand } from './tabGlyphInk.ts'
import { materialUniformMix, materialUniformValues } from '../lens/materialUniforms.ts'
import selectionRecipes from '../lens/selectionParameters.json'
import type { Appearance } from '../lens/theme.ts'
import type { RasterSetup } from '../worker/protocol.ts'
import type { Target, Values } from './passes.ts'
import type { NavigationPose } from './productionTracks.ts'

// Uniform values for the raster's passes (raster.ts). Pure: no GPU calls, no raster state.

type Spec = RasterSetup['spec']
type ShapePart = Spec['shape']['first']
type Lift = NonNullable<RasterSetup['lift']>
type Optics = NonNullable<Lift['optics']>
type Capsule = Pick<ShapePart, 'centerX' | 'centerY' | 'halfWidth' | 'halfHeight' | 'radius'>

/** Where a surface's result lives: its layer, sample rectangle and result texture. */
export type ResultLayout = {
  spec: Spec
  appearance: Appearance
  resolution: number
  /** Layer size, CSS px. */
  width: number
  height: number
  /** Sample rectangle size, CSS px. */
  sampleWidth: number
  sampleHeight: number
  /** A local result covers the sample rectangle (plus one pixel), not the whole layer. */
  local: boolean
  /** The sample rectangle's origin inside the result texture, device px. */
  resultSampleX: number
  resultSampleY: number
  result: Target
}

/** The grouped page background (light) or black behind every backdrop. */
export const pageBackground = (appearance: Appearance) =>
  appearance === 'light' ? [242 / 255, 242 / 255, 247 / 255, 1] : [0, 0, 0, 1]

/** Glass-vibrant glyph ink offsets per appearance. */
export const glyphVibrancy = (appearance: Appearance) =>
  appearance === 'light' ? [13 / 255, 10 / 255] : [-4 / 255, 0]

/** Composite shader uniform (struct P in raster.ts): sample frame, source extents, navigation
 * pose (the live pose, or the tab-drag fallback) and the eight route-atlas slots. */
export function compositeUniforms(
  setup: RasterSetup,
  navigation: NavigationPose | undefined,
  scrollY: number,
  x: number,
  background: readonly number[],
  frontHeight: number,
  rearHeight: number,
) {
  const { spec, resolution, width } = setup
  const dragDim = Math.floor(0.12 * (1 - x / width) * 255) / 255
  return [
    spec.sampleWidth,
    spec.sampleHeight,
    resolution,
    setup.sourceWidth ?? width,
    spec.frameX - spec.sampleInsetX + (setup.sourceOrigin?.x ?? 0),
    spec.frameY - spec.sampleInsetY + (setup.sourceOrigin?.y ?? 0),
    x,
    dragDim,
    ...background,
    frontHeight / resolution,
    rearHeight / resolution,
    scrollY,
    0,
    ...(navigation
      ? [navigation.frontX, navigation.rearX, navigation.frontDim, navigation.rearDim]
      : [x, x - width, 0, dragDim]),
    ...Array.from({ length: 8 }, (_, i) => {
      const route = navigation?.routes?.[i]
      return [route?.x ?? 0, route?.dim ?? 0, ...(route?.zoom?.origin ?? [0, 0])]
    }).flat(),
    setup.navigationAtlas ?? 0,
    // The fill beyond an open window edge (see compositeSource); a raster's own capture has no
    // open edge (`source.w` above is 0) unless its plane's layer says so (composeBackdrop).
    ...background.slice(0, 3),
    1,
    1,
    0,
    0,
    ...Array.from({ length: 8 }, (_, i) => {
      const zoom = navigation?.routes?.[i]?.zoom
      return zoom ? [zoom.x, zoom.y, zoom.scale, zoom.radius] : [0, 0, 0, 0]
    }).flat(),
    ...Array.from(
      { length: 8 },
      (_, i) => navigation?.routes?.[i]?.zoom?.clip ?? [0, 0, 0, 0],
    ).flat(),
  ]
}

/** Fill outside capture windows or real scrolling content. Band clipping uses openEdges alone. */
export const backdropFillEdges = (layer: { openEdges?: number; fillEdges?: number }) =>
  (layer.openEdges ?? 0) | (layer.fillEdges ?? 0)

/** Composite uniform for a backdrop plane other than the content plane: its own capture,
 * scrolled, no navigation pose and no atlas. */
export function planeCompositeUniforms(
  size: readonly [number, number],
  resolution: number,
  layer: {
    width: number
    height: number
    origin: { x: number; y: number }
    fill: readonly number[]
    scroll: { x: number; y: number }
    openEdges?: number
    fillEdges?: number
  },
  rect: readonly number[],
  scale: readonly [number, number] = [1, 1],
) {
  return [
    size[0],
    size[1],
    resolution,
    layer.width,
    rect[0] - layer.origin.x,
    rect[1] - layer.origin.y,
    0,
    0,
    ...layer.fill,
    layer.height,
    layer.height,
    layer.scroll.y,
    backdropFillEdges(layer),
    -layer.scroll.x,
    1e9,
    0,
    0,
    ...Array.from({ length: 32 }, () => 0),
    0,
    ...layer.fill.slice(0, 3),
    ...scale,
    0,
    0,
    ...Array.from({ length: 64 }, () => 0),
  ]
}

/** A kernel's input texture: logical size and a half-texel clamp. */
export const inputUniforms = (source: Target, logicalWidth: number, logicalHeight: number) => ({
  uInputSize: [logicalWidth, logicalHeight, 1 / logicalWidth, 1 / logicalHeight],
  uInputClamp: [
    0.5 / source.width,
    0.5 / source.height,
    1 - 0.5 / source.width,
    1 - 0.5 / source.height,
  ],
})

/** A shape part in sample-rectangle coordinates: [centerX, centerY, halfWidth, halfHeight]. */
export const shapeUniform = (spec: Spec, part: ShapePart) => [
  spec.sampleInsetX + part.centerX,
  spec.sampleInsetY + part.centerY,
  part.halfWidth,
  part.halfHeight,
]

/** A kernel's output frame inside the result texture (local result) or the layer. */
export function outputUniforms(layout: ResultLayout, frameWidth: number, frameHeight: number) {
  const { spec, resolution } = layout
  return layout.local
    ? {
        __outputFrame: [
          layout.resultSampleX / resolution,
          layout.resultSampleY / resolution,
          frameWidth,
          frameHeight,
        ],
        __outputTexture: [
          layout.result.width / resolution,
          layout.result.height / resolution,
          1,
          1,
        ],
        __filterScale: [1, 1],
      }
    : {
        __outputFrame: [
          spec.frameX - spec.sampleInsetX,
          spec.frameY - spec.sampleInsetY,
          frameWidth,
          frameHeight,
        ],
        __outputTexture: [layout.width, layout.height, 1, 1],
        __filterScale: [1, 1],
      }
}

/** The material regular material (bar or menu kernel) sampling the backdrop pyramid. A menu
 * draws its two-part morph outline and trigger regime, and outputs over its padded pyramid. */
/** The tab retains its full-resolution detail and highlight-floor switch.
 * Regular controls share the hardware wide-fill kernel; the separately fitted
 * search field selects the historical fill independently in the second slot.
 */
export function usesTabBarOptics(spec: ResultLayout['spec']) {
  return spec.id === 'dock'
}

/** The material recipe row a surface's material reads. */
function materialSurface(spec: ResultLayout['spec']) {
  if (spec.materialProfile === 'menu') return 'menu'
  return spec.materialProfile === 'searchField' ? 'searchField' : 'bar'
}

export function materialUniforms(
  layout: ResultLayout,
  setup: RasterSetup,
  pyramid: Target,
  scale: number,
): Values {
  const { spec, appearance, resolution, sampleWidth, sampleHeight } = layout
  const first = spec.shape.first
  const second = spec.shape.second ?? first
  const menu = spec.materialProfile === 'menu'
  const material: Values = {
    ...touchLightUniforms(spec.touchLight, spec.sampleInsetX, spec.sampleInsetY),
    ...morphFieldUniforms(spec),
    ...(menu && spec.recipeMix !== undefined
      ? materialUniformMix(appearance, spec.recipeMix)
      : materialUniformValues(materialSurface(spec), appearance)),
    ...inputUniforms(
      pyramid,
      pyramid.width / (resolution * scale),
      pyramid.height / (resolution * scale),
    ),
    __uvScale: [
      (sampleWidth * resolution * scale) / pyramid.width,
      (sampleHeight * resolution * scale) / pyramid.height,
    ],
    // Bar materials render at the full output resolution. Pyramid texel rounding
    // must not rescale their SDF coordinates: a 124.5 pt sample at DPR 2 has
    // 249 output pixels even though its half-resolution pyramid rounds to 125.
    // Menus retain their separate quarter-resolution material grid.
    __filterScale: menu
      ? [
          (sampleWidth * resolution * scale) / Math.ceil(sampleWidth * resolution * scale),
          (sampleHeight * resolution * scale) / Math.ceil(sampleHeight * resolution * scale),
        ]
      : [1, 1],
    uResolution: [sampleWidth, sampleHeight],
    uShape: shapeUniform(spec, first),
    uRadius: first.radius,
    uMaterialMix: 1,
    uCoverageWidth: 0.5 / resolution,
    uDiagnosticOutput: 0,
    uInnerShade: CONTROL_INTERIOR_SHADE,
    uTabBarOptics: [usesTabBarOptics(spec) ? 1 : 0, spec.materialProfile === 'searchField' ? 0 : 1],
    uControlRim: controlRimUniform(appearance),
    uControlSpecular: CONTROL_SPECULAR,
    uControlTransmission:
      spec.materialProfile === 'searchField'
        ? [0, 1, 0, 0]
        : controlTransmission(appearance, first.halfWidth * 2, first.halfHeight * 2),
    uControlSize: [
      controlSizeResponse(appearance, first.halfWidth * 2, first.halfHeight * 2),
      controlShadowScale(appearance, first.halfWidth * 2, first.halfHeight * 2),
      controlBoundarySizeResponse(appearance, first.halfWidth * 2, first.halfHeight * 2),
      spec.materialProfile === 'searchField'
        ? 1
        : controlOpticalScale(first.halfWidth * 2, first.halfHeight * 2),
    ],
  }
  if (menu)
    Object.assign(material, {
      uShapeA: shapeUniform(spec, first),
      uShapeB: shapeUniform(spec, second),
      uShapeRadii: [first.radius, second.radius],
      uShapeParams: [spec.shape.second ? 2 : 1, spec.shape.blendRadius, 0, spec.shape.rimAlpha],
      uContinuousMenu: 1,
      uMenuMaterialMix:
        spec.recipeMix !== undefined ? 1 : (spec.materialMix ?? 1) * (spec.menuTintMix ?? 1),
      uReturningTrigger:
        spec.returningTrigger && spec.recipeMix === undefined
          ? [
              spec.sampleInsetX + spec.returningTrigger.centerX,
              spec.sampleInsetY + spec.returningTrigger.centerY,
              spec.returningTrigger.radius,
              spec.returningTrigger.mix,
            ]
          : [0, 0, 0, 0],
      uTriggerContext: setup.trigger?.context ?? [0, 0, 0, 0],
      uTriggerResponse: setup.trigger?.response ?? [1, 0, 1, 0],
      uTriggerChroma: setup.trigger?.chroma ?? 1,
      uTriggerRegime: setup.trigger?.regime ?? 0,
      uTriggerEnabled: setup.trigger ? 1 : 0,
    })
  if (menu)
    Object.assign(
      material,
      outputUniforms(
        layout,
        pyramid.width / (resolution * scale),
        pyramid.height / (resolution * scale),
      ),
      { __uvScale: [1, 1] },
    )
  return material
}

/** The selection pill's shared uniforms: the capsule over the composed (material) scratch. */
export function selectionBaseUniforms(layout: ResultLayout, composed: Target): Values {
  const { spec, resolution, sampleWidth, sampleHeight } = layout
  const selection = spec.tabSelection!
  const capsule = selection.capsule
  const lensMix = selection.lensMix ?? 0
  return {
    ...morphFieldUniforms({ ...spec, shape: { ...spec.shape, members: undefined } }),
    ...inputUniforms(composed, sampleWidth, sampleHeight),
    ...outputUniforms(layout, sampleWidth, sampleHeight),
    uResolution: [sampleWidth, sampleHeight],
    uShape: [
      spec.sampleInsetX + capsule.centerX,
      spec.sampleInsetY + capsule.centerY,
      capsule.halfWidth,
      capsule.halfHeight,
    ],
    uRadius: capsule.radius,
    uMaterialMix: selection.materialMix * (selection.restMix ?? 1) * (1 - lensMix),
    uCoverageWidth: 0.5 / resolution,
    uDiagnosticOutput: 0,
  }
}

/** The native selection recipe's separable Gaussian over the composed scratch (quarter scale). */
export function selectionBlurUniforms(layout: ResultLayout, composed: Target) {
  const { appearance, resolution, sampleWidth, sampleHeight } = layout
  const recipe = selectionRecipes[appearance]
  const sigma = Math.max(0.01, recipe.blurRadius * recipe.blurSigmaPerRadius * resolution * 0.25)
  const weights = Array.from({ length: 6 }, (_, i) => Math.exp(-0.5 * (i / sigma) ** 2))
  const sum = weights[0] + 2 * weights.slice(1).reduce((total, weight) => total + weight, 0)
  return {
    ...inputUniforms(composed, sampleWidth, sampleHeight),
    uStep: [1 / (resolution * 0.25 * sampleWidth), 0],
    uCross: [0, 1 / composed.height],
    uWeights0: weights.slice(0, 4).map(weight => weight / sum),
    uWeights1: weights.slice(4).map(weight => weight / sum),
  }
}

/** The selection pill (recipe colour matrix and contour) over the blurred scratch. */
export function selectionPillUniforms(layout: ResultLayout, base: Values, vertical: Target) {
  const { appearance, resolution } = layout
  const recipe = selectionRecipes[appearance]
  return {
    ...base,
    uSelectionSize: [
      vertical.width / (resolution * 0.25),
      vertical.height / (resolution * 0.25),
      1 / vertical.width,
      1 / vertical.height,
    ],
    uSelectionRow0: recipe.matrix[0],
    uSelectionRow1: recipe.matrix[1],
    uSelectionRow2: recipe.matrix[2],
    uSelectionContourAngular: recipe.contour.angular,
    uSelectionContourProfile: [recipe.contour.width, recipe.contour.center],
  }
}

/** Anchors of the dock's first and last glyphs, evenly spaced inside the bar's first shape. */
export function dockGlyphAnchors(spec: Spec, count: number) {
  const first = spec.shape.first
  const spacing = (first.halfWidth * 2 - 20) / count
  const anchor = spec.sampleInsetX + first.centerX - first.halfWidth + 10.5 + spacing / 2
  return [anchor, anchor + spacing * (count - 1)]
}

/** How much of a lift is visible: its amount, or any lens field / lighting clock still showing.
 * Geometry-only diffuse height/spread tails do not keep an invisible layer alive. */
export function liftVisibleAmount(lift: RasterSetup['lift'], appearance: Appearance) {
  const lensField = appearance === 'dark' ? lift?.optics?.lensDark : lift?.optics?.lensLight
  const lightingField =
    appearance === 'dark' ? lift?.optics?.lightingDark : lift?.optics?.lightingLight
  const lightingAmount = lightingField
    ? Math.max(
        lightingField[0],
        lightingField[1],
        lightingField[3],
        lightingField[5],
        lightingField[6],
      )
    : 0
  return Math.max(lift?.amount ?? 0, Math.abs(lensField?.[0] ?? 0) / 10.5, lightingAmount)
}

/** The lighting fit a lift uses: its explicit profile (a held control thumb), else a glass button's
 * (composed source, no tab selection) or a tab's. */
export function liftLighting(lift: Lift, spec: Spec, appearance: Appearance) {
  const profile =
    lift.profile ?? (lift.source === 'composed' && !spec.tabSelection ? 'button' : 'tab')
  return { ...TAB_LENS_MAP, ...NO_RIM_LINE, ...NO_TOP_SHADE, ...lightingFit[profile][appearance] }
}
/** Only the control profile draws the measured dark rim line (gain, width in points) with a
 * device-pixel edge; tab and button keep their 0.4 pt edge. */
const NO_RIM_LINE = { rimLineGain: 0, rimLineWidthPt: 0 } as const
/** Only the control profile has native's top inner shadow (amplitude, centre in points below the
 * rim, rim-side and centre-side sigma in points). */
const NO_TOP_SHADE = { topShade: [0, 0, 1, 1] } as const
/** The tab selection's analytic normal field (broad amplitude, broad support, edge amplitude;
 * field gains on the press clock's [edge refraction, depth, edge support, fringe]). */
const TAB_LENS_MAP = { lensMap: [9, 36, -17.5], fieldGain: [1, 1, 1, 1] } as const

/** The lift's lighting clocks (seven phases), all at the lift amount when the optics carry none. */
export function liftLightingClocks(lift: Lift, optics: Optics, appearance: Appearance) {
  return (
    (appearance === 'dark' ? optics.lightingDark : optics.lightingLight) ?? [
      lift.amount,
      lift.amount,
      lift.amount,
      lift.amount,
      lift.amount,
      lift.amount,
      lift.amount,
    ]
  )
}

/** The shared-lift kernel: the lens aperture, its lighting and the lifted foreground glyphs. */
export function sharedLiftUniforms(
  layout: ResultLayout,
  lift: Lift,
  optics: Optics,
  capsule: Capsule,
  lensDebug: number,
  lensAmount: number,
): Values {
  const { spec, appearance, resolution, sampleWidth, sampleHeight } = layout
  const fit = TAB_MOTION_FIT
  const first = spec.shape.first
  const lighting = liftLighting(lift, spec, appearance)
  const clocks = liftLightingClocks(lift, optics, appearance)
  const centerX = spec.sampleInsetX + capsule.centerX
  const centerY = spec.sampleInsetY + capsule.centerY
  const count = lift.glyphCount ?? spec.tabSelection?.glyphCount ?? 1
  const anchors =
    lift.glyphAnchors ?? (spec.tabSelection ? dockGlyphAnchors(spec, count) : [centerX, centerX])
  const contentGlyphs = lift.glyphLayout === 'content'
  const inkBand = tabInkBand(spec, resolution)
  return {
    ...outputUniforms(layout, sampleWidth, sampleHeight),
    uResolution: [sampleWidth, sampleHeight],
    uShape: [centerX, centerY, capsule.halfWidth, capsule.halfHeight],
    uRadius: capsule.radius,
    uLensDebug: [lensDebug, resolution, 32, 0],
    uLensLightRotation: 0,
    uLensBandScale: lighting.bandScale,
    uLensBandDirections: [lighting.capBandScale, lighting.bottomBandScale],
    uLensFringe: [
      lighting.straightFringeGain,
      lighting.capFringeGain,
      lighting.straightFringeWidthPt,
      lighting.capFringeWidthPt,
    ],
    uLensDepthShade: lighting.depthShade,
    uLensDepthIsotropic: lift.source === 'composed' && !spec.tabSelection ? 1 : 0,
    uLensFaceTreatment: [lighting.faceSaturation, lighting.faceRadialMix],
    uLensCrestVertical: [
      lighting.crestTopGain,
      lighting.crestBottomGain,
      lighting.rimLineGain,
      lighting.rimLineWidthPt,
    ],
    uLensExteriorShadow: [lighting.shadowOpacity, lighting.shadowOffsetPt, lighting.shadowSigmaPt],
    uLensLighting: [
      lighting.faceGain,
      lighting.faceBias,
      lighting.crestSigmaPt,
      lighting.crestCenterPt,
    ],
    uLensLightStrength: [
      lighting.crestGain,
      lighting.crestGain,
      lighting.diffuseGain,
      lighting.crestGain,
    ],
    uLensLightingClock: clocks.slice(0, 4),
    uLensLightingClock2: [clocks[4], clocks[5], clocks[6], 0],
    uLensField: (
      (appearance === 'dark' ? optics.lensDark : optics.lensLight) ?? [
        -10.5 * lift.amount,
        7 * lift.amount,
        11.2 * lift.amount,
        3.68 * lift.amount,
      ]
    ).map((value, i) => value * lighting.fieldGain[i]),
    uLensMap: lighting.lensMap,
    uLensTopShade: lighting.topShade,
    uLiftMix: lensAmount,
    uMotionMix: optics.motionMix,
    uBackgroundWarpPt: optics.backgroundWarpPt,
    uTravelWarpPt: optics.travelWarpPt,
    uForegroundChroma: optics.foregroundChroma,
    uForegroundScaleX: optics.foregroundScaleX,
    uForegroundScaleY: optics.foregroundScaleY,
    uForegroundLabelScaleX: optics.foregroundLabelScaleX,
    uForegroundLabelScaleY: optics.foregroundLabelScaleY,
    uForegroundShiftPt: contentGlyphs
      ? [0, 0]
      : [fit.foregroundShiftPt.icon, fit.foregroundShiftPt.label],
    uRimGradient: optics.rimGradient,
    uGlyphAnchors: anchors,
    uGlyphCount: count,
    uGlyphLayers: spec.tabSelection?.glyphLayers
      ? [1, inkBand.top / sampleHeight, sampleHeight / inkBand.height]
      : 0,
    uDockShape: contentGlyphs ? [0, -1e6, 0, 0] : shapeUniform(spec, first),
    uGlyphVibrancy: lift.glyphVibrancy ?? glyphVibrancy(appearance),
  }
}

/** The plain lens kernel for a lift without fitted optics. */
export function lensLiftUniforms(
  layout: ResultLayout,
  lift: Lift,
  capsule: Capsule,
  source: Target,
) {
  const { spec, appearance, sampleWidth, sampleHeight } = layout
  const centerX = spec.sampleInsetX + capsule.centerX
  const centerY = spec.sampleInsetY + capsule.centerY
  return {
    ...inputUniforms(source, sampleWidth, sampleHeight),
    ...outputUniforms(layout, sampleWidth, sampleHeight),
    uResolution: [sampleWidth, sampleHeight],
    uShape: [centerX, centerY, capsule.halfWidth, capsule.halfHeight],
    uRadius: capsule.radius,
    uMaterialMix: Math.max(0, Math.min(1, lift.amount)),
    uGlyphAnchors: lift.glyphAnchors ?? [centerX, centerX],
    uGlyphCount: lift.glyphCount ?? 1,
    uDockShape: shapeUniform(spec, spec.shape.first),
    uGlyphVibrancy: glyphVibrancy(appearance),
  }
}
