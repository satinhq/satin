import { expect, it, vi } from 'vitest'
import { prepareNavigation } from './productionNavigation.ts'
import type { ProductionGlassRuntime } from './production.ts'
import type { NavigationGlassState } from '../../navigation/glassTransition.ts'

it('releases region admission when an unsupported route set fails before capture', async () => {
  const release = vi.fn()
  const runtime = {
    appRegions: { holdNavigation: () => release },
    menuCancel: vi.fn(),
    tabInput: vi.fn(),
    scheduleEdges: vi.fn(),
    options: { geometry: {} },
    navigationRevision: 0,
  } as unknown as ProductionGlassRuntime
  const state = {
    active: true,
    width: 440,
    top: 'last',
    routes: Array.from({ length: 9 }, () => ({})),
  } as unknown as NavigationGlassState
  await expect(prepareNavigation(runtime, state)).rejects.toThrow('8 simultaneous route sources')
  expect(release).toHaveBeenCalledOnce()
  expect(runtime.navigationRelease).toBeUndefined()
})
