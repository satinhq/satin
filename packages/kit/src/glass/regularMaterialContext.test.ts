import { describe, expect, it } from 'vitest'
import { LazyRegularMaterialContext, RegularMaterialContext } from './regularMaterialContext'
import { regularTriggerRegime } from './regularTriggerMaterial'

describe('regular material source ownership', () => {
  it('integrates a clipped disc without duplicating edge colours', () => {
    const width = 80,
      height = 90,
      data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        data.set([x * 3, y * 2, (x * 13 + y * 7) % 256, 255], i)
      }
    const context = new RegularMaterialContext({ width, height, data })
    for (const [cx, cy, radius, top, bottom] of [
      [76, 17, 52, 3, 70],
      [40.25, 45.75, 19, 0, 90],
    ]) {
      const values: number[][] = []
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (
            y + 0.5 < top ||
            y + 0.5 >= bottom ||
            (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 >= radius ** 2
          )
            continue
          values.push(
            Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)).map(v => v / 255),
          )
        }
      const measured = context.sample(cx, cy, radius, top, bottom)!
      expect(measured.count).toBe(values.length)
      measured.rgb.forEach((v, c) =>
        expect(v).toBeCloseTo(values.reduce((s, q) => s + q[c], 0) / values.length, 6),
      )
      const luminances = values.map(v => v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722)
      const mean = luminances.reduce((a, b) => a + b, 0) / values.length
      expect(measured.deviation).toBeCloseTo(
        Math.sqrt(luminances.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length),
        6,
      )
    }
  })
  it('integrates rows lazily, bit-identical to the eager index, from its own copy of the pixels', () => {
    const width = 37,
      height = 23,
      data = new Uint8ClampedArray(width * height * 4)
    let seed = 7
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      data[i] = seed >>> 24
    }
    const eager = new RegularMaterialContext({ width, height, data })
    const reference = (eager as unknown as { rows: Float64Array }).rows
    const lazy = new LazyRegularMaterialContext({ width, height, data })
    data.fill(0)
    for (let y = 0; y < height; y++)
      expect(Array.from(lazy.prefixRow(y))).toEqual(
        Array.from(reference.subarray(y * (width + 1) * 4, (y + 1) * (width + 1) * 4)),
      )
    for (const [cx, cy, r, top, bottom] of [
      [18, 11, 9, 0, 23],
      [3.5, 20.25, 14, 2, 21],
      [40, 40, 5, 0, 23],
    ])
      expect(lazy.sample(cx, cy, r, top, bottom)).toEqual(eager.sample(cx, cy, r, top, bottom))
  })
  it('uses distinct appearance switches at the measured brackets', () => {
    expect(regularTriggerRegime(49 / 255, 'light')).toBe(0)
    expect(regularTriggerRegime(51 / 255, 'light')).toBe(1)
    expect(regularTriggerRegime(224 / 255, 'dark')).toBe(0)
    expect(regularTriggerRegime(232 / 255, 'dark')).toBe(1)
    expect(regularTriggerRegime(128 / 255, 'dark')).toBe(0)
  })
  it('does not fabricate contrast when subtracting uniform-source second moments', () => {
    const width = 402,
      height = 200,
      data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < data.length; i += 4) data.set([184, 184, 184, 255], i)
    const context = new RegularMaterialContext({ width, height, data })
    const sample = context.sample(364, 100, 52)!
    expect(sample.luminance).toBeCloseTo(184 / 255, 12)
    expect(sample.deviation).toBeLessThan(1e-7)
  })
  it('leaves an offscreen aperture without a fabricated context', () => {
    const context = new RegularMaterialContext({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255]),
    })
    expect(context.sample(400, 500, 52)).toBeUndefined()
  })
})
