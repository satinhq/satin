import { expect, it } from 'vitest'
import { controlLensSpec } from '../glass/webgpu/regionScene.ts'
import type { SurfaceRenderSpec } from '../glass/renderSpecs.ts'
import { ToggleContact } from './toggleContact.ts'

it('a held Toggle tolerates scroll tremor and yields at the scroll threshold', () => {
  const contact = new ToggleContact(false, 0)
  contact.down(1, 0, 0, false, 0)
  contact.lift(333)
  expect(contact.move(1, 0, 9, 1000)).toBeUndefined()
  expect(contact.sample(1000).lift).toBeCloseTo(1, 2)
  expect(contact.up(1, 1001)?.value).toBe(true)

  contact.down(2, 0, 0, true, 2000)
  expect(contact.move(2, 0, 10, 2100)).toBe('vertical')
  contact.cancel(2100)
  expect(contact.up(2, 2101)).toBeUndefined()
})

it('a tap keeps the white resting thumb; a 333 ms hold lifts it to the measured lens', () => {
  const tap = new ToggleContact(false, 0)
  tap.down(1, 0, 0, false, 0)
  expect(tap.liftDue(84)).toBe(false)
  tap.up(1, 84)
  expect(tap.sample(400).lift).toBe(0)

  const hold = new ToggleContact(false, 0)
  hold.down(1, 0, 0, false, 0)
  expect(hold.liftDue(320)).toBe(false)
  expect(hold.liftDue(333)).toBe(true)
  hold.lift(333)
  const lift = hold.sample(333 + 600).lift
  expect(lift).toBeCloseTo(1, 2)
  // The renderer draws that lift as the native held lens (58.17 × 39 pt) at the thumb's centre,
  // and the prepared lens is transparent until the lift starts.
  const frame = { frameWidth: 85, shape: { first: { centerX: 0, centerY: 22 } } }
  const held = controlLensSpec(frame as unknown as SurfaceRenderSpec, 'toggle', lift, 31.5)
  expect(held.shape.first).toMatchObject({ centerX: 31.5, centerY: 22 })
  expect(held.shape.first.halfWidth * 2).toBeCloseTo(58.17, 1)
  expect(held.shape.first.halfHeight * 2).toBeCloseTo(39, 1)
  expect(held.opacity).toBe(1)
  expect(controlLensSpec(frame as unknown as SurfaceRenderSpec, 'toggle', 0, 31.5).opacity).toBe(0)
})
