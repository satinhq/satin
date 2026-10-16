import contextFit from './menuContextFit.json'
import dropFit from './menuDropFit.json'
import glyphDropFit from './menuGlyphDropFit.json'
import padFit from './menuMorphFit.json'
import phoneFit from './menuMorphPhoneFit.json'
import { menuSpring, menuSpringSettle } from './menuSpring.ts'
import { CONTEXT_DISMISSAL_MS, contextDismissal } from './menuContextPresentation.ts'
import type { GlassRegion } from '../regions.ts'

export type MenuMorphDirection = 'open' | 'close'
export type MenuMorphPose = {
  centerX: number
  centerY: number
  width: number
  height: number
  returnX: number
  returnY: number
  returnWidth: number
  returnHeight: number
}
const axes = ['centerX', 'centerY', 'width', 'height'] as const
const returns = {
  returnX: 'centerX',
  returnY: 'centerY',
  returnWidth: 'width',
  returnHeight: 'height',
} as const
/** iPad: the recorded contour table (menuMorphFit.json, a centered menu). iPhone: one fitted
 * spring per axis (menuMorphPhoneFit.json, a toolbar menu that drops below its trigger and rises
 * into place), so the motion is continuous in position and velocity. */
export type MenuIdiom = 'pad' | 'phone'
/** `label` is a plain text trigger's drop (a Menu or menu-style Picker in a List row): one
 * spring per axis measured on an iPad (menuDropFit.json), so it eases into the panel and settles
 * like native rather than stopping dead. `glyph` is a plain icon's (a Menu labelled with a bare
 * symbol), a recorded contour table. `context` is a row's
 * context menu (native Notes); `context-content` is one on content such as a chat bubble or a
 * tile, which opens on its own native iPad spring and closes like a row's. */
export type MenuMotionProfile = MenuIdiom | 'label' | 'glyph' | 'context' | 'context-content'

/** The renderer and its presentation watchdog must use the same measured motion. */
export function menuMotionProfile(
  emerge: Pick<NonNullable<GlassRegion['emerge']>, 'sourceKind' | 'content' | 'idiom'>,
): MenuMotionProfile {
  if (emerge.sourceKind === 'context' && emerge.content) return 'context-content'
  return emerge.sourceKind ?? emerge.idiom ?? 'pad'
}
/** A close ends when nothing visible moves, so the hand-off to the page's button is no step:
 * the re-formed button within 0.1 pt of a 200 pt travel (its displacement is `from` of the
 * travel; native's own settle runs to about +780 ms of the tap), the body's centre within
 * 0.3 pt, and the body collapsed to under 5% of the panel, which lies inside the button
 * (menuField.ts). */
const CLOSE_BUTTON_SETTLED = 0.0005
const CLOSE_BODY_HIDDEN = 0.05
const closeSettle = Math.max(
  ...[phoneFit.closeButton.x, phoneFit.closeButton.y].map(spring =>
    menuSpringSettle(spring, CLOSE_BUTTON_SETTLED / Math.abs(spring.from)),
  ),
  menuSpringSettle(phoneFit.closeHead),
  menuSpringSettle(phoneFit.close.centerX),
  menuSpringSettle(phoneFit.close.centerY),
  menuSpringSettle(phoneFit.close.width, CLOSE_BODY_HIDDEN),
  menuSpringSettle(phoneFit.close.height, CLOSE_BODY_HIDDEN),
)
const phoneSettle = {
  open: Math.max(...axes.map(axis => menuSpringSettle(phoneFit.open[axis]))),
  close: closeSettle,
}
const contextOpenSettle = Math.ceil(
  Math.max(
    ...Object.values(contextFit.open).flatMap(fit => axes.map(axis => menuSpringSettle(fit[axis]))),
  ),
)
const contentOpenSettle = Math.ceil(
  Math.max(...axes.map(axis => menuSpringSettle(contextFit.openContent[axis]))),
)
/** A label's open ends when the panel holds still; its close when the drop has poured back
 * into the label (under 5% of the panel, where its fade has already hidden it). */
const labelSettle = {
  open: Math.ceil(Math.max(...axes.map(axis => menuSpringSettle(dropFit.open[axis])))),
  close: Math.ceil(
    Math.max(...axes.map(axis => menuSpringSettle(dropFit.close[axis], CLOSE_BODY_HIDDEN))),
  ),
}
const springProfile = (idiom: MenuMotionProfile) =>
  idiom === 'phone' || idiom === 'label' || idiom === 'context' || idiom === 'context-content'
const isContext = (idiom: MenuMotionProfile) => idiom === 'context' || idiom === 'context-content'
/** A context menu's dismissal: its body collapses into its source on the clock its fade and the
 * page dim run on (menu-close/r3, contextDismissal), so it is gone when they are. It has no glass
 * button to re-form, so it does not take the toolbar close springs: those first carry the body
 * away from its trigger (the toolbar panel rises into its button) and settle long after the
 * fade, which read as the menu flying off and a ghost drifting back (owner, Music Home tile,
 * 2026-10-14). The size and travel curve is UNMEASURED on its own: native's body was seen to
 * shrink and fade with the dim, and only that shared fade was fitted. */
function sampleContextClose(ms: number, appearance: 'light' | 'dark') {
  const remaining = contextDismissal(appearance, ms)
  const step = 1
  const speed = (contextDismissal(appearance, ms + step) - remaining) / (step / 1000)
  const pose = { ...MENU_MORPH_ZERO },
    velocity = { ...MENU_MORPH_ZERO }
  for (const axis of axes) {
    pose[axis] = remaining
    velocity[axis] = speed
  }
  for (const key of Object.keys(returns) as (keyof typeof returns)[]) {
    pose[key] = 1 - remaining
    velocity[key] = -speed
  }
  return { pose, velocity }
}
export function menuMorphDuration(direction: MenuMorphDirection, idiom: MenuMotionProfile = 'pad') {
  if (direction === 'close' && isContext(idiom)) return Math.ceil(CONTEXT_DISMISSAL_MS)
  if (idiom === 'context' && direction === 'open') return contextOpenSettle
  if (idiom === 'context-content' && direction === 'open') return contentOpenSettle
  if (idiom === 'label') return labelSettle[direction]
  return springProfile(idiom)
    ? Math.ceil(phoneSettle[direction])
    : contourFit(idiom)[direction].at(-1)![0]
}
export const MENU_MORPH_DURATION = {
  open: menuMorphDuration('open'),
  close: menuMorphDuration('close'),
} as const
export function menuMorphEndpoint(direction: MenuMorphDirection): MenuMorphPose {
  const value = direction === 'open' ? 1 : 0
  return {
    centerX: value,
    centerY: value,
    width: value,
    height: value,
    returnX: 1 - value,
    returnY: 1 - value,
    returnWidth: 1 - value,
    returnHeight: 1 - value,
  }
}
export const MENU_MORPH_ZERO: MenuMorphPose = {
  centerX: 0,
  centerY: 0,
  width: 0,
  height: 0,
  returnX: 0,
  returnY: 0,
  returnWidth: 0,
  returnHeight: 0,
}

/** Shape-preserving Hermite interpolation of the recorded contour. Independent
 * axes retain the native contour response and its return/settle tail. */
function slopes(knots: number[][], column: number) {
  const h = knots.slice(1).map((k, i) => (k[0] - knots[i][0]) / 1000)
  const d = h.map((v, i) => (knots[i + 1][column] - knots[i][column]) / v)
  return knots.map((_, i) => {
    // The trigger is held before release and the final surface is stationary.
    if (i === 0 || i === knots.length - 1 || d[i - 1] * d[i] <= 0) return 0
    const a = 2 * h[i] + h[i - 1],
      b = h[i] + 2 * h[i - 1]
    return (a + b) / (a / d[i - 1] + b / d[i])
  })
}
const curvesOf = (fit: { open: number[][]; close: number[][] }) => ({
  open: axes.map((_, i) => slopes(fit.open, i + 1)),
  close: axes.map((_, i) => slopes(fit.close, i + 1)),
})
const padCurves = curvesOf(padFit)
const glyphDropCurves = curvesOf(glyphDropFit)
/** The recorded contour table a non-spring profile follows, and its Hermite slopes. */
function contourFit(idiom: MenuMotionProfile) {
  return idiom === 'glyph' ? glyphDropFit : padFit
}
function contourCurves(idiom: MenuMotionProfile) {
  return idiom === 'glyph' ? glyphDropCurves : padCurves
}
/** The springs a spring profile's axes follow in `direction`. */
function morphSprings(
  direction: MenuMorphDirection,
  idiom: MenuMotionProfile,
  appearance: 'light' | 'dark',
) {
  if (idiom === 'label') return dropFit[direction]
  if (direction === 'open' && idiom === 'context-content') return contextFit.openContent
  if (direction === 'open' && idiom === 'context') return contextFit.open[appearance]
  return phoneFit[direction]
}
/** A spring profile's pose: each axis is its own spring (open rises 0 -> 1, close falls 1 -> 0). */
function samplePhoneMorph(
  direction: MenuMorphDirection,
  ms: number,
  idiom: MenuMotionProfile,
  appearance: 'light' | 'dark' = 'dark',
) {
  const pose = { ...MENU_MORPH_ZERO },
    velocity = { ...MENU_MORPH_ZERO }
  const springs = morphSprings(direction, idiom, appearance)
  for (const axis of axes) {
    const spring = menuSpring(springs[axis], ms)
    pose[axis] = direction === 'open' ? 1 - spring.value : spring.value
    velocity[axis] = direction === 'open' ? -spring.velocity : spring.velocity
  }
  return { pose, velocity }
}
export function sampleMenuMorph(
  direction: MenuMorphDirection,
  ms: number,
  idiom: MenuMotionProfile = 'pad',
  appearance: 'light' | 'dark' = 'dark',
) {
  if (springProfile(idiom)) {
    if (ms >= menuMorphDuration(direction, idiom))
      return { pose: menuMorphEndpoint(direction), velocity: { ...MENU_MORPH_ZERO } }
    if (direction === 'close' && isContext(idiom))
      return sampleContextClose(Math.max(0, ms), appearance)
    const sample = samplePhoneMorph(direction, ms, idiom, appearance)
    for (const key of Object.keys(returns) as (keyof typeof returns)[]) {
      sample.pose[key] = direction === 'close' ? 1 - sample.pose[returns[key]] : 0
      sample.velocity[key] = direction === 'close' ? -sample.velocity[returns[key]] : 0
    }
    return sample
  }
  const knots = contourFit(idiom)[direction],
    curves = contourCurves(idiom),
    velocity = { ...MENU_MORPH_ZERO }
  if (ms <= 0)
    return {
      pose: {
        ...menuMorphEndpoint(direction === 'open' ? 'close' : 'open'),
        returnX: 0,
        returnY: 0,
        returnWidth: 0,
        returnHeight: 0,
      },
      velocity,
    }
  if (ms >= menuMorphDuration(direction, idiom))
    return { pose: menuMorphEndpoint(direction), velocity }
  const right = knots.findIndex(k => k[0] >= ms),
    a = knots[right - 1],
    b = knots[right],
    duration = (b[0] - a[0]) / 1000,
    t = (ms - a[0]) / (b[0] - a[0]),
    t2 = t * t,
    t3 = t2 * t
  const pose = { ...MENU_MORPH_ZERO }
  axes.forEach((axis, index) => {
    const m0 = curves[direction][index][right - 1],
      m1 = curves[direction][index][right],
      v0 = a[index + 1],
      v1 = b[index + 1]
    pose[axis] =
      (2 * t3 - 3 * t2 + 1) * v0 +
      (t3 - 2 * t2 + t) * duration * m0 +
      (-2 * t3 + 3 * t2) * v1 +
      (t3 - t2) * duration * m1
    velocity[axis] =
      ((6 * t2 - 6 * t) * v0 +
        (3 * t2 - 4 * t + 1) * duration * m0 +
        (-6 * t2 + 6 * t) * v1 +
        (3 * t2 - 2 * t) * duration * m1) /
      duration
  })
  for (const key of Object.keys(returns) as (keyof typeof returns)[]) {
    pose[key] = direction === 'close' ? 1 - pose[returns[key]] : 0
    velocity[key] = direction === 'close' ? -velocity[returns[key]] : 0
  }
  return { pose, velocity }
}

/** A retarget retains the presented position and its derivative. The inherited
 * velocity decays with a Hermite basis whose value and slope are zero at settle;
 * the measured curve still supplies the independent native axis responses. */
export function transitionMenuMorph(
  direction: MenuMorphDirection,
  ms: number,
  from: MenuMorphPose,
  initialVelocity: MenuMorphPose = MENU_MORPH_ZERO,
  idiom: MenuMotionProfile = 'pad',
  appearance: 'light' | 'dark' = 'dark',
) {
  const target = menuMorphEndpoint(direction),
    duration = menuMorphDuration(direction, idiom) / 1000
  if (ms >= duration * 1000) return { pose: target, velocity: { ...MENU_MORPH_ZERO } }
  const t = Math.max(0, ms) / 1000 / duration,
    sample = sampleMenuMorph(direction, ms, idiom, appearance),
    pose = { ...from },
    velocity = { ...MENU_MORPH_ZERO }
  for (const key of [...axes, ...Object.keys(returns)] as (keyof MenuMorphPose)[]) {
    const axis =
      key in returns ? returns[key as keyof typeof returns] : (key as (typeof axes)[number])
    const progress = direction === 'open' ? sample.pose[axis] : 1 - sample.pose[axis]
    const speed = (direction === 'open' ? 1 : -1) * sample.velocity[axis]
    const delta = target[key] - from[key]
    pose[key] =
      from[key] + delta * progress + initialVelocity[key] * duration * t * (1 - t) * (1 - t)
    velocity[key] = delta * speed + initialVelocity[key] * (1 - 4 * t + 3 * t * t)
  }
  return { pose, velocity }
}
