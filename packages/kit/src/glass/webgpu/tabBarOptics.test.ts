import { expect, it } from 'vitest'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import type { RasterSetup } from '../worker/protocol.ts'
import type { Target } from './passes.ts'
import { tabMaterialBounds, usesAreaMips, usesBarKernel } from './rasterMaterial.ts'
import {
  materialUniforms,
  selectionBaseUniforms,
  usesTabBarOptics,
  type ResultLayout,
} from './rasterUniforms.ts'
import { shaders } from './shaders.ts'

// The tab bar's optics (fitted to the native tab bar) belong to the tab bar. The morph engine's
// glass (buttons, a merged group, a button opening into its menu) and every other bar surface keep
// the optics the morph build was approved on: with the tab bar's optics an open menu's backdrop
// read sharper and brighter than in that build.

const capsule = { centerX: 60, centerY: 22, halfWidth: 60, halfHeight: 22, radius: 22 }
const surface = (overrides: Partial<SurfaceRenderSpec>): SurfaceRenderSpec => ({
  id: 'dock',
  frameX: 20,
  frameY: 20,
  frameWidth: 120,
  frameHeight: 44,
  radius: 22,
  sampleWidth: 160,
  sampleHeight: 84,
  sampleInsetX: 20,
  sampleInsetY: 20,
  shaderAperture: true,
  materialMix: 1,
  materialProfile: 'chrome',
  shape: { blendRadius: 0, rimAlpha: 1, whiteMix: 0, first: capsule },
  ...overrides,
})
const tabBar = surface({ id: 'dock' })
const toolbarButton = surface({ id: 'right' })
const glassButton = surface({ id: 'region:button' })
const openMenu = surface({
  id: 'region:menu',
  shape: {
    blendRadius: 20,
    rimAlpha: 1,
    whiteMix: 0,
    first: capsule,
    members: [capsule, { ...capsule, centerY: 120, halfHeight: 94 }],
  },
})

it('bounds tab fragment work around every moving capsule without shrinking its sampled backdrop', () => {
  const spec = surface({
    sampleInsetY: 128,
    sampleHeight: 512,
    tabSelection: { capsule, materialMix: 1, blurSigmaCssPx: 4, lensMix: 0 },
    shape: {
      ...tabBar.shape,
      blendRadius: 40,
      members: [capsule, { ...capsule, centerY: 200, halfHeight: 30 }],
    },
  })
  expect(tabMaterialBounds(spec)).toEqual([-54, 54, 268, 378])
  expect(spec.sampleHeight).toBe(512)
  expect(spec.sampleInsetY).toBe(128)
  expect(tabMaterialBounds(openMenu)).toBeUndefined()
  expect(tabMaterialBounds(toolbarButton)).toBeUndefined()
})

function uniformsFor(spec: SurfaceRenderSpec) {
  const pyramid = { width: 80, height: 42 } as Target
  const layout = {
    spec,
    appearance: 'dark',
    resolution: 1,
    sampleWidth: spec.sampleWidth,
    sampleHeight: spec.sampleHeight,
  } as ResultLayout
  return materialUniforms(layout, {} as RasterSetup, pyramid, 0.5)
}

it('gives the tab bar its optics and keeps every other bar surface on the morph build optics', () => {
  for (const spec of [tabBar, toolbarButton, glassButton, openMenu])
    expect(usesBarKernel(spec)).toBe(true)
  expect(usesTabBarOptics(tabBar)).toBe(true)
  expect(uniformsFor(tabBar).uTabBarOptics).toEqual([1, 1])
  for (const spec of [toolbarButton, glassButton, openMenu]) {
    expect(usesTabBarOptics(spec)).toBe(false)
    expect(uniformsFor(spec).uTabBarOptics).toEqual([0, 1])
  }
})

it('builds every bar surface on the same size-independent pyramid (areaMips.ts)', () => {
  for (const spec of [tabBar, toolbarButton, glassButton, openMenu])
    expect(usesAreaMips(spec)).toBe(true)
})

it('builds the area-average pyramid only for a surface the bar kernel draws', () => {
  expect(usesAreaMips(surface({ id: 'dock', materialProfile: 'menu' }))).toBe(false)
  expect(usesAreaMips(surface({ id: 'dock', variant: 'clear' }))).toBe(false)
  expect(usesAreaMips(surface({ id: 'dock', treatment: 'sheet' }))).toBe(false)
})

it('packs the bar uniforms in the order the bar shader declares their slots', () => {
  const struct = /struct Parameters \{([^}]*)\}/.exec(shaders.bar.wgsl)![1]
  const slots = [...struct.matchAll(/(\w+)_slot: vec4<f32>/g)].map(match => match[1])
  expect(slots).toEqual([...shaders.bar.uniforms, 'kernelScale'])
  expect(shaders.bar.uniforms.slice(-5)).toEqual([
    'uTabBarOptics',
    'uControlRim',
    'uControlSpecular',
    'uControlSize',
    'uControlTransmission',
  ])
})

it('switches each tab bar optic in the bar shader on uTabBarOptics', () => {
  const wgsl = shaders.bar.wgsl
  expect(wgsl).toContain('return (global.uTabBarOptics_slot.x > 0.5f);')
  // Full-resolution detail: other surfaces fall through to the level-0 pyramid taps.
  expect(wgsl).toContain('if ((level_2 <= 0f) && tabBarOptics()) {')
  expect(wgsl.match(/materialSharp\(/g)).toHaveLength(2)
  // Wide fill is shared by regular controls; the independently measured search row opts out.
  expect(wgsl).toContain('if (global.uTabBarOptics_slot.y > 0.5)')
  expect(wgsl).toContain('fill = materialFill(uv_7, lod);')
  expect(wgsl).toContain('fill = materialTwoTapFill(uv_7, lod);')
  expect(
    uniformsFor(surface({ id: 'region:search', materialProfile: 'searchField' })).uTabBarOptics,
  ).toEqual([0, 0])
  // Highlight band: the 0.25 floor stays everywhere but the tab bar.
  expect(wgsl).toContain('select((0.25f + (0.75f * _e135)), _e135, tabBarOptics())')
  // Hardware interior shading is shared by all regular controls.
  expect(wgsl).toContain('P = P * (1.0 - controlInteriorShade(signedPt_7, n_9))')
})

it('hands the resting selection to a separately rendered lens without changing its rest material', () => {
  const pill = surface({
    tabSelection: {
      capsule,
      materialMix: 1,
      blurSigmaCssPx: 4,
      lensMix: 0,
    },
  })
  const layout = {
    spec: pill,
    appearance: 'dark',
    resolution: 1,
    sampleWidth: 160,
    sampleHeight: 84,
  } as ResultLayout
  const target = { width: 160, height: 84 } as Target
  expect(selectionBaseUniforms(layout, target).uMaterialMix).toBe(1)
  layout.spec = {
    ...pill,
    tabSelection: { ...pill.tabSelection!, restMix: 0 },
  } as SurfaceRenderSpec
  expect(selectionBaseUniforms(layout, target).uMaterialMix).toBe(0)
})

it('registers fractional bar contours on output pixels independently of pyramid rounding', () => {
  for (const resolution of [2, 3])
    for (const sampleWidth of [124.5, 124 + 1 / 3, 160]) {
      const spec = surface({ id: 'region:button', sampleWidth })
      const layout = {
        spec,
        appearance: 'dark',
        resolution,
        sampleWidth,
        sampleHeight: spec.sampleHeight,
      } as ResultLayout
      const pyramid = { width: 256, height: 128 } as Target
      const values = materialUniforms(layout, {} as RasterSetup, pyramid, 0.5)
      const filterScale = values.__filterScale as readonly number[]
      // The pixel centre at x=19.75 pt must stay there; coarse source storage
      // previously moved it inward, attenuating the half-point exterior line.
      expect((19.75 / sampleWidth) * filterScale[0]! * sampleWidth).toBeCloseTo(19.75, 10)
      expect(filterScale).toEqual([1, 1])
    }
})
