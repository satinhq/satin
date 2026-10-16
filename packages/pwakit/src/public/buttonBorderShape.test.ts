import { expect, it } from 'vitest'
import { resolveButtonBorderShape } from './buttonBorderShape.ts'
import { glassRadius } from '../glass/regions.ts'

it('keeps automatic and capsule on the shared capsule geometry', () => {
  expect(resolveButtonBorderShape()).toBe('capsule')
  expect(glassRadius(resolveButtonBorderShape('capsule'), 100, 34)).toBe(17)
})

it('keeps a measured fixed cornerRadius and clamps only at the material bounds', () => {
  const shape = resolveButtonBorderShape({ kind: 'roundedRectangle', cornerRadius: 12 })
  expect(shape).toEqual({ kind: 'roundedRectangle', cornerRadius: 12 })
  expect(glassRadius(shape, 100, 34)).toBe(12)
  expect(glassRadius(shape, 10, 34)).toBe(5)
})

it.each([-1, NaN, Infinity])(
  'rejects invalid fixed cornerRadius %s through shared validation',
  cornerRadius => {
    expect(() => resolveButtonBorderShape({ kind: 'roundedRectangle', cornerRadius })).toThrow(
      'Glass cornerRadius must be finite and nonnegative.',
    )
  },
)
