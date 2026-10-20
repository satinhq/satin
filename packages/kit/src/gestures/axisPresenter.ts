// EXPERIMENTAL, PRIVATE. A motion axis and its declarative visual tracks.
//
// A participant owns an axis position in points, 0...extent. The presenter connects that axis to
// element tracks without per-frame JavaScript:
//
// - while a contact drives a native scroller, each track is a ScrollTimeline animation whose
//   keyframes are the fixed scroll-offset-to-axis mapping (WebKit samples it on the compositor);
// - after release, each track is a document-timeline animation sampled from the settle spring;
// - at rest, one static style write per track.
//
// The presenter never reads layout per frame, never writes styles per frame and never renders
// React. `catch` reads the presented pose of an interrupted settle from its own analytic curve.

import { animateElement } from '../motion/animate.ts'
import { springMotion, springTrack, type SpringParameters } from '../motion/springTrack.ts'
import { menuSpring } from '../glass/lens/menuSpring.ts'

export type AxisTrack = Readonly<{
  element: HTMLElement
  property: 'opacity' | 'transform'
  /** The track's value at axis position `position` (points). Must be affine in position so
   * that linear interpolation between keyframes is exact. */
  value: (position: number) => number | string
}>

/**
 * A fixed mapping from a native scroller's offset to the axis:
 * `position = clamp(base + sign * (origin - scrollLeft) + adjustment, 0, extent)`.
 * `sign` is +1 when finger travel toward the trailing physical edge (rightward) increases the
 * axis; -1 mirrors it (right-to-left layouts).
 */
export type ScrollAxisMapping = Readonly<{
  origin: number
  base: number
  sign: 1 | -1
  adjustment: number
  extent: number
}>

export function axisPositionAtScroll(mapping: ScrollAxisMapping, scrollLeft: number) {
  const raw = mapping.base + mapping.sign * (mapping.origin - scrollLeft) + mapping.adjustment
  return Math.min(mapping.extent, Math.max(0, raw))
}

/** Keyframe offsets (fractions of the scroll range) where the mapping bends, with the axis
 * position at each. Between them the mapping is linear, so the tracks are exact. */
export function scrollAxisKeyframes(mapping: ScrollAxisMapping, range: number) {
  if (!(range > 0)) return [{ offset: 0, position: axisPositionAtScroll(mapping, 0) }]
  const offsetAtPosition = (position: number) =>
    (mapping.base + mapping.sign * mapping.origin + mapping.adjustment - position) /
    (mapping.sign * range)
  const offsets = [0, 1, offsetAtPosition(0), offsetAtPosition(mapping.extent)].filter(
    offset => offset >= 0 && offset <= 1,
  )
  return [...new Set(offsets)]
    .sort((first, second) => first - second)
    .map(offset => ({ offset, position: axisPositionAtScroll(mapping, offset * range) }))
}

export type SettleOptions = Readonly<{
  from: number
  to: number
  /** Presented axis velocity at the start, points per second. */
  velocity: number
  spring: SpringParameters
  onFinish: () => void
}>

type ActiveSettle = {
  animations: Animation[]
  from: number
  to: number
  spring: ReturnType<typeof springMotion>
  startedAt: number
}

export type AxisPresenter = Readonly<{
  /** Static pose: one style write per track. Cancels any scroll or settle tracks. */
  rest(position: number): void
  /** Binds the tracks to a native scroller for a contact. */
  attachScroll(source: HTMLElement, mapping: ScrollAxisMapping): void
  /** The axis position the attached scroller's offset maps to now (main-thread view). */
  scrollPosition(): number | undefined
  /** Starts the settle on the document timeline and retires the scroll tracks in this task. */
  settle(options: SettleOptions): void
  /** Interrupts a running settle at its presented pose and velocity (points, points/s). */
  catch(): Readonly<{ position: number; velocity: number }> | undefined
  /** The last pose this presenter established (rest, scroll or settle target). */
  readonly position: number
  /** Which driver currently owns the tracks. */
  readonly driver: 'rest' | 'scroll' | 'settle'
}>

function scrollTimeline(source: HTMLElement): AnimationTimeline | undefined {
  const Timeline = (
    globalThis as unknown as {
      ScrollTimeline?: new (options: { source: Element; axis: string }) => AnimationTimeline
    }
  ).ScrollTimeline
  return Timeline ? new Timeline({ source, axis: 'x' }) : undefined
}

export function createAxisPresenter(tracks: () => readonly AxisTrack[]): AxisPresenter {
  let position = 0
  let driver: 'rest' | 'scroll' | 'settle' = 'rest'
  let scrollAnimations: Animation[] = []
  let scroll: { source: HTMLElement; mapping: ScrollAxisMapping } | undefined
  let active: ActiveSettle | undefined

  const cancelAll = (animations: Animation[]) => {
    for (const animation of animations) {
      animation.onfinish = null
      animation.cancel()
    }
  }

  const writeStatic = (at: number) => {
    for (const track of tracks()) {
      track.element.style.setProperty(track.property, String(track.value(at)))
    }
  }

  const presenter: AxisPresenter = {
    rest(next) {
      position = next
      // Write the static pose before cancelling, so no frame shows the unanimated style.
      writeStatic(next)
      cancelAll(scrollAnimations)
      scrollAnimations = []
      scroll = undefined
      if (active) cancelAll(active.animations)
      active = undefined
      driver = 'rest'
    },
    attachScroll(source, mapping) {
      const timeline = scrollTimeline(source)
      if (!timeline) throw new Error('Satin axis presenter: ScrollTimeline is unavailable.')
      if (active) cancelAll(active.animations)
      active = undefined
      cancelAll(scrollAnimations)
      const range = source.scrollWidth - source.clientWidth
      const keyframes = scrollAxisKeyframes(mapping, range)
      scrollAnimations = tracks().map(track =>
        animateElement(
          track.element,
          keyframes.map(frame => ({
            offset: frame.offset,
            [track.property]: track.value(frame.position),
          })),
          { timeline, fill: 'both', easing: 'linear' },
        ),
      )
      scroll = { source, mapping }
      position = axisPositionAtScroll(mapping, source.scrollLeft)
      driver = 'scroll'
    },
    scrollPosition() {
      if (!scroll) return undefined
      return axisPositionAtScroll(scroll.mapping, scroll.source.scrollLeft)
    },
    settle({ from, to, velocity, spring, onFinish }) {
      const retiring = scrollAnimations
      scrollAnimations = []
      scroll = undefined
      if (active) cancelAll(active.animations)
      if (from === to) {
        presenter.rest(to)
        onFinish()
        return
      }
      const motion = springMotion(spring, velocity / (from - to))
      const track = springTrack(motion)
      const startedAt = performance.now()
      const animations = tracks().map(entry =>
        animateElement(
          entry.element,
          track.progress.map((progress, index) => ({
            offset: index / (track.progress.length - 1),
            [entry.property]: entry.value(from + (to - from) * progress),
          })),
          { duration: track.duration, fill: 'forwards', easing: 'linear' },
        ),
      )
      // Retire the scroll tracks only after the time tracks exist: one task, no gap frame.
      cancelAll(retiring)
      const settle: ActiveSettle = { animations, from, to, spring: motion, startedAt }
      active = settle
      position = to
      driver = 'settle'
      const first = animations[0]
      if (!first) {
        presenter.rest(to)
        onFinish()
        return
      }
      first.onfinish = () => {
        if (active !== settle) return
        onFinish()
      }
    },
    catch() {
      const settle = active
      if (!settle) return undefined
      const elapsed = Number(
        settle.animations[0]?.currentTime ?? performance.now() - settle.startedAt,
      )
      const state = menuSpring(settle.spring, elapsed)
      const caught = settle.to + (settle.from - settle.to) * state.value
      const velocity = (settle.from - settle.to) * state.velocity
      presenter.rest(caught)
      return { position: caught, velocity }
    },
    get position() {
      return position
    },
    get driver() {
      return driver
    },
  }
  return Object.freeze(presenter)
}
