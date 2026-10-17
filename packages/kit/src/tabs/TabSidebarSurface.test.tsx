// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { GlassMaterialContext, type GlassMaterialContextValue } from '../glass/context.ts'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { GlassRegionRegistry } from '../glass/regionRegistry.ts'
import { TabSidebarSurface } from './TabSidebarSurface.tsx'

// GPU first-show acknowledgement is exercised by the presentation tests and device gate.
vi.mock('../presentation/glassReady.ts', () => ({ holdPresentationForGlass: () => () => {} }))
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const clean of cleanups.splice(0)) clean()
  vi.unstubAllGlobals()
})
function mount(overlay: boolean) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const scene = document.createElement('div'),
    chrome = document.createElement('div')
  document.body.append(scene, chrome)
  const root = createRoot(scene),
    regions = new GlassRegionRegistry(),
    dismiss = vi.fn()
  const material: GlassMaterialContextValue = {
    chromeLayer: chrome,
    registerRegion: () => () => {},
    diagnostics: {
      accessibility: { reducedMotion: false, reducedTransparency: false, increasedContrast: false },
      capability: { state: 'displacement', reason: 'raster-probe-passed' },
      lensBoost: 1,
      mapRegenerationCount: 0,
      renderTest: 'passed',
    },
  }
  act(() =>
    root.render(
      <GlassMaterialContext value={material}>
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <TabSidebarSurface overlay={overlay} onDismiss={dismiss}>
            <button>Home</button>
          </TabSidebarSurface>
        </MaterialEffectContext>
      </GlassMaterialContext>,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    scene.remove()
    chrome.remove()
  })
  return { scene, chrome, regions, dismiss, root }
}
it('presents modal sidebar ink and outside dismissal in the chrome layer above page content', () => {
  const { scene, chrome, dismiss } = mount(true)
  expect(scene.querySelector('aside')).toBeNull()
  expect(chrome.querySelector('aside')?.textContent).toBe('Home')
  act(() => chrome.querySelector<HTMLButtonElement>('[aria-label="Dismiss Tab Sidebar"]')!.click())
  expect(dismiss).toHaveBeenCalledOnce()
})
it('owns one frosted renderer region in landscape and releases it without a modal dimmer', () => {
  const { chrome, regions, root } = mount(false)
  expect(chrome.querySelector('[aria-label="Dismiss Tab Sidebar"]')).toBeNull()
  expect(regions.values().map(entry => entry.descriptor.material.treatment)).toEqual(['sheet'])
  act(() => root.render(null))
  expect(regions.size).toBe(0)
})
