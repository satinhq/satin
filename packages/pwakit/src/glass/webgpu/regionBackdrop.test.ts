import { expect, it, vi } from 'vitest'
import { watchRegionBackdrop } from './regionBackdrop.ts'
it('prepares the first late material but does not recapture for ordinary invalidations', () => {
  let listener = () => {}
  const unsubscribe = vi.fn()
  const registry = {
    size: 0,
    subscribe: (next: () => void) => {
      listener = next
      return unsubscribe
    },
  }
  const prepare = vi.fn()
  const release = watchRegionBackdrop(registry, prepare)
  listener()
  expect(prepare).not.toHaveBeenCalled()
  registry.size = 1
  listener()
  expect(prepare).toHaveBeenCalledOnce()
  listener()
  registry.size = 2
  listener()
  expect(prepare).toHaveBeenCalledOnce()
  registry.size = 0
  listener()
  registry.size = 1
  listener()
  expect(prepare).toHaveBeenCalledTimes(2)
  release()
  expect(unsubscribe).toHaveBeenCalledOnce()
})
it('leaves launch preparation responsible for materials already mounted', () => {
  const prepare = vi.fn()
  watchRegionBackdrop({ size: 1, subscribe: () => () => {} }, prepare)
  expect(prepare).not.toHaveBeenCalled()
})
