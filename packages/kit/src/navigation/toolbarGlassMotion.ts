import { animateElement, timelineStart } from '../motion/animate.ts'
import {
  shapeTrackEnvelope,
  shapeTrackFrame,
  shapeTrackRadius,
  type ShapeFrame,
} from '../glass/shapeTrack.ts'
import { setGlassShapeTrack } from '../glass/shapeTrackRegistry.ts'
import { toolbarMotionAnimation } from './toolbarMotionOwner.ts'
import { glassRadius, type GlassShape } from '../glass/regions.ts'
import { sampleNavigationCurve } from './motionTokens.ts'

type Knot = Readonly<{ offset: number; value: number }>

/** Chrome uses linear, explicitly offset keyframes. Keep their original knots, including
 * interrupted opacity origins, rather than restarting a measured curve when glass mounts. */
export function toolbarTrackValue(knots: readonly Knot[], progress: number) {
  const next = knots.findIndex(knot => knot.offset >= progress)
  if (next === 0) return knots[0]!.value
  if (next < 0) return knots.at(-1)!.value
  const from = knots[next - 1]!
  const to = knots[next]!
  const mix = (progress - from.offset) / (to.offset - from.offset)
  return from.value + (to.value - from.value) * mix
}

export function toolbarShapeFrames(
  from: ShapeFrame,
  to: ShapeFrame,
  opacity: readonly Knot[],
  duration: number,
  morph: boolean,
  padding: number,
  scale?: readonly Knot[],
) {
  // Native chrome knots use integer milliseconds. Sampling each millisecond retains those
  // corners exactly; the worker still presents at its existing, at-most-60-Hz cadence.
  const count = Math.ceil(duration)
  return Array.from({ length: count + 1 }, (_, index) => {
    const progress = index / count
    const mix = toolbarTrackValue(opacity, progress)
    if (morph)
      return {
        x: from.x + (to.x - from.x) * mix,
        y: from.y + (to.y - from.y) * mix,
        width: from.width + (to.width - from.width) * mix,
        height: from.height + (to.height - from.height) * mix,
      }
    const size = scale ? toolbarTrackValue(scale, progress) : 1
    const width = (to.width - 2 * padding) * size + 2 * padding
    const height = (to.height - 2 * padding) * size + 2 * padding
    return {
      x: to.x + (to.width - width) / 2,
      y: to.y + (to.height - height) / 2,
      width,
      height,
    }
  })
}

function chromeAnimation(
  element: HTMLElement | undefined,
  property: 'opacity' | 'scale' | 'transform',
) {
  return toolbarMotionAnimation(element, property)
}

/** Principal travel is the page's pixel translation, with its original easing. */
function translation(animation: Animation, progress: number) {
  const easing = animation.effect!.getTiming().easing
  const position = easing && easing !== 'linear' ? sampleNavigationCurve(progress) : progress
  const frames = (animation.effect as KeyframeEffect).getKeyframes()
  const values = frames.map(frame => {
    const matrix = new DOMMatrixReadOnly(String(frame.transform))
    return { offset: frame.computedOffset, x: matrix.m41, y: matrix.m42 }
  })
  return {
    x: toolbarTrackValue(
      values.map(frame => ({ offset: frame.offset, value: frame.x })),
      position,
    ),
    y: toolbarTrackValue(
      values.map(frame => ({ offset: frame.offset, value: frame.y })),
      position,
    ),
  }
}

function knots(animation: Animation, property: 'opacity' | 'scale'): Knot[] {
  return (animation.effect as KeyframeEffect).getKeyframes().map(frame => ({
    offset: frame.computedOffset,
    value: frame[property] === 'none' ? 1 : Number(frame[property]),
  }))
}

/** One toolbar capsule's delivery of the existing chrome animation. Its canvas keeps a fixed
 * envelope so resizing glass never stretches the backdrop. The worker samples the aperture;
 * WAAPI carries opacity and blur on the chrome animation's document timeline. */
export class ToolbarGlassMotion {
  private source?: Animation
  private fade?: Animation
  private signature = ''
  private travelFrame?: ShapeFrame
  private owner: HTMLElement

  constructor(owner: HTMLElement) {
    this.owner = owner
  }

  update(input: {
    slot: HTMLElement | undefined
    content: HTMLElement
    from: ShapeFrame
    to: ShapeFrame
    morph: boolean
    padding: number
    hidden: boolean
    shape?: GlassShape
    fromRadius?: number
    toRadius?: number
  }) {
    const opacitySource = chromeAnimation(input.slot, 'opacity')
    const travel = !opacitySource && chromeAnimation(input.slot, 'transform')
    const source = opacitySource || travel
    if (!source || source.playState === 'idle') {
      this.clear()
      return false
    }
    const timing = source.effect!.getTiming()
    const duration = Number(timing.duration)
    if (!(duration > 0) || source.playbackRate !== 1) {
      this.clear()
      return false
    }
    const scale = chromeAnimation(input.content, 'scale')
    // Rect reads of compositor-scaled ancestors can differ at floating-point precision.
    // They must not restart a run whose endpoints are otherwise unchanged.
    const stable = (frame: ShapeFrame): ShapeFrame => ({
      x: Math.round(frame.x * 10000) / 10000,
      y: Math.round(frame.y * 10000) / 10000,
      width: Math.round(frame.width * 10000) / 10000,
      height: Math.round(frame.height * 10000) / 10000,
    })
    const displacement = travel
      ? translation(travel, Math.max(0, Math.min(1, Number(travel.currentTime ?? 0) / duration)))
      : { x: 0, y: 0 }
    const to =
      travel &&
      source === this.source &&
      this.travelFrame &&
      this.travelFrame.width === input.to.width &&
      this.travelFrame.height === input.to.height
        ? this.travelFrame
        : stable({ ...input.to, x: input.to.x - displacement.x, y: input.to.y - displacement.y })
    const from = stable(input.morph && !travel ? input.from : to)
    const signature = JSON.stringify([
      from,
      to,
      input.morph,
      input.padding,
      input.hidden,
      source.startTime,
      source.playState === 'paused',
      input.morph ? undefined : input.shape,
      input.morph ? input.fromRadius : undefined,
      input.morph ? input.toRadius : undefined,
    ])
    if (source === this.source && signature === this.signature) return true
    this.clear()
    this.source = source
    this.travelFrame = travel ? to : undefined
    this.signature = signature
    const opacity = opacitySource
      ? knots(opacitySource, 'opacity')
      : [
          { offset: 0, value: 1 },
          { offset: 1, value: 1 },
        ]
    const frames = travel
      ? Array.from({ length: Math.ceil(duration) + 1 }, (_, index) => {
          const offset = translation(travel, index / Math.ceil(duration))
          return { ...to, x: to.x + offset.x, y: to.y + offset.y }
        })
      : toolbarShapeFrames(
          from,
          to,
          opacity,
          duration,
          input.morph,
          input.padding,
          scale ? knots(scale, 'scale') : undefined,
        )
    const envelope = shapeTrackEnvelope(frames)
    const radii = frames.map((frame, index) =>
      input.morph && !travel
        ? (input.fromRadius ?? glassRadius(input.shape ?? 'capsule', from.width, from.height)) +
          ((input.toRadius ?? glassRadius(input.shape ?? 'capsule', to.width, to.height)) -
            (input.fromRadius ?? glassRadius(input.shape ?? 'capsule', from.width, from.height))) *
            toolbarTrackValue(opacity, index / (frames.length - 1))
        : glassRadius(input.shape ?? 'capsule', frame.width, frame.height),
    )
    Object.assign(this.owner.style, {
      left: `${envelope.x}px`,
      top: `${envelope.y}px`,
      width: `${envelope.width}px`,
      height: `${envelope.height}px`,
      opacity: input.hidden ? '0' : '1',
      filter: '',
    })
    const held = source.startTime === null || source.playState === 'paused'
    const at = Number(source.currentTime ?? 0)
    // A paused preparation has not begun. Keep its sampled aperture until the original
    // chrome starts; no independent performance.now() epoch can race that admission.
    const samples = { epoch: 0, duration, frames, radii }
    const sampled = held ? [shapeTrackFrame(samples, at)] : frames
    setGlassShapeTrack(this.owner, {
      epoch: held
        ? Number.MAX_VALUE
        : performance.timeOrigin + Number(source.startTime) - timelineStart(0),
      duration,
      frames: sampled.map(frame => ({
        ...frame,
        x: frame.x - envelope.x,
        y: frame.y - envelope.y,
      })),
      radii: held ? [shapeTrackRadius(samples, at, 0)] : radii,
    })
    if (opacitySource && !input.morph && !input.hidden) {
      this.fade = animateElement(
        this.owner,
        (source.effect as KeyframeEffect).getKeyframes().map(frame => ({
          offset: frame.computedOffset,
          opacity: frame.opacity,
          filter: frame.filter,
        })),
        { duration, easing: 'linear', fill: 'both' },
      )
      if (held) {
        this.fade.pause()
        this.fade.currentTime = at
      } else this.fade.startTime = source.startTime
    }
    return true
  }

  clear() {
    if (!this.source) return
    this.fade?.cancel()
    this.fade = undefined
    this.source = undefined
    this.travelFrame = undefined
    this.signature = ''
    setGlassShapeTrack(this.owner, undefined)
  }
}
