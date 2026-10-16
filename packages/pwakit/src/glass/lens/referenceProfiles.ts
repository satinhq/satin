/* Frozen measured-reference rest-variant measurements; no renderer dependencies. */
export type ReferenceVariant = 'clear' | 'regular'

export type ReferenceLensPreset = Readonly<{
  bandBlurCssPx: number
  /** Gaussian sigma of the diffusion in CSS px (10-90% edge width is about 2.56 sigma). */
  blurSigmaCssPx: number
  /** Filter resolution cap for the diffusion passes; keeps sigma at 2-3 working pixels. */
  blurResolutionCap: number
  /** Inward displacement in CSS px at u = 0, 2, 4, ... 30 px inside the rim (16 knots). */
  knotsCssPx: readonly number[]
  knotSpacingCssPx: number
  /** Amplitude scale as a function of the corner radius: clamp(radius / fullRadius, minScale, 1). */
  fullScaleRadiusCssPx: number
  minScale: number
}>

export const REFERENCE_CLEAR_KNOTS = [
  30, 29, 27, 18, 11, 7, 4.5, 2.5, 1.2, 0.5, 0, 0, 0, 0, 0, 0,
] as const
/** Align the GPU material edge with the inner edge of the one-pixel DOM/native rim. */
export const REFERENCE_APERTURE_REGISTRATION_INSET_CSS_PX = 1
/** WebKit rasterizes the path one CSS pixel outside its numeric top edge at DPR 3. */
export const REFERENCE_APERTURE_CLIP_INSET_CSS_PX = 2

export const REFERENCE_LENS_PRESETS: Readonly<Record<ReferenceVariant, ReferenceLensPreset>> = {
  clear: {
    bandBlurCssPx: 4,
    // Native clear widens a hard edge to a 4.7 px 10-90% transition on the 60 pt chrome capsule.
    blurSigmaCssPx: 1.6,
    // A fractional filter resolution (1.5) rendered black on the Simulator; keep clear at full resolution.
    blurResolutionCap: Number.POSITIVE_INFINITY,
    fullScaleRadiusCssPx: 40,
    knotSpacingCssPx: 2,
    knotsCssPx: REFERENCE_CLEAR_KNOTS,
    minScale: 0.75,
  },
  regular: {
    bandBlurCssPx: 5,
    // Native regular widens the same edge to ~7.3 px.
    blurSigmaCssPx: 2.9,
    blurResolutionCap: 1,
    fullScaleRadiusCssPx: 40,
    knotSpacingCssPx: 2,
    knotsCssPx: REFERENCE_CLEAR_KNOTS,
    minScale: 0.75,
  },
}

export function referenceAmplitudeScale(cornerRadiusCssPx: number, preset: ReferenceLensPreset) {
  return Math.max(preset.minScale, Math.min(1, cornerRadiusCssPx / preset.fullScaleRadiusCssPx))
}
