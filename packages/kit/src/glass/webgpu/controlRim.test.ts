import { expect, it } from 'vitest'
import {
  CONTROL_SPECULAR,
  CONTROL_INTERIOR_SHADE,
  CONTROL_RIM_LOW_LUMA_GAIN,
  CONTROL_RIM_HIGH_LUMA_GAIN,
  controlRimUniform,
  controlSizeResponse,
  controlShadowScale,
  controlOpticalScale,
  controlTransmission,
} from './controlRim.ts'
import recipes from '../lens/materialGlassRecipes.json'
import { shaders } from './shaders.ts'

// Independent reference samples are native default-setting screenshot pixels at DPR 2.
// The software checks supplement, rather than replace, paired installed captures.
function rimPixel(appearance: 'light' | 'dark', background: number, outsidePt: number, nx: number) {
  const [support, opacity, darkAppearance, vertical] = controlRimUniform(appearance)
  const b = background / 255
  const response =
    opacity +
    CONTROL_RIM_LOW_LUMA_GAIN * Math.max(0.5 - b, 0) +
    CONTROL_RIM_HIGH_LUMA_GAIN[darkAppearance] * Math.max(2 * b - 1, 0)
  const alpha = Math.min(
    1,
    response * Math.max(0, 1 - outsidePt / support) * (nx * nx + vertical * (1 - nx * nx)),
  )
  const light = Math.max(0, b * (b - 0.5))
  const dark = 0.6 * Math.max(b - 0.5, 0) * (1 - b)
  return (
    (light * (1 - darkAppearance) + dark * darkAppearance) * 255 * alpha + background * (1 - alpha)
  )
}

it('reproduces the hardware exterior line and clears its next physical pixel', () => {
  for (const [appearance, background, near, far] of [
    ['light', 128, 64, 128],
    ['dark', 128, 64, 128],
    ['light', 255, 188, 254],
    ['dark', 255, 113, 254],
  ] as const) {
    expect(Math.abs(rimPixel(appearance, background, 0.25, 1) - near)).toBeLessThan(2)
    expect(Math.abs(rimPixel(appearance, background, 0.75, 1) - far)).toBeLessThan(2)
  }
})

it('does not invent a black-room outline or a left/right light source', () => {
  for (const appearance of ['light', 'dark'] as const)
    for (const nx of [0, 0.25, 0.5, 1]) {
      expect(rimPixel(appearance, 0, 0.25, nx)).toBe(0)
      expect(rimPixel(appearance, 192, 0.25, nx)).toBe(rimPixel(appearance, 192, 0.25, -nx))
    }
  expect(rimPixel('dark', 128, 0.25, 0)).toBe(128)
  expect(Math.abs(rimPixel('light', 128, 0.25, 0) - 109)).toBeLessThan(2)
})

it('matches hardware face levels before directional edge attenuation', () => {
  for (const [appearance, values] of [
    ['light', [133, 195, 253]],
    ['dark', [32, 134, 185]],
  ] as const) {
    const recipe = recipes[`${appearance}-bar`]
    for (const [i, background] of [0, 128, 255].entries()) {
      const b = background / 255
      const adjusted = b * (1 - b * recipe.colour[0]!)
      const face = recipe.face[0]!
      const output = (adjusted * (face[0]! + face[1]! + face[2]!) + face[3]!) * 255
      expect(Math.abs(output - values[i]!)).toBeLessThan(1)
    }
  }
})

it('separates the greyer sides and top band from the bright specular', () => {
  // White/light native side at 3 pt inside: ~248; top at 8 pt: ~249; bottom at 8 pt: 253.
  expect(Math.abs(253 * (1 - CONTROL_INTERIOR_SHADE[0]) - 248)).toBeLessThan(1)
  expect(Math.abs(253 * (1 - CONTROL_INTERIOR_SHADE[2]) - 249)).toBeLessThan(1)
  const [support, amount, diffuseSupport, diffuseAmount] = CONTROL_SPECULAR
  // Compare fully covered native bottom pixels. At 0.25 pt the screenshot
  // includes contour antialiasing, which this point-sample colour calculation
  // does not model; that peak remains checked by the installed image gate.
  for (const [depth, light, dark] of [
    [0.75, 155, 62],
    [1.25, 140, 43],
    [2.25, 136, 38],
  ]) {
    const h =
      amount * Math.max(0, 1 - depth / support) +
      diffuseAmount * Math.max(0, 1 - depth / diffuseSupport)
    for (const [interior, peak] of [
      [133, light],
      [32, dark],
    ]) {
      // The specular is applied after the vertical interior attenuation.
      const t = Math.min(1, depth)
      const ramp = t * t * (3 - 2 * t)
      const shaded = interior * (1 - CONTROL_INTERIOR_SHADE[1] * ramp)
      expect(Math.abs(shaded + h * (37.5105 - 0.0882 * shaded) - peak)).toBeLessThan(4.1)
    }
  }
})

it('wires the measured model to the active bar kernel and leaves menu optics separate', () => {
  expect(shaders.bar.wgsl).toContain('H = controlSpecular(signedPt_7, n_9)')
  expect(shaders.bar.wgsl).toContain('P = P * (1.0 - controlInteriorShade(signedPt_7, n_9))')
  expect(shaders.bar.wgsl).toContain('normal.x * normal.x')
  expect(shaders.bar.wgsl).not.toContain('contour = dot(')
  expect(shaders.menu.wgsl).not.toContain('controlInteriorShade')
})

it('matches the hardware size response without using corner radius', () => {
  for (const [height, white, grey] of [
    [44, 185, 134],
    [62, 185, 134],
    [80, 159, 127],
  ]) {
    const amount = controlSizeResponse('dark', 120, height) * 255
    for (const [background, original, measured] of [
      [1, 185, white],
      [128 / 255, 134, grey],
    ])
      expect(Math.abs(original - amount * background ** 2 - measured)).toBeLessThan(1)
    expect(controlSizeResponse('light', 120, height)).toBe(0)
    expect(controlSizeResponse('dark', height, 120)).toBe(controlSizeResponse('dark', 120, height))
  }
})

it('matches hardware broad exterior shadow independently of the narrow rim', () => {
  for (const [appearance, height, native] of [
    ['light', 44, 252],
    ['dark', 62, 252],
    ['light', 80, 248],
    ['dark', 80, 246],
  ] as const) {
    const r = recipes[`${appearance}-bar`]
    const s = 2 * r.units[0]! + r.units[2]! - r.shadowOffset[1]!
    const x = 4 * Math.max(0, Math.min(1, 0.5 + (0.25 * s) / r.shadowResponse[0]!)) - 2
    const x2 = x * x
    const response = Math.max(
      0,
      Math.min(
        1,
        (((0.002954483 * x2 - 0.034454346) * x2 + 0.16821289) * x2 - 0.5605469) * x + 0.5,
      ),
    )
    const predicted =
      255 * (1 - r.shadowResponse[1]! * response * controlShadowScale(appearance, 120, height))
    expect(Math.abs(predicted - native)).toBeLessThan(1)
  }
})

it('scales transmission depth with the hardware control short side, anchored at the tab', () => {
  // Native stripe phase fits: circle, tab and rectangle. Fits are in points.
  const samples = [
    [44, 18.95, 11.54],
    [62, 27.98, 15.01],
    [80, 37.11, 20.22],
  ]
  for (const [height, amplitude, support] of samples) {
    const scale = controlOpticalScale(120, height!)
    expect(Math.abs(31 * 0.8991230603 * scale - amplitude!)).toBeLessThan(2)
    expect(Math.abs((15.5 / 0.9548267283) * scale - support!)).toBeLessThan(1.3)
    expect(controlOpticalScale(height!, 120)).toBe(scale)
  }
  expect(controlOpticalScale(274, 62)).toBe(1)
})

it('registers the independent native transmission amplitude and support fits', () => {
  for (const [appearance, height, amplitude, support] of [
    ['light', 44, 19.227, 11.419],
    ['light', 80, 38.959, 18.841],
    ['dark', 44, 18.95, 11.54],
    ['dark', 62, 28.03, 15.012],
    ['dark', 80, 37.11, 20.22],
  ] as const) {
    const row = controlTransmission(appearance, 274, height)
    expect(row[0]).toBeCloseTo(amplitude, 2)
    expect(row[1]).toBeCloseTo(support, 2)
    expect(controlTransmission(appearance, height, 274)).toEqual(row)
  }
  expect(shaders.bar.wgsl).toContain('s = (_e105 + transmission.z) * 15.5 / transmission.y')
})
