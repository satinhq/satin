import { Link, useOpenURL, type OpenURLAction } from '../web/openURL.tsx'
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { ScreenContentContext } from './screenChrome.tsx'
import { Section } from '../list-form/ListForm.tsx'
import { generateSatinManifestJson } from '../app/definition.ts'
import { ControlStyleProvider } from './controlStyle.tsx'
import { Label } from './Label.tsx'
import { ContextMenu, type Action } from './actions.tsx'
import { Pressable } from '../press/Pressable.tsx'
import { prepareSceneRoutes } from '../restoration/routes.ts'
// @vitest-environment happy-dom
import * as React from 'react'
import { act, createContext, useContext, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { notificationRoutes } from '../push/schema.ts'
import { defineRoutes, route, param } from './routes.tsx'
import { resolveRoutes } from './routeRegistry.ts'
import { createRouteCodec } from '../navigation/routeCodec.ts'
import { encodePushRoute, decodePushRoute } from '../push/routes.ts'
import { createSceneRestoration } from '../restoration/scene.ts'
import { createNavigator } from '../navigation/store.ts'
import { defineApp } from './definition.ts'
import {
  runApp,
  NavigationStack,
  NavigationSplitView,
  Tab,
  TabSection,
  TabView,
  useNavigation,
} from './runtime.tsx'
import { defineNavigation } from './structure.ts'
import {
  createScreenChrome,
  Screen,
  ScreenChromeContext,
  DefaultToolbarItem,
  ToolbarItem,
  ToolbarItemGroup,
  ToolbarSpacer,
} from './chrome.tsx'
import { ScrollSurface, type ScrollSurfaceHandle } from '../scroll/ScrollSurface.tsx'
import { ScrollTarget } from '../scroll/ScrollTarget.tsx'
import { nextToolbarMinimization } from '../navigation/toolbarMinimization.ts'
import { topScrollEdgePolicy } from '../scroll/edgePolicy.ts'
import { screenNavigation } from './chrome.tsx'
import { resolveSearchPlacement } from '../search/searchPlacement.ts'
import { createRoot } from 'react-dom/client'
import { NavigatorHost } from '../navigation/NavigatorHost.tsx'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import {
  Button,
  Form,
  List,
  LabeledContent,
  ContentUnavailableView,
  NavigationLink,
  Picker,
  Stepper,
  Toggle,
  TextField,
} from './controls.tsx'
import { useScreenLifecycle } from '../navigation/navigationContext.tsx'
import { ModalPresentationContext } from './presentationContext.ts'
import { Sheet } from './presentation.tsx'
import { Alert, ConfirmationDialog } from '../presentation/Presentation.tsx'
import { useAppContext, type AppRuntime } from './context.ts'
import { useAppStorage, useSceneStorage } from './environment.tsx'

vi.mock('../presentation/PresentationSurface.tsx', () => ({
  Surface: ({ children, isPresented }: any) =>
    isPresented ? <div data-test-sheet>{children}</div> : null,
}))
vi.mock('../presentation/PresentedSheet.tsx', () => ({
  PresentedSheet: ({ children, isPresented }: any) =>
    isPresented ? <div data-test-sheet>{children}</div> : null,
}))
vi.mock('../root/SatinRoot.tsx', () => ({
  SatinRoot: ({ children }: { children: ReactNode }) => children,
}))
const adaptiveLayout = vi.hoisted(() => ({ horizontal: 'compact', width: 402 }))
vi.mock('../root/runtimeContext.ts', () => ({
  useLayoutClass: () => adaptiveLayout,
  useSatinLayoutRuntime: () => ({
    layoutClass: adaptiveLayout,
    metrics: {
      layoutViewport: { width: adaptiveLayout.width },
      screen: { width: 402, height: 874 },
    },
  }),
}))
vi.mock('../reachability/react.tsx', () => ({
  ReachabilityRoute: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../glass/GlassEffect.tsx', () => ({
  GlassBackground: () => null,
  GlassButton: ({ children, ...props }: any) => (
    <button data-satin-button-role={props['data-satin-button-role']} onClick={props.onPress}>
      {children}
    </button>
  ),
  ToolbarGroup: ({ children }: any) => children,
  ToolbarSpacer: () => null,
}))
vi.mock('../glass/TabBar.tsx', () => ({
  TabBar: ({ items, selected, onSelect }: any) => (
    <nav>
      {items.map((item: any) => (
        <button
          key={item.id}
          data-selected={item.id === selected}
          onClick={() => onSelect(item.id)}
        >
          {item.id}
        </button>
      ))}
    </nav>
  ),
}))
vi.mock('../navigation/motion.ts', async importOriginal => ({
  ...(await importOriginal<any>()),
  createAnimatedTransitionController: (completion: any) => ({
    progress: 1,
    start: completion.finish,
    finish: completion.finish,
    cancel: completion.cancel,
  }),
}))
const app = defineApp({
  id: '/test-public-api',
  name: 'Public API',
  icons: [{ src: '/icon.png', sizes: '180x180', type: 'image/png' }],
})
let root: { unmount(): void } | undefined
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  adaptiveLayout.horizontal = 'compact'
  adaptiveLayout.width = 402
  localStorage.clear()
  vi.stubGlobal('location', { href: 'https://app.test/', origin: 'https://app.test' })
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const click = (text: string) =>
  act(() => {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent === text)
    expect(button, text).toBeDefined()
    button!.click()
  })

it('uses one strict schema for typed routes, restoration, URL paths and notifications', () => {
  const routes = defineRoutes({
    home: route(() => null),
    item: route(() => null, {
      params: {
        id: param.string(),
        set: param.int().optional(),
        done: param.boolean(),
        mode: param.enum(['a', 'b']),
      },
    }),
  })
  const registry = resolveRoutes(routes),
    codec = createRouteCodec(registry)
  const params = { id: 'one', set: 2, done: false, mode: 'a' }
  const valid = { screen: 'item', version: 1, params }
  expect(codec.decode(valid)).toEqual(valid)
  for (const invalid of [
    { ...params, set: 1.5 },
    { ...params, done: 'false' },
    { ...params, extra: 1 },
    { ...params, mode: 'c' },
    { ...params, set: Infinity },
  ])
    expect(codec.decode({ ...valid, params: invalid })).toBeNull()
  const rules = codec.pushRules(['home'])
  const relayRules = notificationRoutes(
    Object.fromEntries(
      Object.entries(routes.definitions).map(([id, route]) => [id, route.options]),
    ),
    ['home'],
  )
  const url = encodePushRoute(
    'https://example.com/app/',
    { ...valid, tab: 'home' },
    rules,
    'delivery',
  )
  expect(decodePushRoute(url, 'https://example.com/app/', rules)?.route.params).toEqual(params)
  expect(decodePushRoute(url, 'https://example.com/app/', relayRules)?.route.params).toEqual(params)
  const getter = Object.defineProperty({}, 'id', {
    enumerable: true,
    get() {
      throw new Error('must not invoke')
    },
  })
  expect(routes.definitions.item.validate(getter)).toBe(false)
  expect(
    codec.decodeURL(
      codec.encodeURL('https://example.com/app/', [{ screen: 'item', params }]),
      'https://example.com/app/',
    ),
  ).toEqual([valid])
  const scene = createSceneRestoration({ id: 'public-routes' })
  const navigation = createNavigator({
    registry,
    initial: { id: 'home' },
    restoration: { scene, key: 'home' },
  })
  navigation.push('item', params)
  scene.flush()
  expect(
    createNavigator({
      registry,
      initial: { id: 'home' },
      restoration: { scene: createSceneRestoration({ id: 'public-routes' }), key: 'home' },
    })
      .getState()
      .entries.at(-1)?.params,
  ).toEqual(params)
})

it('owns tab stacks, entry chrome, typed params and adaptive form controls', () => {
  function Home() {
    const navigation = useNavigation<typeof routes>()
    return (
      <Screen
        toolbar={
          <ToolbarItem placement="topBarTrailing">
            <Button onPress={() => navigation.push('detail', { id: 'one' })}>Open</Button>
          </ToolbarItem>
        }
      >
        <p>Home</p>
      </Screen>
    )
  }
  const Owner = createContext('missing')
  function DetailTools() {
    const owner = useContext(Owner)
    const [count, setCount] = useSceneStorage('toolbar-count', 0)
    const lifecycle = useScreenLifecycle()
    return (
      <ToolbarItem placement="topBarTrailing">
        <Button
          onPress={() => setCount(count + 1)}
        >{`${owner}:${count}:${lifecycle.isCovered}`}</Button>
      </ToolbarItem>
    )
  }
  function Detail({ id }: { id: string }) {
    const navigation = useNavigation<typeof routes>()
    const [title, setTitle] = useState(`Detail ${id}`)
    return (
      <Owner value="Ada">
        <Screen
          title={title}
          toolbar={
            <>
              <DetailTools />
              <ToolbarItem placement="topBarLeading">
                <Button onPress={() => navigation.pop()}>Done</Button>
              </ToolbarItem>
            </>
          }
        >
          <Button onPress={() => setTitle('Updated detail')}>Rename</Button>
        </Screen>
      </Owner>
    )
  }
  function Settings() {
    const [name, setName] = useSceneStorage('name', '')
    const [enabled, setEnabled] = useAppStorage('enabled', false)
    return (
      <Form id="settings">
        <TextField label="Name" value={name} onChange={setName} />
        <Toggle label="Enabled" isOn={enabled} onChange={setEnabled} />
      </Form>
    )
  }
  const routes = defineRoutes({
    home: route(Home, { title: 'Home' }),
    detail: route(Detail, { params: { id: param.string() }, title: ({ id }) => `Detail ${id}` }),
    settings: route(Settings, { title: 'Settings' }),
  })
  const structure = defineNavigation(routes, {
    tabs: [
      { id: 'home', label: 'Home', icon: null, root: 'home' },
      { id: 'settings', label: 'Settings', icon: null, root: 'settings' },
    ],
  })
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: structure, content: () => <OpaqueApp /> })
  })
  function OpaqueApp() {
    return <TabView<typeof structure> />
  }
  click('Open')
  expect(
    document.querySelector('[data-satin-navigation-title-layer]:last-child')?.textContent,
  ).toBe('Detail one')
  expect(
    document.querySelector(
      '[data-satin-entry-toolbar]:not([hidden]) [data-satin-navigation-toolbar-slot="leading"]',
    )?.textContent,
  ).toBe('Done')
  click('Ada:0:false')
  expect(
    document.querySelector(
      '[data-satin-entry-toolbar]:not([hidden]) [data-satin-navigation-toolbar-slot=trailing]',
    )?.textContent,
  ).toBe('Ada:1:false')
  click('Rename')
  expect(
    document.querySelector('[data-satin-navigation-title-layer]:last-child')?.textContent,
  ).toBe('Updated detail')
  click('settings')
  expect(document.querySelector('[data-satin-tab-panel="home"]')?.hasAttribute('inert')).toBe(true)
  expect(document.querySelector('[data-satin-field-style="row"]')).not.toBeNull()
  expect(document.querySelector('[data-satin-toggle-row="true"]')).not.toBeNull()
  click('home')
  click('Done')
  expect(
    document.querySelector(
      '[data-satin-entry-toolbar]:not([hidden]) [data-satin-navigation-toolbar-slot="trailing"]',
    )?.textContent,
  ).toBe('Open')
})

it.each(['sheet', 'alert', 'confirmation', 'popover'] as const)(
  'closes a checkpointed %s before mount and permits opaque primary wrappers',
  kind => {
    let runtime: AppRuntime
    function Home() {
      runtime = useAppContext()
      const [open, setOpen] = useSceneStorage('editor', false)
      const [enabled, setEnabled] = useSceneStorage('remembered-toggle', false)
      const [draft] = useSceneStorage('draft', 'Retained draft')
      return (
        <>
          <Button onPress={() => setOpen(!open)}>Toggle editor</Button>
          <Button onPress={() => setEnabled(!enabled)}>Toggle remembered setting</Button>
          <output data-test-remembered>{String(enabled)}</output>
          <output data-test-draft>{draft}</output>
          {kind === 'sheet' ? (
            <Sheet title="Editor" isPresented={open} onPresentedChange={setOpen}>
              Draft
            </Sheet>
          ) : kind === 'alert' ? (
            <Alert
              title="Editor"
              isPresented={open}
              onPresentedChange={setOpen}
              actions={[{ id: 'ok', label: 'OK' }]}
            />
          ) : (
            <ConfirmationDialog
              title="Editor"
              isPresented={open}
              onPresentedChange={setOpen}
              anchor={kind === 'popover' ? { current: null } : undefined}
              actions={[{ id: 'ok', label: 'OK' }]}
            />
          )}
        </>
      )
    }
    const routes = defineRoutes({ home: route(Home) })
    const structure = defineNavigation(routes, { stack: { root: 'home' } })
    function Wrapper() {
      return <NavigationStack<typeof routes, typeof structure> />
    }
    act(() => {
      root = runApp({ app: app, routes: routes, navigation: structure, content: Wrapper })
    })
    click('Toggle remembered setting')
    click('Toggle editor')
    expect(document.querySelector('[data-test-sheet]')).not.toBeNull()
    act(() => runtime!.scene.flush())
    act(() => root!.unmount())
    root = undefined
    act(() => {
      root = runApp({ app: app, routes: routes, navigation: structure, content: Wrapper })
    })
    expect(document.querySelector('[data-test-sheet]')).toBeNull()
    expect(document.querySelector('[data-test-remembered]')?.textContent).toBe('true')
    expect(document.querySelector('[data-test-draft]')?.textContent).toBe('Retained draft')
    click('Toggle editor')
    expect(document.querySelector('[data-test-sheet]')).not.toBeNull()
  },
)
it('rejects duplicate and unknown primary identities before mounting', () => {
  const routes = defineRoutes({ home: route(() => null) })
  expect(() =>
    runApp({
      app: app,
      routes: routes,
      navigation: {
        tabs: [
          { id: 'one', label: 'One', icon: null, root: 'home' },
          { id: 'one', label: 'Two', icon: null, root: 'home' },
        ],
      },
    }),
  ).toThrow('duplicate tab')
  expect(() =>
    runApp({
      app: app,
      routes: routes,
      navigation: {
        tabs: [{ id: 'one', label: 'One', icon: null, root: 'home' }],
        defaultTab: 'missing',
      },
    }),
  ).toThrow('Unknown default tab')
})

it('preserves destructive intent, disabled inline choices, standalone steppers and owned picker navigation', () => {
  let changes = 0
  function Home() {
    const [value, setValue] = useState('one')
    return (
      <Screen
        title="Title"
        titleDisplay="large"
        toolbar={
          <ToolbarItem placement="topBarTrailing">
            <Button role="destructive" onPress={() => {}}>
              Delete
            </Button>
          </ToolbarItem>
        }
      >
        <Stepper label="Outside" value={1} onChange={() => {}} />
        <List id="controls" className="harmless-style">
          <Picker
            label="Inline"
            pickerStyle="inline"
            selection={value}
            disabled
            onSelectionChange={() => changes++}
            options={[
              { id: 'one', label: 'One' },
              { id: 'two', label: 'Two' },
            ]}
          />
          <Picker
            label="Choice"
            pickerStyle="navigationLink"
            selection={value}
            onSelectionChange={setValue}
            options={[
              { id: 'one', label: 'One' },
              { id: 'two', label: 'Two' },
            ]}
          />
        </List>
      </Screen>
    )
  }
  const routes = defineRoutes({ home: route(Home) })
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: { stack: { root: 'home' } } })
  })
  expect(document.querySelector('h1')?.textContent).toBe('Title')
  expect(document.querySelector('[data-satin-button-role=destructive]')?.textContent).toBe('Delete')
  expect(document.querySelector('[data-satin-stepper]')?.closest('[data-satin-row]')).toBeNull()
  const disabled = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-satin-list] button'),
  ].filter(button => button.disabled)
  expect(disabled).toHaveLength(2)
  act(() => disabled[1]!.click())
  expect(changes).toBe(0)
  const picker = document.querySelector<HTMLButtonElement>(
    '[data-satin-picker-mode=navigation] button',
  )!
  act(() => picker.click())
  const destination = document.querySelector('[data-satin-screen="__satin:picker"]')
  expect(destination).not.toBeNull()
  // The label is the destination's navigation title, not a heading repeated in its list.
  expect(destination!.querySelector('[data-satin-list]')?.textContent).not.toContain('Choice')
  expect(
    [...document.querySelectorAll('[role=heading]')].some(
      heading => heading.textContent === 'Choice',
    ),
  ).toBe(true)
  const choice = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-satin-screen="__satin:picker"] button'),
  ].find(button => button.textContent?.includes('Two'))!
  act(() => choice.click())
  expect(document.querySelector('[data-satin-screen="__satin:picker"]')).toBeNull()
  expect(document.querySelector('[data-satin-picker-mode=navigation]')?.textContent).toContain(
    'Two',
  )
})

it('keeps the recoverable ancestor prefix and never acknowledges a skipped notification durably', () => {
  const routes = defineRoutes({
    home: route(() => null),
    transient: route(() => null, { restoration: 'skip' }),
    detail: route(() => null),
  })
  const registry = resolveRoutes(routes),
    scene = createSceneRestoration({ id: 'skip-contract' })
  const navigator = createNavigator({
    registry,
    initial: { id: 'home' },
    restoration: { scene, key: 'home' },
  })
  const binding = prepareSceneRoutes({
    scene,
    registry,
    navigators: { home: navigator },
    defaultTab: 'home',
    scope: 'https://app.test/',
  })
  const url = encodePushRoute(
    'https://app.test/',
    { screen: 'transient', version: 1 },
    createRouteCodec(registry).pushRules(),
    'skip-delivery',
  )
  expect(binding.openURL(url)).toBe(true)
  navigator.push('detail', undefined)
  scene.flush()
  expect(
    (scene.readPersisted('navigation:home') as { screen: string }[]).map(entry => entry.screen),
  ).toEqual(['home'])
  expect(JSON.stringify(scene.readPersisted('route-deliveries') ?? [])).not.toContain(
    'skip-delivery',
  )
  const restored = createNavigator({
    registry,
    initial: { id: 'home' },
    restoration: { scene: createSceneRestoration({ id: 'skip-contract' }), key: 'home' },
  })
  expect(restored.getState().entries.map(entry => entry.screenId)).toEqual(['home'])
})

it('retains toolbar-local state and the original focused trigger through cover and pop', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 210,
    bottom: 54,
    width: 200,
    height: 44,
    toJSON() {},
  }))
  function Tools() {
    const [count, setCount] = useState(0)
    const navigation = useNavigation<typeof routes>()
    return (
      <ToolbarItem placement="topBarTrailing">
        <Button onPress={() => setCount(count + 1)}>Count {count}</Button>
        <Button onPress={() => navigation.push('detail')}>Open detail</Button>
      </ToolbarItem>
    )
  }
  function Home() {
    return (
      <Screen toolbar={<Tools />}>
        <p>Home content</p>
      </Screen>
    )
  }
  function Detail() {
    const navigation = useNavigation<typeof routes>()
    return (
      <Screen>
        <Button onPress={() => navigation.pop()}>Return</Button>
      </Screen>
    )
  }
  const routes = defineRoutes({
    home: route(Home, { title: 'Home' }),
    detail: route(Detail, { title: 'Detail' }),
  })
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: { stack: { root: 'home' } } })
  })
  click('Count 0')
  const counter = [...document.querySelectorAll('button')].find(
    node => node.textContent === 'Count 1',
  )!
  const trigger = [...document.querySelectorAll('button')].find(
    node => node.textContent === 'Open detail',
  )!
  act(() => trigger.focus())
  expect(document.activeElement).toBe(trigger)
  click('Open detail')
  expect(trigger.isConnected).toBe(true)
  expect(trigger.closest('[data-satin-entry-toolbar]')?.hasAttribute('hidden')).toBe(true)
  expect(trigger.closest('[data-satin-entry-toolbar]')?.hasAttribute('inert')).toBe(true)
  expect(document.activeElement).not.toBe(trigger)
  click('Return')
  expect(document.activeElement).toBe(trigger)
  expect(trigger.closest('[hidden], [inert]')).toBeNull()
  expect(counter.isConnected).toBe(true)
  expect(counter.textContent).toBe('Count 1')
  click('Count 1')
  expect(counter.textContent).toBe('Count 2')
})

it.each([
  { saved: undefined, launch: undefined, controlled: 'settings', expected: 'settings' },
  { saved: 'settings', launch: undefined, controlled: 'home', expected: 'home' },
  { saved: 'settings', launch: undefined, controlled: undefined, expected: 'settings' },
  { saved: undefined, launch: undefined, controlled: undefined, expected: 'home' },
  { saved: 'home', launch: 'settings', controlled: undefined, expected: 'settings' },
  { saved: 'home', launch: 'settings', controlled: 'home', expected: 'home' },
])(
  'selects the first tab paint by controlled > launch > restored > default: %j',
  ({ saved, launch, controlled, expected }) => {
    let runtime: AppRuntime
    const renders: string[] = []
    const requests: string[] = []
    function Home() {
      renders.push('home')
      return <p>Home</p>
    }
    function Settings() {
      renders.push('settings')
      return <p>Settings</p>
    }
    const routes = defineRoutes({
      home: route(Home),
      settings: route(Settings),
      detail: route(() => <p>Notification detail</p>),
    })
    const structure = defineNavigation(routes, {
      tabs: [
        { id: 'home', label: 'Home', icon: null, root: 'home' },
        { id: 'settings', label: 'Settings', icon: null, root: 'settings' },
      ],
    })
    if (saved) {
      const scene = createSceneRestoration({ id: app.id })
      scene.write('selected-tab', { version: 1, value: saved })
      scene.flush()
    }
    if (launch) {
      const scope = new URL(app.scope, location.origin).href
      const url = encodePushRoute(
        scope,
        { screen: 'detail', version: 1, tab: launch },
        createRouteCodec(resolveRoutes(routes)).pushRules(['home', 'settings']),
        'cold-launch',
      )
      vi.stubGlobal('location', { href: url, origin: location.origin })
    }
    function App() {
      runtime = useAppContext()
      return (
        <TabView<typeof structure>
          selection={controlled as 'home' | 'settings' | undefined}
          onSelectionChange={id => requests.push(id)}
        />
      )
    }
    act(() => {
      root = runApp({ app: app, routes: routes, navigation: structure, content: App })
    })
    expect(
      document.querySelector('[data-satin-tab-active=true]')?.getAttribute('data-satin-tab-panel'),
    ).toBe(expected)
    expect(renders[0]).toBe(expected)
    expect(requests).toEqual([])
    if (launch)
      expect(runtime!.stacks.get(launch)!.getState().entries.at(-1)?.screenId).toBe('detail')
  },
)

it('keeps rejected tab requests invisible, accepts external values and resists live notification selection', () => {
  let runtime: AppRuntime, update: (id: 'home' | 'settings') => void
  const requests: string[] = []
  const routes = defineRoutes({ home: route(() => null), settings: route(() => null) })
  const structure = defineNavigation(routes, {
    tabs: [
      { id: 'home', label: 'Home', icon: null, root: 'home' },
      { id: 'settings', label: 'Settings', icon: null, root: 'settings' },
    ],
  })
  function App() {
    runtime = useAppContext()
    const [selection, setSelection] = useState<'home' | 'settings'>('settings')
    update = setSelection
    return (
      <TabView<typeof structure>
        selection={selection}
        onSelectionChange={id => requests.push(id)}
      />
    )
  }
  const active = () =>
    document.querySelector('[data-satin-tab-active=true]')?.getAttribute('data-satin-tab-panel')
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: structure, content: App })
  })
  click('home')
  expect(active()).toBe('settings')
  expect(requests).toEqual(['home'])
  expect(runtime!.scene.read('selected-tab')).toEqual({ version: 1, value: 'settings' })
  act(() => update!('home'))
  expect(active()).toBe('home')
  const scope = new URL(app.scope, location.origin).href
  const url = encodePushRoute(
    scope,
    { screen: 'settings', version: 1, tab: 'settings' },
    createRouteCodec(resolveRoutes(routes)).pushRules(['home', 'settings']),
    'live',
  )
  act(() => {
    runtime!.sceneRoutes!.openURL(url)
  })
  expect(active()).toBe('home')
  expect(runtime!.scene.read('selected-tab')).toEqual({ version: 1, value: 'home' })
  expect(requests).toEqual(['home'])
})

it.each([
  'undeclared',
  'mismatched',
  'duplicate',
  'modal-outside',
  'modal-root',
  'modal-params',
] as const)('rejects invalid mounted stacks: %s', kind => {
  const routes = defineRoutes({
    home: route(() => null),
    detail: route(() => null, { params: { id: param.string() } }),
  })
  const Stack = NavigationStack as React.ComponentType<any>
  function Content() {
    if (kind === 'mismatched') return <Stack tab="second" />
    return <Stack />
  }
  const structure = defineNavigation(routes, {
    tabs: [
      { id: 'first', label: 'First', icon: null, root: 'home', content: Content },
      { id: 'second', label: 'Second', icon: null, root: 'home' },
    ],
  })
  function App() {
    if (kind === 'undeclared') return <Stack tab="missing" />
    if (kind === 'mismatched') return <TabView<typeof structure> />
    if (kind === 'duplicate')
      return (
        <>
          <Stack tab="first" />
          <Stack tab="first" />
        </>
      )
    if (kind === 'modal-outside') return <Stack modal root="home" />
    return (
      <ModalPresentationContext value={true}>
        <Stack modal root={kind === 'modal-root' ? 'missing' : 'detail'} params={{ id: 1 }} />
      </ModalPresentationContext>
    )
  }
  // Error boundaries capture render/commit errors without abandoning a React root.
  class Boundary extends React.Component<{ children: ReactNode }, { error: string }> {
    state = { error: '' }
    static getDerivedStateFromError(error: Error) {
      return { error: error.message }
    }
    render() {
      return this.state.error ? <p data-error>{this.state.error}</p> : this.props.children
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  act(() => {
    root = runApp({
      app: app,
      routes: routes,
      navigation: structure,
      content: () => (
        <Boundary>
          <App />
        </Boundary>
      ),
    })
  })
  const expected = {
    undeclared: 'Undeclared primary stack',
    mismatched: 'does not belong to tab',
    duplicate: 'Primary stack mounted twice',
    'modal-outside': 'must be inside a Sheet',
    'modal-root': 'Invalid root route',
    'modal-params': 'Invalid root route',
  }
  expect(document.querySelector('[data-error]')?.textContent).toContain(expected[kind])
})

it('preserves the destructive role inside a toolbar group', () => {
  const routes = defineRoutes({
    home: route(() => (
      <Screen
        toolbar={
          <ToolbarItemGroup placement="topBarTrailing">
            <Button role="destructive" onPress={() => {}}>
              Grouped delete
            </Button>
          </ToolbarItemGroup>
        }
      >
        Home
      </Screen>
    )),
  })
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: { stack: { root: 'home' } } })
  })
  expect(document.querySelector('[data-satin-button-role=destructive]')?.textContent).toBe(
    'Grouped delete',
  )
})

it('forwards public row actions without losing button identity, semantics or navigation', () => {
  const selected = vi.fn(),
    pressed = vi.fn(),
    button = React.createRef<HTMLButtonElement>()
  const actions: readonly Action[] = [{ id: 'pin', label: 'Pin', onPress: selected }]
  const interactions = {
    swipeActions: { edge: 'trailing' as const, actions, allowsFullSwipe: false },
    contextMenu: actions,
  }
  function Home() {
    return (
      <Screen title="Rows">
        <List id="rows">
          <Button
            {...interactions}
            ref={button}
            id="row-button"
            aria-label="Workout"
            onPress={pressed}
          >
            Button row
          </Button>
          <NavigationLink<typeof routes> {...interactions} to="detail">
            Detail row
          </NavigationLink>
          <LabeledContent {...interactions} label="Value row" value="42" />
          <Button {...interactions} disabled onPress={pressed}>
            Disabled row
          </Button>
          <ContextMenu actions={actions} preview={<p>Preview</p>}>
            <p>Card</p>
          </ContextMenu>
        </List>
      </Screen>
    )
  }
  const routes = defineRoutes({
    home: route(Home),
    detail: route(() => (
      <Screen title="Detail">
        <p>Destination</p>
      </Screen>
    )),
  })
  act(() => {
    root = runApp({
      app: app,
      routes: routes,
      navigation: defineNavigation(routes, { stack: { root: 'home' } }),
    })
  })
  const wrappers = [...document.querySelectorAll('[data-satin-row-actions]')]
  expect(wrappers).toHaveLength(5)
  expect(document.querySelector('button button')).toBeNull()
  expect(button.current).toBe(document.querySelector('#row-button'))
  expect(button.current?.getAttribute('aria-label')).toBe('Workout')
  expect(wrappers.every(row => row.querySelector('[aria-haspopup="menu"]'))).toBe(true)
  for (const row of wrappers.slice(0, 4))
    act(() =>
      row.querySelector<HTMLButtonElement>('[data-satin-action-access] button:last-child')!.click(),
    )
  expect(selected).toHaveBeenCalledTimes(3)
  expect(pressed).not.toHaveBeenCalled()
  click('Button row')
  expect(pressed).toHaveBeenCalledTimes(1)
  click('Detail row')
  expect(document.body.textContent).toContain('Destination')
})

it('exposes empty content text while hiding the decorative default symbol', () => {
  document.body.innerHTML = renderToStaticMarkup(
    <ContentUnavailableView title="No Items" description="Items you add appear here." />,
  )
  expect(document.querySelector('[data-satin-empty-state-title]')?.textContent).toBe('No Items')
  expect(document.querySelector('[data-satin-empty-state-description]')?.textContent).toBe(
    'Items you add appear here.',
  )
  expect(document.querySelector('[data-satin-empty-state-icon]')?.getAttribute('aria-hidden')).toBe(
    'true',
  )
  expect(document.querySelector('button')).toBeNull()
})

it('does not treat a warm screen remount after a checkpoint as a cold relaunch', () => {
  let runtime: AppRuntime
  function Home() {
    runtime = useAppContext()
    const [open, setOpen] = useSceneStorage('editor', false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open warm editor</button>
        <Sheet title="Editor" isPresented={open} onPresentedChange={setOpen}>
          Draft
        </Sheet>
      </>
    )
  }
  const routes = defineRoutes({ home: route(Home) })
  const structure = defineNavigation(routes, { stack: { root: 'home' } })
  function Wrapper() {
    const [visible, setVisible] = useState(true)
    return (
      <>
        <button onClick={() => setVisible(!visible)}>Toggle warm stack</button>
        {visible && <NavigationStack<typeof routes, typeof structure> />}
      </>
    )
  }
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: structure, content: Wrapper })
  })
  click('Open warm editor')
  act(() => runtime!.scene.flush())
  click('Toggle warm stack')
  click('Toggle warm stack')
  expect(document.querySelector('[data-test-sheet]')).not.toBeNull()
})

it('suppresses an ordinary useState(true) welcome sheet on a navigation-restored screen', () => {
  let runtime: AppRuntime
  function Home() {
    return <NavigationLink<typeof routes> to="welcome">Visit welcome screen</NavigationLink>
  }
  function Welcome() {
    runtime = useAppContext()
    const [open, setOpen] = useState(true)
    return (
      <>
        <output data-test-welcome>Restored welcome screen</output>
        <output data-test-welcome-open>{String(open)}</output>
        <Button onPress={() => setOpen(false)}>Close welcome sheet</Button>
        <Sheet title="Welcome" isPresented={open} onPresentedChange={setOpen}>
          Welcome content
        </Sheet>
      </>
    )
  }
  const routes = defineRoutes({ home: route(Home), welcome: route(Welcome) })
  const structure = defineNavigation(routes, { stack: { root: 'home' } })
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: structure })
  })
  click('Visit welcome screen')
  expect(document.querySelector('[data-test-sheet]')).not.toBeNull()
  click('Close welcome sheet')
  act(() => runtime!.scene.flush())
  act(() => root!.unmount())
  root = undefined
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: structure })
  })
  expect(document.querySelector('[data-test-welcome]')?.textContent).toBe('Restored welcome screen')
  expect(document.querySelector('[data-test-welcome-open]')?.textContent).toBe('false')
  expect(document.querySelector('[data-test-sheet]')).toBeNull()
})

it('inherits control presentation and keeps a disabled ancestor authoritative', () => {
  let activations = 0
  function Home() {
    return (
      <ControlStyleProvider
        disabled
        tint="#af52de"
        controlSize="large"
        buttonStyle={{
          makeBody: configuration => (
            <span>
              {`${configuration.controlSize}:${configuration.tint}:${configuration.isEnabled}`}
              {configuration.label}
            </span>
          ),
        }}
      >
        <ControlStyleProvider disabled={false}>
          <Button onPress={() => activations++}>Save</Button>
          <Button controlSize="small" onPress={() => activations++}>
            Local
          </Button>
        </ControlStyleProvider>
      </ControlStyleProvider>
    )
  }
  act(() => {
    root = runApp({
      app: app,
      routes: defineRoutes({ home: route(Home) }),
      navigation: { stack: { root: 'home' } },
    })
  })
  expect(document.body.textContent).toContain('large:#af52de:falseSave')
  expect(document.body.textContent).toContain('small:#af52de:falseLocal')
  act(() => document.querySelectorAll('button').forEach(button => button.click()))
  expect(activations).toBe(0)
})

it('renders a custom checkbox with one Boolean activation and disabled semantics', () => {
  function Home() {
    const [checked, setChecked] = useState(false)
    return (
      <Toggle
        label="Complete"
        isOn={checked}
        onChange={setChecked}
        toggleStyle={{
          semantics: 'checkbox',
          makeBody: ({ isOn, label }) => (
            <span>
              {isOn ? 'Done' : 'Todo'} {label}
            </span>
          ),
        }}
      />
    )
  }
  act(() => {
    root = runApp({
      app: app,
      routes: defineRoutes({ home: route(Home) }),
      navigation: { stack: { root: 'home' } },
    })
  })
  const checkbox = document.querySelector<HTMLButtonElement>('[role="checkbox"]')!
  expect(checkbox.getAttribute('aria-checked')).toBe('false')
  act(() => checkbox.click())
  expect(checkbox.textContent).toBe('Done Complete')
  expect(checkbox.getAttribute('aria-checked')).toBe('true')
  expect(checkbox.querySelector('button')).toBeNull()
})

it('announces a button Toggle as selected without changing its accessible name', () => {
  function Home() {
    const [checked, setChecked] = useState(false)
    return <Toggle label="Favorite" toggleStyle="button" isOn={checked} onChange={setChecked} />
  }
  act(() => {
    root = runApp({
      app: app,
      routes: defineRoutes({ home: route(Home) }),
      navigation: { stack: { root: 'home' } },
    })
  })
  const toggle = document.querySelector<HTMLButtonElement>('button[aria-label="Favorite"]')!
  expect(toggle.getAttribute('aria-pressed')).toBe('false')
  act(() => toggle.click())
  expect(toggle.getAttribute('aria-pressed')).toBe('true')
  expect(toggle.getAttribute('aria-label')).toBe('Favorite')
})

it('keeps an icon-only Label title accessible and allows custom title/icon ordering', () => {
  const markup = renderToStaticMarkup(
    <>
      <Label symbol="person" labelStyle="iconOnly">
        Profile
      </Label>
      <Label
        icon={<span>Icon</span>}
        labelStyle={{
          makeBody: ({ title, icon }) => (
            <span>
              {title}
              {icon}
            </span>
          ),
        }}
      >
        Title
      </Label>
    </>,
  )
  document.body.innerHTML = markup
  expect(document.querySelector('.satin-control-accessible-title')?.textContent).toBe('Profile')
  expect(document.body.textContent).toContain('TitleIcon')
})

it('renders native toolbar placement names as working screen actions', () => {
  const pressed: string[] = []
  const placements = [
    'topBarLeading',
    'topBarTrailing',
    'primaryAction',
    'automatic',
    'principal',
    'bottomBar',
  ] as const
  const routes = defineRoutes({
    home: route(() => (
      <Screen
        toolbar={
          <>
            {placements.map(placement => (
              <ToolbarItem key={placement} placement={placement}>
                <Button onPress={() => pressed.push(placement)}>{placement}</Button>
              </ToolbarItem>
            ))}
          </>
        }
      >
        Home
      </Screen>
    )),
  })
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: { stack: { root: 'home' } } })
  })
  for (const placement of placements) {
    const button = [...document.querySelectorAll('button')].find(
      candidate => candidate.textContent === placement,
    )
    expect(button, placement).toBeDefined()
    act(() => {
      button!.click()
    })
  }
  expect(pressed).toEqual(placements)
})

it('accepts nullable scene storage and restores the persisted value', () => {
  let runtime: AppRuntime | undefined
  function Home() {
    runtime = useAppContext()
    const [photo, setPhoto] = useSceneStorage<string | null>('photo', null)
    return <button onClick={() => setPhoto('photo.jpg')}>{photo ?? 'Attach'}</button>
  }
  const routes = defineRoutes({ home: route(Home) })
  const structure = defineNavigation(routes, { stack: { root: 'home' } })
  act(() => {
    root = runApp({
      app: app,
      routes: routes,
      navigation: structure,
      content: () => <NavigationStack<typeof routes, typeof structure> />,
    })
  })
  click('Attach')
  expect(document.body.textContent).toContain('photo.jpg')
  act(() => runtime!.scene.flush())
  act(() => {
    root!.unmount()
    root = undefined
  })
  act(() => {
    root = runApp({
      app: app,
      routes: routes,
      navigation: structure,
      content: () => <NavigationStack<typeof routes, typeof structure> />,
    })
  })
  expect(document.body.textContent).toContain('photo.jpg')
})

it('keeps nullable app storage synchronized across consumers, functional writes and reloads', () => {
  const storageKey = `satin-preference:${app.id}:photo`
  localStorage.setItem(storageKey, JSON.stringify('persisted.jpg'))
  function Photo({ label }: { label: string }) {
    const [photo, setPhoto] = useAppStorage<string | null>('photo', null)
    return (
      <button onClick={() => setPhoto(previous => `${previous}:edited`)}>
        {label}:{photo}
      </button>
    )
  }
  function Home() {
    return (
      <>
        <Photo label="A" />
        <Photo label="B" />
      </>
    )
  }
  const routes = defineRoutes({ home: route(Home) })
  const structure = defineNavigation(routes, { stack: { root: 'home' } })
  act(() => {
    root = runApp({
      app: app,
      routes: routes,
      navigation: structure,
      content: () => <NavigationStack<typeof routes, typeof structure> />,
    })
  })
  click('A:persisted.jpg')
  expect(document.body.textContent).toContain('B:persisted.jpg:edited')
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toBe('persisted.jpg:edited')
  act(() => {
    root!.unmount()
    root = undefined
  })
  act(() => {
    root = runApp({
      app: app,
      routes: routes,
      navigation: structure,
      content: () => <NavigationStack<typeof routes, typeof structure> />,
    })
  })
  expect(document.body.textContent).toContain('A:persisted.jpg:edited')
  act(() => {
    localStorage.setItem(storageKey, JSON.stringify('another-tab.jpg'))
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey }))
  })
  expect(document.body.textContent).toContain('A:another-tab.jpg')
  expect(document.body.textContent).toContain('B:another-tab.jpg')
})

it('draws standalone press controls as plain native labels: no UA chrome, inherited tint, authored color wins', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations() + '.authored-link { color: rgb(255, 0, 0); }'
  document.head.append(style)
  function Home() {
    return (
      <ControlStyleProvider tint="rgb(0, 128, 0)">
        <Pressable onPress={() => {}}>Play</Pressable>
        <NavigationLink<typeof routes> to="detail">Album</NavigationLink>
        <NavigationLink<typeof routes> to="detail" className="authored-link">
          Custom album
        </NavigationLink>
        <ControlStyleProvider disabled>
          <NavigationLink<typeof routes> to="detail">Unavailable album</NavigationLink>
        </ControlStyleProvider>
      </ControlStyleProvider>
    )
  }
  const routes = defineRoutes({ home: route(Home), detail: route(() => <p>Album detail</p>) })
  act(() => {
    root = runApp({
      app: app,
      routes: routes,
      navigation: defineNavigation(routes, { stack: { root: 'home' } }),
    })
  })
  const buttons = [...document.querySelectorAll('button')]
  // A plain Pressable is the label colour on no chrome (UIColor.label: white in dark mode).
  document.documentElement.dataset.satinAppearance = 'dark'
  const play = getComputedStyle(buttons.find(button => button.textContent === 'Play')!)
  expect([play.color, play.backgroundColor, play.padding]).toEqual([
    '#ffffff',
    'transparent',
    '0px',
  ])
  expect(getComputedStyle(buttons.find(button => button.textContent === 'Album')!).color).toBe(
    'rgb(0, 128, 0)',
  )
  expect(
    getComputedStyle(buttons.find(button => button.textContent === 'Custom album')!).color,
  ).toBe('rgb(255, 0, 0)')
  expect(buttons.find(button => button.textContent === 'Unavailable album')!.disabled).toBe(true)
  click('Album')
  expect(document.body.textContent).toContain('Album detail')
  style.remove()
})

it('keeps wide NavigationStack single-column and requires explicit NavigationSplitView', () => {
  expect(JSON.parse(generateSatinManifestJson(app)).orientation).toBe('portrait')
  expect(JSON.parse(generateSatinManifestJson(app, 'pad')).orientation).toBe('any')
  expect(app.orientations.fallback).toBe('responsive')
  const routes = defineRoutes({
    home: route(() => (
      <Screen title="Home">
        <p>Root</p>
      </Screen>
    )),
  })
  const structure = defineNavigation(routes, { stack: { root: 'home' } })
  adaptiveLayout.horizontal = 'regular'
  adaptiveLayout.width = 1366
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: structure })
  })
  expect(
    document
      .querySelector('[data-satin-navigation-layout]')
      ?.getAttribute('data-satin-navigation-layout'),
  ).toBe('stack')
  expect(document.body.textContent).not.toContain('Select an item')
  act(() => root!.unmount())
  act(() => {
    root = runApp({
      app: app,
      routes: routes,
      navigation: structure,
      content: () => <NavigationSplitView />,
    })
  })
  expect(
    document
      .querySelector('[data-satin-navigation-layout]')
      ?.getAttribute('data-satin-navigation-layout'),
  ).toBe('split')
  act(() => root!.unmount())
  adaptiveLayout.horizontal = 'compact'
  adaptiveLayout.width = 440
  act(() => {
    root = runApp({
      app: app,
      routes: routes,
      navigation: structure,
      content: () => <NavigationSplitView />,
    })
  })
  expect(
    document
      .querySelector('[data-satin-navigation-layout]')
      ?.getAttribute('data-satin-navigation-layout'),
  ).toBe('stack')
})

function SearchHome({ suggestions }: { suggestions?: boolean }) {
  const [text, setText] = useState('')
  const [scope, setScope] = useState('all')
  return (
    <Screen title="Search" titleDisplay="large">
      <List
        id="search"
        listStyle="plain"
        searchable={{
          text,
          onTextChange: setText,
          prompt: 'Artists, Songs, Albums',
          scopes: {
            selection: scope,
            onSelectionChange: setScope,
            options: [
              { id: 'all', label: 'All' },
              { id: 'songs', label: 'Songs' },
            ],
          },
          suggestions: suggestions ? [{ id: 'halcyon', text: 'Halcyon Drift' }] : undefined,
        }}
      >
        <LabeledContent label="Browse row" value={text || 'empty'} />
      </List>
    </Screen>
  )
}

function renderSearch(suggestions?: boolean) {
  vi.spyOn(Element.prototype, 'animate').mockImplementation(
    () => ({ finished: Promise.resolve(), cancel() {} }) as unknown as Animation,
  )
  const routes = defineRoutes({ home: route(() => <SearchHome suggestions={suggestions} />) })
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: { stack: { root: 'home' } } })
  })
  const scroller = document.querySelector<HTMLElement>('[data-satin-searchable]')!
  const input = scroller.querySelector<HTMLInputElement>('[data-satin-search] input')!
  return { scroller, input }
}

// reference dark field (native reference reference and reference, iOS 27.0): a drawer fixed under an inline title (explicit
// navigationBarDrawer placement) is part of the bar and its field is the glass capsule at scroll 0.
// An automatic placement's drawer scrolls away with the content (Reminders), and a large title's
// field belongs to the content header: both are a grey fill until the field pins. None draws the
// edge material before content scrolls under it.
it('rests the search field as glass only in a drawer fixed under an inline title', () => {
  function InlineChats({ fixed }: { fixed: boolean }) {
    const [text, setText] = useState('')
    return (
      <Screen
        title="Chats"
        toolbar={
          fixed ? undefined : (
            <ToolbarItem placement="bottomBar">
              <Button onPress={() => {}}>Add List</Button>
            </ToolbarItem>
          )
        }
      >
        <List
          id="chats"
          listStyle="plain"
          searchable={{
            text,
            onTextChange: setText,
            ...(fixed ? { placement: 'navigationBarDrawer' as const } : {}),
          }}
        >
          <LabeledContent label="Atlas" value="1:28 AM" />
        </List>
      </Screen>
    )
  }
  vi.spyOn(Element.prototype, 'animate').mockImplementation(
    () => ({ finished: Promise.resolve(), cancel() {} }) as unknown as Animation,
  )
  const resting = () => {
    const drawer = document.querySelector<HTMLElement>('[data-satin-search]')!
    const edge = drawer.nextElementSibling as HTMLElement
    return {
      glass: drawer.style.getPropertyValue('--satin-search-glass'),
      pinned: drawer.hasAttribute('data-satin-search-pinned'),
      edge: edge.style.getPropertyValue('--satin-search-pin').trim(),
    }
  }
  for (const fixed of [true, false]) {
    const inline = defineRoutes({ home: route(() => <InlineChats fixed={fixed} />) })
    act(() => {
      root = runApp({ app: app, routes: inline, navigation: { stack: { root: 'home' } } })
    })
    expect(resting()).toEqual(
      fixed ? { glass: '1', pinned: true, edge: '0' } : { glass: '0', pinned: false, edge: '0' },
    )
    act(() => root!.unmount())
    document.body.innerHTML = '<div id="root"></div>'
  }

  renderSearch()
  expect(resting()).toEqual({ glass: '0', pinned: false, edge: '0' })
})

it('keeps search presented across a blur and closes only from its close button, which owns that touch', () => {
  const { scroller, input } = renderSearch()
  const close = scroller.querySelector<HTMLButtonElement>('[data-satin-search-close]')!
  const scopes = scroller.querySelector('[data-satin-search-scopes]')!
  expect(scroller.querySelector('h1')?.textContent).toBe('Search')
  expect(scroller.hasAttribute('data-satin-search-presented')).toBe(false)

  act(() => input.focus())
  expect(scroller.hasAttribute('data-satin-search-presented')).toBe(true)
  act(() => input.blur())
  // Owner, Music (Oct 9): blurring the field used to dismiss search and unmount its chrome.
  expect(scroller.hasAttribute('data-satin-search-presented')).toBe(true)
  expect(scopes.hasAttribute('inert')).toBe(false)

  close.getBoundingClientRect = () => new DOMRect(376, 62, 44, 44)
  for (const type of ['pointerdown', 'pointerup']) {
    act(() => {
      close.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          clientX: 398,
          clientY: 84,
        }),
      )
    })
  }
  // The touch that pressed Close must not go on to focus the field that widens under it.
  const touchEnd = new Event('touchend', { bubbles: true, cancelable: true })
  close.dispatchEvent(touchEnd)
  expect(touchEnd.defaultPrevented).toBe(true)
  expect(scroller.hasAttribute('data-satin-search-presented')).toBe(false)
  expect(document.activeElement).not.toBe(input)
  expect(close.isConnected && scopes.isConnected).toBe(true)
})

it('draws a pushed screen’s bar from the first frame of a push over presented search', async () => {
  // Owner, Reminders (Oct 9 04:18): the pushed back and trailing items stayed hidden for the whole
  // push and appeared only once it settled, and vanished at once on pop.
  function Lists() {
    const [text, setText] = useState('')
    return (
      <Screen
        title="Lists"
        titleDisplay="large"
        toolbar={
          <ToolbarItem placement="topBarTrailing">
            <Button onPress={() => {}}>Edit</Button>
          </ToolbarItem>
        }
      >
        {/* The owner's Reminders has bottom bar items, so its automatic field is the drawer. */}
        <List
          id="lists"
          searchable={{ text, onTextChange: setText, placement: 'navigationBarDrawer' }}
        >
          <LabeledContent label="Work" value="4" />
        </List>
      </Screen>
    )
  }
  function Work() {
    return (
      <Screen
        toolbar={
          <ToolbarItem placement="topBarTrailing">
            <Button onPress={() => {}}>More</Button>
          </ToolbarItem>
        }
      >
        <p>Work content</p>
      </Screen>
    )
  }
  const navigator = createNavigator({
    registry: createScreenRegistry(
      defineScreen('lists', { component: Lists, navigation: { title: 'Lists' } }),
      defineScreen('work', { component: Work, navigation: { title: 'Work' } }),
    ),
    initial: { id: 'lists' },
    // Held in flight: the test reads the bar mid-push and mid-pop.
    transitionControllerFactory: completion => ({
      progress: 0,
      finish: completion.finish,
      cancel: completion.cancel,
    }),
  })
  const reactRoot = createRoot(document.getElementById('root')!)
  act(() =>
    reactRoot.render(
      <ScreenChromeContext value={createScreenChrome()}>
        <NavigatorHost navigator={navigator} />
      </ScreenChromeContext>,
    ),
  )
  const header = document.querySelector<HTMLElement>('[data-satin-navigation-chrome]')!
  const presented = (element: Element) => element.hasAttribute('data-satin-search-presented')
  const toolbars = () => [...header.querySelectorAll('[data-satin-entry-toolbar]')].map(presented)
  act(() => document.querySelector<HTMLInputElement>('[data-satin-search] input')!.focus())
  expect(presented(header)).toBe(true)

  await act(async () => navigator.push('work'))
  expect(navigator.getState().entries[1].transition.phase).toBe('entering')
  expect(presented(header)).toBe(false)
  expect(toolbars()).toEqual([true, false])

  await act(async () => navigator.getState().entries[1].transition.controller.finish())
  await act(async () => navigator.pop())
  expect(navigator.getState().entries[1].transition.phase).toBe('exiting')
  expect(presented(header)).toBe(false)
  await act(async () => navigator.getState().entries[1].transition.controller.finish())
  expect(presented(header)).toBe(true)
  act(() => reactRoot.unmount())
})

it('shows suggestions in place of the still-mounted content, and a suggestion completes the text', () => {
  const { scroller, input } = renderSearch(true)
  const content = scroller.querySelector('[data-satin-labeled-content], [data-satin-row]')
  const suggestions = scroller.querySelector<HTMLElement>('[data-satin-search-suggestions]')!
  expect(suggestions.hidden).toBe(true)
  act(() => input.focus())
  expect(suggestions.hidden).toBe(false)
  const suggestion = suggestions.querySelector<HTMLButtonElement>('button')!
  expect(suggestion.textContent).toBe('Halcyon Drift')
  act(() => suggestion.click())
  expect(input.value).toBe('Halcyon Drift')
  expect(content?.isConnected).toBe(true)
  expect(scroller.textContent).toContain('Halcyon Drift')
})

function BottomSearch({
  items,
  scoped = false,
}: {
  items: 'none' | 'compose' | 'messages'
  scoped?: boolean
}) {
  const [text, setText] = useState('')
  const [scope, setScope] = useState('All')
  const compose = (
    <ToolbarItem placement="bottomBar">
      <Button onPress={() => {}}>Compose</Button>
    </ToolbarItem>
  )
  return (
    <Screen
      title="Messages"
      titleDisplay="large"
      toolbar={
        items === 'none' ? undefined : items === 'compose' ? (
          compose
        ) : (
          <>
            <DefaultToolbarItem kind="search" placement="bottomBar" />
            <ToolbarSpacer placement="bottomBar" />
            {compose}
          </>
        )
      }
    >
      <List
        id="messages"
        searchable={{
          text,
          onTextChange: setText,
          ...(scoped
            ? {
                scopes: {
                  selection: scope,
                  onSelectionChange: setScope,
                  options: [
                    { id: 'All', label: 'All' },
                    { id: 'Unread', label: 'Unread' },
                  ],
                },
              }
            : {}),
        }}
      >
        <LabeledContent label="Row" value="1" />
      </List>
    </Screen>
  )
}

function renderBottomSearch(items: 'none' | 'compose' | 'messages') {
  const routes = defineRoutes({ home: route(() => <BottomSearch items={items} />) })
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: { stack: { root: 'home' } } })
  })
  const scroller = document.querySelector<HTMLElement>('[data-satin-scroll="messages"]')!
  const bottom = document.querySelector<HTMLElement>(
    '[data-satin-entry-toolbar-active] [data-satin-navigation-toolbar-slot="bottom"]',
  )!
  return { scroller, bottom }
}

it('puts an automatic search field in the bottom toolbar on iPhone unless other bottom items take it', () => {
  // iOS 27.0 native reference: plain `.searchable` draws a 384x48 bottom capsule (search-large); with
  // bottom bar items it moves to the navigation bar drawer (reminders-root-items).
  const alone = renderBottomSearch('none')
  expect(alone.scroller.querySelector('[data-satin-search]')).toBeNull()
  expect(alone.bottom.querySelector('[data-satin-search-toolbar] input')).not.toBeNull()
  expect(alone.scroller.getAttribute('data-satin-bottom-bar')).toBe('search')
  expect(alone.scroller.hasAttribute('data-satin-searchable')).toBe(false)
  act(() => root!.unmount())

  const withItems = renderBottomSearch('compose')
  expect(withItems.scroller.querySelector('[data-satin-search] input')).not.toBeNull()
  expect(withItems.bottom.querySelector('[data-satin-search-toolbar]')).toBeNull()

  act(() => root!.unmount())
  const routes = defineRoutes({ home: route(() => <BottomSearch items="none" />) })
  act(() => {
    root = runApp({
      app,
      routes,
      navigation: {
        tabs: [{ id: 'home', label: 'Home', symbol: 'house', root: 'home' }],
        defaultTab: 'home',
      },
    })
  })
  expect(
    document.querySelector('[data-satin-scroll="messages"] [role="search"] input'),
  ).not.toBeNull()
  expect(document.querySelector('[data-satin-search-toolbar]')).toBeNull()
  act(() => root!.unmount())
  const bareRoutes = defineRoutes({
    home: route(
      () => (
        <List id="bare-search" searchable={{ text: '', onTextChange: () => {} }}>
          <LabeledContent label="Row" value="1" />
        </List>
      ),
      { title: 'Search', titleDisplay: 'inlineLarge' },
    ),
  })
  act(() => {
    root = runApp({
      app,
      routes: bareRoutes,
      navigation: {
        tabs: [
          { id: 'home', label: 'Search', symbol: 'magnifyingglass', root: 'home', role: 'search' },
        ],
        defaultTab: 'home',
      },
    })
  })
  expect(
    document.querySelector('[data-satin-scroll="bare-search"] [role="search"] input'),
  ).not.toBeNull()
  act(() => root!.unmount())
  adaptiveLayout.horizontal = 'regular'
  adaptiveLayout.width = 834
  act(() => {
    root = runApp({ app, routes: bareRoutes, navigation: { stack: { root: 'home' } } })
  })
  expect(
    document.querySelector('[data-satin-navigation-toolbar-slot="trailing"] [role="search"] input'),
  ).not.toBeNull()
  act(() => root!.unmount())
  const padRoutes = defineRoutes({ home: route(() => <BottomSearch items="none" scoped />) })
  act(() => {
    root = runApp({ app, routes: padRoutes, navigation: { stack: { root: 'home' } } })
  })
  const field = document.querySelector<HTMLInputElement>(
    '[data-satin-navigation-toolbar-slot="trailing"] [role="search"] input',
  )!
  expect(field).not.toBeNull()
  expect(document.querySelector('[data-satin-search]')).toBeNull()
  act(() => field.focus())
  expect(document.querySelector('[data-satin-search-scopes]')?.textContent).toContain('Unread')

  expect(
    resolveSearchPlacement('automatic', {
      compact: false,
      bottomBarItems: false,
      searchToolbarItem: true,
    }),
  ).toBe('navigationBarDrawer')
  expect(
    resolveSearchPlacement('automatic', {
      compact: false,
      bottomBarItems: false,
      searchToolbarItem: false,
    }),
  ).toBe('navigationBarToolbar')
  expect(
    resolveSearchPlacement('automatic', {
      compact: true,
      bottomBarItems: false,
      searchToolbarItem: false,
      tabbed: true,
    }),
  ).toBe('navigationBarDrawer')
  expect(
    resolveSearchPlacement(undefined, {
      compact: true,
      bottomBarItems: false,
      searchToolbarItem: false,
      scoped: true,
    }),
  ).toBe('navigationBarDrawer')
  expect(
    resolveSearchPlacement('toolbar', {
      compact: true,
      bottomBarItems: true,
      searchToolbarItem: false,
    }),
  ).toBe('toolbar')
})

it('places a DefaultToolbarItem search field before the spacer and compose, as Messages', () => {
  const { scroller, bottom } = renderBottomSearch('messages')
  const order = [...bottom.children].map(
    child =>
      child.getAttribute('data-satin-toolbar-item') ??
      child.getAttribute('data-satin-toolbar-spacer'),
  )
  expect(order).toEqual(['search', 'flexible', 'item'])
  expect(
    bottom.firstElementChild!.querySelector('[data-satin-search-toolbar] input'),
  ).not.toBeNull()
  expect(scroller.querySelector('[data-satin-search]')).toBeNull()
})

it('presents bottom search above the keyboard: the bar and compose give way, Close dismisses', () => {
  const { scroller, bottom } = renderBottomSearch('messages')
  const header = document.querySelector<HTMLElement>('[data-satin-navigation-chrome]')!
  const toolbar = bottom.closest('[data-satin-entry-toolbar]')!
  const input = bottom.querySelector<HTMLInputElement>('[data-satin-search-toolbar] input')!
  expect(bottom.querySelector('[data-satin-search-toolbar-close]')).toBeNull()

  act(() => input.focus())
  expect(scroller.hasAttribute('data-satin-search-presented')).toBe(true)
  expect(toolbar.hasAttribute('data-satin-search-presented')).toBe(true)
  expect(header.getAttribute('data-satin-search-presented')).toBe('toolbar')
  // The bar is hidden, not made inert: it holds the field.
  expect(header.inert).toBe(false)
  act(() => input.blur())
  expect(scroller.hasAttribute('data-satin-search-presented')).toBe(true)

  const close = bottom.querySelector<HTMLButtonElement>('[data-satin-search-toolbar-close]')!
  act(() => close.click())
  expect(scroller.hasAttribute('data-satin-search-presented')).toBe(false)
  expect(header.hasAttribute('data-satin-search-presented')).toBe(false)
  expect(toolbar.hasAttribute('data-satin-search-presented')).toBe(false)
})

it('keeps authored titles and titleDisplay none in a screen-bounded primary scroll view', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  document.head.append(style)
  function Home() {
    return (
      <Screen title="Home" titleDisplay="none">
        <ScrollSurface id="feed" axis="vertical" primary>
          <h1>Home</h1>
          <p>Feed</p>
        </ScrollSurface>
      </Screen>
    )
  }
  act(() => {
    root = runApp({
      app: app,
      routes: defineRoutes({ home: route(Home) }),
      navigation: { stack: { root: 'home' } },
    })
  })
  const scroll = document.querySelector<HTMLElement>('[data-satin-scroll="feed"]')!
  expect(getComputedStyle(scroll).height).toBe('100%')
  expect(scroll.querySelectorAll('h1')).toHaveLength(1)
  style.remove()
})

it('omits an automatic empty root bar but retains explicit visibility and control demand', () => {
  expect(screenNavigation({ title: '' }, undefined)?.visibility).toBe('hidden')
  expect(screenNavigation({ title: '' }, undefined, undefined, false, 1)?.visibility).toBe(
    'visible',
  )
  expect(screenNavigation({ title: '' }, { hasToolbar: true })?.visibility).toBe('visible')
  expect(screenNavigation({ title: '', visibility: 'visible' }, undefined)?.visibility).toBe(
    'visible',
  )
  expect(screenNavigation({ title: 'Home', visibility: 'hidden' }, undefined)?.visibility).toBe(
    'hidden',
  )
})

it('minimizes in the selected direction and restores on reversal or the scroll edge', () => {
  expect(nextToolbarMinimization(false, 0, 140, 'onScrollDown')).toBe(true)
  expect(nextToolbarMinimization(true, 140, 100, 'onScrollDown')).toBe(false)
  expect(nextToolbarMinimization(true, 140, 100, 'onScrollDown', 'atScrollEdge')).toBe(true)
  expect(nextToolbarMinimization(true, 100, 0, 'onScrollDown', 'atScrollEdge')).toBe(false)
  expect(nextToolbarMinimization(false, 0, 140, 'onScrollUp')).toBe(false)
  expect(nextToolbarMinimization(false, 140, 100, 'onScrollUp')).toBe(true)
  expect(nextToolbarMinimization(true, 140, 200, 'never')).toBe(false)
})

it('selects top-edge visibility independently and refuses an unrenderable hard style', () => {
  expect(topScrollEdgePolicy({ hidden: true, edges: 'bottom' }, 'soft')).toEqual({
    hidden: false,
    style: 'soft',
  })
  expect(topScrollEdgePolicy({ hidden: true, edges: ['top', 'bottom'] }, 'automatic').hidden).toBe(
    true,
  )
  expect(() => topScrollEdgePolicy(false, 'hard')).toThrow('hard')
})

it('retains initial section spacing inside a bar-less plain List without moving its sticky boundary', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  document.head.append(style)
  function Home() {
    return (
      <Screen>
        <List id="feed" listStyle="plain">
          <Section header="Recently Played">
            <p>Song</p>
          </Section>
          <Section header="Next">
            <p>Another song</p>
          </Section>
        </List>
      </Screen>
    )
  }
  act(() => {
    root = runApp({
      app: app,
      routes: defineRoutes({ home: route(Home) }),
      navigation: { stack: { root: 'home' } },
    })
  })
  const sections = document.querySelectorAll<HTMLElement>('[data-satin-list-section]')
  expect(getComputedStyle(sections[0]!).marginBlockStart).toBe('32px')
  expect(getComputedStyle(sections[1]!).marginBlockStart).not.toBe('32px')
  expect(getComputedStyle(sections[0]!.querySelector<HTMLElement>('[role="heading"]')!).top).toBe(
    '0px',
  )
  style.remove()
})

it('shows a Toggle subtitle under its label as the switch description, with one activation', () => {
  const changed = vi.fn()
  function Home() {
    const [checked, setChecked] = useState(false)
    return (
      <Form id="subtitle">
        <Toggle
          label="Date"
          subtitle="Today"
          isOn={checked}
          onChange={value => {
            changed(value)
            setChecked(value)
          }}
        />
        <Toggle
          label="Custom"
          subtitle="Description"
          isOn={false}
          onChange={changed}
          toggleStyle={{ semantics: 'checkbox', makeBody: ({ label }) => <span>{label}</span> }}
        />
      </Form>
    )
  }
  const routes = defineRoutes({ home: route(Home) })
  act(() => {
    root = runApp({ app, routes, navigation: { stack: { root: 'home' } } })
  })
  const toggle = document.querySelector<HTMLElement>('[role="switch"]')!
  const description = document.getElementById(toggle.getAttribute('aria-describedby') ?? '')
  expect(description?.textContent).toBe('Today')
  expect(document.getElementById(toggle.getAttribute('aria-labelledby')!)?.textContent).toBe('Date')
  // Tapping the subtitle toggles once, like tapping anywhere else in the row.
  act(() => description!.click())
  expect(changed.mock.calls).toEqual([[true]])
  expect(document.querySelector('[role="checkbox"]')?.textContent).toContain('Description')
})

it('draws Picker option icons per style and never commits an unavailable option', () => {
  const changed = vi.fn()
  const options = [
    { id: 'home', label: 'Home', symbol: 'house', color: '#ff0000' },
    { id: 'work', label: 'Work', symbol: 'folder', disabled: true },
    { id: 'other', label: 'Other', icon: <span>Other glyph</span> },
  ] as const
  function Home() {
    const [value, setValue] = useState('home')
    const select = (next: string) => {
      changed(next)
      setValue(next)
    }
    return (
      <Form id="rich">
        <Section>
          <Picker
            label="Destination"
            pickerStyle="inline"
            selection={value}
            onSelectionChange={select}
            options={options}
          />
        </Section>
        <Section>
          <Picker label="Menu" selection={value} onSelectionChange={select} options={options} />
        </Section>
        <ControlStyleProvider disabled>
          <Picker
            label="Locked"
            pickerStyle="inline"
            selection={value}
            onSelectionChange={changed}
            options={options}
          />
        </ControlStyleProvider>
      </Form>
    )
  }
  const routes = defineRoutes({ home: route(Home) })
  act(() => {
    root = runApp({ app, routes, navigation: { stack: { root: 'home' } } })
  })
  // Inline rows draw each icon in its own colour.
  const homeRow = document.querySelector<HTMLElement>('[aria-label="Home, selected"]')!
  const icon = homeRow.querySelector<HTMLElement>('[data-satin-picker-choice-icon]')!
  expect(icon.querySelector('[data-satin-symbol="house"]')).not.toBeNull()
  expect(icon.style.color).toBe('#ff0000')
  expect(document.body.textContent).toContain('Other glyph')
  // The menu's resting value shows the selected option as a Label.
  const trigger = document.querySelector<HTMLElement>('[data-satin-picker-trigger]')!
  expect(trigger.getAttribute('data-satin-picker-decorated')).toBe('true')
  expect(trigger.querySelector('[data-satin-symbol="house"]')).not.toBeNull()
  // A disabled option and a Picker disabled by its environment both refuse a press.
  act(() => document.querySelector<HTMLElement>('[aria-label="Work"]')!.click())
  const locked = [...document.querySelectorAll<HTMLElement>('[aria-label="Other"]')].at(-1)!
  act(() => locked.click())
  expect(changed).not.toHaveBeenCalled()
  act(() => document.querySelector<HTMLElement>('[aria-label="Other"]')!.click())
  expect(changed.mock.calls).toEqual([['other']])
})

it.each([false, true])('reserves the built-in Picker bar in a modal=%s stack', modal => {
  let removePicker!: () => void
  function Details() {
    const [present, setPresent] = useState(true)
    removePicker = () => setPresent(false)
    return (
      <Form id="picker-inset-details">
        {present && (
          <Picker
            label="Repeat"
            pickerStyle="navigationLink"
            selection="never"
            options={[
              { id: 'never', label: 'Never' },
              { id: 'daily', label: 'Daily' },
            ]}
            onSelectionChange={() => {}}
          />
        )}
        <NavigationLink<typeof routes> to="large">Large page</NavigationLink>
      </Form>
    )
  }
  function Home() {
    return modal ? (
      <Sheet title="Details" isPresented onPresentedChange={() => {}}>
        <ScreenContentContext value={{}}>
          <NavigationStack<typeof routes> modal root="details" />
        </ScreenContentContext>
      </Sheet>
    ) : (
      <Details />
    )
  }
  const routes = defineRoutes({
    home: route(Home, { title: 'Reminders', titleDisplay: 'large' }),
    details: route(Details, { title: 'Details' }),
    large: route(
      () => (
        <Form id="picker-inset-large">
          <LabeledContent label="Reminder" value="One" />
        </Form>
      ),
      { title: 'Large page', titleDisplay: 'large' },
    ),
  })
  act(() => {
    root = runApp({ app, routes, navigation: { stack: { root: 'home' } } })
  })
  act(() =>
    document
      .querySelector<HTMLButtonElement>('[data-satin-picker-mode=navigation] button')!
      .click(),
  )
  const destination = () =>
    document.querySelector<HTMLElement>('[data-satin-screen="__satin:picker"] [data-satin-list]')!
  expect(destination().dataset.satinPrimary).toBe('true')
  expect(destination().dataset.satinListNavigation).toBe('inline')
  expect(destination().dataset.satinScrollNavigation).toBeUndefined()
  act(removePicker)
  expect(destination().textContent).toContain('Selection unavailable')
  expect(destination().dataset.satinListNavigation).toBe('inline')
})

it('retires a pushed Picker list when its Picker is removed, keeping the title', () => {
  const changed = vi.fn()
  let setPresent!: (present: boolean) => void
  function Home() {
    const [present, setPresentState] = useState(true)
    const [value, setValue] = useState('home')
    setPresent = setPresentState
    return (
      <Form id="owner-removal">
        {present && (
          <Picker
            label="Destination"
            pickerStyle="navigationLink"
            selection={value}
            options={[
              { id: 'home', label: 'Home' },
              { id: 'work', label: 'Work' },
            ]}
            onSelectionChange={next => {
              changed(next)
              setValue(next)
            }}
          />
        )}
      </Form>
    )
  }
  const routes = defineRoutes({ home: route(Home) })
  act(() => {
    root = runApp({ app, routes, navigation: { stack: { root: 'home' } } })
  })
  const open = () =>
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-satin-picker-mode=navigation] button')!
        .click(),
    )
  open()
  const retained = document.querySelector<HTMLButtonElement>('[aria-label="Work"]')!
  act(() => setPresent(false))
  act(() => retained.click())
  expect(changed).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('Selection unavailable')
  expect(
    [...document.querySelectorAll('[role=heading]')].some(
      heading => heading.textContent === 'Destination',
    ),
  ).toBe(true)
  // A Picker mounted again pushes a fresh, working list.
  act(() => setPresent(true))
  act(() =>
    document.querySelector<HTMLButtonElement>('[data-satin-navigation-back-button]')!.click(),
  )
  open()
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Work"]')!.click())
  expect(changed.mock.calls).toEqual([['work']])
})

it('opens built-in acknowledgements only on navigation and allows removal', () => {
  let open: (() => boolean) | undefined
  const routes = defineRoutes({
    home: route(() => {
      open = useNavigation().showAcknowledgements
      return (
        <Screen title="Settings">
          <List id="credit-test">
            <LabeledContent label="General" value="Default" />
          </List>
        </Screen>
      )
    }),
  })
  const structure = defineNavigation(routes, { stack: { root: 'home' } })
  act(() => {
    root = runApp({ app: app, routes: routes, navigation: structure })
  })
  expect(document.body.textContent).not.toContain('Built with Satin')
  act(() => {
    expect(open!()).toBe(true)
  })
  expect(document.body.textContent).toContain('Built with Satin')
  expect(document.body.textContent).toContain('Framework7 Icons')
  act(() => root!.unmount())
  const removed = defineApp({
    id: '/without-credit',
    name: 'No credit',
    icons: app.icons,
    acknowledgements: false,
  })
  act(() => {
    root = runApp({ app: removed, routes: routes, navigation: structure })
  })
  act(() => {
    expect(open!()).toBe(false)
  })
  expect(document.body.textContent).not.toContain('Built with Satin')
  expect(document.body.textContent).toContain('General')
})

it('positions vertical targets through a ref without an observation prop', () => {
  const scroll = React.createRef<ScrollSurfaceHandle>()
  function Home() {
    return (
      <ScrollSurface id="target-feed" ref={scroll}>
        <ScrollTarget id="last">Last item</ScrollTarget>
      </ScrollSurface>
    )
  }
  act(() => {
    root = runApp({
      app,
      routes: defineRoutes({ home: route(Home) }),
      navigation: { stack: { root: 'home' } },
    })
  })
  let positioned = false
  act(() => {
    positioned = scroll.current!.scrollTo('last')
  })
  expect(positioned).toBe(true)
})

it('opens a Link in the existing scene and rejects malformed paths without losing its root', () => {
  const app = defineApp({
    id: 'web-handoff-test',
    name: 'Web handoff',
    icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }],
  })
  let runtime!: AppRuntime
  let openURL!: OpenURLAction
  const routes = defineRoutes({
    home: route(() => <p>Home</p>),
    detail: route(() => <p>Detail</p>),
  })
  const navigation = defineNavigation(routes, { stack: { root: 'home' } })
  const url = new URL(app.scope, location.origin)
  url.searchParams.set('satin-route', JSON.stringify([{ screen: 'detail', version: 1 }]))
  function App() {
    runtime = useAppContext()
    openURL = useOpenURL()
    return <Link destination={url.href}>Open detail</Link>
  }
  act(() => {
    root = runApp({ app, routes, navigation, content: App })
  })
  const scene = runtime.scene
  act(() => {
    ;(document.querySelector('[role=link]') as HTMLElement).click()
  })
  expect(runtime.stacks.get('main')!.getState().entries.at(-1)?.screenId).toBe('detail')
  expect(runtime.scene).toBe(scene)
  url.searchParams.set('satin-route', JSON.stringify([{ screen: 'missing', version: 1 }]))
  expect(openURL(url.href)).toEqual({ status: 'unavailable', reason: 'unregistered-app-url' })
  expect(runtime.stacks.get('main')!.getState().entries.at(-1)?.screenId).toBe('detail')
})

it('composes sections from declared IDs while keeping hidden destinations and their primary stacks', () => {
  let runtime: AppRuntime
  let update: (id: 'home' | 'albums') => void
  const routes = defineRoutes({
    home: route(() => <p>Home content</p>),
    albums: route(() => <p>Albums content</p>),
  })
  const structure = defineNavigation(routes, {
    tabs: [
      { id: 'home', label: 'Home', root: 'home' },
      { id: 'albums', label: 'Albums', root: 'albums' },
    ],
  })
  function App() {
    runtime = useAppContext()
    const [selection, setSelection] = useState<'home' | 'albums'>('home')
    update = setSelection
    return (
      <TabView<typeof structure> selection={selection}>
        <Tab<typeof structure> id="home" />
        <TabSection title="Library" tabPlacement="sidebarOnly">
          <Tab<typeof structure> id="albums" />
        </TabSection>
      </TabView>
    )
  }
  act(() => {
    root = runApp({ app, routes, navigation: structure, content: App })
  })
  expect(runtime!.stacks.has('albums')).toBe(true)
  expect(document.querySelector('nav')!.textContent).toBe('home')
  const stack = runtime!.stacks.get('albums')
  act(() => update!('albums'))
  // A sidebar-only destination remains declared, but cannot displace compact navigation.
  expect(document.querySelector('[data-satin-tab-active=true]')!.textContent).toContain(
    'Home content',
  )
  act(() => update!('home'))
  act(() => update!('albums'))
  expect(runtime!.stacks.get('albums')).toBe(stack)
})

it.each(['unknown', 'duplicate', 'missing'] as const)(
  'rejects invalid TabSection composition: %s',
  kind => {
    const routes = defineRoutes({ home: route(() => null), albums: route(() => null) })
    const structure = defineNavigation(routes, {
      tabs: [
        { id: 'home', label: 'Home', root: 'home' },
        { id: 'albums', label: 'Albums', root: 'albums' },
      ],
    })
    const App = () => (
      <TabView<typeof structure>>
        <Tab<typeof structure> id="home" />
        {kind !== 'missing' && (
          <TabSection title="Library" tabPlacement="sidebarOnly">
            <Tab<typeof structure> id={(kind === 'unknown' ? 'absent' : 'home') as 'home'} />
          </TabSection>
        )}
      </TabView>
    )
    expect(() =>
      act(() => {
        root = runApp({ app, routes, navigation: structure, content: App })
      }),
    ).toThrow(
      kind === 'unknown'
        ? /Unknown tab/
        : kind === 'duplicate'
          ? /Duplicate tab/
          : /every declared tab/,
    )
  },
)
