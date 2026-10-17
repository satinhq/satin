import { expect, it } from 'vitest'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { popoverArrowUniform, presentationUniforms } from './presentationMaterial.ts'
import { shaders } from './shaders.ts'

const popover = (popoverArrow?: SurfaceRenderSpec['popoverArrow']) =>
  ({
    id: 'region:confirmation',
    treatment: 'confirmation',
    variant: 'regular',
    popoverArrow,
    frameX: 48,
    frameY: 48,
    frameWidth: 240,
    frameHeight: 214.5,
    radius: 36,
    sampleWidth: 336,
    sampleHeight: 310.5,
    sampleInsetX: 48,
    sampleInsetY: 48,
    shaderAperture: true,
    materialMix: 1,
    materialProfile: 'chrome',
    shape: {
      blendRadius: 0,
      rimAlpha: 0,
      whiteMix: 0,
      first: { centerX: 120, centerY: 107.25, halfWidth: 120, halfHeight: 107.25, radius: 36 },
    },
    debug: '',
  }) as SurfaceRenderSpec

it('draws a confirmation as its own near-opaque treatment, not the regular glass', () => {
  const values = presentationUniforms(popover(), 'light')
  expect(values.uSheetTreatment).toBe(4)
  for (const name of shaders.presentation.uniforms) expect(values).toHaveProperty(name)
})

it('draws the popover arrow in the body field, 14 pt beyond the edge it points from', () => {
  // native reference reference: the tip of a row-sourced arrow sits 14 pt below the body.
  expect(popoverArrowUniform(popover({ edge: 'bottom', x: 120, scale: 1 }))).toEqual([
    168, 276.5, 1, 1,
  ])
  expect(popoverArrowUniform(popover({ edge: 'top', x: 60, scale: 1 }))).toEqual([108, 34, -1, 1])
  // Mid-entrance the body is measured scaled; the wedge scales with it.
  expect(popoverArrowUniform(popover({ edge: 'bottom', x: 60, scale: 0.5 }))).toEqual([
    108, 269.5, 1, 0.5,
  ])
  expect(popoverArrowUniform(popover())).toEqual([0, 0, 0, 0])
  expect(shaders.presentation.wgsl).toContain('smoothUnion(body, popoverArrowDistance(point_5)')
})
