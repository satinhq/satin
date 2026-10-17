// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import type { SurfaceRenderSpec } from '../glass/renderSpecs.ts'
import { PadSearchBarMotion } from './padSearchBarMotion.ts'
const captured = vi.hoisted(() => ({ frames: [] as Keyframe[] }))
vi.mock('../motion/animate.ts', () => ({
  animateElement: (_element: HTMLElement, frames: Keyframe[]) => {
    captured.frames = frames
    return { playState: 'running', cancel: vi.fn(), finished: Promise.resolve(), startTime: null }
  },
  timelineStart: (at: number) => at,
}))
afterEach(() => vi.unstubAllGlobals())
it('keeps painted glass and DOM ink on the same translation and opacity at every sample', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const motion = new PadSearchBarMotion()
  const spec = { frameY: -32, opacity: 0 } as SurfaceRenderSpec
  const track = motion.start(document.createElement('nav'), 1, spec, 100)
  expect(track.specs.length).toBeGreaterThan(12)
  track.specs.forEach((sample, index) => {
    const frame = captured.frames[index]!
    const offset = Number(String(frame.transform).match(/translateY\(([-.\d]+)px\)/)![1])
    expect(sample.frameY).toBeCloseTo(spec.frameY + offset)
    expect(sample.opacity).toBe(frame.opacity)
    expect(String(frame.transform)).not.toContain('scale')
  })
  expect(track.specs[0]!.frameY).toBe(32)
  expect(track.specs.at(-1)!.frameY).toBe(-32)
  expect(track.specs.at(-1)!.opacity).toBe(0)
})
it('reduced motion settles both material and controls immediately, including return', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const motion = new PadSearchBarMotion()
  const element = document.createElement('nav')
  const hidden = motion.start(element, 1, { frameY: -32, opacity: 0 } as SurfaceRenderSpec, 100)
  expect(hidden.duration).toBe(0)
  expect(hidden.specs.every(spec => spec.frameY === -32 && spec.opacity === 0)).toBe(true)
  const shown = motion.start(element, 0, { frameY: 32, opacity: 1 } as SurfaceRenderSpec, 200)
  expect(shown.duration).toBe(0)
  expect(shown.specs.every(spec => spec.frameY === 32 && spec.opacity === 1)).toBe(true)
  expect(motion.sample(200)).toEqual({ value: 0, velocity: 0 })
})
