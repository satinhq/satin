// @vitest-environment happy-dom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { GlassPresentation } from './GlassPresentation.tsx'
import { Tab, TabView } from '../tabs/TabView.tsx'
import { MaterialEffectContext, type RegisteredTabBar } from './liquidContext.ts'

vi.mock('../root/runtimeContext.ts', async importOriginal => ({
  ...(await importOriginal<object>()),
  useLayoutClass: () => ({ horizontal: 'compact', vertical: 'regular' }),
  useSatinLayoutRuntime: () => ({ metrics: { layoutViewport: { width: 402, height: 874 } } }),
}))
vi.mock('./context.ts', async importOriginal => ({
  ...(await importOriginal<object>()),
  useGlassMaterialContext: () => ({ chromeLayer: null, registerRegion: () => () => {} }),
}))

// StrictMode cleanup must release only its own pending runtime request.
const state = vi.hoisted(() => ({
  calls: [] as unknown[][],
  created: [] as { menuEnabled: boolean; options: unknown }[],
  resolvers: [] as (() => void)[],
}))
vi.mock('./webgpu/production.ts', () => {
  const runtime = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'then'
          ? undefined
          : (...args: unknown[]) => {
              state.calls.push([key, ...args])
            },
    },
  )
  return {
    ProductionGlassRuntime: {
      create(options: { menuEnabled: boolean; onPresented?: (ready: boolean) => void }) {
        state.created.push({ menuEnabled: options.menuEnabled, options })
        options.onPresented?.(true)
        return new Promise(resolve => {
          state.resolvers.push(() => resolve(runtime))
        })
      },
    },
  }
})

afterEach(() => {
  state.calls = []
  state.created = []
  state.resolvers = []
})

it('StrictMode (setup → cleanup → setup while create is pending): the cancelled call releases only as its own owner', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const mount = document.createElement('div'),
    scroller = document.createElement('div'),
    content = document.createElement('div')
  document.body.append(mount, scroller, content)
  const root = createRoot(mount)
  try {
    act(() =>
      root.render(
        <StrictMode>
          <GlassPresentation consumer={{ scroller, content, onReady() {} }} />
        </StrictMode>,
      ),
    )
    expect(state.created.length).toBe(2)
    await act(async () => {
      for (const resolve of state.resolvers) resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const releases = state.calls.filter(call => call[0] === 'dispose' || call[0] === 'detach')
    // The shared runtime is released once, by the cancelled first call, with ITS options: the runtime
    // ignores that stale owner once the second call has rebound it. The bound (second) owner is never released.
    expect(releases.length).toBe(1)
    expect(releases[0][1]).toBe(state.created[0].options)
    expect(releases.some(call => call[1] === state.created[1].options)).toBe(false)
  } finally {
    act(() => root.unmount())
    mount.remove()
    scroller.remove()
    content.remove()
  }
})

it('renders symbol tab declarations in the bottom glass path and updates selected fills', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const mount = document.createElement('div')
  const scroller = document.createElement('div')
  const content = document.createElement('div')
  document.body.append(mount, scroller, content)
  const root = createRoot(mount)
  const renderTabs = (selected: string) =>
    root.render(
      <GlassPresentation
        consumer={{
          scroller,
          content,
          onReady() {},
          tabs: {
            items: [
              { id: 'star', label: 'Star', symbol: 'star' },
              { id: 'house', label: 'House', symbol: 'house' },
            ],
            selected,
            onSelect() {},
          },
        }}
      />,
    )
  try {
    act(() => renderTabs('star'))
    const star = mount.querySelector('[data-satin-symbol="star"]')!
    const initialPath = star.querySelector('g path')!.getAttribute('d')
    expect(star.closest('[role="tab"]')?.getAttribute('aria-selected')).toBe('true')
    act(() => renderTabs('house'))
    expect(star.querySelector('g path')!.getAttribute('d')).not.toBe(initialPath)
    expect(star.closest('[role="tab"]')?.getAttribute('aria-selected')).toBe('false')
    expect(mount.querySelector('[data-satin-symbol="house"]')).not.toBeNull()
  } finally {
    act(() => root.unmount())
    mount.remove()
    scroller.remove()
    content.remove()
  }
})

it('keeps inset-slot tab foreground in the glass presentation layer', () => {
  const mount = document.createElement('div')
  const tabMount = document.createElement('div')
  const content = document.createElement('div')
  const scroller = document.createElement('div')
  document.body.append(mount, tabMount, content, scroller)
  const tabsRoot = createRoot(tabMount)
  let registered: RegisteredTabBar | undefined
  act(() =>
    tabsRoot.render(
      <MaterialEffectContext
        value={{
          ready: false,
          registerTabs: (_id, tabs) => {
            registered = tabs
          },
        }}
      >
        <TabView bottomAccessory={<textarea aria-label="Message" />}>
          <Tab id="star" label="Star" symbol="star">
            Thread
          </Tab>
          <Tab id="house" label="House" symbol="house">
            Home
          </Tab>
        </TabView>
      </MaterialEffectContext>,
    ),
  )
  const insetHost = registered!.insetHost!
  expect(insetHost.closest('[data-satin-safe-area-inset]')).not.toBeNull()
  const rect = vi.spyOn(insetHost, 'getBoundingClientRect').mockReturnValue({
    x: 20,
    y: 870,
    width: 400,
    height: 62,
  } as DOMRect)
  let measure = () => {}
  const observe = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        measure = () => callback([], this as unknown as ResizeObserver)
      }
      observe = observe
      disconnect() {}
    },
  )
  const root = createRoot(mount)
  try {
    act(() =>
      root.render(
        <GlassPresentation
          consumer={{
            content,
            scroller,
            onReady() {},
            tabs: registered,
          }}
        />,
      ),
    )
    const shell = mount.querySelector('[data-satin-liquid="consumer"]')!
    const dock = document.querySelector('.satin-lens-glass-chrome--dock')!
    // The slot is in the content stacking context, below the GPU chrome canvas. Merely having
    // glyphs in the DOM is insufficient: their foreground must share the canvas's chrome layer.
    expect(shell.contains(dock)).toBe(true)
    expect(dock.querySelector('[data-satin-symbol="star"]')).not.toBeNull()
    expect(dock.querySelector('small')?.textContent).toBe('Star')
    expect((dock as HTMLElement).style.left).toBe('20px')
    expect((dock as HTMLElement).style.top).toBe('870px')
    expect(observe).toHaveBeenCalledWith(insetHost.closest('[data-satin-bottom-boundary="root"]'))
    rect.mockReturnValue({ x: 20, y: 700, width: 400, height: 62 } as DOMRect)
    act(() => measure())
    expect((dock as HTMLElement).style.top).toBe('700px')
  } finally {
    act(() => root.unmount())
    act(() => tabsRoot.unmount())
    for (const element of [mount, tabMount, content, scroller]) element.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
