import nativeFits from './tab-motion-native-fits.json'
import type { CapsuleShape, SurfaceShape } from '../renderSpecs.ts'
import type { Appearance } from './theme.ts'

export type LiquidMotionMode = 'merge' | 'none' | 'pill' | 'press'

type SplineKnot = Readonly<{
  seconds: number
  slopePerSecond: number
  value: number
}>

type TemporalSpline = Readonly<{
  durationSeconds: number
  knots: readonly SplineKnot[]
}>

export const LIQUID_SCRIPT = Object.freeze({
  initialHoldSeconds: 1.2,
  morphDurationSeconds: nativeFits.pill.forward.position.durationSeconds,
  reverseAtSeconds: 2.7,
  settledHoldSeconds: 0.58,
})

export const LIQUID_ENVELOPES = Object.freeze({
  merge: { frameHeight: 142, frameWidth: 332, frameX: 35, frameY: 385 },
  pill: { frameHeight: 86, frameWidth: 308, frameX: 20, frameY: 776 },
  press: { frameHeight: 182, frameWidth: 182, frameX: 110, frameY: 360 },
})

export const LIQUID_PILL_BAR = Object.freeze({
  height: 60,
  width: 370,
  x: 16,
  // Pixel-difference in the 7j/7l native reference puts the declared y=768 bar 14 pt lower.
  y: 782,
})

// The first installed-PWA raster pass measured the Pixi rim one pixel narrower
// and one pixel taller than the input SDF throughout the pill morph. Compensate
// at the shape boundary so the visible outline, rather than the mathematical
// primitive hidden beneath the material, follows the native fit.
const PILL_RIM_WIDTH_COMPENSATION_PX = 1
const PILL_RIM_HEIGHT_COMPENSATION_PX = -1

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function smoothstep(minimum: number, maximum: number, value: number) {
  const progress = clamp((value - minimum) / (maximum - minimum), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

export function springStep(seconds: number, stiffness: number, damping: number) {
  if (seconds <= 0) return 0
  const frequency = Math.sqrt(stiffness)
  const ratio = damping / (2 * frequency)
  if (ratio >= 0.999) return 1 - Math.exp(-frequency * seconds) * (1 + frequency * seconds)
  const damped = frequency * Math.sqrt(1 - ratio * ratio)
  return (
    1 -
    Math.exp(-ratio * frequency * seconds) *
      (Math.cos(damped * seconds) +
        (ratio / Math.sqrt(1 - ratio * ratio)) * Math.sin(damped * seconds))
  )
}

export function evaluateTemporalSpline(spline: TemporalSpline, seconds: number) {
  const knots = spline.knots
  if (seconds <= knots[0].seconds) return knots[0].value
  if (seconds >= knots.at(-1)!.seconds) return knots.at(-1)!.value
  const rightIndex = knots.findIndex(knot => knot.seconds >= seconds)
  const left = knots[rightIndex - 1]
  const right = knots[rightIndex]
  const duration = right.seconds - left.seconds
  const progress = (seconds - left.seconds) / duration
  const squared = progress * progress
  const cubed = squared * progress
  return (
    (2 * cubed - 3 * squared + 1) * left.value +
    (cubed - 2 * squared + progress) * duration * left.slopePerSecond +
    (-2 * cubed + 3 * squared) * right.value +
    (cubed - squared) * duration * right.slopePerSecond
  )
}

function evaluateBridge(centreDistance: number) {
  const knots = nativeFits.merge.bridge.knots
  if (centreDistance >= knots[0].centreDistancePt) return knots[0].bridgeWidthPt
  if (centreDistance <= knots.at(-1)!.centreDistancePt) return knots.at(-1)!.bridgeWidthPt
  const rightIndex = knots.findIndex(knot => centreDistance >= knot.centreDistancePt)
  const farther = knots[rightIndex - 1]
  const nearer = knots[rightIndex]
  const duration = nearer.centreDistancePt - farther.centreDistancePt
  const progress = (centreDistance - farther.centreDistancePt) / duration
  const squared = progress * progress
  const cubed = squared * progress
  return (
    (2 * cubed - 3 * squared + 1) * farther.bridgeWidthPt +
    (cubed - 2 * squared + progress) * duration * farther.slopeWidthPerDistance +
    (-2 * cubed + 3 * squared) * nearer.bridgeWidthPt +
    (cubed - squared) * duration * nearer.slopeWidthPerDistance
  )
}

function rimAlpha(appearance: Appearance) {
  return appearance === 'light' ? 0.55 : 0.3
}

function capsule(
  envelope: (typeof LIQUID_ENVELOPES)[Exclude<LiquidMotionMode, 'none'>],
  centerX: number,
  centerY: number,
  width: number,
  height: number,
): CapsuleShape {
  return {
    centerX: centerX - envelope.frameX,
    centerY: centerY - envelope.frameY,
    halfHeight: height / 2,
    halfWidth: width / 2,
    radius: height / 2,
  }
}

function pillShape(seconds: number, appearance: Appearance, reducedMotion: boolean): SurfaceShape {
  const envelope = LIQUID_ENVELOPES.pill
  const forwardAt = LIQUID_SCRIPT.initialHoldSeconds
  const reverseAt = LIQUID_SCRIPT.reverseAtSeconds
  let splines = nativeFits.pill.forward
  let reverse = false
  let local = 0
  if (seconds < forwardAt) {
    local = 0
  } else if (seconds < forwardAt + LIQUID_SCRIPT.morphDurationSeconds) {
    local = reducedMotion ? LIQUID_SCRIPT.morphDurationSeconds : seconds - forwardAt
  } else if (seconds < reverseAt) {
    local = LIQUID_SCRIPT.morphDurationSeconds
  } else {
    splines = nativeFits.pill.reverse
    reverse = true
    local = reducedMotion ? LIQUID_SCRIPT.morphDurationSeconds : seconds - reverseAt
  }
  // WebKit's path raster clips the early forward rim slightly right and narrow.
  // This bounded correction comes from the installed-PWA pixel-difference pass;
  // it is zero at both endpoints and does not alter the native timing spline.
  const forwardClipCorrection = reverse
    ? 0
    : smoothstep(0.145, 0.16, local) * (1 - smoothstep(0.2, 0.28, local))
  const reverseCenterCorrection = reverse
    ? 0.4 * smoothstep(0.08, 0.12, local) * (1 - smoothstep(0.2, 0.24, local))
    : 0
  const centerX =
    evaluateTemporalSpline(splines.position, local) -
    1.1 * forwardClipCorrection +
    reverseCenterCorrection
  const reverseWidthCorrection = reverse
    ? 2.7 * smoothstep(0.25, 0.32, local) * (1 - smoothstep(0.38, 0.42, local))
    : 0
  const width =
    evaluateTemporalSpline(splines.width, local) +
    PILL_RIM_WIDTH_COMPENSATION_PX +
    1.3 * forwardClipCorrection +
    reverseWidthCorrection
  const height = evaluateTemporalSpline(splines.height, local) + PILL_RIM_HEIGHT_COMPENSATION_PX
  return {
    blendRadius: 0,
    first: capsule(envelope, centerX, nativeFits.pill.centreY, width, height),
    rimAlpha: rimAlpha(appearance),
    whiteMix: 0,
  }
}

function pressFit(appearance: Appearance) {
  return nativeFits.press.appearances.find(fit => fit.appearance === appearance)!
}

function pressShape(seconds: number, appearance: Appearance, reducedMotion: boolean): SurfaceShape {
  const envelope = LIQUID_ENVELOPES.press
  const fit = pressFit(appearance)
  const downAt = LIQUID_SCRIPT.initialHoldSeconds
  const releaseAt = downAt + nativeFits.press.holdDurationSeconds
  let scale = 1
  let whiteMix = 0
  if (seconds >= downAt && seconds < releaseAt) {
    const downSeconds = reducedMotion ? 10 : seconds - downAt
    scale =
      1 +
      (fit.heldScaleRatio - 1) *
        springStep(downSeconds, fit.scaleDown.stiffness, fit.scaleDown.damping)
    whiteMix =
      fit.heldWhiteMix *
      springStep(downSeconds, fit.brightnessDown.stiffness, fit.brightnessDown.damping)
  } else if (seconds >= releaseAt) {
    const releaseSeconds = reducedMotion ? 10 : seconds - releaseAt
    const scaleProgress = springStep(
      releaseSeconds,
      fit.scaleRelease.stiffness,
      fit.scaleRelease.damping,
    )
    const brightnessProgress = springStep(
      releaseSeconds,
      fit.brightnessRelease.stiffness,
      fit.brightnessRelease.damping,
    )
    scale = fit.heldScaleRatio + (1 - fit.heldScaleRatio) * scaleProgress
    whiteMix = fit.heldWhiteMix * (1 - brightnessProgress)
  }
  return {
    blendRadius: 0,
    first: capsule(envelope, 201, nativeFits.press.centreY, 160 * scale, 160 * scale),
    rimAlpha: rimAlpha(appearance),
    whiteMix,
  }
}

function mergeDistance(seconds: number, reducedMotion: boolean) {
  const forwardAt = LIQUID_SCRIPT.initialHoldSeconds
  const reverseAt = LIQUID_SCRIPT.reverseAtSeconds
  if (seconds < forwardAt) return 200
  if (seconds < reverseAt) {
    const local = reducedMotion ? 10 : seconds - forwardAt
    const fit = nativeFits.merge.forward
    return 200 + (60 - 200) * springStep(local, fit.stiffness, fit.damping)
  }
  const local = reducedMotion ? 10 : seconds - reverseAt
  const fit = nativeFits.merge.reverse
  return 60 + (200 - 60) * springStep(local, fit.stiffness, fit.damping)
}

function mergeShape(seconds: number, appearance: Appearance, reducedMotion: boolean): SurfaceShape {
  const envelope = LIQUID_ENVELOPES.merge
  const distance = clamp(mergeDistance(seconds, reducedMotion), 60, 200)
  const fittedBridge = Math.max(0, evaluateBridge(distance))
  // Pixel difference measures the PWA bridge slightly wide at onset and one
  // to three pixels narrow after the first native knot. Both corrections stay
  // at the shape boundary so the shader and CSS path still share one SDF.
  const bridgeCorrection = clamp(
    (nativeFits.merge.bridge.knots[0].centreDistancePt - distance) /
      (nativeFits.merge.bridge.knots[0].centreDistancePt - 140),
    0,
    1,
  )
  const onsetDistance = nativeFits.merge.bridge.knots[0].centreDistancePt
  const onsetRasterCorrection =
    2 *
    clamp((onsetDistance - distance) / (onsetDistance - 144), 0, 1) *
    clamp((distance - 122) / (144 - 122), 0, 1)
  const bridge =
    fittedBridge === 0 ? 0 : Math.max(0, fittedBridge + bridgeCorrection - onsetRasterCorrection)
  // For the polynomial smooth-min used in the shader, the symmetric midpoint
  // boundary is r + k/4. Solve k from the measured bridge width. A measured
  // zero is a genuinely disconnected pair, not the non-zero k that would make
  // the two contours mathematically tangent at a zero-width midpoint.
  const blendRadius =
    bridge === 0 ? 0 : Math.max(0, 4 * (Math.hypot(bridge / 2, distance / 2) - 60))
  return {
    blendRadius,
    first: capsule(envelope, 201 - distance / 2, nativeFits.merge.centreY, 120, 120),
    rimAlpha: rimAlpha(appearance),
    second: capsule(envelope, 201 + distance / 2, nativeFits.merge.centreY, 120, 120),
    whiteMix: 0,
  }
}

export function liquidScriptDuration(mode: Exclude<LiquidMotionMode, 'none'>) {
  const animationEnd =
    mode === 'press'
      ? LIQUID_SCRIPT.initialHoldSeconds + nativeFits.press.holdDurationSeconds + 0.72
      : LIQUID_SCRIPT.reverseAtSeconds + LIQUID_SCRIPT.morphDurationSeconds
  return animationEnd + LIQUID_SCRIPT.settledHoldSeconds
}

export function liquidAnimationActive(mode: Exclude<LiquidMotionMode, 'none'>, seconds: number) {
  const firstStart = LIQUID_SCRIPT.initialHoldSeconds
  const firstEnd = firstStart + LIQUID_SCRIPT.morphDurationSeconds
  const secondStart =
    mode === 'press'
      ? firstStart + nativeFits.press.holdDurationSeconds
      : LIQUID_SCRIPT.reverseAtSeconds
  const secondEnd = secondStart + LIQUID_SCRIPT.morphDurationSeconds
  return (
    (seconds >= firstStart && seconds <= firstEnd) ||
    (seconds >= secondStart && seconds <= secondEnd)
  )
}

export function sampleLiquidShape(
  mode: Exclude<LiquidMotionMode, 'none'>,
  seconds: number,
  appearance: Appearance,
  reducedMotion: boolean,
): SurfaceShape {
  if (mode === 'pill') return pillShape(seconds, appearance, reducedMotion)
  if (mode === 'press') return pressShape(seconds, appearance, reducedMotion)
  return mergeShape(seconds, appearance, reducedMotion)
}
