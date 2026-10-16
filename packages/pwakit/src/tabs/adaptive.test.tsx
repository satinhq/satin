// @vitest-environment happy-dom
import { act } from 'react'
import * as safeAreaMetrics from '../safe-area/useSafeAreaMetrics.ts'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { TabBar } from '../glass/TabBar.tsx'
import { Tab, TabView } from './TabView.tsx'
import { NavigatorHost } from '../navigation/NavigatorHost.tsx'
import { createNavigator } from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { GlassMaterialContext } from '../glass/context.ts'
import { MaterialEffectContext } from '../glass/liquidContext.ts'

const layout = vi.hoisted(() => ({
  horizontal: 'compact',
  width: 1024,
  height: 1376,
  screen: { width: 1032, height: 1376 },
}))
vi.mock('../root/runtimeContext.ts', () => ({
  useLayoutClass: () => layout,
  useSatinLayoutRuntime: () => ({
    layoutClass: layout,
    metrics: {
      layoutViewport: { width: layout.width, height: layout.height },
      screen: layout.screen,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  }),
}))
it('maps the same retained panels to adaptive top tabs without changing selection or content', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ScrollTimeline', class {})
  vi.stubGlobal('navigator', { userAgent: 'iPad', platform: 'iPad', maxTouchPoints: 5 })
  const mount = document.createElement('div'),
    chrome = document.createElement('div')
  document.body.append(mount, chrome)
  const registerMaterial = vi.fn(() => () => {}),
    invalidate = vi.fn()
  const root = createRoot(mount),
    registerTabs = vi.fn(),
    register = vi.fn(() => () => {})
  const registry = createScreenRegistry(
    defineScreen('page', { component: () => <span>Page</span> }),
  )
  const a = createNavigator({ registry, initial: { id: 'page' } }),
    b = createNavigator({ registry, initial: { id: 'page' } })
  a.push('page')
  a.push('page')
  b.push('page')
  const keys = [a, b].map(navigator => navigator.getState().entries.map(entry => entry.key))
  const render = () =>
    act(() =>
      root.render(
        <GlassMaterialContext
          value={{ chromeLayer: chrome, registerRegion: register, diagnostics: {} as never }}
        >
          <MaterialEffectContext
            value={{
              ready: false,
              registerTabs,

              regions: { register: registerMaterial, invalidate } as never,
            }}
          >
            <TabView defaultSelection="b">
              <Tab id="a" label="A" icon={null}>
                <NavigatorHost adaptive navigator={a} />
              </Tab>
              <Tab id="b" label="B" icon={null}>
                <NavigatorHost adaptive navigator={b} />
              </Tab>
            </TabView>
          </MaterialEffectContext>
        </GlassMaterialContext>,
      ),
    )
  render()
  const retainedScreens = [...mount.querySelectorAll('[data-satin-screen-key]')]
  const panel = mount.querySelector('[data-satin-tab-panel="b"]')
  const host = panel?.querySelector<HTMLElement>('[data-satin-navigator-host]')
  expect(host?.style.getPropertyValue('--satin-sidebar-rowHeight')).toBe('52px')
  expect(chrome.querySelector('nav')).toBeNull()
  expect(registerTabs).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ selected: 'b' }),
  )
  layout.horizontal = 'regular'
  render()
  expect(mount.querySelector('[data-satin-detail-scrub="true"]')).not.toBeNull()
  vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 })
  render()
  expect(chrome.querySelector('[data-satin-tab-placement="top"]')).toBeNull()
  vi.stubGlobal('navigator', { userAgent: 'iPad', platform: 'iPad', maxTouchPoints: 5 })
  render()
  expect([...mount.querySelectorAll('[data-satin-screen-key]')]).toEqual(retainedScreens)
  expect(chrome.querySelector('nav')?.getAttribute('data-satin-tab-placement')).toBe('top')
  // The regular-width bar runs on the shared glass tab engine (lens on press, drag to select):
  // it registers with the liquid root as the top bar, with its measured label-sized items.
  // The engine draws the material and the accessible tab buttons, so this bar is inert sizing.
  const topBar = registerTabs.mock.calls.at(-1)?.[1]
  expect(topBar).toEqual(
    expect.objectContaining({
      placement: 'top',
      selected: 'b',
      insetHost: chrome.querySelector('nav'),
      itemFrames: [expect.objectContaining({ x: expect.any(Number) }), expect.anything()],
    }),
  )
  expect(chrome.querySelector('nav')?.hasAttribute('inert')).toBe(true)
  expect(chrome.querySelector('[role="tab"]')).toBeNull()
  expect(mount.querySelector('[data-satin-tab-panel="b"]')).toBe(panel)
  // Rotating a full-width iPad changes geometry, never its device idiom or
  // regular-width placement. Keep the same panels and navigation entries.
  for (const [width, height] of [
    [1194, 810],
    [834, 1170],
    [1194, 810],
  ]) {
    layout.width = width!
    layout.height = height!
    render()
    expect(chrome.querySelector('nav')?.getAttribute('data-satin-tab-placement')).toBe('top')
    expect(registerTabs.mock.calls.at(-1)?.[1]?.placement).toBe('top')
    expect(mount.querySelector('[data-satin-tab-panel="b"]')).toBe(panel)
    expect([a, b].map(n => n.getState().entries.map(entry => entry.key))).toEqual(keys)
  }
  layout.width = 1024
  layout.height = 1376
  const selectedItem = topBar.items.find((item: { id: string }) => item.id === 'b')
  expect(panel?.getAttribute('role')).toBe('tabpanel')
  expect(panel?.getAttribute('aria-labelledby')).toBe(selectedItem.tabId)
  expect(selectedItem.panelId).toBe(panel?.id)
  layout.screen = { width: 744, height: 1133 }
  layout.width = 1133
  render()
  expect(host?.style.getPropertyValue('--satin-sidebar-width')).toBe('320px')
  layout.width = 744
  render()
  expect(host?.style.getPropertyValue('--satin-sidebar-width')).toBe('296px')
  layout.horizontal = 'compact'
  render()
  expect(chrome.querySelector('nav')).toBeNull()
  expect(mount.querySelector('[data-satin-tab-panel="b"]')).toBe(panel)
  expect(host?.style.getPropertyValue('--satin-sidebar-rowHeight')).toBe('52px')
  expect([a, b].map(navigator => navigator.getState().entries.map(entry => entry.key))).toEqual(
    keys,
  )
  expect([...mount.querySelectorAll('[data-satin-screen-key]')]).toEqual(retainedScreens)
  act(() => root.unmount())
  mount.remove()
  chrome.remove()
  vi.unstubAllGlobals()
})

it('owns the activated tab before its selection callback mounts content', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('navigator', { userAgent: 'iPad', platform: 'iPad', maxTouchPoints: 5 })
  layout.horizontal = 'regular'
  const mount = document.createElement('div'),
    chrome = document.createElement('div')
  document.body.append(mount, chrome)
  const root = createRoot(mount)
  const onSelect = vi.fn(() => {
    expect(document.activeElement?.textContent).toBe('B')
    expect(document.activeElement?.getAttribute('data-satin-focus-quiet')).not.toBeNull()
  })
  act(() =>
    root.render(
      <GlassMaterialContext
        value={{ chromeLayer: chrome, registerRegion: () => () => {}, diagnostics: {} as never }}
      >
        <TabBar
          items={[
            { id: 'a', label: 'A', icon: null },
            { id: 'b', label: 'B', icon: null },
          ]}
          selected="a"
          onSelect={onSelect}
        />
      </GlassMaterialContext>,
    ),
  )
  // Accessibility click: no preceding pointer or browser focus event.
  act(() => chrome.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click())
  expect(onSelect).toHaveBeenCalledWith('b')
  act(() => root.unmount())
  mount.remove()
  chrome.remove()
  layout.horizontal = 'compact'
})

it('hugs three portrait tabs with a Search role and stretches only for an accessory', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 })
  const previousLayout = { ...layout }
  Object.assign(layout, {
    horizontal: 'compact',
    width: 440,
    height: 956,
    screen: { width: 440, height: 956 },
  })
  const metrics = vi.spyOn(safeAreaMetrics, 'useSafeAreaMetrics').mockReturnValue({
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    physicalInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    physicalCoordinateSpace: 'layout-viewport',
    layoutViewport: { width: 440, height: 956 },
    visualViewport: { width: 440, height: 956, offsetTop: 0, offsetLeft: 0, scale: 1 },
    screen: { width: 440, height: 956 },
    safeFrame: { width: 440, height: 956 },
    physicalSafeFrame: { width: 440, height: 956 },
    coordinateSpacesReconcile: true,
    standalone: true,
  })
  const mount = document.createElement('div')
  const chrome = document.createElement('div')
  document.body.append(mount, chrome)
  const root = createRoot(mount)
  const render = (accessory: boolean) =>
    act(() =>
      root.render(
        <GlassMaterialContext
          value={{ chromeLayer: chrome, registerRegion: () => () => {}, diagnostics: {} as never }}
        >
          <TabView bottomAccessory={accessory ? <span>Now Playing</span> : undefined}>
            <Tab id="home" label="Home">
              Home
            </Tab>
            <Tab id="library" label="Library">
              Library
            </Tab>
            <Tab id="search" label="Search" role="search">
              Search
            </Tab>
          </TabView>
        </GlassMaterialContext>,
      ),
    )
  try {
    render(false)
    expect(mount.querySelector<HTMLElement>('[data-satin-tab-inset]')!.style.width).toBe(
      'max-content',
    )
    render(true)
    expect(mount.querySelector<HTMLElement>('[data-satin-tab-inset]')!.style.width).toBe('398px')
  } finally {
    act(() => root.unmount())
    mount.remove()
    chrome.remove()
    metrics.mockRestore()
    Object.assign(layout, previousLayout)
    vi.unstubAllGlobals()
  }
})

it.each([false, true])('presents search as the trailing iPad magnifier with liquid=%s', liquid => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('navigator', { userAgent: 'iPad', platform: 'iPad', maxTouchPoints: 5 })
  layout.horizontal = 'regular'
  const mount = document.createElement('div'),
    chrome = document.createElement('div')
  document.body.append(mount, chrome)
  const root = createRoot(mount),
    registerTabs = vi.fn(),
    onSelect = vi.fn()
  const items = [
    {
      id: 'search',
      label: 'Find music',
      role: 'search' as const,
      accessibilityLabel: 'Search collection',
    },
    { id: 'home', label: 'Home' },
    { id: 'plain', label: 'Search' },
  ]
  try {
    act(() =>
      root.render(
        <GlassMaterialContext
          value={{ chromeLayer: chrome, registerRegion: () => () => {}, diagnostics: {} as never }}
        >
          <MaterialEffectContext
            value={
              liquid
                ? {
                    ready: false,
                    registerTabs,
                    regions: { register: () => () => {}, invalidate: vi.fn() } as never,
                  }
                : null
            }
          >
            <TabBar items={items} selected="home" onSelect={onSelect} />
          </MaterialEffectContext>
        </GlassMaterialContext>,
      ),
    )
    const painted = [...chrome.querySelectorAll('[data-satin-tab-item]')]
    expect(painted.map(item => item.textContent)).toEqual(['Home', 'Search', ''])
    expect(painted[2]!.querySelector('svg')).not.toBeNull()
    expect(items.map(item => item.id)).toEqual(['search', 'home', 'plain'])
    if (liquid) {
      const registered = registerTabs.mock.calls.at(-1)?.[1]
      expect(registered.items.map((item: { id: string }) => item.id)).toEqual([
        'home',
        'plain',
        'search',
      ])
      expect(registered.selected).toBe('home')
      expect(registered.items[2].accessibilityLabel).toBe('Search collection')
    } else {
      expect(painted[2]!.getAttribute('aria-label')).toBe('Search collection')
      act(() => (painted[2] as HTMLButtonElement).click())
      expect(onSelect).toHaveBeenCalledWith('search')
    }
  } finally {
    act(() => root.unmount())
    mount.remove()
    chrome.remove()
    layout.horizontal = 'compact'
    vi.unstubAllGlobals()
  }
})

it('keeps a collapsed adaptable bar usable when its selected destination is sidebar-only', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('navigator', { userAgent: 'iPad', platform: 'iPad', maxTouchPoints: 5 })
  layout.horizontal = 'regular'
  const mount = document.createElement('div'),
    chrome = document.createElement('div')
  document.body.append(mount, chrome)
  const root = createRoot(mount)
  try {
    act(() =>
      root.render(
        <GlassMaterialContext
          value={{
            chromeLayer: chrome,
            registerRegion: vi.fn(() => () => {}),
            diagnostics: {} as never,
          }}
        >
          <TabBar
            items={[
              { id: 'home', label: 'Home' },
              { id: 'search', label: 'Search', role: 'search' },
            ]}
            selected="albums"
            onSelect={() => {}}
            onShowSidebar={() => {}}
          />
        </GlassMaterialContext>,
      ),
    )
    const tabs = [...chrome.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    expect(tabs).toHaveLength(2)
    expect(tabs.every(tab => tab.getAttribute('aria-selected') === 'false')).toBe(true)
    expect(tabs[0]!.tabIndex).toBe(0)
    expect(chrome.querySelector('[aria-label="Show Tab Sidebar"]')).not.toBeNull()
  } finally {
    act(() => root.unmount())
    mount.remove()
    chrome.remove()
    layout.horizontal = 'compact'
    vi.unstubAllGlobals()
  }
})
