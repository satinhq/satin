import { describe, expect, it } from 'vitest'
import {
  glassBlendRadius,
  glassFieldDistance,
  morphFieldSampleBounds,
  glassFieldKey,
  glassIdentityKey,
  glassUnionDiagnostics,
  roundedRectDistance,
  smoothMinimum,
} from './morphField.ts'
import type { SurfaceRenderSpec } from './renderSpecs.ts'
import type { GlassRegion } from './regions.ts'

const circle = (centerX: number) => ({
  centerX,
  centerY: 0,
  halfWidth: 36,
  halfHeight: 36,
  radius: 36,
})
describe('container signed distance field', () => {
  it('preserves the member distance and the hard union at zero spacing', () => {
    expect(roundedRectDistance(36, 0, circle(0))).toBe(0)
    expect(smoothMinimum(-2, 4, 0)).toBe(-2)
    expect(glassFieldDistance(0, 0, [circle(-37), circle(37)], 0)).toBe(1)
  })
  it.each([10, 20, 40, 80])('joins at half the measured blend radius for spacing %s', spacing => {
    const k = glassBlendRadius(spacing)
    const center = 36 + k / 4
    expect(glassFieldDistance(0, 0, [circle(-center), circle(center)], k)).toBeCloseTo(0, 8)
    expect(glassFieldDistance(0, 0, [circle(-center + 1), circle(center - 1)], k)).toBeLessThan(0)
    expect(glassFieldDistance(0, 0, [circle(-center - 1), circle(center + 1)], k)).toBeGreaterThan(
      0,
    )
  })
  it('rejects invalid spacing', () => {
    expect(() => glassBlendRadius(-1)).toThrow()
    expect(() => glassBlendRadius(NaN)).toThrow()
  })
  it('scopes identity by container and namespace', () => {
    const key = (container: string, namespace: string) =>
      glassIdentityKey({
        container: { id: container, spacing: 20 },
        morph: { id: 'same', namespace },
      } as GlassRegion)
    expect(key('a', 'n')).not.toBe(key('b', 'n'))
    expect(key('a', 'n')).not.toBe(key('a', 'm'))
    expect(key('a', 'n')).toBe(key('a', 'n'))
  })
})

it('keeps incompatible union fields separate while ignoring member identity', () => {
  const member = {
    container: { id: 'c', spacing: 20 },
    morph: { namespace: 'n', id: 'a' },
    union: 'u',
    shape: 'capsule',
    material: { variant: 'regular', interactive: false },
  } as GlassRegion
  expect(glassFieldKey(member)).toBe(
    glassFieldKey({ ...member, morph: { namespace: 'n', id: 'b' } }),
  )
  expect(glassFieldKey(member)).not.toBe(glassFieldKey({ ...member, union: 'v' }))
  expect(glassFieldKey(member)).not.toBe(
    glassFieldKey({ ...member, shape: { kind: 'roundedRectangle', cornerRadius: 10 } }),
  )
})

it('diagnoses incompatible explicit unions without rejecting members', () => {
  const a = {
    container: { id: 'c', spacing: 20 },
    namespace: 'n',
    union: 'u',
    shape: 'capsule',
    material: { variant: 'regular', interactive: false },
  } as GlassRegion
  expect(glassUnionDiagnostics([a, a])).toEqual([])
  expect(
    glassUnionDiagnostics([a, { ...a, shape: { kind: 'roundedRectangle', cornerRadius: 12 } }]),
  ).toEqual([expect.stringContaining('preserving separate')])
  expect(
    glassUnionDiagnostics([a, { ...a, material: { ...a.material, variant: 'clear' } }]),
  ).toHaveLength(1)
})

// Native gaps/neck widths from sequential measured-reference frames, not seek-by-frame.
it.each([
  [10, 2, 20],
  [20, 2, 32],
  [40, 2, 45.33],
  [80, 2, 61.33],
  [10, 4.5, 6],
  [20, 4.34, 26.67],
  [40, 17.09, 18.67],
  [80, 33.65, 28],
])('fits native neck at spacing %s, gap %s', (spacing, gap, nativeWidth) => {
  const members = [circle(-36 - gap / 2), circle(36 + gap / 2)]
  let lo = 0,
    hi = 72
  for (let i = 0; i < 40; i++) {
    const y = (lo + hi) / 2
    if (glassFieldDistance(0, y, members, glassBlendRadius(spacing)) < 0) lo = y
    else hi = y
  }
  expect(Math.abs(lo * 2 - nativeWidth) / nativeWidth).toBeLessThan(0.15)
})
it.each([
  [10, 4.5, 5.04, 3.59, 9.78],
  [20, 9.23, 10.57, 4.34, 9.78],
  [40, 18.53, 20.94, 17.09, 25.17],
  [80, 36.56, 41.92, 33.65, 41.78],
])(
  'puts spacing %s contact in the native frame bracket',
  (spacing, joined, separate, breakJoined, breakSeparate) => {
    const gap = glassBlendRadius(spacing) / 2
    expect(gap).toBeGreaterThan(joined)
    expect(gap).toBeLessThan(separate)
    // Separation sampling is sparse; require interval agreement with 15% tolerance.
    expect(gap).toBeGreaterThan(breakJoined * 0.85)
    expect(gap).toBeLessThan(breakSeparate * 1.15)
  },
)

it('bounds every blended member without moving sample coordinates', () => {
  const members = [circle(100), circle(180), circle(240)]
  const spec: SurfaceRenderSpec = {
    id: 'region:test-field',
    shaderAperture: true,
    frameX: 20,
    frameY: 20,
    frameWidth: 400,
    frameHeight: 300,
    sampleWidth: 440,
    sampleHeight: 340,
    sampleInsetX: 20,
    sampleInsetY: 20,
    radius: 36,
    materialMix: 1,
    materialProfile: 'chrome',
    shape: { first: members[0], members, blendRadius: 40, rimAlpha: 0, whiteMix: 0 },
  }
  const bounds = morphFieldSampleBounds(spec)!
  expect(bounds).toEqual([44, -56, 292, 152])
  const [left, top, width, height] = bounds
  for (let x = left - 2; x <= left + width + 2; x += 2) {
    for (const y of [top - 1, top + height + 1]) {
      expect(glassFieldDistance(x - 20, y - 20, members, 40)).toBeGreaterThan(20)
    }
  }
  expect(morphFieldSampleBounds({ ...spec, treatment: 'contextMenu' })).toBeUndefined()
  expect(morphFieldSampleBounds({ ...spec, shape: { ...spec.shape, members: [] } })).toBeUndefined()
})

it('blends button and menu press policies into the same optical field', () => {
  const member = {
    container: { id: 'mixed-buttons', spacing: 20 },
    shape: 'capsule',
    material: { variant: 'regular', interactive: true, press: 'button' },
  } as GlassRegion
  expect(glassFieldKey(member)).toBe(
    glassFieldKey({ ...member, material: { ...member.material, press: 'menu' } }),
  )
  expect(glassFieldKey(member)).not.toBe(
    glassFieldKey({ ...member, material: { ...member.material, tint: [1, 0, 0, 0.2] } }),
  )
})
