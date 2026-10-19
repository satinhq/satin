import { currentKeyboardHeight, onKeyboardMotion, type KeyboardMotion } from './adapter.ts'
import { KEYBOARD_DURATION_MS, keyboardKeyframes } from './motion.ts'
import { createKeyboardTransports } from './transports.ts'
import { keyboardTranslationStops, sampleKeyboardTranslation } from './translation.ts'
import {
  clearKeyboardCarrierPose,
  KEYBOARD_CARRIER_MOTION,
  setKeyboardCarrierPose,
} from '../safe-area/keyboardCarrierGeometry.ts'

/**
 * Carry a fixed bottom accessory on the keyboard's compositor clock. Its resting layout stays
 * fixed throughout both directions, so dismissing its input cannot remove the exit animation.
 * The same sampled transform is published to glass; a main-thread pause cannot strand its lens.
 */
export function installKeyboardAccessory(
  element: HTMLElement,
  active: () => boolean,
  offsetForHeight: (height: number) => number,
) {
  const transports = createKeyboardTransports()
  let height = 0
  let animation: Animation | undefined
  let sample = () => 0
  const announce = () => window.dispatchEvent(new Event(KEYBOARD_CARRIER_MOTION))
  const carry = ({ height: nextHeight, startTime }: KeyboardMotion) => {
    // Keep listening through dismissal. Only an idle accessory ignores another editor's show.
    if (!active() && height === 0) return
    if (nextHeight === height && animation) {
      animation.startTime = startTime
      announce()
      return
    }
    const from = sample()
    height = nextHeight
    const to = offsetForHeight(height)
    const frames = keyboardKeyframes(progress => from + (to - from) * progress)
    animation = transports.drive(element, frames, KEYBOARD_DURATION_MS, startTime)
    const current = animation
    const stops = keyboardTranslationStops(frames)
    const motion = () => {
      const epoch = performance.timeOrigin + Number(current.startTime)
      return {
        epoch,
        duration: KEYBOARD_DURATION_MS,
        end: epoch + KEYBOARD_DURATION_MS,
        offset: 0,
        stops,
      }
    }
    sample = () => sampleKeyboardTranslation(motion(), performance.timeOrigin + performance.now())
    setKeyboardCarrierPose(element, () => ({
      offsetY: sample(),
      moving: performance.timeOrigin + performance.now() < motion().end,
      motion: motion(),
    }))
    announce()
  }
  const unsubscribe = onKeyboardMotion(carry)
  if (active() && currentKeyboardHeight() > 0) {
    carry({ height: currentKeyboardHeight(), startTime: performance.now() - KEYBOARD_DURATION_MS })
  }
  return () => {
    unsubscribe()
    transports.releaseAll()
    clearKeyboardCarrierPose(element)
    announce()
  }
}
