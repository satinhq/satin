import { glassMaterialResponse } from './rendererContract.ts'
import { describe, expect, it } from 'vitest'
import {
  Glass,
  glassRadius,
  glassViewportFrame,
  validateGlassRegions,
  type GlassRegion,
} from './regions.ts'
import { GlassRegionRegistry } from './regionRegistry.ts'
const region = (id = 'card'): GlassRegion => ({
  id,
  layer: { id: 'content', depth: 0, attachment: { kind: 'scroll', scrollId: 'list' } },
  frame: { x: 24, y: 400, width: 200, height: 80 },
  shape: 'capsule',
  material: Glass.regular.material,
})
describe('glass region contract', () => {
  it('projects scroll content for sampling while keeping its content coordinates', () => {
    const value = region()
    expect(
      glassViewportFrame(value, [
        {
          id: 'list',
          viewportX: 10,
          viewportY: 60,
          offsetX: 0,
          offsetY: 120,
          width: 440,
          height: 800,
        },
      ]),
    ).toEqual({ x: 34, y: 340, width: 200, height: 80 })
    expect(value.frame.y).toBe(400)
    expect(() => glassViewportFrame(value, [])).toThrow('Missing glass scroll')
  })
  it('keeps fixed overlays independent of scroll offsets', () => {
    const value = {
      ...region(),
      layer: { id: 'overlay', depth: 100, attachment: { kind: 'fixed' as const } },
    }
    expect(glassViewportFrame(value, [])).toBe(value.frame)
  })
  it('keeps material modifiers immutable and validates tint', () => {
    const tint: [number, number, number, number] = [0, 0.5, 1, 0.4]
    const value = Glass.clear.tint(tint).interactive()
    tint[1] = 0
    expect(value.material).toEqual({ variant: 'clear', tint: [0, 0.5, 1, 0.4], interactive: true })
    expect(Glass.clear.material.tint).toBeUndefined()
    expect(() => Glass.regular.tint([0, 0, 0, NaN])).toThrow()
  })
  it('enforces allocation and identity budgets without treating regions as contexts', () => {
    expect(validateGlassRegions([region()], 3)).toEqual({ regions: 1, samplePixels: 259200 })
    expect(() => validateGlassRegions([region(), region()], 3)).toThrow('Duplicate')
    expect(() =>
      validateGlassRegions(
        Array.from({ length: 17 }, (_, i) => region(String(i))),
        1,
      ),
    ).toThrow('16')
    expect(() =>
      validateGlassRegions([{ ...region(), frame: { x: 0, y: 0, width: 4000, height: 4000 } }], 3),
    ).toThrow('budget')
    expect(() => validateGlassRegions([{ ...region(), shape: 'circle' }], 1)).toThrow('equal')
  })
  it('rejects morph identity collisions only within the same container and namespace', () => {
    const a = { ...region('a'), morph: { namespace: 'one', id: 'button' } }
    expect(() => validateGlassRegions([a, { ...a, id: 'b' }], 1)).toThrow('glassEffectID')
    expect(
      validateGlassRegions([a, { ...a, id: 'b', morph: { ...a.morph, namespace: 'two' } }], 1)
        .regions,
    ).toBe(2)
    expect(
      validateGlassRegions(
        [
          { ...a, container: { id: 'first', spacing: 20 } },
          { ...a, id: 'b', container: { id: 'second', spacing: 20 } },
        ],
        1,
      ).regions,
    ).toBe(2)
  })
  it('clamps a rounded-rectangle radius to the shorter half-side', () => {
    expect(glassRadius({ kind: 'roundedRectangle', cornerRadius: 100 }, 30, 40)).toBe(15)
  })
  it('unregisters once and releases subscribers without an idle timer', () => {
    const registry = new GlassRegionRegistry()
    let changes = 0
    const stop = registry.subscribe(() => changes++)
    const remove = registry.register({
      id: 'a',
      element: {} as HTMLElement,
      canvas: {} as HTMLCanvasElement,
      descriptor: region('a'),
    })
    expect(registry.size).toBe(1)
    remove()
    remove()
    expect(changes).toBe(2)
    stop()
    registry.invalidate()
    expect(changes).toBe(2)
    expect(registry.size).toBe(0)
  })
})

it('interactive lift transmits the backdrop and leaves the reference rest descriptor untouched', () => {
  const material = Glass.regular.tint([1, 0, 0, 0.4]).interactive().material
  const rest = glassMaterialResponse(material, 0),
    lift = glassMaterialResponse(material, 1)
  expect(rest.rest).toBe(material)
  expect(rest.liftMix).toBe(0)
  expect(lift.lift).toEqual({
    variant: 'clear',
    source: 'transmitted-backdrop',
    blurSigma: 0,
    tintAlpha: 0,
    rimProfile: 'measured-reference-native',
    refractForeground: true,
  })
  expect(glassMaterialResponse(Glass.regular.material, 1).liftMix).toBe(0)
})

it('rejects conflicting attachment definitions for one layer', () => {
  const a = region('a'),
    b = { ...region('b'), layer: { ...region().layer, depth: 100 } }
  expect(() => validateGlassRegions([a, b], 1)).toThrow('Conflicting glass layer')
})

it('keeps sheet treatment serializable through modifiers and shared presentation', () => {
  const material = JSON.parse(
    JSON.stringify(Glass.sheet.tint([1, 0, 0, 0.1]).interactive().material),
  )
  expect(material.treatment).toBe('sheet')
  expect(Glass.regular.material.treatment).toBeUndefined()
  const full = { ...region(), frame: { x: 0, y: 0, width: 440, height: 894 } }
  expect(validateGlassRegions([full, { ...full, id: 'second' }], 3).samplePixels).toBe(8_069_760)
})
