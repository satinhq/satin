import { expect, it } from 'vitest'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { liftLighting } from './rasterUniforms.ts'
import { shaders } from './shaders.ts'

// A held Toggle/Slider thumb is the tab selection's lens with its own fitted parameters, not a
// second material. Native (control-lift r3, 3x native reference stills) samples outward along the capsule
// normal (~3.5 pt at 9 pt inside), so the track reads slightly minified with the row showing as dark
// bands inside the rim; the tab lens pulls inward (magnifies) with an outward edge band.
const spec = {} as SurfaceRenderSpec

it('gives the control lens an outward field and leaves the tab lens unchanged', () => {
  const tab = liftLighting({ amount: 1, source: 'transmissive' }, spec, 'dark')
  expect(tab.lensMap).toEqual([9, 36, -17.5])
  expect(tab.fieldGain).toEqual([1, 1, 1, 1])
  // r4 (3x Catalyst vs 3x native reference): only the control rim has the dark outer line and a device-pixel edge.
  expect([tab.rimLineGain, tab.rimLineWidthPt]).toEqual([0, 0])
  // r7: only the control lens has native's top inner shadow.
  expect(tab.topShade[0]).toBe(0)
  for (const appearance of ['light', 'dark'] as const) {
    const control = liftLighting(
      { amount: 1, source: 'transmissive', profile: 'control' },
      spec,
      appearance,
    )
    expect(control.lensMap[0]).toBeLessThan(0)
    expect(control.lensMap[2]).toBe(0)
    // The broad map fades out at the medial axis: a Slider's 6 pt track passes the lens centre.
    expect(control.lensMap[3]).toBeGreaterThan(0)
    expect(control.fieldGain[0]).toBe(0)
    expect(control.diffusionSigmaPt).toBe(0)
    expect(control.rimLineGain).toBeGreaterThan(0)
    expect(control.rimLineWidthPt).toBeGreaterThan(0)
    // r7 (3x native reference stills, Toggle and Slider, light and dark): the upper half darkens below the
    // top rim, deepest ≈ 9 pt in; the lower half does not.
    expect(control.topShade[0]).toBeLessThan(0)
    expect(control.topShade[1]).toBeGreaterThan(6)
    expect(control.topShade[1]).toBeLessThan(12)
  }
})

it('packs the shared-lift uniforms in the order the hand-maintained shader declares them', () => {
  const struct = /struct Parameters \{([^}]*)\}/.exec(shaders.sharedLift.wgsl)![1]
  const slots = [...struct.matchAll(/(\w+)_slot: vec4<f32>/g)].map(match => match[1])
  expect(slots).toEqual([...shaders.sharedLift.uniforms])
  expect(shaders.sharedLift.wgsl).toContain('global.uLensMap_slot.x * _e217.x')
  expect(shaders.sharedLift.wgsl).toContain('(global.uLensCrestVertical_slot.w > 0f)')
  expect(shaders.sharedLift.wgsl).toContain('(global.uLensMap_slot.w > 0f)')
  // The top shade follows depth below the top edge, so it never curls through the caps.
  expect(shaders.sharedLift.wgsl).toContain('((global.uShape_slot.w + p.y) - topShade.y)')
})

it('moves tab ink with the lens rim, never by travel direction', () => {
  // Owner, Oct 10: a sign(travel) fold shifted ink up to 6.8 pt near the leading cap. Glyph
  // halves left the lens, and the fold flipped off whenever the drag paused.
  const wgsl = shaders.sharedLift.wgsl
  const ink = wgsl.slice(wgsl.indexOf('fn tabInkPlane('), wgsl.indexOf('struct Parameters'))
  expect(ink).not.toContain('uTravelWarpPt')
  expect(ink).not.toContain('sign(')
  // The rim displacement is the same edge field that bends the backdrop.
  expect(wgsl).toContain('let rimShift = ((outward * (edgeRefraction - edgeMap))')
  expect(wgsl).toContain('tabGlyphInk(point_3, p, rimShift, outward, inside)')
})
