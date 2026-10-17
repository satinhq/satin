import { describe, it, expect } from 'vitest'
import { ShapeCadence, evaluateTrack, validateTrack } from './cadence.ts'
describe('page-locked glass timing', () => {
  it.each([30, 60, 120])('caps a %i Hz page without catching up missed frames', hz => {
    const clock = new ShapeCadence()
    const accepted = Array.from({ length: hz }, (_, i) => (i * 1000) / hz).filter(at =>
      clock.admit(at),
    )
    expect(accepted).toHaveLength(Math.min(hz, 60))
    for (let i = 1; i < accepted.length; i++)
      expect(accepted[i] - accepted[i - 1]).toBeCloseTo(1000 / Math.min(hz, 60))
    expect(clock.admit(2000)).toBe(true)
    expect(clock.admit(2000)).toBe(false)
    expect(clock.admit(2000 + 1000 / 120)).toBe(false)
  })
  it.each([0, 1, 2])('keeps quantized 60 Hz frames at starting phase %i', phase => {
    const clock = new ShapeCadence()
    for (let i = 0; i < 600; i++)
      expect(clock.admit(Math.round(((i + phase) * 1000) / 60))).toBe(true)
  })
  it('follows a page rate change without a discovery window or catch-up burst', () => {
    const clock = new ShapeCadence()
    for (let i = 0; i < 120; i++) expect(clock.admit((i * 1000) / 120)).toBe(i % 2 === 0)
    for (let i = 0; i < 60; i++) expect(clock.admit(1000 + (i * 1000) / 60)).toBe(true)
    expect(clock.admit(NaN)).toBe(false)
  })
  it('resumes ordinary 60 Hz frames after Catalyst timestamp jitter', () => {
    const clock = new ShapeCadence()
    // Captured page offsets: a late frame, then an early one, then quantized 60 Hz.
    const frames = [48, 71, 88, 105, 116, 133, 149, 166, 183, 199, 216, 233, 249]
    expect(frames.filter(at => clock.admit(at))).toEqual(frames.filter(at => at !== 116))
  })
  it.each(['interval', 'timestamp'] as const)(
    'never rejects a 60 Hz page with ±2 ms %s jitter',
    mode => {
      const clock = new ShapeCadence()
      const jitter = [0, -2, 2, -1.3, 1.8, -2, -2, 2, 2, 0]
      let at = 0
      for (let i = 0; i < 1200; i++) {
        const offset = jitter[i % jitter.length]
        at = mode === 'interval' ? at + 1000 / 60 + offset : (i * 1000) / 60 + offset
        expect(clock.admit(at)).toBe(true)
      }
    },
  )
  it('rejects exactly every other steady 120 Hz frame', () => {
    const clock = new ShapeCadence()
    for (let i = 0; i < 1200; i++) expect(clock.admit((i * 1000) / 120)).toBe(i % 2 === 0)
  })
  it.each(['interval', 'timestamp'] as const)(
    'never rejects two consecutive 120 Hz frames with ±2 ms %s jitter',
    mode => {
      const clock = new ShapeCadence()
      const jitter = [0, -2, 2, -1.3, 1.8, -2, -2, 2, 2, 0]
      let at = 0
      let previousAccepted = true
      for (let i = 0; i < 1200; i++) {
        const offset = jitter[i % jitter.length]
        at = mode === 'interval' ? at + 1000 / 120 + offset : (i * 1000) / 120 + offset
        const accepted = clock.admit(at)
        expect(previousAccepted || accepted).toBe(true)
        previousAccepted = accepted
      }
    },
  )
  it('does not drift after an hour of epoch-based 60 Hz frames', () => {
    const clock = new ShapeCadence()
    let accepted = 0
    for (let i = 0; i < 216000; i++) if (clock.admit(1791940891408 + (i * 1000) / 60)) accepted++
    expect(accepted).toBe(216000)
  })
  it('evaluates compositor keyframes at the shared epoch including overshoot and endpoints', () => {
    const track = { epoch: 1000, duration: 200, from: 10, to: 110, samples: [0, 0.8, 1.1, 1] }
    expect(evaluateTrack(track, 900)).toBe(10)
    expect(evaluateTrack(track, 1100)).toBeCloseTo(105)
    expect(evaluateTrack(track, 1300)).toBe(110)
    expect(() => validateTrack({ ...track, samples: [NaN] })).toThrow()
  })
})
