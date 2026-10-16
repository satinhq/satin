import { expect, it } from 'vitest'
import { SheetMaterialTransition } from './sheetMaterialTransition.ts'

it('keeps fading after detent geometry has stopped moving', () => {
  const material = new SheetMaterialTransition(0)
  material.target(1, 1000)
  expect(material.sample(1150)).toBeCloseTo(0.5)
  expect(material.active).toBe(true)
  expect(material.sample(1300)).toBe(1)
  expect(material.active).toBe(false)
})

it('reverses from the current painted value without an opacity discontinuity', () => {
  const material = new SheetMaterialTransition(0)
  material.target(1, 1000)
  const before = material.sample(1120)
  material.target(0, 1120)
  expect(material.sample(1120)).toBe(before)
  expect(material.sample(1420)).toBe(0)
})

it('does not restart a fade when drag frames repeat the same target', () => {
  const material = new SheetMaterialTransition(0)
  material.target(1, 1000)
  material.target(1, 1100)
  material.target(1, 1200)
  expect(material.sample(1300)).toBe(1)
})

it('settles immediately for reduced motion', () => {
  const material = new SheetMaterialTransition(0)
  material.target(1, 1000, true)
  expect(material.sample(1000)).toBe(1)
  expect(material.active).toBe(false)
})
