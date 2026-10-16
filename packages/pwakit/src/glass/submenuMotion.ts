import { animateElement, timelineStart } from '../motion/animate.ts'
import { menuSpring } from './lens/menuSpring.ts'
import { setGlassShapeTrack } from './shapeTrackRegistry.ts'
import {
  shapeTrackClock,
  shapeTrackEnvelope,
  shapeTrackFrame,
  type GlassShapeTrack,
} from './shapeTrack.ts'
import {
  springMotion,
  springTrack,
  sampledKeyframes,
  type SpringParameters,
} from '../motion/springTrack.ts'

/**
 * Nested menus, measured from stock SwiftUI on iOS 27.0 (submenus/SPEC.md).
 *
 * iPhone stacks each submenu over its parent: the parent shrinks to 0.97 about its top edge and
 * its rows dim to half ink, and the child grows out of the row that opened it into a full-width
 * platter whose title row sits 12 pt above where that row now is. iPad opens a cascade beside the
 * parent instead: the child overlaps the parent's edge by 12 pt and its first row lines up with
 * the row that opened it, while the parent stays as it was.
 *
 * Springs are fitted per track from a 60 Hz presentation-layer trace of the native Simulator
 * (submenus-impl/fit-open-child.json and fit-back.json; RMS residuals under 0.2 pt / 0.004 ink).
 * Forward and back are fitted separately: the child opens slightly underdamped (zeta 0.85) and
 * collapses critically damped (zeta 1.0). The iPad cascade's motion is unmeasured; it uses the
 * same child springs until an iPad trace exists.
 *
 * Only the glass changes size. The same trace shows the child's rows keeping their full size
 * throughout: on the way back the glass shrinks around the title row while the rows drift 3.6 pt,
 * so the title lands exactly on the row that opened it, and the title's chevron turns from down to
 * forward on its own spring (measured Oct 13: the content and chevron fits).
 */
export const SUBMENU_GEOMETRY = {
  /** Each ancestor level below the top submenu shrinks by this much more (0.97, 0.94, ...). */
  parentScaleStep: 0.03,
  /** Ink of an ancestor's rows while a submenu covers it. */
  parentInk: 0.5,
  /** The child's top sits this far above the (scaled) top of the row that opened it. */
  phoneTitleLift: 12,
  /** The iPad child overlaps the parent's edge by this much. */
  padEdgeOverlap: 12,
  /** The iPad child's first row starts this far above the row that opened it. */
  padRowLift: 1,
}

const OPEN = {
  /** Width, height and x of the child's glass: one spring. */
  frame: { stiffness: 249.05, damping: 26.89 },
  /** The glass's top settles faster than its size (overdamped). */
  top: { stiffness: 1027.7, damping: 107.3 },
  /** The child's rows keep their size and move only from the opening row to their place. */
  content: { stiffness: 608.68, damping: 108.1 },
  /** The title's chevron turns from pointing forward to pointing down. */
  chevron: { stiffness: 1200, damping: 73.44 },
  parentScale: { stiffness: 257.9, damping: 27.7 },
  /** The parent's rows start dimming 50 ms after the child starts to grow. */
  parentInk: { stiffness: 92.36, damping: 16.26, delay: 50 },
} satisfies Record<string, SpringParameters>

const BACK = {
  frame: { stiffness: 246.2, damping: 31.35 },
  top: { stiffness: 194.1, damping: 26.41 },
  parentScale: { stiffness: 216.3, damping: 27.78 },
  parentInk: { stiffness: 241.1, damping: 30.74 },
  /** The child's rows fade out as it collapses into its row. */
  fade: { stiffness: 157.5, damping: 25.07 },
  /** The rows keep their size and move only until the title sits on the row that opened it. */
  content: { stiffness: 148, damping: 21.41 },
  /** The title's chevron turns back from pointing down to pointing forward. */
  chevron: { stiffness: 150, damping: 24 },
} satisfies Record<string, SpringParameters>

export const SUBMENU_SPRINGS = { open: OPEN, back: BACK }

export type Frame = Readonly<{ x: number; y: number; width: number; height: number }>

/** Progress (0 to 1) of a measured spring `ms` after it starts. */
export function springProgress(parameters: SpringParameters, ms: number) {
  return 1 - menuSpring(springMotion(parameters), ms).value
}

/** Compositor keyframes for one measured spring, from `from` to `to`. */
export function springKeyframes(
  parameters: SpringParameters,
  frame: (progress: number) => Keyframe,
) {
  const track = springTrack(springMotion(parameters))
  return { keyframes: sampledKeyframes(track, frame), duration: track.duration }
}

/** Scale of a level that has `covering` submenu levels open above it. */
export function ancestorScale(covering: number) {
  return 1 - SUBMENU_GEOMETRY.parentScaleStep * covering
}

/**
 * Where a phone submenu settles, in the root platter's coordinates. `parent` is the parent
 * platter's resting frame and `row` the opening row's resting frame; the parent then shrinks to
 * `parentScale` about its top edge.
 */
export function phoneSubmenuFrame(
  parent: Frame,
  row: Frame,
  parentScale: number,
  child: { width: number; height: number },
  bounds: Frame,
): Frame {
  const scaledRowTop = parent.y + (row.y - parent.y) * parentScale
  const y = scaledRowTop - SUBMENU_GEOMETRY.phoneTitleLift
  return {
    x: parent.x + (parent.width - child.width) / 2,
    y: clamp(y, bounds.y, bounds.y + bounds.height - child.height),
    width: child.width,
    height: child.height,
  }
}

/**
 * Where an iPad submenu settles: beside the parent, overlapping its trailing edge, with its first
 * row level with the opening row. It flips to the leading side when the trailing side has no room.
 */
export function padSubmenuFrame(
  parent: Frame,
  row: Frame,
  child: { width: number; height: number; firstRowOffset: number },
  bounds: Frame,
): Frame {
  const overlap = SUBMENU_GEOMETRY.padEdgeOverlap
  const trailing = parent.x + parent.width - overlap
  const leading = parent.x + overlap - child.width
  const fitsTrailing = trailing + child.width <= bounds.x + bounds.width
  const y = row.y - SUBMENU_GEOMETRY.padRowLift - child.firstRowOffset
  // A window too narrow for either side keeps the child on screen over more of its parent.
  const x = fitsTrailing || leading < bounds.x ? trailing : leading
  return {
    x: clamp(x, bounds.x, bounds.x + bounds.width - child.width),
    y: clamp(y, bounds.y, bounds.y + bounds.height - child.height),
    width: child.width,
    height: child.height,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, Math.max(min, max)))
}

/** Where the child's content sits, in the same coordinates as its frame. */
export type Point = Readonly<{ x: number; y: number }>

/** Glass frames are sampled at 120 Hz; the renderer and the page interpolate between them. */
const SAMPLE_MS = 1000 / 120

/**
 * The child's glass frame from `from` to `to`, sampled from the measured springs until it settles:
 * x, width and height share one spring and the top has its own.
 */
export function submenuGlassFrames(from: Frame, to: Frame, direction: 'open' | 'back') {
  const springs = SUBMENU_SPRINGS[direction]
  const frames: Frame[] = []
  for (let ms = 0; ; ms += SAMPLE_MS) {
    const size = springProgress(springs.frame, ms)
    const top = springProgress(springs.top, ms)
    const settled =
      Math.abs(1 - size) * Math.max(Math.abs(to.height - from.height), 1) < 0.05 &&
      Math.abs(1 - top) * Math.max(Math.abs(to.y - from.y), 1) < 0.05
    if (settled || ms > 3000) {
      frames.push(to)
      break
    }
    frames.push({
      x: from.x + (to.x - from.x) * size,
      y: from.y + (to.y - from.y) * top,
      width: from.width + (to.width - from.width) * size,
      height: from.height + (to.height - from.height) * size,
    })
  }
  return { frames, duration: (frames.length - 1) * SAMPLE_MS }
}

/**
 * Where a phone child's content must sit for its title row to cover the row that opened it:
 * `titleOffset` is the title row's position inside the content. The child grows out of that place
 * and collapses back into it, so the title never jumps when the platter appears or leaves.
 */
export function titleOnRow(row: Frame, titleOffset: Point): Point {
  return { x: row.x - titleOffset.x, y: row.y - titleOffset.y }
}

/** The content's position `ms` into a transition from `from` to `to`. */
export function submenuContentAt(
  from: Point,
  to: Point,
  direction: 'open' | 'back',
  ms: number,
): Point {
  const progress = springProgress(SUBMENU_SPRINGS[direction].content, ms)
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress }
}

/** Compositor keyframes that turn the title's chevron: forward is a quarter turn back from down. */
export function chevronKeyframes(direction: 'open' | 'back', fromDegrees?: number) {
  const forward = -90
  const start = fromDegrees ?? (direction === 'open' ? forward : 0)
  const end = direction === 'open' ? 0 : forward
  return springKeyframes(SUBMENU_SPRINGS[direction].chevron, progress => ({
    transform: `rotate(${start + (end - start) * progress}deg)`,
  }))
}

/** The parts of a platter a transition moves. */
export type SubmenuParts = Readonly<{
  /** The positioned frame element; its layout box holds still for the whole transition. */
  platter: HTMLElement
  /** The glass element inside it, which carries the shape track. */
  glass: HTMLElement
  /** Clips the content to the glass's current frame. */
  clip: HTMLElement
  /** The rows, at their full size. */
  content: HTMLElement
  /** The glass's corner radius. */
  cornerRadius: number
}>

const visibleFrames = new WeakMap<HTMLElement, Frame>()
const contentPlaces = new WeakMap<HTMLElement, Point>()
const activeRuns = new WeakMap<
  HTMLElement,
  {
    frame: () => Frame
    content: () => Point
  }
>()

/** Where a platter's glass is now (not its layout box, which may be larger while it moves). */
export function submenuVisibleFrame(platter: HTMLElement) {
  return activeRuns.get(platter)?.frame() ?? visibleFrames.get(platter)
}

/**
 * Move a child platter's glass from `from` to `to` on the measured springs, and its content from
 * `contentFrom` to `contentTo` on its own spring.
 *
 * The platter's layout box holds the envelope of every frame of the run, so its glass canvas never
 * resizes or moves: the backdrop stays where it is on screen and only the glass's edge moves
 * (shapeTrack.ts). The glass is drawn from a shape track, and the content is clipped to the same
 * frames, read from the same track. Returns a function that stops the motion where it is.
 */
export function animateSubmenuFrame(
  parts: SubmenuParts,
  from: Frame,
  to: Frame,
  contentFrom: Point,
  contentTo: Point,
  direction: 'open' | 'back',
  done?: () => void,
) {
  const run = startRun(parts, from, to, direction, shapeTrackClock())
  const { envelope, track } = run
  // Sample content until the same positional tolerance used by the old frame loop.
  let duration = track.duration
  while (
    Math.hypot(
      contentTo.x - submenuContentAt(contentFrom, contentTo, direction, duration).x,
      contentTo.y - submenuContentAt(contentFrom, contentTo, direction, duration).y,
    ) >= 0.05 &&
    duration < 10000
  )
    duration += SAMPLE_MS
  const count = Math.max(1, Math.ceil(duration / SAMPLE_MS))
  duration = count * SAMPLE_MS
  const placeAt = (age: number) =>
    age >= duration
      ? contentTo
      : submenuContentAt(contentFrom, contentTo, direction, Math.max(0, age))
  const contentFrames: Keyframe[] = []
  const clipFrames: Keyframe[] = []
  for (let index = 0; index <= count; index++) {
    const age = index * SAMPLE_MS
    contentFrames.push({ offset: index / count, transform: run.transform(placeAt(age)) })
    clipFrames.push({ offset: index / count, clipPath: run.clipPath(track.epoch + age) })
  }
  run.write(track.epoch, contentFrom)
  const options = { duration, easing: 'linear', fill: 'both' } as const
  const animations = [
    animateElement(parts.content, contentFrames, options),
    // The rounded clip must follow the glass without scaling the rows or their corners.
    // WAAPI owns this track; compositor acceleration of clip-path needs WebKit evidence.
    animateElement(parts.clip, clipFrames, options),
  ]
  const start = timelineStart(track.epoch - performance.timeOrigin)
  for (const animation of animations) animation.startTime = start
  const live = {
    frame: () => run.frameAt(shapeTrackClock()),
    content: () => placeAt(shapeTrackClock() - track.epoch),
  }
  activeRuns.set(parts.platter, live)
  let stopped = false
  const stop = (finished: boolean) => {
    if (stopped) return
    stopped = true
    const at = finished ? track.epoch + duration : shapeTrackClock()
    run.write(at, finished ? contentTo : placeAt(at - track.epoch))
    // Freeze the renderer at the same point before a reversal or whole-menu dismissal.
    const frame = shapeTrackFrame(track, at)
    setGlassShapeTrack(parts.glass, { epoch: Number.MAX_VALUE, duration: 0, frames: [frame] })
    if (activeRuns.get(parts.platter) === live) activeRuns.delete(parts.platter)
    for (const animation of animations) animation.cancel()
    if (finished) {
      if (sameFrame(envelope, to)) {
        setGlassShapeTrack(parts.glass, undefined)
        parts.clip.style.clipPath = ''
      }
      done?.()
    }
  }
  void Promise.all(animations.map(animation => animation.finished)).then(
    () => stop(true),
    () => {},
  )
  return () => stop(false)
}

/**
 * Lay a platter out for a run that has not started: its box is already the run's envelope and its
 * glass holds the first frame, so the glass the platter first appears with is drawn in the canvas
 * the whole run keeps.
 */
export function holdSubmenuFrame(
  parts: SubmenuParts,
  from: Frame,
  to: Frame,
  contentFrom: Point,
  direction: 'open' | 'back',
) {
  const run = startRun(parts, from, to, direction, Number.MAX_VALUE)
  run.write(run.track.epoch, contentFrom)
}

/** Fix the run's envelope as the platter's layout box and give its glass the run's shape track. */
function startRun(
  parts: SubmenuParts,
  from: Frame,
  to: Frame,
  direction: 'open' | 'back',
  epoch: number,
) {
  const { platter, glass, clip, content, cornerRadius } = parts
  const { frames, duration } = submenuGlassFrames(from, to, direction)
  const laidOut = layoutBox(platter)
  const envelope = shapeTrackEnvelope(laidOut ? [laidOut, ...frames] : frames)
  writeBox(platter, envelope)
  const local = (frame: Frame) => ({ ...frame, x: frame.x - envelope.x, y: frame.y - envelope.y })
  const track: GlassShapeTrack = { epoch, duration, frames: frames.map(local) }
  setGlassShapeTrack(glass, track)
  const frameAt = (at: number) => {
    const frame = shapeTrackFrame(track, at)
    return { ...frame, x: frame.x + envelope.x, y: frame.y + envelope.y }
  }
  const transform = (place: Point) =>
    `translate(${place.x - envelope.x}px, ${place.y - envelope.y}px)`
  const clipPath = (at: number) => {
    const frame = shapeTrackFrame(track, at)
    const radius = Math.min(cornerRadius, frame.width / 2, frame.height / 2)
    const right = envelope.width - frame.x - frame.width
    const bottom = envelope.height - frame.y - frame.height
    return `inset(${frame.y}px ${right}px ${bottom}px ${frame.x}px round ${radius}px)`
  }
  // Writes happen only at admission, interruption and settlement, never per display frame.
  const write = (at: number, place: Point) => {
    clip.style.clipPath = clipPath(at)
    content.style.transform = transform(place)
    visibleFrames.set(platter, frameAt(at))
    contentPlaces.set(platter, place)
  }
  return { envelope, track, write, frameAt, transform, clipPath }
}

/** Where a platter's content sits now, if a transition has placed it. */
export function submenuContentPlace(platter: HTMLElement) {
  return activeRuns.get(platter)?.content() ?? contentPlaces.get(platter)
}

function layoutBox(element: HTMLElement): Frame | undefined {
  const style = element.style
  if (!style.width || !style.height) return undefined
  return {
    x: parseFloat(style.left),
    y: parseFloat(style.top),
    width: parseFloat(style.width),
    height: parseFloat(style.height),
  }
}

function writeBox(element: HTMLElement, box: Frame) {
  element.style.left = `${box.x}px`
  element.style.top = `${box.y}px`
  element.style.width = `${box.width}px`
  element.style.height = `${box.height}px`
}

function sameFrame(a: Frame, b: Frame) {
  return (
    Math.abs(a.x - b.x) < 0.25 &&
    Math.abs(a.y - b.y) < 0.25 &&
    Math.abs(a.width - b.width) < 0.25 &&
    Math.abs(a.height - b.height) < 0.25
  )
}
