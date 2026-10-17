import { expect, it } from 'vitest'
import { InteractiveContact } from './interactiveContact.ts'

it('a dragged press follows the finger, squishes along the motion and springs back on release', () => {
  const contact = new InteractiveContact()
  const regionId = 'field'
  contact.input({ regionId, phase: 'pressed', epoch: 1000, contact: { x: 50, y: 20 } })
  // A 60 pt drag to the right over 100 ms.
  for (let step = 1; step <= 6; step++)
    contact.input({
      regionId,
      phase: 'dragging',
      epoch: 1000 + step * (100 / 6),
      contact: { x: 50 + step * 10, y: 20 },
    })
  const dragging = contact.pose(1100)
  // The shape trails the finger a little and stretches along the drag, narrowing across it.
  expect(dragging.x).toBeGreaterThan(0)
  expect(dragging.x).toBeLessThanOrEqual(8)
  expect(Math.abs(dragging.y)).toBeLessThan(0.01)
  expect(dragging.width).toBeGreaterThan(0)
  expect(dragging.height).toBeLessThan(0)
  // The light is under the finger, not spread over the whole shape.
  expect(contact.light.sample('dark', 1100)).toMatchObject({ x: 110, y: 20 })
  // Reduce Motion keeps the glass at rest; the light still answers the finger.
  expect(contact.pose(1100, true)).toEqual({ x: 0, y: 0, width: 0, height: 0 })

  contact.input({ regionId, phase: 'releasing', epoch: 1100, contact: { x: 110, y: 20 } })
  expect(contact.needsFrame(1200)).toBe(true)
  const settled = contact.pose(2000)
  for (const value of Object.values(settled)) expect(Math.abs(value)).toBeLessThan(0.05)
})
