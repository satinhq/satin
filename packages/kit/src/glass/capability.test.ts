import { describe, expect, it } from 'vitest'
import { resolveGlassCapability } from './capability.ts'

describe('glass raster-prerequisite capability gate', () => {
  it('keeps the complete CSS baseline while the render test is pending or failed', () => {
    expect(
      resolveGlassCapability({
        forcedBaseline: false,
        reducedTransparency: false,
        renderTest: 'pending',
      }),
    ).toEqual({ reason: 'render-test-pending', state: 'baseline' })
    expect(
      resolveGlassCapability({
        forcedBaseline: false,
        reducedTransparency: false,
        renderTest: 'failed',
      }),
    ).toEqual({ reason: 'render-test-failed', state: 'baseline' })
  })

  it('enables displacement only after the foreground render test passes', () => {
    expect(
      resolveGlassCapability({
        forcedBaseline: false,
        reducedTransparency: false,
        renderTest: 'passed',
      }),
    ).toEqual({ reason: 'raster-probe-passed', state: 'displacement' })
  })

  it('lets force-disable and Reduced Transparency override a passing render test', () => {
    expect(
      resolveGlassCapability({
        forcedBaseline: true,
        reducedTransparency: false,
        renderTest: 'passed',
      }),
    ).toEqual({ reason: 'forced-baseline', state: 'baseline' })
    expect(
      resolveGlassCapability({
        forcedBaseline: false,
        reducedTransparency: true,
        renderTest: 'passed',
      }),
    ).toEqual({ reason: 'reduced-transparency', state: 'baseline' })
  })
})
