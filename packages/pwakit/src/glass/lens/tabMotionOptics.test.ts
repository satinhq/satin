import { expect, it } from 'vitest'
import { TAB_INTERACTIVE_MOTION, TabMotion } from './tabMotion.ts'

it('clears every optical response after release, cancellation and reduced motion', () => {
  for (const ending of ['release', 'cancel', 'reduced'] as const) {
    const motion = new TabMotion(TAB_INTERACTIVE_MOTION)
    motion.down(53, 0, 0)
    for (let at = 0; at <= 300; at += 1000 / 120) motion.sample(at, false)
    motion.move(200)
    for (let at = 300; at <= 600; at += 1000 / 120) motion.sample(at, false)
    const lifted = motion.optics()
    expect(lifted.motionMix).toBeGreaterThan(0)
    expect(lifted.foregroundScaleX).toBeGreaterThan(0)
    for (const value of Object.values(lifted).flat()) expect(Number.isFinite(value)).toBe(true)
    motion.up(600, ending === 'cancel', 0)
    for (let at = 600; at <= 2000; at += 1000 / 120) motion.sample(at, ending === 'reduced')
    expect(motion.active).toBe(false)
    expect(Object.values(motion.optics()).every(value => value === 0)).toBe(true)
    if (ending === 'cancel') expect(motion.selected).toBe(0)
  }
})

it('suppresses optical fields while a reduced-motion contact is still held', () => {
  const motion = new TabMotion(TAB_INTERACTIVE_MOTION)
  motion.down(53, 0, 1000)
  motion.sample(1100, true)
  expect(motion.lensMix).toBe(0)
  expect(motion.optics().lensLight).toEqual([0, 0, 0, 0])
  expect(motion.optics().lensDark).toEqual([0, 0, 0, 0])
})
