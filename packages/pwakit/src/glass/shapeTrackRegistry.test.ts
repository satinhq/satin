// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { glassAperture, glassApertureInFrame, setGlassShapeTrack } from './shapeTrackRegistry.ts'
import { shapeTrackFrame } from './shapeTrack.ts'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('maps a moving aperture through a translated and scaled sheet exactly once', () => {
  const owner = document.createElement('div')
  document.body.append(owner)
  owner.style.width = '120px'
  owner.style.height = '44px'
  owner.style.borderRadius = '22px'
  const track = {
    epoch: 1000,
    duration: 240,
    frames: [
      { x: 80, y: 0, width: 40, height: 44 },
      { x: 0, y: 0, width: 120, height: 44 },
    ],
    radii: [4, 20],
  }
  setGlassShapeTrack(owner, track)
  vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 300, 96, 35.2))
  for (let elapsed = 0; elapsed <= 240; elapsed += 0.5) {
    const local = shapeTrackFrame(track, 1000 + elapsed)
    const actual = glassAperture(owner, 1000 + elapsed)
    expect(actual.x).toBe(200 + local.x * 0.8)
    expect(actual.y).toBe(300)
    expect(actual.width).toBe(local.width * 0.8)
    expect(actual.height).toBeCloseTo(35.2, 10)
    expect(actual.radius).toBeCloseTo((4 + (16 * elapsed) / 240) * 0.8, 10)
    expect(
      glassApertureInFrame(owner, { x: 50, y: 70, width: 120, height: 44 }, 1000 + elapsed).width,
    ).toBe(local.width)
  }
  setGlassShapeTrack(owner, undefined)
  expect(glassAperture(owner)).toEqual({ x: 200, y: 300, width: 96, height: 35.2, radius: 22 })
})

it('retains held endpoints and custom radius without a new page frame', () => {
  const owner = document.createElement('div')
  document.body.append(owner)
  owner.style.width = '200px'
  owner.style.height = '80px'
  setGlassShapeTrack(owner, {
    epoch: Number.MAX_VALUE,
    duration: 100,
    frames: [{ x: 50, y: 10, width: 60, height: 40 }],
    radii: [7],
  })
  expect(glassApertureInFrame(owner, { x: 20, y: 30, width: 200, height: 80 }, 12345)).toEqual({
    x: 70,
    y: 40,
    width: 60,
    height: 40,
    radius: 7,
  })
})
