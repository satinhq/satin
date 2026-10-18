import { expect, it } from 'vitest'
import { advanceSwipeResponse } from './swipeResponse.ts'

it.each([
  { stiffness: 100, damping: 12 },
  { stiffness: 100, damping: 20 },
  { stiffness: 100, damping: 30 },
])('retains velocity and is independent of frame subdivision: %j', poles => {
  const initial = { position: 0.2, velocity: 3 }
  const direct = advanceSwipeResponse(initial, 1, 0.4, poles)
  let split = initial
  for (let frame = 0; frame < 48; frame++)
    split = advanceSwipeResponse(split, 1, 1 / 120, poles)
  expect(split.position).toBeCloseTo(direct.position, 12)
  expect(split.velocity).toBeCloseTo(direct.velocity, 12)
})

it('preserves the signed rebound instead of clipping the spring at its target', () => {
  const poles = { stiffness: 100, damping: 4 }
  const after = advanceSwipeResponse({ position: 1, velocity: 0 }, 0, 0.3, poles)
  expect(after.position).toBeLessThan(0)
  const settled = advanceSwipeResponse(after, 0, 10, poles)
  expect(Math.abs(settled.position)).toBeLessThan(1e-8)
})

it('retargets from the current position and velocity without a takeover jump', () => {
  const poles = { stiffness: 100, damping: 12 }
  const moving = advanceSwipeResponse({ position: 0, velocity: 0 }, 1, 0.12, poles)
  expect(advanceSwipeResponse(moving, -1, 0, poles)).toBe(moving)
  const next = advanceSwipeResponse(moving, -1, 1e-6, poles)
  expect((next.position - moving.position) / 1e-6).toBeCloseTo(moving.velocity, 3)
})


it('preserves a ramp response across arbitrary sample subdivisions', async () => {
  const { advanceSwipeRampResponse } = await import('./swipeResponse.ts')
  const poles = { stiffness: 1483.5205592581408, damping: 58.5063488822322 }
  const initial = { position: 0, velocity: 0 }
  const whole = advanceSwipeRampResponse(initial, 0, -85, 0.3, poles)
  let state = initial
  for (let i = 0; i < 30; i++)
    state = advanceSwipeRampResponse(state, -85 * i / 30, -85 * (i + 1) / 30, 0.01, poles)
  expect(state.position).toBeCloseTo(whole.position, 8)
  expect(state.velocity).toBeCloseTo(whole.velocity, 8)
  expect(state.position).toBeGreaterThan(-85)
  expect(state.velocity).toBeLessThan(-200)
})
