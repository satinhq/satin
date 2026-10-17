// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { GlassRegionRegistry } from './regionRegistry.ts'
import { Glass } from './regions.ts'
it('delivers ink hand-offs to the region that registered for them, until it unsubscribes', () => {
  const registry = new GlassRegionRegistry()
  const received: [string, number | undefined][] = []
  const stop = registry.onEmergeInk('menu', (phase, generation) =>
    received.push([phase, generation]),
  )
  registry.emergeInk({ type: 'emerge-ink', regionId: 'other', phase: 'open-settled' })
  registry.emergeInk({ type: 'emerge-ink', regionId: 'menu', phase: 'open-settled', generation: 3 })
  stop()
  registry.emergeInk({
    type: 'emerge-ink',
    regionId: 'menu',
    phase: 'close-started',
    generation: 3,
  })
  expect(received).toEqual([['open-settled', 3]])
})

it('rejects duplicate identities only in the same container and namespace', () => {
  const registry = new GlassRegionRegistry()
  const entry = (id: string, container: string, namespace = 'n') => ({
    id,
    element: document.createElement('div'),
    canvas: document.createElement('canvas'),
    descriptor: {
      id,
      container: { id: container, spacing: 20 },
      morph: { id: 'same', namespace },
      material: Glass.regular.material,
      shape: 'capsule' as const,
    },
  })
  const remove = registry.register(entry('a', 'one'))
  expect(() => registry.register(entry('b', 'one'))).toThrow('Duplicate active glassEffectID')
  expect(() => registry.register(entry('c', 'two'))).not.toThrow()
  expect(() => registry.register(entry('d', 'one', 'other'))).not.toThrow()
  remove()
  expect(() => registry.register(entry('e', 'one'))).not.toThrow()
})

it('clips current-show foreground to submitted material and ignores stale/reversed shows', () => {
  const registry = new GlassRegionRegistry(),
    element = document.createElement('div'),
    canvas = document.createElement('canvas')
  const descriptor = {
    id: 'menu',
    material: Glass.regular.material,
    shape: { kind: 'roundedRectangle' as const, cornerRadius: 22 },
    emerge: { from: { x: 0, y: 0, width: 44, height: 44, radius: 22 }, generation: 3 },
  }
  const unregister = registry.register({ id: 'menu', element, canvas, descriptor })
  const event = {
    type: 'emerge-aperture' as const,
    regionId: 'menu',
    generation: 3,
    top: 0,
    right: 120,
    bottom: 160,
    left: 0,
    radius: 22,
  }
  registry.emergeAperture({ ...event, generation: 2 })
  expect(element.style.getPropertyValue('--satin-glass-emerge-clip')).toBe('')
  registry.emergeAperture(event)
  const clip = element.style.getPropertyValue('--satin-glass-emerge-clip')
  expect(clip).toContain('120px')
  expect(clip).toContain('160px')
  expect(canvas.style.clipPath).toBe('')
  registry.emergeAperture({ ...event, generation: 2, right: 0, bottom: 0 })
  expect(element.style.getPropertyValue('--satin-glass-emerge-clip')).toBe(clip)
  registry.emergeAperture({ ...event, right: 0, bottom: 0 })
  expect(element.style.getPropertyValue('--satin-glass-emerge-clip')).not.toBe(clip)
  const finalClip = element.style.getPropertyValue('--satin-glass-emerge-clip')
  unregister()
  registry.emergeAperture({ ...event, right: 0, bottom: 0 })
  expect(element.style.getPropertyValue('--satin-glass-emerge-clip')).toBe(finalClip)
})
