// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { afterEach, expect, it, vi } from 'vitest'
import {
  GlassEffect,
  GlassEffectContainer,
  GlassLayer,
  PresentationGlassBoundary,
} from './GlassEffect.tsx'
import { MaterialEffectContext, type MaterialEffectRegistration } from './liquidContext.ts'
import { GlassRegionRegistry } from './regionRegistry.ts'
import { Glass, type GlassRegion } from './regions.ts'

const mounted: Array<() => void> = []
afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose()
  vi.unstubAllGlobals()
})

it('keeps menu ownership and contact state through motion updates and retires only on unmount', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const observe = vi.fn(),
    disconnect = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe
      disconnect = disconnect
    },
  )
  const element = document.createElement('div'),
    root = createRoot(element)
  const regions = new GlassRegionRegistry()
  document.body.append(element)
  mounted.push(() => {
    act(() => root.unmount())
    element.remove()
  })
  const registration: MaterialEffectRegistration = {
    backend: 'webgpu',
    regions,
    ready: true,
    registerTabs() {},
  }
  const from = { x: 300, y: 80, width: 44, height: 44, radius: 22 }
  const render = (emerge: GlassRegion['emerge']) =>
    act(() =>
      root.render(
        <MaterialEffectContext value={registration}>
          <GlassEffect touchLight emerge={emerge}>
            Actions
          </GlassEffect>
        </MaterialEffectContext>,
      ),
    )
  render({ from, generation: 1, ready: false })
  const entry = regions.values()[0]!
  const input = { regionId: entry.id, phase: 'pressed' as const, epoch: 1 }
  regions.interact(input)
  const observedSizes: number[] = []
  const unsubscribe = regions.subscribe(() => observedSizes.push(regions.size))
  for (const emerge of [
    { from, generation: 1, ready: true },
    { from, generation: 1, ready: true, inkDom: true },
    { from, generation: 2, closing: true, returnTo: from },
    { from, generation: 2, closing: true, returnTo: { ...from, y: 100 } },
    { from, generation: 3, ready: true },
  ]) {
    render(emerge)
    expect(regions.values()[0]).toBe(entry)
    expect(entry.descriptor.emerge).toEqual(emerge)
    expect(regions.interactions.get(entry.id)).toBe(input)
  }
  expect(observedSizes).toEqual([1, 1, 1, 1, 1])
  expect(observe).toHaveBeenCalledTimes(1)
  expect(disconnect).not.toHaveBeenCalled()
  expect(regions.retirementVersion).toBe(0)
  act(() => root.render(null))
  expect(regions.size).toBe(0)
  expect(regions.interactions.has(entry.id)).toBe(false)
  expect(regions.retirementVersion).toBe(1)
  expect(disconnect).toHaveBeenCalledTimes(1)
  unsubscribe()
})

it('isolates portalled sheet glass from its declaring group while preserving explicit inner groups', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const element = document.createElement('div')
  const portal = document.createElement('div')
  const root = createRoot(element)
  const regions = new GlassRegionRegistry()
  document.body.append(element, portal)
  mounted.push(() => {
    act(() => root.unmount())
    element.remove()
    portal.remove()
  })
  const registration: MaterialEffectRegistration = {
    backend: 'webgpu',
    regions,
    ready: true,
    registerTabs() {},
  }
  act(() =>
    root.render(
      <MaterialEffectContext value={registration}>
        <GlassEffectContainer>
          {createPortal(
            <PresentationGlassBoundary>
              <GlassLayer attachment="fixed">
                <GlassEffect
                  glass={Glass.sheet}
                  shape={{ kind: 'roundedRectangle', cornerRadius: 38, bottomCornerRadius: 54 }}
                >
                  <GlassEffectContainer>
                    <GlassEffect glass={Glass.regular}>Inner control</GlassEffect>
                  </GlassEffectContainer>
                </GlassEffect>
              </GlassLayer>
            </PresentationGlassBoundary>,
            portal,
          )}
        </GlassEffectContainer>
      </MaterialEffectContext>,
    ),
  )
  const descriptors = regions.values().map(region => region.descriptor)
  const sheet = descriptors.find(region => region.material.treatment === 'sheet')!
  const control = descriptors.find(region => region.material.treatment === undefined)!
  expect(sheet.container).toBeUndefined()
  expect(sheet.shape).toMatchObject({ bottomCornerRadius: 54 })
  expect(control.container).toBeDefined()
})

it('interactive glass presses in its own material canvas, with no lift canvas', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const element = document.createElement('div'),
    root = createRoot(element),
    regions = new GlassRegionRegistry()
  document.body.append(element)
  mounted.push(() => {
    act(() => root.unmount())
    element.remove()
  })
  const registration: MaterialEffectRegistration = {
    backend: 'webgpu',
    regions,
    ready: true,
    registerTabs() {},
  }
  act(() =>
    root.render(
      <MaterialEffectContext value={registration}>
        <GlassEffect glass={Glass.regular.interactive()}>Button</GlassEffect>
      </MaterialEffectContext>,
    ),
  )
  // The press light, growth and squish draw in the glass's material (InteractiveContact).
  expect(element.querySelectorAll('[data-satin-glass-region-canvas]')).toHaveLength(1)
  expect(regions.values()[0]?.overlay).toBeUndefined()
})
