import { expect, it } from 'vitest'
import { glassDockHeight } from './Scene.tsx'
import { TabMotion } from './tabMotion.ts'

it('fits landscape ink and selection into the measured 44pt native platter', () => {
  // native reference rough-edges: 956 x 440, 44pt platter, 36pt selected content.
  expect(glassDockHeight(956, 440)).toBe(44)
  const motion = new TabMotion()
  motion.configure([43, 129, 215], 80, glassDockHeight(956, 440) - 8, 270, {
    selected: 0,
    centerY: 22,
  })
  expect(motion.frame.height).toBe(36)
  expect(motion.capsule().centerY).toBe(22)
  // A raised keyboard never turns a portrait window into landscape.
  expect(glassDockHeight(440, 956)).toBe(62)
})
