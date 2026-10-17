import { animateElement } from '../motion/animate.ts'
/** A document-timeline animation, submitted once per input or state transition.
 * Sampling density controls interpolation error, not the display refresh rate.
 * Keep accelerated properties in separate effects from paint-bound properties.
 */
export class SampledMotion {
  private animations = new Map<string, Animation>()
  private records: {
    id: number
    name: string
    at: number
    startTime: number
    duration: number
    iterations: number
    properties: string[]
    keyframes: number
    eligible: boolean
  }[] = []
  private sequence = 0
  private constants = new Map<string, string>()

  play(
    name: string,
    element: HTMLElement,
    frames: Keyframe[],
    duration: number,
    startedAt: number,
    iterations = 1,
  ) {
    if (!frames.length) return
    if (frames.some(frame => Object.keys(frame).some(key => key.startsWith('--')))) {
      throw new Error('Sampled menu motion requires concrete CSS properties, not custom properties')
    }
    const properties = Object.keys(frames[0]).filter(
      key => !['offset', 'easing', 'composite'].includes(key),
    )
    const values = frames.map(({ offset: _offset, ...values }) => JSON.stringify(values))
    const constant = values.every(value => value === values[0])
    if (constant && this.constants.get(name) === values[0]) return
    if (constant) {
      this.constants.set(name, values[0])
      frames = [frames[0], frames[frames.length - 1]]
    } else {
      this.constants.delete(name)
      // Retain both ends of every constant interval. Its interior samples add
      // no information, but large effects make WebKit's style resolution slow.
      frames = frames.filter(
        (_, i) =>
          i === 0 ||
          i === frames.length - 1 ||
          values[i] !== values[i - 1] ||
          values[i] !== values[i + 1],
      )
    }
    const animation = animateElement(element, frames, {
      duration,
      iterations,
      fill: 'both',
      easing: 'linear',
    })
    // performance.now and the document timeline share an origin in this target.
    // Setting startTime, rather than currentTime every rAF, lets WebKit own time.
    animation.startTime = startedAt
    animation.id = `satin-menu-${name}`
    this.animations.get(name)?.cancel()
    this.animations.set(name, animation)
    this.records.push({
      id: this.sequence++,
      name,
      at: performance.now(),
      startTime: startedAt,
      duration,
      iterations,
      properties,
      keyframes: frames.length,
      eligible: properties.every(p => p === 'transform' || p === 'opacity'),
    })
    if (this.records.length > 512) this.records.shift()
  }

  get submissions() {
    return this.sequence
  }

  report() {
    return {
      clock: 'document.timeline',
      limitation:
        'Transform/opacity eligibility and submitted timelines, not proof of compositor execution or physical scanout. rAF cannot measure 120 Hz compositor presentation.',
      submissions: this.records,
      animations: [...this.animations.entries()].map(([name, a]) => ({
        name,
        id: a.id,
        startTime: a.startTime,
        currentTime: a.currentTime,
        playState: a.playState,
        pending: a.pending,
        timing: a.effect?.getComputedTiming(),
      })),
    }
  }

  dispose() {
    for (const a of this.animations.values()) a.cancel()
    this.animations.clear()
    this.constants.clear()
  }
}
