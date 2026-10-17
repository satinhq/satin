import { expect, it } from 'vitest'
import type { SurfaceRenderSpec } from './renderSpecs.ts'
import {
  shapeTrackEnvelope,
  shapeTrackFrame,
  shapeTrackRunning,
  trackedShapeSpec,
  type GlassShapeTrack,
} from './shapeTrack.ts'

const track: GlassShapeTrack = {
  epoch: 1000,
  duration: 100,
  frames: [
    { x: 10, y: 70, width: 230, height: 42 },
    { x: 5, y: 30, width: 240, height: 200 },
    { x: 0, y: 0, width: 250, height: 334 },
  ],
}

it('samples a shape track between its frames and holds its ends', () => {
  expect(shapeTrackFrame(track, 900)).toEqual(track.frames[0])
  expect(shapeTrackFrame(track, 1025)).toEqual({ x: 7.5, y: 50, width: 235, height: 121 })
  expect(shapeTrackFrame(track, 5000)).toEqual(track.frames[2])
  expect(shapeTrackRunning(track, 1050)).toBe(true)
  expect(shapeTrackRunning(track, 1100)).toBe(false)
  expect(shapeTrackRunning({ ...track, epoch: Number.MAX_VALUE }, 1050)).toBe(false)
})

it('covers every frame of a run with one envelope', () => {
  expect(shapeTrackEnvelope(track.frames)).toEqual({ x: 0, y: 0, width: 250, height: 334 })
})

it('changes only the drawn shape, never the canvas or the sampled backdrop', () => {
  // The owner's Oct 13 clip: a growing menu's glass smeared the page under it because its canvas
  // was resized every frame and the stale picture was stretched into the new box. A tracked
  // region keeps its frame and sampling rectangle, so nothing behind the glass can move.
  const spec = {
    frameX: 12,
    frameY: 12,
    frameWidth: 250,
    frameHeight: 334,
    sampleWidth: 274,
    sampleHeight: 358,
    radius: 22,
    shape: {
      blendRadius: 0,
      rimAlpha: 1,
      whiteMix: 0,
      first: { centerX: 125, centerY: 167, halfWidth: 125, halfHeight: 167, radius: 22 },
    },
  } as unknown as SurfaceRenderSpec
  const radius = (width: number, height: number) => Math.min(22, width / 2, height / 2)
  const start = trackedShapeSpec(spec, track, 0, radius)
  expect([start.frameX, start.frameY, start.frameWidth, start.frameHeight]).toEqual([
    12, 12, 250, 334,
  ])
  expect([start.sampleWidth, start.sampleHeight]).toEqual([274, 358])
  expect(start.shape.first).toMatchObject({
    centerX: 125,
    centerY: 91,
    halfWidth: 115,
    halfHeight: 21,
    radius: 21,
  })
  const end = trackedShapeSpec(spec, track, 2000, radius)
  expect(end.shape.first).toMatchObject(spec.shape.first)
})

it('samples independent top and bottom contours and preserves untracked bottom corners', () => {
  const spec = {
    radius: 38,
    shape: {
      first: {
        centerX: 125,
        centerY: 167,
        halfWidth: 125,
        halfHeight: 167,
        radius: 38,
        bottomRadius: 12,
      },
    },
  } as SurfaceRenderSpec
  const tracked = { ...track, radii: [38, 38, 38], bottomRadii: [6, 14, 24] }
  const sampled = trackedShapeSpec(spec, tracked, 1075, () => 38)
  expect(sampled.shape.first.radius).toBe(38)
  expect(sampled.shape.first.bottomRadius).toBe(19)
  expect(trackedShapeSpec(spec, track, 1075, () => 38).shape.first.bottomRadius).toBe(12)
  const held = trackedShapeSpec(spec, { ...tracked, epoch: Number.MAX_VALUE }, 1075, () => 38)
  expect(held.shape.first.radius).toBe(21)
  expect(held.shape.first.bottomRadius).toBe(6)
})
