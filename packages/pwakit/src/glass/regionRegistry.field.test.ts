// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { GlassRegionRegistry } from './regionRegistry.ts'
import { Glass } from './regions.ts'

it('moves foreground from submitted member geometry and replaces interrupted motion', () => {
  const registry = new GlassRegionRegistry()
  const element = document.createElement('div')
  const content = document.createElement('div')
  content.dataset.satinGlassFieldContent = 'true'
  element.append(content)
  const prior = { cancel: vi.fn() }
  const animation = { currentTime: 0 }
  content.getAnimations = vi.fn(() => [prior as unknown as Animation])
  content.animate = vi.fn(() => animation as unknown as Animation)
  registry.register({
    id: 'member',
    element,
    canvas: document.createElement('canvas'),
    descriptor: {
      id: 'member',
      material: Glass.regular.material,
      shape: { kind: 'roundedRectangle', cornerRadius: 36 },
    },
  })
  registry.fieldMotion({
    type: 'field-motion',
    regionId: 'member',
    start: performance.timeOrigin + performance.now() - 50,
    duration: 1000,
    offsetX: -54,
    offsetY: 10,
    scaleX: 2,
    scaleY: 1,
  })
  expect(prior.cancel).toHaveBeenCalledOnce()
  const frames = vi.mocked(content.animate).mock.calls[0][0] as Keyframe[]
  expect(frames[0].transform).toBe('translate(-54px, 10px) scale(2, 1)')
  expect(frames[120].transform).toBe('translate(0px, 0px) scale(1, 1)')
  expect(animation.currentTime).toBeGreaterThanOrEqual(50)
  registry.fieldMotion({
    type: 'field-motion',
    regionId: 'member',
    start: 0,
    duration: 0,
    offsetX: 0,
    offsetY: 0,
    scaleX: 1,
    scaleY: 1,
  })
  expect(content.animate).toHaveBeenCalledOnce()
})

// Scope-thumb r2: the scope bar's glass is not an interactive material, and the registry dropped
// its finger, so the thumb never lifted or followed (only page selection changes reached it).
it("delivers a segmented glass's finger to the renderer", () => {
  const registry = new GlassRegionRegistry()
  const received: string[] = []
  registry.subscribeInput(input => received.push(`${input.regionId}:${input.phase}`))
  registry.register({
    id: 'scopes',
    element: document.createElement('div'),
    canvas: document.createElement('canvas'),
    descriptor: {
      id: 'scopes',
      material: Glass.regular.material,
      shape: 'capsule',
      selection: { index: 0, count: 4 },
    },
  })
  registry.interact({ regionId: 'scopes', phase: 'pressed', epoch: 1, contact: { x: 50, y: 18 } })
  expect(received).toEqual(['scopes:pressed'])
})

it('keeps live editor ink unscaled while its glass changes height', () => {
  const registry = new GlassRegionRegistry()
  const element = document.createElement('div')
  const content = document.createElement('div')
  content.dataset.satinGlassFieldContent = 'true'
  content.append(document.createElement('textarea'))
  element.append(content)
  const cancel = vi.fn()
  content.getAnimations = vi.fn(() => [{ cancel }] as unknown as Animation[])
  content.animate = vi.fn()
  registry.register({
    id: 'composer',
    element,
    canvas: document.createElement('canvas'),
    descriptor: {
      id: 'composer',
      material: Glass.regular.material,
      shape: 'capsule',
    },
  })
  registry.fieldMotion({
    type: 'field-motion',
    regionId: 'composer',
    start: 0,
    duration: 500,
    offsetX: 0,
    offsetY: 11,
    scaleX: 1,
    scaleY: 0.5,
  })
  expect(cancel).toHaveBeenCalledOnce()
  expect(content.animate).not.toHaveBeenCalled()
})
