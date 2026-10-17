import { expect, it } from 'vitest'
import { selectNavigationProbeLayers } from './probeLayers.ts'
it('samples only the three painted layers in a 30-screen retained stack', () => {
  const layers = Array.from({ length: 30 }, (_, key) => ({
    key,
    dataset: { satinRenderSuspended: key > 0 && key < 28 ? 'true' : undefined },
  }))
  expect(selectNavigationProbeLayers(layers).map(layer => layer.key)).toEqual([0, 28, 29])
})
it('bounds popToRoot diagnostics while retaining its true endpoints', () => {
  const layers = Array.from({ length: 30 }, (_, key) => ({ key, dataset: {} }))
  const selected = selectNavigationProbeLayers(layers)
  expect(selected).toHaveLength(8)
  expect(selected[0]).toBe(layers[0])
  expect(selected.at(-1)).toBe(layers.at(-1))
})
