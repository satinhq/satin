import { expect, it } from 'vitest'
import { TabShapeResponse } from './tabShapeResponse.ts'

it('keeps slow drag neutral and responds to braking while contact is still held', () => {
  const shape = new TabShapeResponse()
  for (let i = 0; i < 100; i++) expect(shape.sample(160, 1 / 60)).toBe(0)
  for (let i = 0; i < 20; i++) shape.sample(1300, 1 / 60)
  expect(shape.sample(1300, 1 / 60)).toBeGreaterThan(10)
  const stopped = Array.from({ length: 20 }, () => shape.sample(0, 1 / 60))
  expect(Math.min(...stopped)).toBeLessThan(-3)
  for (let i = 0; i < 120; i++) shape.sample(0, 1 / 60)
  expect(Math.abs(shape.sample(0, 1 / 60))).toBeLessThan(0.001)
})
it('resets on suspension and does not advance on a repeated timestamp', () => {
  const shape = new TabShapeResponse()
  const value = shape.sample(1300, 1 / 60)
  expect(shape.sample(0, 0)).toBe(value)
  expect(shape.sample(0, 2)).toBe(0)
  expect(shape.sample(0, 1 / 60)).toBe(0)
})
