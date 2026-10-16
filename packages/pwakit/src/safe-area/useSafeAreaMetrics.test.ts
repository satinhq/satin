import { describe, expect, it } from 'vitest'
import { safeAreaMetricsEqual, type SafeAreaMetrics } from './useSafeAreaMetrics.ts'
import { concentricRadius, resolveDisplayCornerMetrics } from './displayCorners.ts'

describe('display-concentric corners', () => {
  it('uses the measured display across orientation and distinguishes identical point sizes by DPR', () => {
    expect(resolveDisplayCornerMetrics({ width: 440, height: 956, scale: 3 }).radius).toBe(62)
    expect(resolveDisplayCornerMetrics({ width: 956, height: 440, scale: 3 }).radius).toBe(62)
    expect(resolveDisplayCornerMetrics({ width: 414, height: 896, scale: 2 }).radius).toBe(41.5)
    expect(resolveDisplayCornerMetrics({ width: 414, height: 896, scale: 3 }).radius).toBe(39)
  })

  it('reports model ambiguity and unknown displays without claiming exact identification', () => {
    expect(resolveDisplayCornerMetrics({ width: 820, height: 1180, scale: 2 })).toEqual({
      radius: 18,
      range: [18, 25],
      source: 'ambiguous',
    })
    expect(resolveDisplayCornerMetrics({ width: 441, height: 957, scale: 3 })).toEqual({
      radius: 0,
      range: [0, 0],
      source: 'fallback',
    })
    expect(resolveDisplayCornerMetrics({ width: 466, height: 678, scale: 3 }).source).toBe(
      'fallback',
    )
  })

  it('keeps nested corners concentric, clamps consumed radii, and rejects invalid geometry', () => {
    expect(concentricRadius(62, 8)).toBe(54)
    expect(concentricRadius(concentricRadius(62, 8), 4)).toBe(concentricRadius(62, 12))
    expect(concentricRadius(18, 24)).toBe(0)
    expect(() => concentricRadius(Number.NaN, 8)).toThrow()
    expect(() => concentricRadius(62, -8)).toThrow()
  })
})

function metrics(): SafeAreaMetrics {
  return {
    coordinateSpacesReconcile: true,
    physicalCoordinateSpace: 'calibrated-screen',
    insets: { top: 0, right: 0, bottom: 34, left: 0 },
    layoutViewport: { width: 402, height: 812 },
    physicalInsets: { top: 62, right: 0, bottom: 34, left: 0 },
    physicalSafeFrame: { width: 402, height: 778 },
    safeFrame: { width: 402, height: 778 },
    screen: { width: 402, height: 874 },
    standalone: true,
    visualViewport: {
      width: 402,
      height: 812,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
    },
  }
}

describe('safe-area metric equality', () => {
  it('bails out for structurally equal metric snapshots', () => {
    expect(safeAreaMetricsEqual(metrics(), metrics())).toBe(true)
  })

  it('detects a nested sensor change', () => {
    const changed = metrics()
    changed.visualViewport = { ...changed.visualViewport, height: 506 }

    expect(safeAreaMetricsEqual(metrics(), changed)).toBe(false)
  })
})

import { reconcileWindowGeometry } from './useSafeAreaMetrics.ts'

describe('measured-reference window comparison spaces', () => {
  it('retains the Foundation 00 portrait calibration bit for bit', () => {
    const baseline = metrics()
    const actual = reconcileWindowGeometry(
      baseline.insets,
      baseline.layoutViewport,
      baseline.screen,
      true,
    )
    expect(actual.physicalInsets).toEqual(baseline.physicalInsets)
    expect(actual.physicalSafeFrame).toEqual(baseline.physicalSafeFrame)
    expect(actual.safeFrame).toEqual(baseline.safeFrame)
    expect(actual.physicalCoordinateSpace).toBe('calibrated-screen')
  })
  it.each([
    [409, 971, 0, 10],
    [997, 1170, 0, 10],
    [511, 1243, 22, 10],
    [647, 1221, 0, 10],
    [375, 843, 0, 10],
    [685, 688, 0, 10],
  ])('does not fabricate screen deficits in a %i x %i window', (width, height, top, bottom) => {
    const insets = { top, right: 0, bottom, left: 0 }
    const actual = reconcileWindowGeometry(
      insets,
      { width, height },
      { width: 1032, height: 1376 },
      true,
    )
    expect(actual.physicalInsets).toEqual(insets)
    expect(actual.physicalSafeFrame).toEqual(actual.safeFrame)
    expect(actual.physicalCoordinateSpace).toBe('layout-viewport')
  })
  it('matches the recorded full-screen landscape coordinate pair without orientation input', () => {
    const actual = reconcileWindowGeometry(
      { top: 0, right: 0, bottom: 20, left: 0 },
      { width: 1376, height: 1000 },
      { width: 1032, height: 1376 },
      true,
    )
    expect(actual.physicalInsets.top).toBe(32)
    expect(actual.physicalSafeFrame).toEqual({ width: 1376, height: 980 })
  })
  it.each([
    [{ width: 744, height: 1101 }, 32],
    [{ width: 1133, height: 712 }, 32],
  ])('reconciles the installed iPad mini viewport %j', (layout, top) => {
    const actual = reconcileWindowGeometry(
      { top: 0, right: 0, bottom: 20, left: 0 },
      layout,
      { width: 744, height: 1133 },
      true,
    )
    expect(actual.physicalCoordinateSpace).toBe('calibrated-screen')
    expect(actual.physicalInsets.top).toBe(top)
  })
  it('does not use screen calibration in a browser tab or hide the double-inset failure', () => {
    const baseline = metrics()
    expect(
      reconcileWindowGeometry(baseline.insets, baseline.layoutViewport, baseline.screen, false)
        .physicalInsets.top,
    ).toBe(0)
    const mismatch = reconcileWindowGeometry(
      { ...baseline.insets, top: 62 },
      baseline.layoutViewport,
      baseline.screen,
      true,
    )
    expect(mismatch.safeFrame).not.toEqual(mismatch.physicalSafeFrame)
  })
  it('retains the measured iPad status boundary in both full-window orientations', () => {
    for (const layout of [
      { width: 1024, height: 1334 },
      { width: 1366, height: 992 },
    ]) {
      const actual = reconcileWindowGeometry(
        { top: 0, right: 0, bottom: 20, left: 0 },
        layout,
        { width: 1024, height: 1366 },
        true,
      )
      expect(actual.physicalInsets.top).toBe(32)
      expect(actual.safeFrame.height).toBe(layout.height - 20)
    }
  })
})

it('reconciles the recorded standalone Pro Max viewport without calibrating other windows', () => {
  const insets = { top: 0, right: 0, bottom: 34, left: 0 }
  const actual = reconcileWindowGeometry(
    insets,
    { width: 440, height: 894 },
    { width: 440, height: 956 },
    true,
  )
  expect(actual.physicalInsets.top).toBe(62)
  expect(actual.safeFrame).toEqual({ width: 440, height: 860 })
  expect(actual.physicalSafeFrame).toEqual(actual.safeFrame)
  expect(
    reconcileWindowGeometry(insets, { width: 440, height: 893 }, { width: 440, height: 956 }, true)
      .physicalCoordinateSpace,
  ).toBe('layout-viewport')
})

describe('full-bleed coordinate migration', () => {
  it.each([
    [440, 956, 62, 34],
    [1032, 1376, 32, 20],
    [1376, 1032, 32, 20],
    [956, 440, 0, 21],
  ])('keeps a full %i x %i viewport in screen coordinates', (width, height, top, bottom) => {
    const insets = { top, right: 0, bottom, left: 0 }
    const result = reconcileWindowGeometry(
      insets,
      { width, height },
      { width: Math.min(width, height), height: Math.max(width, height) },
      true,
    )
    expect(result.physicalCoordinateSpace).toBe('calibrated-screen')
    expect(result.physicalInsets).toEqual(insets)
    expect(result.physicalSafeFrame).toEqual(result.safeFrame)
    expect(result.physicalInsets.top - insets.top).toBe(0)
  })
  it('preserves the safe frame when the recorded phone viewport grows after launch', () => {
    const screen = { width: 440, height: 956 }
    const reduced = reconcileWindowGeometry(
      { top: 0, right: 0, bottom: 34, left: 0 },
      { width: 440, height: 894 },
      screen,
      true,
    )
    const full = reconcileWindowGeometry(
      { top: 62, right: 0, bottom: 34, left: 0 },
      screen,
      screen,
      true,
    )
    expect(full.safeFrame).toEqual(reduced.safeFrame)
    expect(full.physicalInsets).toEqual(reduced.physicalInsets)
  })
})
