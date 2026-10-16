import { describe, expect, it } from 'vitest'
import { accessoryPose, accessoryOffset, type AccessoryTrack } from './accessoryTrack.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'

const spec = {
  sampleWidth: 340,
  sampleHeight: 84,
  sampleInsetX: 20,
  sampleInsetY: 20,
  shape: { first: { centerX: 150, centerY: 22, halfWidth: 150, halfHeight: 22, radius: 22 } },
} as SurfaceRenderSpec
const track: AccessoryTrack = {
  epoch: 1000,
  duration: 400,
  widths: [300, 250, 200],
  envelope: 300,
  slices: [
    { x: 20, y: 10, width: 180, height: 24, anchor: 0, clip: 1 },
    { x: 250, y: 10, width: 30, height: 24, anchor: 1, clip: 0 },
  ],
}
const atlas = { width: 340, height: 84 }
describe('retained accessory aperture', () => {
  it('clips text without scaling it and translates the trailing control', () => {
    const pose = accessoryPose(spec, track, 1200, atlas)
    expect(pose.shape.first.halfWidth).toBe(125)
    expect(pose.shape.first.radius).toBe(22)
    expect(pose.sampleWidth).toBe(340)
    expect(pose.ink!.layers[0]!.source.width).toBe(130)
    expect(pose.ink!.layers[0]!.frame.width).toBe(130)
    expect(pose.ink!.layers[1]!.frame.x).toBe(200)
    expect(pose.ink!.layers[1]!.frame.width).toBe(30)
  })
  it('samples matching backdrop translation without moving atlas coordinates', () => {
    const moving = {
      ...track,
      offsets: [
        { x: -80, y: 40 },
        { x: -40, y: 20 },
        { x: 0, y: 0 },
      ],
    }
    expect(accessoryOffset(moving, 1100)).toEqual({ x: -60, y: 30 })
    expect(accessoryOffset(moving, 900)).toEqual({ x: -80, y: 40 })
    expect(accessoryOffset(moving, 1500)).toEqual({ x: 0, y: 0 })
  })
  it('moves the glass inside a held-still canvas by the carrier offset at that instant', () => {
    // The canvas stays put, so the backdrop it refracts stays fixed to the page. Only the
    // capsule and its ink travel, from the resting frame, never from the previous pose.
    const held: AccessoryTrack = {
      ...track,
      offsets: [
        { x: -80, y: -60 },
        { x: -40, y: -30 },
        { x: 0, y: 0 },
      ],
      held: true,
    }
    const resting = { x: 100, y: 80 }
    const pose = accessoryPose({ ...spec, frameX: 7, frameY: 7 }, held, 1100, atlas, resting)
    expect([pose.frameX, pose.frameY]).toEqual([40, 35])
    expect(accessoryPose(pose, held, 1100, atlas, resting).frameX).toBe(40)
  })
  it('holds delayed starts and clamps settlement without integrating prior frames', () => {
    expect(accessoryPose(spec, track, 900, atlas).shape.first.halfWidth).toBe(150)
    const settled = accessoryPose(spec, track, 1500, atlas)
    expect(settled.shape.first.halfWidth).toBe(100)
    expect(accessoryPose(spec, track, 1200, atlas)).toEqual(accessoryPose(spec, track, 1200, atlas))
  })
})
