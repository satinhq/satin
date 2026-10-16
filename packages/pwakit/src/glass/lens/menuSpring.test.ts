import { expect, it } from 'vitest'
import { menuSpring, menuSpringSettle } from './menuSpring.ts'
import { menuMorphDuration, sampleMenuMorph } from './menuMorphMotion.ts'

it('returns the analytic velocity of its displacement and holds before its delay', () => {
  const spring = { delay: 20, omega: 15, zeta: 0.7, velocity: 5 }
  expect(menuSpring(spring, 0)).toEqual({ value: 1, velocity: 0 })
  for (const ms of [30, 80, 150, 300]) {
    const numeric = (menuSpring(spring, ms + 0.5).value - menuSpring(spring, ms - 0.5).value) * 1000
    expect(menuSpring(spring, ms).velocity).toBeCloseTo(numeric, 1)
  }
  expect(Math.abs(menuSpring(spring, menuSpringSettle(spring) + 50).value)).toBeLessThan(0.0015)
})

it('closes the phone menu as one continuous motion: shrinking without re-growth before the settle', () => {
  const duration = menuMorphDuration('close', 'phone')
  let previous = sampleMenuMorph('close', 0, 'phone')
  let previousStep: Record<string, number> = {}
  let largestChange = 0
  for (let ms = 4; ms < duration; ms += 4) {
    const sample = sampleMenuMorph('close', ms, 'phone')
    // Size only falls until it is within 3% of the trigger (the final momentum settle).
    for (const axis of ['width', 'height'] as const)
      if (previous.pose[axis] > 0.03)
        expect(sample.pose[axis]).toBeLessThanOrEqual(previous.pose[axis])
    for (const axis of ['centerX', 'centerY', 'width', 'height'] as const) {
      const step = sample.pose[axis] - previous.pose[axis]
      // Native starts abruptly too (its centre moves 15 pt in its first moving frame).
      if (axis in previousStep && ms > 40)
        largestChange = Math.max(largestChange, Math.abs(step - previousStep[axis]))
      previousStep[axis] = step
    }
    previous = sample
  }
  // Velocity is continuous: no step changes by more than 0.8% of the travel from the last one
  // (a keyframe table's knots or a snap would).
  expect(largestChange).toBeLessThan(0.008)
  expect(sampleMenuMorph('close', duration, 'phone').pose.width).toBe(0)
})
