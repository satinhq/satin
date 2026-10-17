import { animateElement, timelineStart } from '../motion/animate.ts'
import type { SurfaceRenderSpec } from '../glass/renderSpecs.ts'

/** iPad, iPadOS 27.0 (24A437), reference. Activation fit from original video
 * F742–751: omega 17.8734, critical damping, RMS 0.104 pt. Dismissal
 * presentation-layer fit: omega 17.9118, zeta .9982, RMS .038 pt.
 * Translation and effective opacity are one group track; scale remains 1. */
export const PAD_SEARCH_BAR_OMEGA = 17.9
export const PAD_SEARCH_BAR_TRAVEL = 64

export class PadSearchBarMotion {
  private run?: { at: number; from: number; target: number; velocity: number }
  private animation?: Animation
  get active() {
    return this.animation?.playState === 'running'
  }
  sample(at: number) {
    const run = this.run
    if (!run) return { value: 0, velocity: 0 }
    const t = Math.max(0, at - run.at) / 1000
    const displacement = run.from - run.target
    const slope = run.velocity + PAD_SEARCH_BAR_OMEGA * displacement
    const decay = Math.exp(-PAD_SEARCH_BAR_OMEGA * t)
    return {
      value: run.target + (displacement + slope * t) * decay,
      velocity: (slope - PAD_SEARCH_BAR_OMEGA * (displacement + slope * t)) * decay,
    }
  }
  retarget(target: number, at: number) {
    const current = this.sample(at)
    this.run = { at, from: current.value, target, velocity: current.velocity }
  }
  start(
    element: HTMLElement,
    target: number,
    finalSpec: SurfaceRenderSpec | undefined,
    at = performance.now(),
  ) {
    this.retarget(target, at)
    this.animation?.cancel()
    this.animation = undefined
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let duration = 0
    if (!reduced) {
      do {
        duration += 1000 / 60
      } while (
        duration < 2000 &&
        (Math.abs(this.sample(at + duration).value - target) > 0.0015 ||
          Math.abs(this.sample(at + duration).velocity) > 0.02)
      )
    }
    const count = Math.max(1, Math.round(duration / (1000 / 60)))
    const values = Array.from({ length: count + 1 }, (_, index) =>
      reduced || index === count ? target : this.sample(at + (duration * index) / count).value,
    )
    const specs = finalSpec
      ? values.map(value => ({
          ...finalSpec,
          frameY: finalSpec.frameY - PAD_SEARCH_BAR_TRAVEL * (value - target),
          opacity: Math.max(0, Math.min(1, 1 - value)),
        }))
      : []
    const frames = values.map(value => ({
      transform: `translateY(${-PAD_SEARCH_BAR_TRAVEL * (value - target)}px)`,
      opacity: Math.max(0, Math.min(1, 1 - value)),
    }))
    if (duration) {
      this.animation = animateElement(element, frames, { duration, easing: 'linear' })
      this.animation.startTime = timelineStart(at)
    } else this.run = { at, from: target, target, velocity: 0 }
    return {
      at,
      duration,
      specs,
      finished: this.animation?.finished.catch(() => {}) ?? Promise.resolve(),
    }
  }
  dispose() {
    this.animation?.cancel()
  }
}
