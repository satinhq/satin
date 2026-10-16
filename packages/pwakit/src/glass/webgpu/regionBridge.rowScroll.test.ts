// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { GlassRegionRegistry } from '../regionRegistry.ts'
import { Glass } from '../regions.ts'
import { RegionBridge } from './regionBridge.ts'
import type { WebGPUClient } from './client.ts'
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
it('skips distant row scrolls without layout reads, but refreshes overlapping glass', () => {
  const registry = new GlassRegionRegistry()
  const row = document.createElement('div')
  row.dataset.satinRowActions = 'true'
  const source = document.createElement('div')
  source.dataset.satinRowScrub = 'true'
  const surface = document.createElement('div')
  row.append(source)
  document.body.append(row, surface)
  const rowRect = vi
    .spyOn(row, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(20, 200, 400, 70))
  const glassRect = vi
    .spyOn(surface, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(20, 20, 400, 40))
  registry.register({
    id: 'glass',
    element: surface,
    canvas: document.createElement('canvas'),
    descriptor: {
      id: 'glass',
      material: Glass.sheet.material,
      shape: { kind: 'roundedRectangle', cornerRadius: 20, cornerStyle: 'continuous' },
    },
  })
  const bridge = new RegionBridge({ onEvent: () => () => {} } as unknown as WebGPUClient, 'light')
  const invalidate = vi.spyOn(bridge, 'invalidate').mockImplementation(() => {})
  bridge.bind(registry, document.body)
  source.dispatchEvent(new Event('touchstart', { bubbles: true }))
  invalidate.mockClear()
  rowRect.mockClear()
  glassRect.mockClear()
  for (let index = 0; index < 20; index++) source.dispatchEvent(new Event('scroll'))
  expect(invalidate).not.toHaveBeenCalled()
  expect(rowRect).not.toHaveBeenCalled()
  expect(glassRect).not.toHaveBeenCalled()
  glassRect.mockReturnValue(new DOMRect(20, 190, 400, 40))
  source.dispatchEvent(new Event('touchstart', { bubbles: true }))
  source.dispatchEvent(new Event('scroll'))
  expect(invalidate).toHaveBeenCalledOnce()
  bridge.unbind()
})
