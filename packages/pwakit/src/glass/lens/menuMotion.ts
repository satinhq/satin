import { evaluateTemporalSpline } from './liquidMotion.ts'
import closeFit from './menu-closing-close-fit.json'
import nativeFits from './menu-opening-native-fits.json'
import type { SurfaceShape, ReturningMenuTrigger } from '../renderSpecs.ts'
import type { Appearance } from './theme.ts'

export type MenuDirection = 'close' | 'open'

export const MENU_ENVELOPE = Object.freeze({
  // Screen-space target x=143...393, y=126...316 plus 20 pt for the
  // measured opening overshoot and shadow. Runtime subtracts the physical
  // top inset from frameY, as it does for the 7l reference envelopes.
  frameHeight: 230,
  frameWidth: 290,
  frameX: 123,
  frameY: 106,
})

export const MENU_BUTTON = Object.freeze({
  centerX: nativeFits.button.centerX,
  centerY: nativeFits.button.centerY,
  diameter: nativeFits.button.diameter,
})

export const MENU_PANEL = Object.freeze({
  centerX: 268,
  // measured-reference exact framebuffer contour fit (provenance/menu-contour-fit.json).
  centerY: 221,
  cornerRadius: 43.15835260047611,
  height: 188,
  width: 250,
})

export const MENU_MOTION_DURATIONS = Object.freeze({
  close: closeFit.geometry.width.durationSeconds,
  open: nativeFits.open.geometry.width.durationSeconds,
})

export const MENU_CADENCE = Object.freeze({
  // Fresh 7o2 footage shows a return after the threshold track disappears.
  // Continue to the actual button instead of holding a 60 x 74 silhouette.
  closeSettleSeconds: 0,
  closedHoldSeconds: 0.24,
  // Native reference closes by the mandated outside HID tap 1.5 s after open.
  openHoldSeconds: 1.5,
})

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value))
}

function smoothstep(progress: number) {
  const clamped = clamp(progress, 0, 1)
  return clamped * clamped * (3 - 2 * clamped)
}

/* How far a menu's material has gone from the button's glass (0) to the menu's frosted
 * material (1), `seconds` after the morph's geometry onset. Native, light, toolbar Menu: a
 * neutral-grey plate's intensity under the glass (menu-opening-native-fits.json `material`). It
 * reaches the menu material 174 ms into an open and leaves it within 162 ms of a close, well
 * before the outline settles. Linear between the measured samples. */
export function menuMaterialProgress(direction: MenuDirection, seconds: number) {
  const samples = nativeFits.material[direction]
  if (seconds <= samples[0][0]) return samples[0][1]
  const right = samples.findIndex(([at]) => at >= seconds)
  if (right < 0) return samples.at(-1)![1]
  const [startSeconds, startValue] = samples[right - 1]
  const [endSeconds, endValue] = samples[right]
  return (
    startValue + ((endValue - startValue) * (seconds - startSeconds)) / (endSeconds - startSeconds)
  )
}

function fittedOpenProgress(direction: MenuDirection, seconds: number) {
  const spline = nativeFits[direction].geometry.width
  const measuredStart = spline.knots[0].value
  const measuredEnd = spline.knots.at(-1)!.value
  const progress =
    (evaluateTemporalSpline(spline, seconds) - measuredStart) / (measuredEnd - measuredStart)
  return direction === 'open' ? progress : 1 - progress
}

function localX(screenX: number) {
  return screenX - MENU_ENVELOPE.frameX
}

function localY(screenY: number) {
  return screenY - MENU_ENVELOPE.frameY
}

function rimAlpha(appearance: Appearance) {
  // Converted from the native row-127 lift after measuring the 1x filter
  // target's subpixel coverage: 26 -> 49 RGB levels in light and 26 -> 33 in
  // dark. Values above one are safe here because the final framebuffer clips
  // the subpixel highlight while its row average remains below white.
  return appearance === 'light' ? 1.39 : 0.2
}

export type MenuMotionFrame = Readonly<{
  materialMix: number
  menuTintMix: number
  itemBlur: number
  itemOffsetX: number
  itemOffsetY?: number
  itemOpacity: number
  openProgress: number
  shape: SurfaceShape
  triggerOpacity: number
  toolbarProjected?: boolean
  returningTrigger?: ReturningMenuTrigger
}>

export function sampleMenuMotion(
  direction: MenuDirection,
  seconds: number,
  appearance: Appearance,
  reducedMotion: boolean,
): MenuMotionFrame {
  if (direction === 'close' && !reducedMotion) return sampleMenuClose(seconds, appearance)
  const duration = MENU_MOTION_DURATIONS[direction]
  const localSeconds = reducedMotion ? duration : clamp(seconds, 0, duration)
  const openEndpoint = direction === 'open'
  const exactEndpoint = reducedMotion || localSeconds >= duration
  const tail =
    direction === 'close'
      ? smoothstep((localSeconds - nativeFits.close.geometry.width.durationSeconds) / (2 / 60))
      : 0
  const openProgress = reducedMotion
    ? openEndpoint
      ? 1
      : 0
    : clamp(fittedOpenProgress(direction, localSeconds), -0.08, 1.08)
  const fittedWidth = evaluateTemporalSpline(nativeFits[direction].geometry.width, localSeconds)
  const centerX = exactEndpoint
    ? openEndpoint
      ? MENU_PANEL.centerX
      : MENU_BUTTON.centerX
    : evaluateTemporalSpline(nativeFits[direction].geometry.centerX, localSeconds)
  const centerY = exactEndpoint
    ? openEndpoint
      ? MENU_PANEL.centerY
      : MENU_BUTTON.centerY
    : evaluateTemporalSpline(nativeFits[direction].geometry.centerY, localSeconds)
  const width = exactEndpoint
    ? openEndpoint
      ? MENU_PANEL.width
      : MENU_BUTTON.diameter
    : fittedWidth
  const height = exactEndpoint
    ? openEndpoint
      ? MENU_PANEL.height
      : MENU_BUTTON.diameter
    : evaluateTemporalSpline(nativeFits[direction].geometry.height, localSeconds)
  const clampedOpen = clamp(openProgress, 0, 1)
  const itemFit = nativeFits.open.items[0]
  const itemTime = localSeconds
  const itemProgress = reducedMotion
    ? clampedOpen
    : direction === 'open'
      ? clamp((itemTime - itemFit.onsetSeconds) / itemFit.durationSeconds, 0, 1)
      : 1 - clamp(localSeconds / 0.14, 0, 1)
  const easedItems = itemProgress * itemProgress * (3 - 2 * itemProgress)
  const halfWidth = Math.max(MENU_BUTTON.diameter / 2, width / 2)
  const halfHeight = Math.max(MENU_BUTTON.diameter / 2, height / 2)
  const fittedRadius = evaluateTemporalSpline(
    nativeFits[direction].geometry.cornerRadius,
    localSeconds,
  )
  const endpointRadius = direction === 'open' ? MENU_PANEL.cornerRadius : MENU_BUTTON.diameter / 2
  const radius = Math.min(
    halfWidth,
    halfHeight,
    exactEndpoint
      ? endpointRadius
      : direction === 'close'
        ? fittedRadius
        : fittedRadius +
          (MENU_PANEL.cornerRadius - fittedRadius) *
            smoothstep((localSeconds - 0.28) / (duration - 0.28)),
  )
  const panel = {
    centerX: localX(centerX + (MENU_BUTTON.centerX - centerX) * tail),
    centerY: localY(centerY + (MENU_BUTTON.centerY - centerY) * tail),
    halfHeight: halfHeight + (MENU_BUTTON.diameter / 2 - halfHeight) * tail,
    halfWidth: halfWidth + (MENU_BUTTON.diameter / 2 - halfWidth) * tail,
    radius: radius + (MENU_BUTTON.diameter / 2 - radius) * tail,
  }
  // Neutral-plate samples measure tint progression independently of width.
  // Width-weighting the material erased the frost twice during dismissal.
  const plateMix = menuMaterialProgress(direction, localSeconds)
  const materialMix = reducedMotion ? 1 : Math.max(tail, plateMix)
  const menuTintMix = exactEndpoint ? (openEndpoint ? 1 : 0) : 1 - tail
  return {
    materialMix,
    menuTintMix,
    itemBlur: reducedMotion
      ? 0
      : direction === 'open'
        ? 4 * (1 - smoothstep((localSeconds - 0.1) / 0.07))
        : 4 * smoothstep(localSeconds / 0.08),
    itemOffsetX: itemFit.offsetXPt * (1 - easedItems),
    itemOpacity: easedItems,
    openProgress,
    shape: {
      // Fresh uncapped contours show one expanding lens. A permanently
      // unioned trigger added a visible shoulder absent from the reference.
      blendRadius: 0,
      first: panel,
      second: panel,
      rimAlpha: rimAlpha(appearance),
      rimBandCssPx: 1.5,
      whiteMix: 0,
    },
    triggerOpacity: 1 - clamp(openProgress / 0.72, 0, 1),
  }
}

// Close has a spatial handoff: the glyph and regular material return inside
// the clear remnant. They do not wait for the remnant to become a circle.
function sampleMenuClose(seconds: number, appearance: Appearance): MenuMotionFrame {
  const t = clamp(seconds, 0, MENU_MOTION_DURATIONS.close)
  if (t >= MENU_MOTION_DURATIONS.close) return sampleMenuMotion('close', 0, appearance, true)
  const fit = closeFit.geometry
  const panel = {
    centerX: localX(evaluateTemporalSpline(fit.centerX, t)),
    centerY: localY(evaluateTemporalSpline(fit.centerY, t)),
    halfWidth: evaluateTemporalSpline(fit.width, t) / 2,
    halfHeight: evaluateTemporalSpline(fit.height, t) / 2,
    radius: evaluateTemporalSpline(fit.cornerRadius, t),
  }
  // Glyph centres from the fresh flat close: y142 at 200 ms, y147 at
  // 283 ms, returning to y156. No new spring constants are introduced.
  const recovery = smoothstep((t - 0.1) / 0.1)
  const settle = smoothstep((t - 0.2) / 0.2)
  const emerge = smoothstep((t - 0.05) / 0.13)
  const trigger = {
    centerX: panel.centerX + (localX(354 + 6 * recovery + 4 * settle) - panel.centerX) * emerge,
    centerY: panel.centerY + (localY(156 - 14 * recovery + 14 * settle) - panel.centerY) * emerge,
    radius: 16 + 10 * recovery + 3 * settle,
    mix: recovery,
  }
  const joined = smoothstep((t - 0.18333333333333332) / (0.25 - 0.18333333333333332))
  // Once the residual has joined, both shapes follow the same return. This
  // also makes the final frame identical to the unchanged resting preset.
  const join = (a: number, b: number) => a + (b - a) * joined
  const returningPanel = {
    centerX: join(panel.centerX, trigger.centerX),
    centerY: join(panel.centerY, trigger.centerY),
    halfWidth: join(panel.halfWidth, trigger.radius),
    halfHeight: join(panel.halfHeight, trigger.radius),
    radius: join(panel.radius, trigger.radius),
  }
  const plate = 1 - smoothstep(t / 0.21)
  const regular = smoothstep((t - 0.2) / 0.2)
  return {
    materialMix: plate + (1 - plate) * regular,
    menuTintMix: 1 - regular,
    itemBlur: 4 * smoothstep(t / 0.1),
    itemOffsetX: 6 * smoothstep(t / 0.15),
    itemOpacity: 1 - smoothstep(t / 0.15),
    openProgress:
      (returningPanel.halfWidth * 2 - MENU_BUTTON.diameter) /
      (MENU_PANEL.width - MENU_BUTTON.diameter),
    triggerOpacity: smoothstep((t - 0.13) / 0.075),
    returningTrigger: trigger,
    shape: {
      blendRadius: 28 * recovery * (1 - joined),
      first: returningPanel,
      second: {
        centerX: trigger.centerX,
        centerY: trigger.centerY,
        halfWidth: trigger.radius,
        halfHeight: trigger.radius,
        radius: trigger.radius,
      },
      rimAlpha: rimAlpha(appearance),
      rimBandCssPx: 1.5,
      whiteMix: 0,
    },
  }
}

export function menuCadenceDuration() {
  return (
    MENU_MOTION_DURATIONS.open +
    MENU_CADENCE.openHoldSeconds +
    MENU_MOTION_DURATIONS.close +
    MENU_CADENCE.closeSettleSeconds +
    MENU_CADENCE.closedHoldSeconds
  )
}

export function sampleMenuCadence(seconds: number, appearance: Appearance, reducedMotion: boolean) {
  if (seconds < MENU_MOTION_DURATIONS.open) {
    return {
      direction: 'open' as const,
      frame: sampleMenuMotion('open', seconds, appearance, reducedMotion),
    }
  }
  const closeAt = MENU_MOTION_DURATIONS.open + MENU_CADENCE.openHoldSeconds
  if (seconds < closeAt) {
    return {
      direction: 'open' as const,
      frame: sampleMenuMotion('open', MENU_MOTION_DURATIONS.open, appearance, reducedMotion),
    }
  }
  const closeFitAt = closeAt + MENU_MOTION_DURATIONS.close
  if (seconds < closeFitAt + MENU_CADENCE.closeSettleSeconds) {
    return {
      direction: 'close' as const,
      frame: sampleMenuMotion('close', seconds - closeAt, appearance, reducedMotion),
    }
  }
  return { direction: 'close' as const, frame: sampleMenuMotion('close', 0, appearance, true) }
}

/** Restart an interrupted transition near the current geometry, not at its
 * opposite endpoint. This is an interruption policy, not a native timing fit. */
export function menuRetargetTime(
  frame: MenuMotionFrame,
  direction: MenuDirection,
  appearance: Appearance,
) {
  const from = frame.shape.first
  let best = 0,
    error = Infinity
  for (let i = 0; i <= 120; i++) {
    const seconds = (MENU_MOTION_DURATIONS[direction] * i) / 120
    const sample = sampleMenuMotion(direction, seconds, appearance, false).shape.first
    const distance =
      (sample.centerX - from.centerX) ** 2 +
      (sample.centerY - from.centerY) ** 2 +
      (sample.halfWidth - from.halfWidth) ** 2 +
      (sample.halfHeight - from.halfHeight) ** 2
    if (distance < error) {
      error = distance
      best = seconds
    }
  }
  return Math.min(best, MENU_MOTION_DURATIONS[direction] - 1 / 60)
}

export function blendMenuFrames(
  from: MenuMotionFrame,
  to: MenuMotionFrame,
  progress: number,
): MenuMotionFrame {
  if (progress <= 0) return from
  if (progress >= 1) return to
  const t = smoothstep(progress)
  const mix = (a: number, b: number) => a + (b - a) * t
  const capsule = (a: SurfaceShape['first'], b: SurfaceShape['first']) => ({
    centerX: mix(a.centerX, b.centerX),
    centerY: mix(a.centerY, b.centerY),
    halfWidth: mix(a.halfWidth, b.halfWidth),
    halfHeight: mix(a.halfHeight, b.halfHeight),
    radius: mix(a.radius, b.radius),
  })
  return {
    materialMix: mix(from.materialMix, to.materialMix),
    menuTintMix: mix(from.menuTintMix, to.menuTintMix),
    itemBlur: mix(from.itemBlur, to.itemBlur),
    itemOffsetX: mix(from.itemOffsetX, to.itemOffsetX),
    itemOpacity: mix(from.itemOpacity, to.itemOpacity),
    openProgress: mix(from.openProgress, to.openProgress),
    triggerOpacity: mix(from.triggerOpacity, to.triggerOpacity),
    returningTrigger:
      from.returningTrigger || to.returningTrigger
        ? {
            centerX: mix(
              from.returningTrigger?.centerX ?? localX(MENU_BUTTON.centerX),
              to.returningTrigger?.centerX ?? localX(MENU_BUTTON.centerX),
            ),
            centerY: mix(
              from.returningTrigger?.centerY ?? localY(MENU_BUTTON.centerY),
              to.returningTrigger?.centerY ?? localY(MENU_BUTTON.centerY),
            ),
            radius: mix(
              from.returningTrigger?.radius ?? MENU_BUTTON.diameter / 2,
              to.returningTrigger?.radius ?? MENU_BUTTON.diameter / 2,
            ),
            mix: mix(from.returningTrigger?.mix ?? 0, to.returningTrigger?.mix ?? 0),
          }
        : undefined,
    shape: {
      ...to.shape,
      blendRadius: mix(from.shape.blendRadius, to.shape.blendRadius),
      first: capsule(from.shape.first, to.shape.first),
      second: capsule(from.shape.second ?? from.shape.first, to.shape.second ?? to.shape.first),
    },
  }
}
