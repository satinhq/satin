import { describe, expect, it } from 'vitest'
import { createRenderSpecs, createSurfaceClipPath, type RuntimeGeometry } from './renderSpecs.ts'
import { GLASS_OVERSCAN_X_PX, GLASS_OVERSCAN_Y_PX } from './lens/Scene.tsx'
import { MENU_ENVELOPE, sampleMenuMotion } from './lens/menuMotion.ts'

const geometry: RuntimeGeometry = {
  bottomInset: 34,
  physicalTopInset: 62,
  circleSize: 44,
  circleY: 8,
  dockHeight: 60,
  dockRadius: 30,
  dockWidth: 370,
  dockX: 16,
  dockY: 706,
  height: 812,
  leftX: 16,
  rightX: 342,
  surfaceMode: 'chrome',
  width: 402,
}

// Moved from lens/directPresentLayout.test.ts with the render specs. The band, clip-band
// and mirror cases were removed with the WebGL runtime they tested.
describe('measured-reference lens-split geometry', () => {
  it('keeps dock and both circles in stable render order', () => {
    const specs = createRenderSpecs(geometry)
    expect(specs.map(spec => spec.id)).toEqual(['dock', 'left', 'right'])
  })

  it('keeps bridge overscan on every retained region texture', () => {
    for (const spec of createRenderSpecs(geometry)) {
      expect(spec.sampleWidth - spec.frameWidth).toBe(GLASS_OVERSCAN_X_PX * 2)
      expect(spec.sampleHeight - spec.frameHeight).toBe(GLASS_OVERSCAN_Y_PX * 2)
    }
  })

  it('adds the resting selection to the dock source without another surface texture', () => {
    const specs = createRenderSpecs({ ...geometry, tabBarSelectedIndex: 2 })
    expect(specs.map(spec => spec.id)).toEqual(['dock', 'left', 'right'])
    expect(specs[0].tabSelection).toMatchObject({
      blurSigmaCssPx: 4.5,
      capsule: { centerX: 223, centerY: 31, halfHeight: 26, halfWidth: 48, radius: 26 },
      materialMix: 1,
    })
    expect(specs.slice(1).every(spec => spec.tabSelection === undefined)).toBe(true)
  })

  it('omits the selection pass when the tab bar is not rendered', () => {
    expect(createRenderSpecs(geometry).every(spec => spec.tabSelection === undefined)).toBe(true)
  })

  it('keeps a smooth union as two CSS subpaths until its SDF connects', () => {
    const rest = createRenderSpecs(geometry, 'light', 'merge')[0]
    const merged = createRenderSpecs(geometry, 'light', 'merge', {
      ...rest.shape,
      blendRadius: 4,
      first: { ...rest.shape.first, centerX: 136 },
      second: { ...rest.shape.second!, centerX: 196 },
    })[0]

    expect(createSurfaceClipPath(rest).match(/ Z/g)).toHaveLength(2)
    expect(createSurfaceClipPath(merged).match(/ Z/g)).toHaveLength(1)
  })

  it('keeps the menu circle and panel in one retained right RenderTexture', () => {
    const frame = sampleMenuMotion('open', 0.2, 'light', false)
    const specs = createRenderSpecs(geometry, 'light', 'none', undefined, true, frame)
    const right = specs.find(spec => spec.id === 'right')!

    expect(specs.map(spec => spec.id)).toEqual(['dock', 'left', 'right'])
    expect(right.frameWidth).toBe(MENU_ENVELOPE.frameWidth)
    expect(right.frameHeight).toBe(MENU_ENVELOPE.frameHeight)
    expect(right.shaderAperture).toBe(true)
    expect(right.shape.second).toBeDefined()
    expect(createSurfaceClipPath(right)).toMatch(/^path\("M /)
  })

  it('contours menu surfaces around each native center instead of a shared midpoint', () => {
    const settled = sampleMenuMotion('open', 1, 'light', false)
    const frame = { ...settled, shape: { ...settled.shape, blendRadius: 0.001 } }
    const right = createRenderSpecs(geometry, 'light', 'none', undefined, true, frame).find(
      spec => spec.id === 'right',
    )!
    const coordinates = [
      ...createSurfaceClipPath(right).matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g),
    ]
    const yValues = coordinates.map(match => Number(match[2]))

    // The shader owns a 1pt outside contour; the DOM aperture admits it.
    expect(Math.min(...yValues)).toBeCloseTo(20, 1)
    // Fresh iOS 27 reference height is 188 pt, beginning at the same top edge.
    expect(Math.max(...yValues)).toBeCloseTo(210, 1)
  })

  it('preserves every dock rendering input throughout menu open and close', () => {
    const tabGeometry = { ...geometry, tabBarSelectedIndex: 2 }
    const baseline = createRenderSpecs(tabGeometry)[0]
    for (const direction of ['open', 'close'] as const) {
      for (let seconds = 0; seconds <= 0.6; seconds += 1 / 120) {
        const frame = sampleMenuMotion(direction, seconds, 'light', false)
        expect(createRenderSpecs(tabGeometry, 'light', 'none', undefined, true, frame)[0]).toEqual(
          baseline,
        )
      }
    }
  })
})
