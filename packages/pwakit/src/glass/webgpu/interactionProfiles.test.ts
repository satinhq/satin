import { expect, it } from 'vitest'
import { TabMotion, TAB_INTERACTIVE_MOTION } from '../lens/tabMotion.ts'
import { tabHeldGeometry } from './interactionProfiles.ts'
it('reaches the observed native held tab bounds and preserves its original rest', () => {
  const motion = new TabMotion(TAB_INTERACTIVE_MOTION, tabHeldGeometry(107.5, 54, 398))
  motion.configure([59.25, 153.75, 248.25, 342.75], 107.5, 54, 398)
  motion.reset(0)
  const rest = motion.capsule()
  motion.down(59.25, 0, 1000)
  for (let t = 1000; t <= 2200; t += 10) motion.sample(t, false)
  const c = motion.capsule()
  expect(c.centerX - c.halfWidth + 21).toBeCloseTo(9.7889447236, 3)
  expect(c.halfWidth * 2).toBeCloseTo(127.7144342402, 5)
  expect(c.halfHeight * 2).toBeCloseTo(72.486570785, 5)
  expect(motion.needsFrame).toBe(false)
  motion.reset(0)
  expect(motion.capsule()).toEqual(rest)
  expect(tabHeldGeometry(96, 52, 360)).toBeUndefined()
})
