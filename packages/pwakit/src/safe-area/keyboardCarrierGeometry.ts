import {
  keyboardTranslationStops,
  sampleKeyboardTranslation,
  type KeyboardTranslation,
} from '../keyboard/translation.ts'
/** Geometry of transforms owned by the keyboard carrier, on the same clock as its WAAPI runs. */
export const KEYBOARD_CARRIER_MOTION = 'satin-keyboard-carrier-motion'
type Pose = Readonly<{
  offsetY: number
  moving: boolean
  motion?: KeyboardTranslation
  /** Converts the last-row carrier pose to the captured first-row origin, excluding scroll. */
  backdropAdjustment?: number
}>
const poses = new WeakMap<HTMLElement, () => Pose>()
const contents = new WeakMap<HTMLElement, { content: HTMLElement; atRest: () => number }>()

export function setKeyboardCarrierContent(
  surface: HTMLElement,
  content: HTMLElement,
  atRest: () => number,
) {
  contents.set(surface, { content, atRest })
}
export function clearKeyboardCarrierContent(surface: HTMLElement) {
  contents.delete(surface)
}

export function setKeyboardCarrierPose(element: HTMLElement, read: () => Pose) {
  poses.set(element, read)
}
export function clearKeyboardCarrierPose(element: HTMLElement) {
  poses.delete(element)
}
export function keyboardCarrierPose(element: HTMLElement) {
  for (let owner: HTMLElement | null = element; owner; owner = owner.parentElement) {
    const read = poses.get(owner)
    if (read) return { owner, ...read() }
  }
  return undefined
}
/** Interpolate the actual rounded compositor keyframes, rather than fit a second curve. */
export function keyboardFrameTranslation(
  frames: readonly Keyframe[],
  elapsed: number,
  duration: number,
) {
  return sampleKeyboardTranslation(
    {
      epoch: 0,
      duration,
      end: duration,
      offset: 0,
      stops: keyboardTranslationStops(frames),
    },
    elapsed,
  )
}

/** A capture's content origin follows the same carrier, excluding native scroll.
 * Native scroll is transported separately, including real overscroll. */
export function keyboardBackdropPose(host: HTMLElement) {
  const entry = contents.get(host)
  const pose = entry && poses.get(entry.content)?.()
  if (!pose) return undefined
  const adjustment = pose.backdropAdjustment ?? 0
  return {
    offsetY: pose.moving ? pose.offsetY + adjustment : entry!.atRest(),
    moving: pose.moving,
    motion: pose.motion && { ...pose.motion, offset: pose.motion.offset + adjustment },
  }
}
