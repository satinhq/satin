import { expect, it } from 'vitest'
import { uncoveredSourceRows } from './captureBands.ts'

it('checks navigation atlas rows instead of the replaced settled plane bands', () => {
  const layer = {
    origin: { y: 0 },
    scroll: { y: 0 },
    height: 894,
    resolution: 3,
    clip: [0, 0, 440, 894] as const,
    rows: [{ top: 659, bottom: 894 }],
  }
  const rect = [0, 402.6, 440, 267] as const
  expect(uncoveredSourceRows(rect, layer)).toBeDefined()
  expect(
    uncoveredSourceRows(rect, layer, { width: 440, height: 894, rows: [{ top: 0, bottom: 894 }] }),
  ).toBeUndefined()
  expect(
    uncoveredSourceRows(rect, layer, {
      width: 440,
      height: 894,
      rows: [{ top: 659, bottom: 894 }],
    }),
  ).toBeDefined()
})
