// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GlassBackground } from '../glass/GlassEffect.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { GlassRegionRegistry } from '../glass/regionRegistry.ts'
import { RegionBridge } from '../glass/webgpu/regionBridge.ts'
import type { WebGPUClient } from '../glass/webgpu/client.ts'
import type { GlassRendererOperation } from '../glass/rendererContract.ts'

vi.mock('../glass/webgpu/foreground.ts', () => ({
  captureRegionForeground: vi.fn(async () => document.createElement('canvas')),
}))
import { ScreenToolbar } from '../public/chrome.tsx'

let root: Root
let host: HTMLDivElement
let stylesheet: HTMLStyleElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  stylesheet = document.createElement('style')
  // Include the UA hidden rule: an inline display declaration must never override it.
  stylesheet.textContent =
    '[hidden] { display: none !important; }' + readFileSync('src/styles.css', 'utf8')
  document.head.append(stylesheet)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  stylesheet.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// Mounted computed-style model. Actual WebKit layout, painting and hit testing are covered by
// the round-3 Catalyst probe and installed-device acceptance, not by happy-dom.
it.each(['incoming', 'outgoing'] as const)(
  'paints a non-top %s toolbar while retaining its accessibility exclusion',
  motion => {
    act(() =>
      root.render(
        <ScreenToolbar
          entryKey="root"
          active={false}
          motion={motion}
          fallback={<button>Action</button>}
        />,
      ),
    )
    const toolbar = host.querySelector<HTMLElement>('[data-satin-entry-toolbar]')!
    expect(getComputedStyle(toolbar).display).toBe('contents')
    expect(toolbar.hasAttribute('inert')).toBe(true)
    expect(toolbar.getAttribute('aria-hidden')).toBe('true')
  },
)
it('suppresses entering hit targets before their painted opacity passes the threshold', () => {
  act(() =>
    root.render(
      <ScreenToolbar entryKey="next" motion="incoming" fallback={<button>Action</button>} />,
    ),
  )
  const toolbar = host.querySelector<HTMLElement>('[data-satin-entry-toolbar]')!
  const slot = toolbar.querySelector<HTMLElement>(
    '[data-satin-navigation-toolbar-slot="trailing"]',
  )!
  expect(getComputedStyle(slot).pointerEvents).toBe('none')
  expect(toolbar.hasAttribute('inert')).toBe(true)
  expect(toolbar.getAttribute('aria-hidden')).toBe('true')
})
it('removes an inactive settled toolbar from layout', () => {
  act(() => root.render(<ScreenToolbar entryKey="root" active={false} />))
  expect(
    getComputedStyle(host.querySelector<HTMLElement>('[data-satin-entry-toolbar]')!).display,
  ).toBe('none')
})

it('admits a deep push with a retained hidden search toolbar and still requires moving glass', async () => {
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.closest('[hidden]') ? new DOMRect() : new DOMRect(20, 40, 240, 44)
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'transferControlToOffscreen', {
    configurable: true,
    value: () => ({}),
  })
  const registry = new GlassRegionRegistry()
  let omitDraw = false
  const client = {
    request: async ({ request }: { request: GlassRendererOperation }) =>
      request.type === 'scene'
        ? {
            navigation: 'deep-push',
            presented: omitDraw ? [] : request.snapshot.regions.map(region => region.id),
          }
        : {},
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const renderToolbar = (motion?: 'outgoing') =>
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions: registry, ready: true, registerTabs() {} }}>
          <ScreenToolbar
            entryKey="root"
            active={false}
            motion={motion}
            fallback={
              <div>
                <GlassBackground />
                <span>Search</span>
              </div>
            }
          />
        </MaterialEffectContext>,
      ),
    )
  renderToolbar()
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, host)
  const release = bridge.holdNavigation()
  try {
    await expect(bridge.admitNavigation('deep-push')).resolves.toBeUndefined()
    renderToolbar('outgoing')
    await expect(bridge.admitNavigation('deep-push')).resolves.toBeUndefined()
    omitDraw = true
    await expect(bridge.admitNavigation('deep-push')).rejects.toThrow(
      'current-source region draw receipt',
    )
  } finally {
    release()
    bridge.unbind()
    delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).transferControlToOffscreen
  }
})
