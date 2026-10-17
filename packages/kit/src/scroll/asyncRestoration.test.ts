// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createScrollSurfaceRegistry } from './registry.ts'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach(stop => stop())
  vi.unstubAllGlobals()
})
function fixture(target = 6400) {
  let extent = 100
  const element = document.createElement('div')
  Object.defineProperties(element, {
    clientHeight: { value: 100 },
    scrollHeight: { get: () => extent },
    clientWidth: { value: 100 },
    scrollWidth: { value: 100 },
  })
  element.scrollTo = vi.fn(options => {
    if (typeof options === 'object') element.scrollTop = Math.min(options.top ?? 0, extent - 100)
  })
  const callbacks = new Set<() => void>()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private callback: () => void
      constructor(callback: () => void) {
        this.callback = callback
        callbacks.add(callback)
      }
      observe() {
        callbacks.add(this.callback)
      }
      disconnect() {
        callbacks.delete(this.callback)
      }
    },
  )
  const registry = createScrollSurfaceRegistry({ development: false })
  cleanup.push(registry.register({ id: 'rows', primary: true, axis: 'vertical', element }))
  registry.restore(new Map([['rows', { x: 0, y: target }]]))
  return {
    registry,
    element,
    callbacks,
    grow(height: number, notify = true) {
      extent = height
      if (notify) for (const callback of [...callbacks]) callback()
    },
  }
}
it('keeps a large offset through partial data and restores only when its range exists', () => {
  const { registry, element, grow, callbacks } = fixture()
  expect(element.scrollTo).not.toHaveBeenCalled()
  grow(1000)
  expect(element.scrollTo).not.toHaveBeenCalled()
  expect(registry.capture({ preservePending: true }).get('rows')?.y).toBe(6400)
  expect(registry.capture().get('rows')?.y).toBe(6400)
  grow(10000)
  expect(element.scrollTop).toBe(6400)
  expect(callbacks.size).toBe(0)
  element.scrollTop = 7000
  grow(12000)
  expect(element.scrollTop).toBe(7000)
})
it.each(['pointerdown', 'wheel', 'keydown'])('yields to %s rather than jumping later', event => {
  const { registry, element, grow } = fixture()
  element.dispatchEvent(new Event(event))
  grow(10000)
  expect(element.scrollTo).not.toHaveBeenCalled()
  expect(registry.capture({ preservePending: true }).get('rows')?.y).toBe(0)
})
it('cleans pending observers on reset and unregister', () => {
  const { registry, callbacks, element, grow } = fixture()
  expect(callbacks.size).toBe(1)
  registry.reset()
  expect(callbacks.size).toBe(0)
  registry.restore(new Map([['rows', { x: 0, y: 9000 }]]))
  cleanup.pop()!()
  expect(callbacks.size).toBe(0)
  grow(20000)
  expect(element.scrollTop).toBe(0)
})
it('retries when asynchronously inserted content changes the scroll range', async () => {
  const { element, registry, grow } = fixture(500)
  grow(1000, false)
  element.append(document.createElement('p'))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(element.scrollTop).toBe(500)
  expect(registry.capture({ preservePending: true }).get('rows')?.y).toBe(500)
})
