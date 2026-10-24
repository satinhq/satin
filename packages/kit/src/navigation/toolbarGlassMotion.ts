import { partitionMaterialFrame, type MaterialPartition } from '../glass/partitionMorph.ts'
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
import { retainToolbarSymbols } from './toolbarSharedSymbols.ts'
import { linearSampleIndices } from '../motion/linearSamples.ts'

type Knot = Readonly<{ offset: number; value: number }>
export const toolbarCarriedContent = new WeakSet<HTMLElement>()

export type ToolbarInk = { element: HTMLElement; frame: ShapeFrame; incoming: boolean }

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
  private ink: { element: HTMLElement; animation: Animation }[] = []
  private releaseSymbols?: () => void
  private signature = ''
  private travelFrame?: ShapeFrame
  private morphEndpoints?: {
    from: ShapeFrame
    to: ShapeFrame
    fromRadius: number
    toRadius: number
  }
  private morphInk?: ToolbarInk[]
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
    partition?: MaterialPartition
    preserveSymbols?: boolean
    padding: number
    hidden: boolean
    shape?: GlassShape
    fromRadius?: number
    toRadius?: number
    ink?: ToolbarInk[]
    canvasWidth?: number
  }) {
    const opacitySource = chromeAnimation(input.slot, 'opacity')
    const travel = !opacitySource && chromeAnimation(input.slot, 'transform')
    const source = opacitySource || travel
    if (!source || source.playState === 'idle') {
      this.clear(input.canvasWidth !== undefined)
      return false
    }
    const timing = source.effect!.getTiming()
    const duration = Number(timing.duration)
    if (!(duration > 0) || source.playbackRate !== 1) {
      this.clear(input.canvasWidth !== undefined)
      return false
    }
    // Page settlement removes the outgoing toolbar before a chrome tail ends.
    // Keep that transaction's aperture and ink until its original clock retires;
    // treating the surviving run as a new arrival would apply its scale twice.
    if (!input.morph && this.morphEndpoints && source === this.source)
      input = { ...input, morph: true, ink: this.morphInk }
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
    const measuredTo =
      travel &&
      source === this.source &&
      this.travelFrame &&
      this.travelFrame.width === input.to.width &&
      this.travelFrame.height === input.to.height
        ? this.travelFrame
        : stable({ ...input.to, x: input.to.x - displacement.x, y: input.to.y - displacement.y })
    // Endpoints belong to the transaction, not to later compositor samples of
    // its own ink transforms. Re-reading them can restart the aperture every
    // frame and briefly expose the canvas envelope between tracks.
    const endpoints = source === this.source && input.morph ? this.morphEndpoints : undefined
    const to = endpoints?.to ?? measuredTo
    const from = endpoints?.from ?? stable(input.morph && !travel ? input.from : to)
    // Radius is endpoint geometry too. Reading it again from compositor-scaled
    // content retargets the transaction and rebuilds every carried ink animation.
    const fromRadius =
      endpoints?.fromRadius ??
      input.fromRadius ??
      glassRadius(input.shape ?? 'capsule', from.width, from.height)
    const toRadius =
      endpoints?.toRadius ??
      input.toRadius ??
      glassRadius(input.shape ?? 'capsule', to.width, to.height)
    const signature = JSON.stringify([
      from,
      to,
      input.morph,
      input.partition,
      input.preserveSymbols,
      input.padding,
      input.hidden,
      source.startTime,
      source.playState === 'paused',
      input.morph ? undefined : input.shape,
      input.morph ? fromRadius : undefined,
      input.morph ? toRadius : undefined,
    ])
    if (source === this.source && signature === this.signature) return true
    this.clear(true)
    this.source = source
    this.morphEndpoints = input.morph ? { from, to, fromRadius, toRadius } : undefined
    this.morphInk = input.morph ? input.ink : undefined
    this.travelFrame = travel ? to : undefined
    this.signature = signature
    const opacity = opacitySource
      ? knots(opacitySource, 'opacity')
      : [
          { offset: 0, value: 1 },
          { offset: 1, value: 1 },
        ]
    let frames = travel
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
    if (input.partition) {
      frames = frames.map((_, index) =>
        partitionMaterialFrame(
          input.partition === 'split' ? from : to,
          input.partition === 'split' ? to : from,
          toolbarTrackValue(opacity, index / (frames.length - 1)),
          input.partition!,
        ),
      )
    }
    const bounds = shapeTrackEnvelope(frames)
    const envelope = input.canvasWidth ? { ...bounds, x: 0, width: input.canvasWidth } : bounds
    const radii = frames.map((frame, index) =>
      input.morph && !travel && !input.partition
        ? fromRadius +
          (toRadius - fromRadius) * toolbarTrackValue(opacity, index / (frames.length - 1))
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
    if (input.morph && !travel) {
      this.releaseSymbols =
        input.preserveSymbols === false || input.partition
          ? undefined
          : retainToolbarSymbols(
              this.owner,
              input.ink ?? [],
              from,
              to,
              envelope,
              frames.map((_, index) => toolbarTrackValue(opacity, index / (frames.length - 1))),
              source,
              duration,
            )
      // Keep content attached to the capsule's nearest persistent edge. Resizing
      // a search field into actions must not stretch glyphs or move them around
      // the unrelated centre of the whole toolbar.
      const trailing = Math.abs(from.x - to.x) > Math.abs(from.x + from.width - to.x - to.width)
      const anchor = (frame: ShapeFrame) => frame.x + (trailing ? frame.width : 0)
      for (const member of input.ink ?? []) {
        const resting = member.incoming ? to : from
        toolbarCarriedContent.add(member.element)
        // The clip is expressed in the item's local box, before its chrome scale.
        // Freeze the unscaled box, then inverse-map each aperture through that
        // scale. A frozen presentation rect leaves a permanent inset at rest.
        const style = getComputedStyle(member.element)
        const measuredScale = parseFloat(style.scale) || 1
        const origin = style.transformOrigin.split(' ').map(Number.parseFloat)
        const originX = Number.isFinite(origin[0])
          ? origin[0]!
          : member.frame.width / measuredScale / 2
        const originY = Number.isFinite(origin[1])
          ? origin[1]!
          : member.frame.height / measuredScale / 2
        const layout = {
          x: member.frame.x - originX * (1 - measuredScale),
          y: member.frame.y - originY * (1 - measuredScale),
          width: member.frame.width / measuredScale,
          height: member.frame.height / measuredScale,
        }
        const memberScale = chromeAnimation(member.element, 'scale')
        const scaleKnots = memberScale ? knots(memberScale, 'scale') : undefined
        const scaleDuration = Number(memberScale?.effect?.getTiming().duration) || duration
        const scaleOffset =
          source.startTime !== null && memberScale?.startTime != null
            ? Number(source.startTime) - Number(memberScale.startTime)
            : Number(memberScale?.currentTime ?? 0) - at
        const grouped = (input.ink ?? []).filter(ink => ink.incoming === member.incoming).length > 1
        const centreSpan = resting.width - layout.width
        const position = centreSpan > 0 ? (layout.x - resting.x) / centreSpan : 0.5
        // Signed insets describe the whole capsule in member coordinates. Clamping
        // to the member box rounds each glyph separately and loses the outer rim.
        const samples = frames.map((frame, index) => {
          const size = scaleKnots
            ? toolbarTrackValue(
                scaleKnots,
                Math.max(
                  0,
                  Math.min(
                    1,
                    ((index / (frames.length - 1)) * duration + scaleOffset) / scaleDuration,
                  ),
                ),
              )
            : measuredScale
          // A group's members spread within its changing aperture. Translate each
          // glyph box, never stretch it. A field keeps its leading/trailing text
          // anchor instead. Cancel the group's scale-origin travel so its dissolve
          // changes glyph size without pushing the last icon beyond the glass.
          const scaledCentre = layout.x + originX * (1 - size) + (layout.width * size) / 2
          // A wider replacement field does not expand the dissolving group's
          // layout. Native keeps its old actions together while the glass grows.
          const groupWidth = Math.min(resting.width, frame.width)
          const groupLeft = frame.x + (trailing ? frame.width - groupWidth : 0)
          const centre =
            groupLeft +
            Math.min(layout.width, groupWidth) / 2 +
            position * Math.max(0, groupWidth - layout.width)
          const x = grouped ? centre - scaledCentre : anchor(frame) - anchor(resting)
          const y = frame.y + frame.height / 2 - resting.y - resting.height / 2
          const left = layout.x + originX * (1 - size) + x
          const top = layout.y + originY * (1 - size) + y
          return [
            x,
            y,
            (frame.y - top) / size,
            (left + layout.width * size - frame.x - frame.width) / size,
            (top + layout.height * size - frame.y - frame.height) / size,
            (frame.x - left) / size,
            radii[index]! / size,
          ]
        })
        const animation = animateElement(
          member.element,
          linearSampleIndices(samples).map(index => {
            const [x, y, top, right, bottom, left, radius] = samples[index]!
            return {
              offset: index / (frames.length - 1),
              translate: `${x}px ${y}px`,
              clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`,
            }
          }),
          { duration, easing: 'linear', fill: 'both' },
        )
        void animation.finished.catch(() => {})
        if (held) {
          animation.pause()
          animation.currentTime = at
        } else animation.startTime = source.startTime
        this.ink.push({ element: member.element, animation })
      }
    }
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

  clear(replacing = false) {
    if (!this.source) return
    this.releaseSymbols?.()
    this.releaseSymbols = undefined
    for (const { element, animation } of this.ink) {
      animation.cancel()
      toolbarCarriedContent.delete(element)
    }
    this.ink = []
    this.fade?.cancel()
    this.fade = undefined
    this.source = undefined
    this.travelFrame = undefined
    this.morphEndpoints = undefined
    this.morphInk = undefined
    this.signature = ''
    if (!replacing) setGlassShapeTrack(this.owner, undefined)
  }
}
