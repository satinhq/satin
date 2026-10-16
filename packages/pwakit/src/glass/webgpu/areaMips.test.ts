import { expect, it } from 'vitest'
import { footprint, PYRAMID_GRID, pyramidContent, pyramidStorage } from './areaMips.ts'

/** One level of the bar pyramid as the compute shader builds it (one axis): each destination
 * texel averages the source texels under it, weighted by overlap and by how much is content. */
function downsample(source: number[], content: number, size: number) {
  const ratio = source.length / size
  return Array.from({ length: size }, (_, index) => {
    const taps = footprint(index, ratio, content)
    const weight = taps.reduce((sum, tap) => sum + tap.weight, 0)
    if (!weight) return source[Math.min(Math.floor(index * ratio), Math.ceil(content) - 1)]
    return taps.reduce((sum, tap) => sum + source[tap.texel] * tap.weight, 0) / weight
  })
}

/** Level `levels` of a pyramid over the first `content` texels of `backdrop`, `storage` texels
 * wide, the rest cleared to 0 as the content copy leaves it. */
function coarse(backdrop: number[], content: number, storage: number, levels: number) {
  let level = [...backdrop.slice(0, content), ...new Array<number>(storage - content).fill(0)]
  let filled = content
  for (let step = 0; step < levels; step++) {
    const size = Math.max(1, level.length >> 1)
    const next = downsample(level, filled, size)
    filled = (filled * size) / level.length
    level = next
  }
  return level
}

it('weighs every backdrop texel equally through the tab bar pyramid (477 rows, level 5)', () => {
  // The weight of each level-0 row in the level-5 texels: push a unit impulse through the chain.
  const rows = 477
  const storage = pyramidStorage(rows)
  const shares = Array.from({ length: rows }, (_, row) => {
    const impulse = Array.from({ length: rows }, (_, index) => (index === row ? 1 : 0))
    // The texels that hold content; the one past them repeats the edge.
    return coarse(impulse, rows, storage, 5)
      .slice(0, Math.ceil(rows / 32))
      .reduce((sum, value) => sum + value, 0)
  })
  // Rows in whole level-5 texels each carry 1/32 of a texel; none is dropped or counted twice.
  const whole = shares.slice(0, Math.floor(rows / 32) * 32)
  expect(Math.min(...whole)).toBeCloseTo(1 / 32, 9)
  expect(Math.max(...whole)).toBeCloseTo(1 / 32, 9)
  // The rows in the texel the content ends in share it among themselves (the storage past
  // them carries no weight).
  const edge = shares.slice(Math.floor(rows / 32) * 32)
  expect(edge.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 9)
})

it('averages only the content under a destination texel at the content edge', () => {
  // Ratio 2, content ending 0.5 into source texel 5: texel 2 covers texels 4 and 5.
  expect(footprint(2, 2, 5.5)).toEqual([
    { texel: 4, weight: 1 },
    { texel: 5, weight: 0.5 },
  ])
  expect(footprint(3, 2, 5.5)).toEqual([])
  // A ratio above 2 (a 5 texel level halved to 2) spans a partial texel.
  expect(footprint(1, 2.5, 5).map(tap => tap.texel)).toEqual([2, 3, 4])
})

it('keeps the coarse levels under a fixed point unchanged while the surface grows', () => {
  // A row of tiles under a growing accessory: orange, a dark gap, pastel, in level-0 texels.
  const backdrop = Array.from({ length: 900 }, (_, x) =>
    x < 255 ? 140 : x < 272 ? 0 : x < 527 ? 200 : x < 545 ? 0 : 60,
  )
  // Level-0 content widths of a capsule growing by about a point per frame (1.5 texels).
  const widths = Array.from({ length: 40 }, (_, frame) => 560 + frame * 1.5)
  const firstTexels = (storage: (content: number) => number) =>
    widths.map(width => coarse(backdrop, pyramidContent(width), storage(width), 5).slice(0, 12))
  const spread = (rows: number[][]) =>
    Math.max(
      ...rows[0].map((_, texel) => {
        const values = rows.map(row => row[texel])
        return Math.max(...values) - Math.min(...values)
      }),
    )
  // Storage on the coarse grid: the twelve level-5 texels (the first 384 level-0 texels, far
  // from the growing edge) never change.
  expect(spread(firstTexels(pyramidStorage))).toBeLessThan(1e-9)
  // Storage that followed the width (the content rounded up) rescaled every level.
  expect(spread(firstTexels(Math.ceil))).toBeGreaterThan(10)
})

it('rounds pyramid storage up to whole coarse texels and counts the content the copy writes', () => {
  expect(pyramidStorage(1)).toBe(PYRAMID_GRID)
  expect(pyramidStorage(64)).toBe(64)
  expect(pyramidStorage(64.2)).toBe(128)
  expect(pyramidContent(100.3)).toBe(100)
  expect(pyramidContent(100.7)).toBe(101)
})
