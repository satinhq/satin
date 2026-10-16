import type { SurfaceRenderSpec } from '../renderSpecs.ts'

/** Immutable sampled motion shared with the compositor, on the normalized performance clock. */
export type AccessoryTrack = {
  epoch: number
  duration: number
  offsets?: readonly { x: number; y: number }[]
  widths: readonly number[]
  envelope: number
  slices: readonly {
    x: number
    y: number
    width: number
    height: number
    anchor: number
    clip: number
  }[]
  /**
   * The canvas holds still on screen for this run (see `accessoryMorph.ts`, `accessoryReach`).
   * The worker then draws the moving capsule and its ink inside it at each sampled offset, so
   * the backdrop is always sampled where the canvas really is. Without it the canvas rides the
   * compositor carrier and only its sampling viewport follows, which lets the refracted content
   * slide whenever the canvas frame and the compositor frame disagree about the time.
   */
  held?: boolean
}

/**
 * The accessory's glass and ink at `at`. `restingFrame` is the glass frame's position in its
 * canvas at the run's target layout; a held-still canvas (`track.held`) moves the frame from
 * there by the carrier's offset at the same instant.
 */
export function accessoryPose(
  spec: SurfaceRenderSpec,
  track: AccessoryTrack,
  at: number,
  atlas: { width: number; height: number },
  restingFrame: { x: number; y: number } = { x: spec.frameX, y: spec.frameY },
): SurfaceRenderSpec {
  const progress = Math.max(0, Math.min(1, (at - track.epoch) / track.duration))
  const index = progress * (track.widths.length - 1)
  const low = Math.floor(index),
    high = Math.min(track.widths.length - 1, low + 1)
  const width = track.widths[low]! + (track.widths[high]! - track.widths[low]!) * (index - low)
  const delta = width - track.envelope
  const travel = track.held ? accessoryOffset(track, at) : undefined
  return {
    ...spec,
    ...(travel ? { frameX: restingFrame.x + travel.x, frameY: restingFrame.y + travel.y } : {}),
    shape: {
      ...spec.shape,
      first: { ...spec.shape.first, centerX: width / 2, halfWidth: width / 2 },
      members: [{ ...spec.shape.first, centerX: width / 2, halfWidth: width / 2 }],
    },
    ink: {
      atlas,
      layers: track.slices
        .map(slice => {
          const shown = Math.max(0, slice.width + delta * slice.clip)
          return {
            source: {
              x: slice.x + spec.sampleInsetX,
              y: slice.y + spec.sampleInsetY,
              width: shown,
              height: slice.height,
            },
            frame: {
              x: slice.x + delta * slice.anchor,
              y: slice.y,
              width: shown,
              height: slice.height,
            },
            opacity: 1,
            blur: 0,
            lens: 0,
            lensWidth: 1,
          }
        })
        .filter(layer => layer.source.width > 0),
    },
  }
}

/** Sampling motion is available even when the document still owns the accessory ink. */
export type AccessoryViewportTrack = Pick<
  AccessoryTrack,
  'epoch' | 'duration' | 'widths' | 'offsets'
>

/** Coordinates of the compositor carrier, sampled without a DOM read. */
export function accessoryOffset(track: AccessoryViewportTrack, at: number) {
  const position =
    Math.max(0, Math.min(1, (at - track.epoch) / track.duration)) * (track.widths.length - 1)
  const index = Math.floor(position)
  const from = track.offsets?.[index] ?? { x: 0, y: 0 }
  const to = track.offsets?.[Math.min(index + 1, track.widths.length - 1)] ?? from
  return {
    x: from.x + (to.x - from.x) * (position - index),
    y: from.y + (to.y - from.y) * (position - index),
  }
}
