import { resetPointerClickSuppression } from '../press/activation.ts'
// @vitest-environment happy-dom
import { registerCompactTabBar } from './compactBar.ts'
import { installKeyboardAdapter } from '../keyboard/adapter.ts'
import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tab, TabSection, TabView } from './TabView.tsx'
import { GlassEffect } from '../public/glass.tsx'
import { Image } from '../image/Image.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { ContentAdmission } from '../image/ContentAdmission.tsx'
import { Pressable } from '../press/Pressable.tsx'
import { resolveTabSelection } from './model.ts'
import { NavigatorHost } from '../navigation/NavigatorHost.tsx'
import { createNavigator, navigatorScrollRuntime } from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { useScreenLifecycle } from '../navigation/navigationContext.tsx'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import { reconcileWindowGeometry } from '../safe-area/useSafeAreaMetrics.ts'
import type { TabBarProps } from '../glass/TabBar.tsx'

vi.mock('../glass/TabBar.tsx', () => ({
  TabBar: ({
    items,
    selected,
    onSelect,
    onShowSidebar,
    trailingAction,
    inert,
    style,
    ...props
  }: TabBarProps) => (
    <>
      <nav inert={inert} style={style} aria-hidden={props['aria-hidden']}>
        {onShowSidebar && <button aria-label="Show Tab Sidebar" onClick={onShowSidebar} />}
        {items.map(item => (
          <button
            key={item.id}
            id={item.tabId}
            aria-controls={item.panelId}
            disabled={item.disabled}
            data-selected={item.id === selected}
            onClick={() => onSelect(item.id)}
          >
            {item.id}
          </button>
        ))}
      </nav>
      {trailingAction}
    </>
  ),
}))
const layout = vi.hoisted(() => ({ horizontal: 'compact', vertical: 'regular' }))
const viewport = vi.hoisted(() => ({ width: 402, height: 874 }))
const physicalInsets = vi.hoisted(() => ({ top: 32, right: 0, bottom: 0, left: 0 }))
vi.mock('../root/runtimeContext.ts', () => ({
  useLayoutClass: () => layout,
  useSatinLayoutRuntime: () => ({
    layoutClass: { horizontal: 'compact' },
    metrics: {
      layoutViewport: viewport,
      screen: { width: 402, height: 874 },
      physicalInsets,
      insets: physicalInsets,
    },
  }),
}))
vi.mock('../navigation/NavigationChrome.tsx', () => ({ NavigationChrome: () => null }))
vi.mock('../reachability/react.tsx', async importOriginal => ({
  ...(await importOriginal<typeof import('../reachability/react.tsx')>()),
  ReachabilityRoute: ({ children }: { children: React.ReactNode }) => children,
}))
let root: Root, element: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(() => {
  act(() => root.unmount())
  element.remove()
  vi.restoreAllMocks()
  layout.horizontal = 'compact'
  viewport.width = 402
  viewport.height = 874
  physicalInsets.bottom = 0
})
const render = (children: React.ReactNode) => act(() => root.render(children))
const select = (id: string) =>
  act(() =>
    [...element.querySelectorAll('nav button')]
      .find(button => button.textContent === id)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })),
  )
const panel = (id: string) => element.querySelector<HTMLElement>(`[data-satin-tab-panel="${id}"]`)

it('runs a trailing action without selecting or remounting a destination', () => {
  const changed = vi.fn()
  const mounted = vi.fn()
  function Content() {
    useEffect(mounted, [])
    return 'Home content'
  }
  function App() {
    const [opens, setOpens] = useState(0)
    return (
      <TabView
        onSelectionChange={changed}
        trailingAction={
          <button aria-label="Compose" onClick={() => setOpens(value => value + 1)}>
            {opens}
          </button>
        }
      >
        <Tab id="home" label="Home">
          <Content />
        </Tab>
        <Tab id="saved" label="Saved">
          Saved content
        </Tab>
      </TabView>
    )
  }
  render(<App />)
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Compose"]')!.click())
  expect(element.querySelector('[aria-label="Compose"]')?.textContent).toBe('1')
  expect(panel('home')?.dataset.satinTabActive).toBe('true')
  expect(changed).not.toHaveBeenCalled()
  expect(mounted).toHaveBeenCalledTimes(1)
})

it('rejects an action competing with the reserved search destination', () => {
  expect(() =>
    render(
      <TabView trailingAction={<button>Compose</button>}>
        <Tab id="home" label="Home">
          Home
        </Tab>
        <Tab id="search" label="Search" role="search">
          Search
        </Tab>
      </TabView>,
    ),
  ).toThrow('either trailingAction or a Tab with role="search", not both')
})

describe('TabView ownership', () => {
  it('mounts lazily, keeps DOM and React state, and makes hidden tabs inaccessible', () => {
    const mount = vi.fn(),
      unmount = vi.fn()
    function Counter() {
      const [count, setCount] = useState(0)
      useEffect(() => {
        mount()
        return unmount
      }, [])
      return <button onClick={() => setCount(count + 1)}>{count}</button>
    }
    render(
      <TabView>
        <Tab id="a" label="A" icon={null}>
          <Counter />
        </Tab>
        <Tab id="b" label="B" icon={null}>
          <Counter />
        </Tab>
      </TabView>,
    )
    expect(panel('b')?.childElementCount).toBe(0)
    expect(mount).toHaveBeenCalledTimes(1)
    const a = panel('a')!
    act(() => a.querySelector('button')!.click())
    a.scrollTop = 123
    select('b')
    expect(a.hasAttribute('inert')).toBe(true)
    expect(a.getAttribute('aria-hidden')).toBe('true')
    select('a')
    expect(panel('a')).toBe(a)
    expect(a.scrollTop).toBe(123)
    expect(a.textContent).toBe('1')
    expect(mount).toHaveBeenCalledTimes(2)
    expect(unmount).not.toHaveBeenCalled()
  })
  it('waits for the controlled selection and ignores disabled selection', () => {
    const change = vi.fn()
    const children = [
      <Tab key="a" id="a" label="A" icon={null}>
        A
      </Tab>,
      <Tab key="b" id="b" label="B" icon={null}>
        B
      </Tab>,
      <Tab key="c" id="c" label="C" icon={null} disabled>
        C
      </Tab>,
    ]
    render(
      <TabView selection="a" onSelectionChange={change}>
        {children}
      </TabView>,
    )
    select('b')
    expect(change).toHaveBeenCalledWith('b')
    expect(panel('b')?.childElementCount).toBe(0)
    render(
      <TabView selection="b" onSelectionChange={change}>
        {children}
      </TabView>,
    )
    expect(panel('b')?.dataset.satinTabActive).toBe('true')
    select('c')
    expect(change).toHaveBeenCalledTimes(1)
  })
  it('keeps separate navigators, settles a hidden push, and re-taps root then primary scroll', () => {
    const disappear = vi.fn(),
      appear = vi.fn()
    function Screen() {
      useScreenLifecycle({ disappear, appear })
      return <span>screen</span>
    }
    const registry = createScreenRegistry(
      defineScreen('root', { component: Screen }),
      defineScreen('detail', { component: Screen }),
    )
    const a = createNavigator({
      registry,
      initial: { id: 'root' },
      transitionControllerFactory: completion => ({
        progress: 0,
        finish: completion.finish,
        cancel: completion.cancel,
      }),
    })
    const b = createNavigator({ registry, initial: { id: 'root' } })
    render(
      <TabView>
        <Tab id="a" label="A" icon={null}>
          <NavigatorHost navigator={a} />
        </Tab>
        <Tab id="b" label="B" icon={null}>
          <NavigatorHost navigator={b} />
        </Tab>
      </TabView>,
    )
    act(() => a.push('detail'))
    select('b')
    expect(a.getState().entries).toHaveLength(2)
    expect(a.getState().entries[1].transition.phase).toBe('settled')
    expect(disappear).toHaveBeenCalled()
    expect(b.getState().entries).toHaveLength(1)
    select('a')
    select('a')
    expect(a.getState().entries[1].transition.phase).toBe('exiting')
    act(() => a.getState().entries[1].transition.controller.finish())
    const scrollTo = vi.fn()
    const scroll = createScrollSurfaceRegistry()
    scroll.register({
      id: 'primary',
      primary: true,
      axis: 'vertical',
      element: { scrollTop: 200, scrollLeft: 0, scrollTo },
    })
    const release = a[navigatorScrollRuntime].bind(a.getState().entries[0].key, scroll)
    select('a')
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', left: 0, top: 0 })
    release()
  })
  it('removes deleted tabs and validates identities', () => {
    expect(() => resolveTabSelection([{ id: 'a' }, { id: 'a' }])).toThrow(/unique/)
    expect(resolveTabSelection([{ id: 'a', disabled: true }, { id: 'b' }], 'a')).toBe('b')
    expect(resolveTabSelection([{ id: 'a', disabled: true }])).toBeUndefined()
    render(
      <TabView>
        <Tab id="a" label="A" icon={null}>
          A
        </Tab>
        <Tab id="b" label="B" icon={null}>
          B
        </Tab>
      </TabView>,
    )
    select('b')
    render(
      <TabView>
        <Tab id="a" label="A" icon={null}>
          A
        </Tab>
      </TabView>,
    )
    expect(panel('b')).toBeNull()
    expect(panel('a')?.dataset.satinTabActive).toBe('true')
  })
})

it('keeps portrait sidebar content full width and dismisses the modal sidebar', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
  layout.horizontal = 'regular'
  viewport.width = 1194
  viewport.height = 802
  render(
    <TabView tabViewStyle="sidebarAdaptable">
      <Tab id="home" label="Home">
        Content
      </Tab>
    </TabView>,
  )
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Show Tab Sidebar"]')!.click())
  viewport.width = 834
  viewport.height = 1162
  render(
    <TabView tabViewStyle="sidebarAdaptable">
      <Tab id="home" label="Home">
        Content
      </Tab>
    </TabView>,
  )
  const dismiss = element.querySelector<HTMLButtonElement>('[aria-label="Dismiss Tab Sidebar"]')
  expect(dismiss).not.toBeNull()
  expect(element.querySelector('[data-satin-tab-sidebar-overlay="true"]')).not.toBeNull()
  expect(element.querySelector('[data-satin-safe-area-inset]')?.hasAttribute('inert')).toBe(true)
  expect(element.querySelector('nav button[data-selected]')?.textContent).toBe('home')
  expect(element.querySelector('nav')?.inert).toBe(true)
  expect(element.querySelector('nav')?.style.visibility).toBe('hidden')
  act(() => dismiss!.click())
  expect(element.querySelector('aside')).toBeNull()
  vi.restoreAllMocks()
  layout.horizontal = 'compact'
  viewport.width = 402
  viewport.height = 874
  physicalInsets.bottom = 0
})

it('starts a fresh landscape iPad scene with outer tabs collapsed', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
  layout.horizontal = 'regular'
  viewport.width = 1194
  viewport.height = 802
  render(
    <TabView tabViewStyle="sidebarAdaptable">
      <Tab id="home" label="Home">
        Content
      </Tab>
    </TabView>,
  )
  expect(element.querySelector('aside')).toBeNull()
  expect(panel('home')?.textContent).toBe('Content')
})

it('distinguishes an explicit portrait sidebar collapse from the initial tab presentation', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
  layout.horizontal = 'regular'
  viewport.width = 834
  viewport.height = 1162
  const app = (
    <TabView tabViewStyle="sidebarAdaptable">
      <Tab id="home" label="Home">
        Content
      </Tab>
    </TabView>
  )
  render(app)
  const host = () => element.querySelector<HTMLElement>('[data-satin-tab-view]')!
  expect(host().dataset.satinTabSidebarCollapsedOverlay).toBeUndefined()
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Show Tab Sidebar"]')!.click())
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Dismiss Tab Sidebar"]')!.click())
  expect(host().dataset.satinTabSidebarCollapsedOverlay).toBe('true')
  expect(host().style.getPropertyValue('--satin-tab-sidebar-return-inset')).toBe('32px')
  expect(
    reconcileWindowGeometry(
      { top: 0, right: 0, bottom: 0, left: 0 },
      { width: 834, height: 1162 },
      { width: 834, height: 1194 },
      true,
    ).physicalInsets.top,
  ).toBe(32)
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Show Tab Sidebar"]')!.click())
  expect(host().dataset.satinTabSidebarCollapsedOverlay).toBeUndefined()
})

it('ends editing when leaving a retained tab', () => {
  render(
    <TabView>
      <Tab id="search" label="Search" icon={null}>
        <input aria-label="Search" />
      </Tab>
      <Tab id="home" label="Home" icon={null}>
        Home
      </Tab>
    </TabView>,
  )
  const stop = installKeyboardAdapter(document.body)
  try {
    const input = panel('search')!.querySelector('input')!
    input.focus()
    select('home')
    expect(document.activeElement).not.toBe(input)
    expect(input.isConnected).toBe(true)
  } finally {
    stop()
  }
})

it('keeps the Search-role shortcut without an accessory and selects its retained destination', () => {
  render(
    <TabView defaultSelection="home">
      <Tab id="home" label="Home">
        Home content
      </Tab>
      <Tab id="search" label="Search" role="search">
        Search content
      </Tab>
    </TabView>,
  )
  const shortcut = element.querySelector<HTMLButtonElement>(
    '[data-satin-tab-compact-search] button',
  )
  expect(shortcut).not.toBeNull()
  let expanded = false
  const unregister = registerCompactTabBar(
    element.querySelector('[data-satin-tab-bottom-chrome]')!,
    () => {
      expanded = true
    },
  )
  act(() => shortcut!.click())
  expect(expanded).toBe(true)
  expect(panel('search')?.dataset.satinTabActive).toBe('true')
  expanded = false
  act(() => shortcut!.click())
  expect(expanded).toBe(true)
  unregister()
})

it('keeps an accessory drag-off from activating an underlying row and preserves the next tap', () => {
  let pushes = 0
  let opens = 0
  render(
    <TabView bottomAccessory={<button onClick={() => opens++}>Now Playing</button>}>
      <Tab id="library" label="Library" icon={null}>
        <button onClick={() => pushes++}>Albums</button>
      </Tab>
    </TabView>,
  )
  const accessory = element.querySelector<HTMLElement>('[data-satin-tab-bottom-accessory]')!
  const button = accessory.querySelector('button')!
  const row = panel('library')!.querySelector('button')!
  accessory.getBoundingClientRect = () => new DOMRect(0, 0, 400, 48)
  const contact = (type: string, target: Element, y: number) =>
    act(() => {
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          isPrimary: true,
          button: 0,
          pointerType: 'touch',
          clientX: 20,
          clientY: y,
          detail: type === 'click' ? 1 : 0,
        }),
      )
    })
  try {
    contact('pointerdown', accessory, 20)
    contact('pointerup', row, 100)
    contact('click', row, 100)
    expect(pushes).toBe(0)
    contact('pointerdown', button, 20)
    contact('pointerup', button, 20)
    contact('click', button, 20)
    expect(opens).toBe(1)
    contact('pointerdown', row, 100)
    contact('pointerup', row, 100)
    contact('click', row, 100)
    expect(pushes).toBe(1)
  } finally {
    resetPointerClickSuppression()
  }
})

it('places the search role first in the existing tab sidebar while retaining panel identity', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
  layout.horizontal = 'regular'
  viewport.width = 1024
  viewport.height = 1334
  render(
    <TabView tabViewStyle="sidebarAdaptable" defaultSelection="home">
      <Tab id="home" label="Home">
        Home content
      </Tab>
      <Tab id="ordinary-search" label="Search">
        Ordinary content
      </Tab>
      <Tab id="search" label="Find music" role="search" accessibilityLabel="Search collection">
        Search content
      </Tab>
    </TabView>,
  )
  const home = panel('home')
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Show Tab Sidebar"]')!.click())
  const tabs = [...element.querySelectorAll<HTMLButtonElement>('aside [role="tab"]')]
  const ids = [...element.querySelectorAll('[id]')].map(node => node.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(tabs.map(tab => tab.textContent)).toEqual(['Find music', 'Home', 'Search'])
  expect(tabs[0]!.querySelector('svg')).not.toBeNull()
  expect(tabs[0]!.getAttribute('aria-label')).toBe('Search collection')
  act(() => tabs[0]!.click())
  expect(panel('search')?.dataset.satinTabActive).toBe('true')
  const searchControl = [...element.querySelectorAll('nav button')].find(
    button => button.textContent === 'search',
  )!
  expect(panel('search')?.getAttribute('aria-labelledby')).toBe(searchControl.id)
  expect(panel('home')).toBe(home)
})

it('groups sidebar-only destinations without adding top tabs and retains their panels when collapsed', () => {
  vi.stubGlobal('navigator', { userAgent: 'iPad', maxTouchPoints: 5 })
  layout.horizontal = 'regular'
  viewport.width = 1366
  viewport.height = 1024
  render(
    <TabView tabViewStyle="sidebarAdaptable">
      <Tab id="home" label="Home">
        Home
      </Tab>
      <TabSection title="Library" tabPlacement="sidebarOnly">
        <Tab id="albums" label="Albums">
          <input aria-label="Album filter" defaultValue="Saved" />
        </Tab>
        <Tab id="artists" label="Artists">
          Artists
        </Tab>
      </TabSection>
      <Tab id="search" label="Search" role="search">
        Search
      </Tab>
    </TabView>,
  )
  expect([...element.querySelectorAll('nav button')].map(b => b.textContent)).toEqual([
    '',
    'home',
    'search',
  ])
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Show Tab Sidebar"]')!.click())
  expect([...element.querySelectorAll('[role="tab"]')].map(b => b.textContent)).toEqual([
    'Search',
    'Home',
    'Albums',
    'Artists',
  ])
  const albums = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    b => b.textContent === 'Albums',
  )!
  act(() => albums.click())
  const retained = panel('albums')!
  const filter = retained.querySelector('input')!
  filter.value = 'Edited'
  const header = element.querySelector<HTMLButtonElement>('[aria-label="Library"]')!
  act(() => header.click())
  expect(header.getAttribute('aria-expanded')).toBe('false')
  expect(element.querySelector('[role="group"]')!.hasAttribute('hidden')).toBe(true)
  expect(panel('albums')).toBe(retained)
  expect(filter.value).toBe('Edited')
  const home = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    button => button.textContent === 'Home',
  )!
  act(() => home.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
  expect(panel('search')?.dataset.satinTabActive).toBe('true')
  act(() => header.click())
  expect(element.querySelector('[role="group"]')!.hasAttribute('hidden')).toBe(false)
  vi.unstubAllGlobals()
})

it('does not promote sidebar-only destinations into the compact phone bar', () => {
  render(
    <TabView>
      <Tab id="home" label="Home">
        Home
      </Tab>
      <TabSection title="Library" tabPlacement="sidebarOnly">
        <Tab id="albums" label="Albums">
          Albums
        </Tab>
      </TabSection>
    </TabView>,
  )
  expect([...element.querySelectorAll('nav button')].map(b => b.textContent)).toEqual(['home'])
  expect(panel('albums')).not.toBeNull()
})

it('closes a portrait sidebar on destination selection and restores its accessory frame', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
  layout.horizontal = 'regular'
  viewport.width = 834
  viewport.height = 1194
  render(
    <TabView tabViewStyle="sidebarAdaptable" bottomAccessory={<span>Track</span>}>
      <Tab id="home" label="Home">
        Home
      </Tab>
      <TabSection title="Collection" tabPlacement="sidebarOnly">
        <Tab id="albums" label="Albums">
          Albums
        </Tab>
      </TabSection>
    </TabView>,
  )
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Show Tab Sidebar"]')!.click())
  const albums = [...element.querySelectorAll<HTMLButtonElement>('aside [role="tab"]')].find(
    button => button.textContent === 'Albums',
  )!
  act(() => albums.click())
  expect(panel('albums')?.dataset.satinTabActive).toBe('true')
  expect(element.querySelector('[data-satin-tab-sidebar]')).toBeNull()
  expect(
    element.querySelector<HTMLElement>('[data-satin-tab-bottom-accessory]')!.style.marginLeft,
  ).toBe('24px')
})

it('presents the selected sidebar-only destination in the regular iPad bar with its accessible identity', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
  layout.horizontal = 'regular'
  viewport.width = 834
  viewport.height = 1194
  render(
    <TabView tabViewStyle="sidebarAdaptable" defaultSelection="albums">
      <Tab id="home" label="Home">
        Home
      </Tab>
      <TabSection title="Collection" tabPlacement="sidebarOnly">
        <Tab id="albums" label="Albums">
          Albums
        </Tab>
        <Tab id="artists" label="Artists">
          Artists
        </Tab>
      </TabSection>
      <Tab id="search" label="Search" role="search">
        Search
      </Tab>
    </TabView>,
  )
  const buttons = [...element.querySelectorAll<HTMLButtonElement>('nav button')]
  expect(buttons.map(button => button.textContent)).toEqual(['', 'home', 'albums', 'search'])
  const albums = buttons.find(button => button.textContent === 'albums')!
  expect(albums.dataset.selected).toBe('true')
  expect(panel('albums')?.getAttribute('aria-labelledby')).toBe(albums.id)
  select('home')
  expect([...element.querySelectorAll('nav button')].map(button => button.textContent)).toEqual([
    '',
    'home',
    'albums',
    'search',
  ])
  expect(panel('home')?.dataset.satinTabActive).toBe('true')
})

it('rejects duplicate destination IDs across sections instead of sharing a retained stack', () => {
  expect(() =>
    render(
      <TabView>
        <Tab id="home" label="Home">
          Home
        </Tab>
        <TabSection title="Library" tabPlacement="sidebarOnly">
          <Tab id="home" label="Duplicate">
            Duplicate
          </Tab>
        </TabSection>
      </TabView>,
    ),
  ).toThrow(/duplicate tab id/i)
})

it.each([0, 20, 25])('keeps native iPad accessory margins with a %i pt physical inset', bottom => {
  physicalInsets.bottom = bottom
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
  layout.horizontal = 'regular'
  viewport.width = 1024
  viewport.height = 1366
  render(
    <TabView tabViewStyle="sidebarAdaptable" bottomAccessory={<span>Track</span>}>
      <Tab id="home" label="Home">
        Page
      </Tab>
    </TabView>,
  )
  const accessory = element.querySelector<HTMLElement>('[data-satin-tab-bottom-accessory]')!
  const page = panel('home')
  expect(accessory.style.marginLeft).toBe('24px')
  expect(accessory.style.marginRight).toBe('24px')
  expect(accessory.style.marginBottom).toBe(`${24 - bottom}px`)
  expect(accessory.style.minHeight).toBe('48px')
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Show Tab Sidebar"]')!.click())
  expect(accessory.style.marginLeft).toBe('304px')
  expect(accessory.style.marginRight).toBe('24px')
  expect(accessory.style.minHeight).toBe('48px')
  expect(panel('home')).toBe(page)
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Dismiss Tab Sidebar"]')!.click())
  expect(accessory.style.marginLeft).toBe('24px')
})

it('does not double-count a landscape sidebar column or change the phone accessory contract', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
  layout.horizontal = 'regular'
  viewport.width = 1366
  viewport.height = 1024
  const app = (
    <TabView tabViewStyle="sidebarAdaptable" bottomAccessory={<span>Track</span>}>
      <Tab id="home" label="Home">
        Page
      </Tab>
    </TabView>
  )
  render(app)
  act(() => element.querySelector<HTMLButtonElement>('[aria-label="Show Tab Sidebar"]')!.click())
  const accessory = element.querySelector<HTMLElement>('[data-satin-tab-bottom-accessory]')!
  expect(accessory.style.marginLeft).toBe('24px')
  expect(element.querySelector('[data-satin-tab-sidebar-dim]')).toBeNull()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  layout.horizontal = 'compact'
  viewport.width = 402
  viewport.height = 874
  render(
    <TabView bottomAccessory={<span>Track</span>}>
      <Tab id="home" label="Home">
        Page
      </Tab>
    </TabView>,
  )
  expect(accessory.style.marginLeft).toBe('')
  expect(accessory.style.minHeight).toBe('')
})

it.each([false, true])('commits cold tab placeholders with glass=%s', async glass => {
  const coldSource = `https://tab-admission.test/cold-${glass}.jpg`
  const fullSource = `https://tab-admission.test/full-${glass}.jpg`
  let resolveArtwork = () => {}
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 80
      naturalHeight = 80
      decode() {
        return new Promise<void>(resolve => {
          resolveArtwork = resolve
        })
      }
    },
  )
  let finishDisplayed = () => {}
  const displayedDecode = vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finishDisplayed = resolve
      }),
  )
  const activate = vi.fn()
  function AlbumCard() {
    const [preparing, setPreparing] = useState(false)
    return (
      <Pressable onPress={activate} onPressStateChange={state => setPreparing(state === 'pressed')}>
        <Image priority src={coldSource} alt="Cold album" />
        {preparing && (
          <span hidden>
            <Image priority src={fullSource} alt="" />
          </span>
        )}
      </Pressable>
    )
  }
  try {
    await act(() =>
      root.render(
        <MaterialEffectContext
          value={glass ? { ready: true, preparingSources: true, registerTabs() {} } : null}
        >
          <TabView>
            <Tab id="a" label="A">
              Accepted screen
            </Tab>
            <Tab id="b" label="B">
              <ContentAdmission>
                <AlbumCard />
              </ContentAdmission>
            </Tab>
          </TabView>
        </MaterialEffectContext>,
      ),
    )
    await select('b')
    if (glass) {
      expect(panel('b')!.dataset.satinTabActive).toBe('true')
      act(() => panel('b')!.dispatchEvent(new Event('satin:tab-source-ready', { bubbles: true })))
    }
    expect(panel('b')!.getAttribute('aria-hidden')).toBeNull()
    expect(element.querySelector('nav [data-selected="true"]')!.textContent).toBe('b')
    expect(panel('b')!.querySelector('[data-satin-content-pending]')).not.toBeNull()
    await select('a')
    if (glass)
      act(() => panel('a')!.dispatchEvent(new Event('satin:tab-source-ready', { bubbles: true })))
    await act(() => resolveArtwork())
    expect(panel('a')!.getAttribute('aria-hidden')).toBeNull()
    await select('b')
    if (glass) {
      expect(panel('b')!.dataset.satinTabActive).toBe('true')
      act(() => panel('b')!.dispatchEvent(new Event('satin:tab-source-ready', { bubbles: true })))
    }
    expect(panel('b')!.getAttribute('aria-hidden')).toBeNull()
    expect(panel('b')!.querySelector('img')!.dataset.satinImageState).toBe('pending')
    await act(() => finishDisplayed())
    expect(panel('b')!.getAttribute('aria-hidden')).toBeNull()
    expect(panel('b')!.querySelector('img')!.src).toBe(coldSource)
    const button = panel('b')!.querySelector('button')!
    button.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    button.setPointerCapture = () => {}
    button.hasPointerCapture = () => true
    button.releasePointerCapture = () => {}
    const touch = (type: string) =>
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 77,
        isPrimary: true,
        pointerType: 'touch',
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    await act(() => button.dispatchEvent(touch('pointerdown')))
    expect(button.style.display).not.toBe('none')
    await act(() => button.dispatchEvent(touch('pointerup')))
    expect(activate).toHaveBeenCalledOnce()
  } finally {
    displayedDecode.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('reveals a tab and selects its label only after that tab source is presented', async () => {
  render(
    <MaterialEffectContext value={{ ready: true, preparingSources: true, registerTabs() {} }}>
      <TabView>
        <Tab id="a" label="A">
          First page
        </Tab>
        <Tab id="b" label="B">
          Second page
        </Tab>
      </TabView>
    </MaterialEffectContext>,
  )
  await select('b')
  expect(panel('b')!.dataset.satinTabActive).toBe('true')
  expect(panel('a')!.getAttribute('aria-hidden')).toBeNull()
  expect(element.querySelector('nav [data-selected="true"]')!.textContent).toBe('a')
  // A capture of the outgoing tab cannot admit the destination.
  act(() => panel('a')!.dispatchEvent(new Event('satin:tab-source-ready', { bubbles: true })))
  expect(panel('a')!.getAttribute('aria-hidden')).toBeNull()
  act(() => panel('b')!.dispatchEvent(new Event('satin:tab-source-ready', { bubbles: true })))
  expect(panel('b')!.getAttribute('aria-hidden')).toBeNull()
  expect(element.querySelector('nav [data-selected="true"]')!.textContent).toBe('b')
})

it('ignores a superseded tab receipt and admits only the latest requested panel', async () => {
  render(
    <MaterialEffectContext value={{ ready: true, preparingSources: true, registerTabs() {} }}>
      <TabView>
        <Tab id="a" label="A">
          A
        </Tab>
        <Tab id="b" label="B">
          B
        </Tab>
        <Tab id="c" label="C">
          C
        </Tab>
      </TabView>
    </MaterialEffectContext>,
  )
  await select('b')
  await select('c')
  act(() => panel('b')!.dispatchEvent(new Event('satin:tab-source-ready', { bubbles: true })))
  expect(panel('a')!.getAttribute('aria-hidden')).toBeNull()
  expect(panel('c')!.inert).toBe(true)
  act(() => panel('c')!.dispatchEvent(new Event('satin:tab-source-ready', { bubbles: true })))
  expect(panel('c')!.getAttribute('aria-hidden')).toBeNull()
  expect(panel('a')!.inert).toBe(true)
  expect(element.querySelectorAll('nav [data-selected="true"]')).toHaveLength(1)
})

it('owns regular capsule glass for a plain bottom accessory', () => {
  render(
    <TabView bottomAccessory={<span>Track</span>}>
      <Tab id="home" label="Home">
        Home
      </Tab>
    </TabView>,
  )
  const accessory = element.querySelector('[data-satin-accessory-content]')!
  expect(accessory.querySelectorAll('[data-satin-glass-effect]')).toHaveLength(1)
  expect(accessory.textContent).toBe('Track')
})

it('lets an accessory own its material without nesting glass', () => {
  render(
    <TabView bottomAccessoryMaterial="custom" bottomAccessory={<GlassEffect>Track</GlassEffect>}>
      <Tab id="home" label="Home">
        Home
      </Tab>
    </TabView>,
  )
  expect(
    element.querySelectorAll('[data-satin-accessory-content] [data-satin-glass-effect]'),
  ).toHaveLength(1)
})
