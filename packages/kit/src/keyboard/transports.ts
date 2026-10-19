/** Two identical keyframes: the transform an element has at rest. */
const AT_REST: Keyframe[] = [{ transform: 'translateY(0px)' }, { transform: 'translateY(0px)' }]

/**
 * The compositor animations that carry elements with the keyboard, one per element, kept while
 * the keyboard is up.
 *
 * Starting a new transform animation on a long transcript is expensive in WebKit, and it falls
 * in the very rendering update that has to put the composer in motion: the composer stands
 * still while the keyboard moves. Retargeting an animation that already exists is cheap
 * (1,200 messages in iOS-family WebKit: 57 ms to start one, 11 ms to retarget one). So the
 * keyboard's first motion creates each element's animation, later motions retarget it, and
 * between motions it is parked, paused at rest. Once the keyboard has gone they are released,
 * so a page without a keyboard carries no transform.
 */
export function createKeyboardTransports() {
  const animations = new Map<HTMLElement, Animation>()
  const effect = (animation: Animation) => animation.effect as KeyframeEffect
  return {
    /** Run `frames` on the keyboard's clock, starting at `startTime`. */
    drive(element: HTMLElement, frames: Keyframe[], duration: number, startTime: number) {
      let animation = animations.get(element)
      if (animation) effect(animation).setKeyframes(frames)
      else {
        animation = element.animate(frames, { duration, fill: 'both' })
        animations.set(element, animation)
      }
      animation.play()
      animation.startTime = startTime
      return animation
    },
    /** Hold the element at rest, keeping its animation for the next motion. */
    park(element: HTMLElement) {
      const animation = animations.get(element)
      if (!animation) return
      effect(animation).setKeyframes(AT_REST)
      animation.pause()
    },
    release(element: HTMLElement) {
      animations.get(element)?.cancel()
      animations.delete(element)
    },
    releaseAll() {
      for (const animation of animations.values()) animation.cancel()
      animations.clear()
    },
  }
}
