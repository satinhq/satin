/*
 * Geometry/displacement only from measured-reference; rejected frosted body/rim colour fits omitted.
 * measured-reference robust fit over the frozen fitting backdrops. Coefficients retain
 * their measured output units: point displacement, luma gradient per point,
 * and RGB chroma. The held-out split did not participate in these values.
 */
export const TAB_MOTION_FIT = Object.freeze({
  featureScale: Object.freeze({
    heightPt: 20,
    widthPt: 47,
    speedPtPerSecond: 900,
    releasePtPerSecond: 600,
  }),
  backgroundRadialWarpPt: Object.freeze({
    press: 0.3390986554912535,
    stretch: 0.5500298147419825,
    speed: 0,
    release: 0.0005952247959177478,
  }),
  signedTravelWarpPt: 0.16556452653435294,
  rimGradientLumaPerPt: Object.freeze({
    press: 4.251829133485595,
    stretch: 2.384288032010487,
    speed: 0,
    release: 0,
  }),
  foregroundChromaRgb: Object.freeze({
    press: 10.08659659306276,
    stretch: 21.151758899396164,
    speed: 2.6674233681054784,
    release: 31.309158428891998,
  }),
  // Native selected-ink crop dimensions against the same tab at rest on the
  // frozen fitting backdrops (measured-reference/fit-foreground-shape.py).
  foregroundScaleX: Object.freeze({
    press: 0.16235604980773563,
    stretch: 0.1910066486599282,
    speed: 0.05429437871333094,
    release: 0.0633111609467502,
  }),
  foregroundScaleY: Object.freeze({
    press: -0.006202568392504617,
    stretch: 0.5076160458415709,
    speed: -0.002458943334700509,
    release: -0.17354118608967614,
  }),
  foregroundLabelScaleX: Object.freeze({
    press: 0.1360674304840465,
    stretch: 0.17095056699034716,
    speed: 0.027482042487999455,
    release: 0.23474281573120326,
  }),
  foregroundLabelScaleY: Object.freeze({
    press: 0.10905416081578569,
    stretch: 0.12801180051044745,
    speed: 0.038963502104220366,
    release: 0.04227731967392007,
  }),
  foregroundShiftPt: Object.freeze({ icon: -0.9043300435671711, label: -0.7992057582526684 }),
  nativeDisplacement: Object.freeze({ heightPt: 11.2, curvature: 1, angle: 0, maskOffset: 0 }),
})

export type TabMotionOptics = Readonly<{
  lightingLight?: import('./lensPress.ts').LensLighting
  lightingDark?: import('./lensPress.ts').LensLighting
  lensLight?: readonly [number, number, number, number]
  lensDark?: readonly [number, number, number, number]
  backgroundWarpPt: number
  foregroundChroma: number
  foregroundScaleX: number
  foregroundScaleY: number
  foregroundLabelScaleX: number
  foregroundLabelScaleY: number
  motionMix: number
  rimGradient: number
  travelWarpPt: number
}>
