import { describe, expect, it } from 'vitest'
import { TabMotion } from './tabMotion.ts'
import { tabSelectionCapsule } from './tabSelectionMaterial.ts'
describe('consumer tab geometry', () => {
  it('uses two consumer centres for selection and drag endpoints', () => {
    const motion = new TabMotion()
    motion.configure([95.5, 265.5])
    expect(motion.frame.centre).toBe(95.5)
    motion.down(95.5, 0, 10)
    motion.move(267)
    motion.up(100)
    motion.sample(1000, true)
    expect(motion.selected).toBe(1)
    expect(motion.frame.centre).toBe(265.5)
  })
  it('preserves the measured four-tab defaults', () => {
    expect([0, 1, 2, 3].map(index => tabSelectionCapsule(index).centerX)).toEqual([
      53, 138, 223, 308,
    ])
    const motion = new TabMotion()
    motion.configure()
    motion.select(3, 0)
    motion.sample(1000, true)
    expect(motion.frame).toEqual({ centre: 308, width: 96, height: 52 })
  })
})

it('resolves activation on release independently of selection animation settlement', () => {
  const motion = new TabMotion()
  motion.configure([95.5, 265.5])
  motion.down(265.5, 1, 0)
  expect(motion.releaseTarget()).toBe(1)
  motion.up(10)
  expect(motion.selected).toBe(0)
  motion.sample(1000, true)
  expect(motion.selected).toBe(1)
  motion.down(265.5, 1, 1100)
  expect(motion.releaseTarget()).toBe(1) // active-tab re-tap is still an activation
  motion.move(95.5)
  expect(motion.releaseTarget()).toBe(0)
})
