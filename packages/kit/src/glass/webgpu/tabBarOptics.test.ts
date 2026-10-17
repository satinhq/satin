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
  expect(uniformsFor(tabBar).uTabBarOptics).toBe(1)
  for (const spec of [toolbarButton, glassButton, openMenu]) {
    expect(usesTabBarOptics(spec)).toBe(false)
    expect(uniformsFor(spec).uTabBarOptics).toBe(0)
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
  expect(shaders.bar.uniforms.at(-1)).toBe('uTabBarOptics')
})

it('switches each tab bar optic in the bar shader on uTabBarOptics', () => {
  const wgsl = shaders.bar.wgsl
  expect(wgsl).toContain('return (global.uTabBarOptics_slot.x > 0.5f);')
  // Full-resolution detail: other surfaces fall through to the level-0 pyramid taps.
  expect(wgsl).toContain('if ((level_2 <= 0f) && tabBarOptics()) {')
  expect(wgsl.match(/materialSharp\(/g)).toHaveLength(2)
  // Wide fill: four taps at a whole level for the tab bar, two at the fractional level otherwise.
  expect(wgsl).toMatch(
    /if \(tabBarOptics\(\)\) \{\s+fill = materialFill\(uv_7, lod\);\s+\} else \{\s+fill = materialTwoTapFill\(uv_7, lod\);/,
  )
  // Highlight band: the 0.25 floor stays everywhere but the tab bar.
  expect(wgsl).toContain('select((0.25f + (0.75f * _e135)), _e135, tabBarOptics())')
  // Inner shade: none outside the tab bar.
  expect(wgsl).toContain('select(0f, innerShade.x, tabBarOptics())')
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
