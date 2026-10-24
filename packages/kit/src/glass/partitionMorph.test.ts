import { expect, it } from 'vitest'
import { partitionMaterialFrame } from './partitionMorph.ts'
import { glassBlendRadius, glassFieldDistance } from './fieldGeometry.ts'

it('joins nearby branches through the general field and separates distant endpoints', () => {
  const parent = { x: 0, y: 0, width: 88, height: 44 }
  const branch = { x: 52, y: 0, width: 44, height: 44 }
  expect(partitionMaterialFrame(parent, branch, 0, 'split')).toEqual({
    x: 74,
    y: 22,
    width: 0,
    height: 0,
  })
  expect(partitionMaterialFrame(parent, branch, 1, 'split')).toEqual(branch)
  const member = (x: number) => ({
    centerX: x + 22,
    centerY: 22,
    halfWidth: 22,
    halfHeight: 22,
    radius: 22,
  })
  const blend = glassBlendRadius(20)
  // The native-measured smooth union supplies the neck; no toolbar-specific curve.
  expect(glassFieldDistance(48, 22, [member(0), member(52)], blend)).toBeLessThan(0)
  expect(glassFieldDistance(52, 22, [member(0), member(60)], blend)).toBeGreaterThan(0)
})

it('retires a merging branch at departure rather than reversing split travel', () => {
  const parent = { x: 0, y: 0, width: 44, height: 44 }
  const branch = { x: 60, y: 0, width: 44, height: 44 }
  const split = partitionMaterialFrame(parent, branch, 0.5, 'split')
  const merge = partitionMaterialFrame(parent, branch, 0.5, 'merge')
  expect(merge.x + merge.width / 2).toBe(82)
  expect(merge.width).toBe(0)
  expect(partitionMaterialFrame(parent, branch, 1, 'merge')).toEqual(branch)
  expect(split.x + split.width / 2).toBe(63)
  expect(partitionMaterialFrame(parent, branch, 0, 'merge').width).toBe(0)
})
