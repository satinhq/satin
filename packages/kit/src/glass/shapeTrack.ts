import type { SurfaceRenderSpec } from './renderSpecs.ts'

/**
 * Glass that changes size without moving its canvas.
 *
 * A region's canvas fills its element. When the element's layout grows or shrinks, the canvas box
 * changes in that same frame, but the worker only draws the new size a frame or more later. Until
 * then the compositor stretches the old picture into the new box, so the page under the glass
 * seems to slide and smear while nothing behind it moves (owner, Oct 13: "it looks like content is
 * moving underneath as the menu grows").
 *
 * Native glass keeps the content behind it in place: only the edge moves. A shape track
 * does the same. The element keeps one layout box for the whole run (the envelope of every frame
 * the glass passes through), so its canvas never resizes or moves and samples the page where it
 * really is. The worker draws the glass at the track's frame for each frame's presentation time,
 * and the page clips the element's content to the same frame from the same samples: one time
 * function for both, as in the accessory morph (`webgpu/accessoryTrack.ts`, `held`).
 */
export type GlassShapeTrack = Readonly<{
  /** When the run starts, on the normalized clock (`performance.timeOrigin + performance.now()`,
   * the same instant in the page and the worker). `Number.MAX_VALUE` holds the first frame. */
  epoch: number
  /** Milliseconds from the first frame to the last. */
  duration: number
  /** The glass's frame at evenly spaced instants across the run, relative to the region's
   * laid-out box (the envelope). The last frame holds after the run. */
  frames: readonly ShapeFrame[]
  /** Optional corner radii at the same instants as frames. Absent for existing submenu tracks. */
  radii?: readonly number[]
  /** Optional independent bottom corners, sampled at the same instants as frames. */
  bottomRadii?: readonly number[]
  /** Absolute material opacity at the same instants as frames; content stays independent. */
  opacities?: readonly number[]
}>

export type ShapeFrame = Readonly<{ x: number; y: number; width: number; height: number }>

/** The normalized clock shared by the page and the glass worker. */
export function shapeTrackClock() {
  return performance.timeOrigin + performance.now()
}

/** Material and geometry share a clock, including a held pose during interruption. */
export function shapeTrackOpacity(track: GlassShapeTrack, at: number) {
  const values = track.opacities
  if (!values?.length) return 1
  const progress =
    track.duration > 0 ? Math.max(0, Math.min(1, (at - track.epoch) / track.duration)) : 1
  const position = progress * (values.length - 1)
  const index = Math.floor(position)
  const from = values[index]!
  return from + (values[Math.min(index + 1, values.length - 1)]! - from) * (position - index)
}

/** The glass frame at `at`, interpolated between the track's samples. */
export function shapeTrackFrame(track: GlassShapeTrack, at: number): ShapeFrame {
  const frames = track.frames
  if (frames.length === 0) throw Error('A glass shape track needs at least one frame')
  const progress =
    track.duration > 0 ? Math.max(0, Math.min(1, (at - track.epoch) / track.duration)) : 1
  const position = progress * (frames.length - 1)
  const index = Math.floor(position)
  const from = frames[index]!
  const to = frames[Math.min(index + 1, frames.length - 1)]!
  const mix = position - index
  return {
    x: from.x + (to.x - from.x) * mix,
    y: from.y + (to.y - from.y) * mix,
    width: from.width + (to.width - from.width) * mix,
    height: from.height + (to.height - from.height) * mix,
  }
}

/** Corners and geometry use one clock. Existing tracks keep their shape's radius rule. */
export function shapeTrackRadius(
  track: GlassShapeTrack,
  at: number,
  fallback: number,
  edge: 'top' | 'bottom' = 'top',
) {
  const radii = edge === 'bottom' ? track.bottomRadii : track.radii
  if (!radii?.length) return fallback
  const progress =
    track.duration > 0 ? Math.max(0, Math.min(1, (at - track.epoch) / track.duration)) : 1
  const position = progress * (radii.length - 1)
  const index = Math.floor(position)
  const from = radii[index]!
  return from + (radii[Math.min(index + 1, radii.length - 1)]! - from) * (position - index)
}

/** Whether the track still moves at `at` (a held first frame does not). */
export function shapeTrackRunning(track: GlassShapeTrack, at: number) {
  return track.epoch !== Number.MAX_VALUE && at < track.epoch + track.duration
}

/** The smallest box that holds every frame of the track (relative to the same origin). */
export function shapeTrackEnvelope(frames: readonly ShapeFrame[]): ShapeFrame {
  const left = Math.min(...frames.map(frame => frame.x))
  const top = Math.min(...frames.map(frame => frame.y))
  const right = Math.max(...frames.map(frame => frame.x + frame.width))
  const bottom = Math.max(...frames.map(frame => frame.y + frame.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * A region's render spec with its glass drawn at the track's frame for `at`. The spec's frame and
 * sampling rectangle stay the envelope's, so its canvas and textures keep their size: only the
 * shape inside them changes. Corners keep the region's radius, capped by the smaller frame.
 */
export function trackedShapeSpec(
  spec: SurfaceRenderSpec,
  track: GlassShapeTrack,
  at: number,
  cornerRadius: (width: number, height: number) => number,
): SurfaceRenderSpec {
  const frame = shapeTrackFrame(track, at)
  const radius = Math.max(
    0,
    Math.min(
      frame.width / 2,
      frame.height / 2,
      shapeTrackRadius(track, at, cornerRadius(frame.width, frame.height)),
    ),
  )
  const first = spec.shape.first
  const bottomRadius =
    first.bottomRadius === undefined && !track.bottomRadii?.length
      ? undefined
      : Math.max(
          0,
          Math.min(
            shapeTrackRadius(track, at, first.bottomRadius ?? radius, 'bottom'),
            frame.width / 2,
            frame.height / 2,
          ),
        )
  return {
    ...spec,
    ...(track.opacities ? { opacity: shapeTrackOpacity(track, at) } : {}),
    radius,
    shape: {
      ...spec.shape,
      first: {
        ...first,
        centerX: frame.x + frame.width / 2,
        centerY: frame.y + frame.height / 2,
        halfWidth: frame.width / 2,
        halfHeight: frame.height / 2,
        radius,
        ...(bottomRadius === undefined ? {} : { bottomRadius }),
      },
    },
  }
}
