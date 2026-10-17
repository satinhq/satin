/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TAB_BAR_MATERIAL, TAB_PILL_MATERIAL, TAB_MATERIAL_LUMINANCES } from './tabMaterialModel.ts'
import { stableTabSelection } from './tabSelectionMaterial.ts'
import { TAB_SELECTION_MEASUREMENTS } from './tabSelectionMeasurements.test-fixture'

describe('Phase reference fit flat-constrained dense-input model', () => {
  it('exports per-appearance numerical material tables with no backdrop or tab keys', () => {
    for (const table of [TAB_BAR_MATERIAL, TAB_PILL_MATERIAL]) {
      expect(Object.keys(table).sort()).toEqual(['dark', 'light'])
      for (const model of Object.values(table)) {
        expect(Object.keys(model).sort()).toEqual(['contextSigma', 'field', 'knots', 'sigma'])
        expect(model.contextSigma).toBe(24)
        expect(model.field).toHaveLength(16)
        expect(model.knots).toHaveLength(5)
        expect(model.knots.every(k => k.length === 5 && k.every(Number.isFinite))).toBe(true)
        expect(model.field.every(Number.isFinite)).toBe(true)
      }
    }
    expect(stableTabSelection.length).toBe(1)
  })
  it('ships the measured coefficients and preserves native calibration colours', () => {
    const inputs = [
      [0, 0, 0],
      [32, 32, 32],
      [10, 132, 255],
      [216, 216, 216],
      [255, 255, 255],
    ]
    const names = [
      'tint-black',
      'tint-dark-grey',
      'tint-saturated-blue',
      'tint-light-grey',
      'tint-white',
    ]
    for (const [kind, table] of [
      ['bar', TAB_BAR_MATERIAL],
      ['pill', TAB_PILL_MATERIAL],
    ] as const) {
      for (const appearance of ['light', 'dark'] as const) {
        const report = JSON.parse(
          readFileSync(
            new URL(`../../../../../fixtures/fit/${appearance}-${kind}.json`, import.meta.url),
            'utf8',
          ),
        )
        expect(table[appearance].knots).toEqual(report.coefficients)
        expect(TAB_MATERIAL_LUMINANCES).toEqual(report.knots)
        for (const [i, rgb] of inputs.entries()) {
          const q = table[appearance].knots[i]
          const target = TAB_SELECTION_MEASUREMENTS.find(
            f => f.appearance === appearance && f.background === names[i],
          )![kind]
          const predicted = rgb.map(
            (v, c) => q[0] * v + q[1] * TAB_MATERIAL_LUMINANCES[i] * 255 + q[c + 2] * 255,
          )
          for (const [c, value] of predicted.entries()) expect(value).toBeCloseTo(target[c], 8)
        }
      }
    }
  })
})
