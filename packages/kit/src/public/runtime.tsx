import { TabSection, type TabSectionProps } from '../tabs/TabSection.tsx'
export { TabSection, type TabSectionProps } from '../tabs/TabSection.tsx'
import {
  acknowledgementsRegistry,
  ACKNOWLEDGEMENTS,
} from '../acknowledgements/Acknowledgements.tsx'
import { preferredColorScheme, type PreferredColorScheme } from '../app/appearance.ts'
import { ControlStyleProvider } from './controlStyle.tsx'
import {
  validateNavigation,
  type NavigationDeclaration,
  type RegisteredNavigation,
  type StackDeclaration,
  type TabId,
} from './structure.ts'
import { ModalPresentationContext } from './presentationContext.ts'
import { TabRegistrationContext, TabSidebarContext } from '../tabs/context.ts'
import { resolveRoutes } from './routeRegistry.ts'
import { AppContext, useAppContext, type AppRuntime } from './context.ts'
import type { OfflinePresentationProps } from '../reachability/react.tsx'
import type { GlassError } from '../glass/errors.ts'
import type { RouteProps } from './routes.tsx'
import {
  Children,
  isValidElement,
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
} from 'react'
import { mountSatin } from '../root/mountSatin.ts'
import { SatinRoot } from '../root/SatinRoot.tsx'
import type { AppDefinition } from '../app/definition.ts'
import {
  createNavigator,
  createInstantTransitionController,
  type NavigatorStore,
} from '../navigation/store.ts'
import { createAnimatedTransitionController } from '../navigation/motion.ts'
import { withZoomTransitions } from '../navigation/zoomTransition.ts'
import { NavigatorHost } from '../navigation/NavigatorHost.tsx'
import { useNavigator } from '../navigation/navigationContext.tsx'
import { createSceneRestoration } from '../restoration/scene.ts'
import { prepareSceneRoutes } from '../restoration/routes.ts'
import { useRestoredState } from '../restoration/react.ts'
import {
  Tab as EngineTab,
  TabView as EngineTabView,
  type TabViewProps as EngineTabViewProps,
} from '../tabs/TabView.tsx'
import { createPushNotifications, createPushRelayAdapter } from '../push/notifications.ts'
import type { Routes, RegisteredRoutes } from './routes.tsx'
import { createScreenChrome, ScreenChromeContext } from './screenChrome.tsx'

/** App-wide runtime options for `runApp`. Every one is optional. */
export type RunAppOptions = {
  /** Initial scene override; call preferredColorScheme when the setting changes. */
  preferredColorScheme?: PreferredColorScheme
  /** The push relay that delivers this app's notifications; omit it for an app without push. */
  notifications?: {
    relay: { url: string; publicKey: string; token?: () => string | Promise<string> }
  }
  /** Replaces the framework's offline presentation. */
  offline?: ComponentType<OfflinePresentationProps>
  /** Release builds fall back to a CSS material when WebGPU cannot render. `onGlassError` still receives every failure. */
  onGlassError?: (error: GlassError) => void
  /** Limits on what the scene checkpoint keeps, and for how long the app may be away. */
  restoration?: { maxAbsenceMs?: number; maxBytes?: number }
  className?: string
}
/** Pushes and pops slide, or zoom when the pushed screen asks for it (`navigationTransition`). */
const animatedTransitionController = withZoomTransitions(createAnimatedTransitionController)

function makeStack(runtime: AppRuntime, key: string, root: string, params?: unknown) {
  const route = runtime.routes.definitions[root]
  if (!route || !route.validate(params)) throw new Error(`Invalid root route: ${root}`)
  return createNavigator({
    registry:
      runtime.app.acknowledgements === false
        ? resolveRoutes(runtime.routes)
        : acknowledgementsRegistry(resolveRoutes(runtime.routes)),
    initial: { id: root, params },
    restoration: { scene: runtime.scene, key },
    transitionControllerFactory: (completion, context) =>
      context.operation === 'replace'
        ? createInstantTransitionController(completion)
        : animatedTransitionController(completion, context),
  })
}
/** The app, routes, navigation and optional root content mounted by runApp. */
export type RunAppConfiguration<
  R extends Routes,
  D extends NavigationDeclaration<R>,
> = RunAppOptions & {
  app: AppDefinition
  routes: R
  navigation: D
  content?: ComponentType
}
/**
 * Mounts the app into `#root`. Satin creates every
 * primary stack and restores the scene and its launch route before React's first commit, then
 * owns navigation, restoration, notifications and the app shell. Call it once.
 *
 * `Content` replaces the default root, usually to add app-wide providers; it renders `TabView` or
 * `NavigationStack` itself. Without it Satin renders the declaration directly.
 *
 * @example
 * runApp({ app, routes, navigation })
 */
export function runApp<R extends Routes, const D extends NavigationDeclaration<R>>({
  app,
  routes,
  navigation: declaration,
  content: Content,
  ...options
}: RunAppConfiguration<R, D>) {
  const structure = validateNavigation(routes, declaration)
  if (options.preferredColorScheme !== undefined) preferredColorScheme(options.preferredColorScheme)
  const runtime: AppRuntime = {
    app,
    routes,
    structure,
    scene: createSceneRestoration({ id: app.id, ...options.restoration }),
    stacks: new Map(),
    mountedStacks: new Set(),
    notifications: null,
  }
  const relay = options.notifications?.relay
  if (relay)
    runtime.notifications = createPushNotifications({
      app,
      applicationServerKey: relay.publicKey,
      server: createPushRelayAdapter({ url: relay.url, token: relay.token ?? (() => '') }),
    })
  const declarations = structure.tabs ?? [{ id: 'main', ...structure.stack }]
  for (const stack of declarations)
    runtime.stacks.set(stack.id, makeStack(runtime, stack.id, stack.root, stack.params))
  const first = structure.defaultTab ?? declarations[0]!.id
  runtime.sceneRoutes = prepareSceneRoutes({
    scene: runtime.scene,
    scope: app.scope,
    registry: resolveRoutes(routes),
    navigators: Object.fromEntries(runtime.stacks),
    defaultTab: first,
  })
  const mount = document.querySelector('#root')
  if (!mount) throw new Error('runApp requires a #root mount element')
  function Lifecycle() {
    useEffect(() => {
      const stopRoutes = runtime.sceneRoutes!.connect()
      const stopPush = runtime.notifications?.start()
      return () => {
        stopPush?.()
        stopRoutes()
      }
    }, [])
    return null
  }
  const root = mountSatin(
    mount,
    <AppContext value={runtime}>
      <SatinRoot
        app={app}
        style={
          app.appearance.tint
            ? ({
                '--satin-tint': app.appearance.tint,
                '--satin-list-accent': app.appearance.tint,
              } as CSSProperties)
            : undefined
        }
        className={options.className}
        offlinePresentation={options.offline}
        onGlassError={options.onGlassError}
      >
        <ControlStyleProvider tint={app.appearance.tint}>
          <Lifecycle />
          {Content ? <Content /> : structure.tabs ? <DeclaredTabView /> : <PrimaryStack />}
        </ControlStyleProvider>
      </SatinRoot>
    </AppContext>,
  )
  return { unmount: () => root.unmount() }
}
const PrimaryTabContext = createContext<string | null>(null)
const NestedStackContext = createContext(false)
/** Either a declared primary stack (optionally naming its tab), or a modal stack inside a `Sheet`
 * that declares its own root. */
export type NavigationStackProps<R extends Routes = RegisteredRoutes, D = RegisteredNavigation> =
  | ([D] extends [never]
      ? { tab: never; modal?: false; root?: never; params?: never }
      : { modal?: false; tab?: TabId<D>; root?: never; params?: never })
  | ({ modal: true; tab?: never } & StackDeclaration<R>)
/**
 * Renders an in-memory navigation stack. A primary stack's root comes from
 * `defineNavigation`, never from JSX. Inside a `Sheet`, `modal` with a `root` makes a stack the
 * sheet owns.
 *
 * @example
 * <Sheet isPresented={open} onPresentedChange={setOpen} title="New Note">
 *   <NavigationStack modal root="compose" />
 * </Sheet>
 */
export function NavigationStack<R extends Routes = RegisteredRoutes, D = RegisteredNavigation>(
  props: NavigationStackProps<R, D>,
) {
  if (!props.modal && ('root' in props || 'params' in props))
    throw new Error('Primary roots belong in defineNavigation, not JSX')
  return props.modal ? <ModalStack {...props} /> : <PrimaryStack tab={props.tab} />
}
/** Selects which declared primary stack the split view renders; inside a `Tab`, its own. */
export type NavigationSplitViewProps<D = RegisteredNavigation> = { tab?: TabId<D> }
/** Shows the declared root as a sidebar and pushes into a retained detail column. At compact
 * width it collapses to a plain stack. A `NavigationStack` never splits by itself. */
export function NavigationSplitView<D = RegisteredNavigation>(props: NavigationSplitViewProps<D>) {
  if ('root' in props || 'params' in props || 'modal' in props)
    throw new Error('NavigationSplitView uses a declared primary sidebar root')
  return <PrimaryStack tab={props.tab} split />
}
function StackHost({
  navigator,
  adaptive,
  primary,
}: {
  navigator: NavigatorStore
  adaptive?: boolean
  primary: boolean
}) {
  const [chrome] = useState(createScreenChrome)
  const tabRegistration = useContext(TabRegistrationContext)
  return (
    <ScreenChromeContext value={chrome}>
      <NestedStackContext value={true}>
        <TabRegistrationContext value={primary ? tabRegistration : null}>
          <NavigatorHost navigator={navigator} adaptive={adaptive ?? false} />
        </TabRegistrationContext>
      </NestedStackContext>
    </ScreenChromeContext>
  )
}
function PrimaryStack({ tab, split = false }: { tab?: string; split?: boolean }) {
  const runtime = useAppContext()
  const owningTab = useContext(PrimaryTabContext)
  const nested = useContext(NestedStackContext)
  const modal = useContext(ModalPresentationContext)
  const id = tab ?? owningTab ?? (runtime.structure.stack ? 'main' : undefined)
  const navigator = id ? runtime.stacks.get(id) : undefined
  if (nested || modal) throw new Error('Nested NavigationStack requires modal and an explicit root')
  if (!id || !navigator) throw new Error(`Undeclared primary stack: ${id ?? '(missing tab)'}`)
  if (owningTab && id !== owningTab)
    throw new Error(`Stack ${id} does not belong to tab ${owningTab}`)
  useLayoutEffect(() => {
    if (runtime.mountedStacks.has(id)) throw new Error(`Primary stack mounted twice: ${id}`)
    runtime.mountedStacks.add(id)
    return () => {
      runtime.mountedStacks.delete(id)
    }
  }, [runtime, id])
  return <StackHost navigator={navigator} adaptive={split} primary />
}
function ModalStack({ root, params }: { root: string; params?: unknown }) {
  const runtime = useAppContext()
  const instance = useId()
  const modal = useContext(ModalPresentationContext)
  if (!modal) throw new Error('A modal NavigationStack must be inside a Sheet')
  const [scene] = useState(() =>
    createSceneRestoration({
      id: `${runtime.app.id}:modal:${instance}`,
      storage: { getItem: () => null, setItem() {}, removeItem() {} },
    }),
  )
  const [navigator] = useState(() =>
    makeStack({ ...runtime, scene }, `modal:${instance}`, root, params),
  )
  useEffect(() => scene.connect(), [scene])
  return <StackHost navigator={navigator} adaptive={false} primary={false} />
}

/** The typed parameter tuple accepted by push and replace. */
export type NavigationArguments<P> = {} extends P ? [params?: P] : [params: P]
/** The actions `useNavigation` returns: `push`, `replace`, `pop`, `popToRoot` and
 * `showAcknowledgements`, typed against the routes. */
export interface Navigation<R extends Routes> {
  /** Opens the built-in credit and bundled licenses. Returns false when opted out or while a back gesture owns navigation. */
  showAcknowledgements(): boolean
  /** Pushes a destination. Returns false, pushing nothing, while the user holds a back swipe. */
  push<K extends keyof R['definitions'] & string>(
    id: K,
    ...args: NavigationArguments<RouteProps<R, K>>
  ): boolean
  /** Replaces the top entry without a transition. */
  replace<K extends keyof R['definitions'] & string>(
    id: K,
    ...args: NavigationArguments<RouteProps<R, K>>
  ): void
  pop(): void
  popToRoot(): void
}
/**
 * Returns the enclosing stack's navigation actions, typed against the registered routes. A wrong
 * route id or a missing param is a compile error.
 *
 * @example
 * const navigation = useNavigation()
 * navigation.push('note', { id: note.id })
 */
export function useNavigation<R extends Routes = RegisteredRoutes>(): Navigation<R> {
  const navigator = useNavigator()
  const { routes, app } = useAppContext()
  return useMemo(() => {
    const validate = (id: string, params: unknown) => {
      if (!Object.hasOwn(routes.definitions, id) || !routes.definitions[id]!.validate(params))
        throw new Error(`Invalid route parameters: ${id}`)
    }
    return {
      push(id: string, params?: unknown) {
        validate(id, params)
        return navigator.push(id, params)
      },
      replace(id: string, params?: unknown) {
        validate(id, params)
        navigator.replace(id, params)
      },
      showAcknowledgements() {
        if (app.acknowledgements === false) return false
        return navigator.push(ACKNOWLEDGEMENTS, undefined)
      },
      pop: () => navigator.pop(),
      popToRoot: () => navigator.popToRoot(),
    } as Navigation<R>
  }, [navigator, routes, app])
}
/** TabView's selection binding and bar behaviour; its tabs come from `defineNavigation`. */
export type TabViewProps<D = RegisteredNavigation> = {
  /** Optional Tab and TabSection composition referencing the declared navigation IDs. */
  children?: ReactNode
  selection?: TabId<D>
  onSelectionChange?: (id: TabId<D>) => void
  bottomAccessory?: ReactNode
  /** Use custom when the accessory already supplies its own material. Defaults to glass. */
  bottomAccessoryMaterial?: EngineTabViewProps['bottomAccessoryMaterial']
  tabViewStyle?: 'automatic' | 'sidebarAdaptable'
}
/** Names the declared tab to render. */
export type TabProps<D = RegisteredNavigation> = { id: TabId<D> }
/** Renders one declared tab inside a `TabView`. Its id, label and root stack come from
 * `defineNavigation`. */
export function Tab<D = RegisteredNavigation>({ id }: TabProps<D>) {
  return <DeclaredTab id={id} />
}
function DeclaredTab({ id }: { id: string }) {
  const runtime = useAppContext()
  const definition = runtime.structure.tabs?.find(tab => tab.id === id)
  if (!definition) throw new Error(`Unknown tab: ${id}`)
  const Content = definition.content
  return (
    <PrimaryTabContext value={id}>{Content ? <Content /> : <PrimaryStack />}</PrimaryTabContext>
  )
}
/**
 * Renders the tabs from `defineNavigation`. Each tab keeps its own stack, and the selected tab is
 * restored with the scene. Pass `selection` and `onSelectionChange` to control it; a controlled
 * tab press only requests the change.
 */
export function TabView<D = RegisteredNavigation>(props: TabViewProps<D>) {
  return <DeclaredTabView {...(props as EngineTabViewProps<string>)} />
}
function DeclaredTabView({
  children,
  ...props
}: Omit<EngineTabViewProps<string>, 'children'> & { children?: ReactNode }) {
  const runtime = useAppContext()
  const binding = runtime.sceneRoutes!
  if (!runtime.structure.tabs) throw new Error('TabView requires a tabs declaration')
  if (props.selection !== undefined && !runtime.stacks.has(props.selection))
    throw new Error(`Unknown tab: ${props.selection}`)
  const [selection, setSelection] = useRestoredState(
    runtime.scene,
    binding.selectionKey,
    binding.selectionSchema,
  )
  // Controlled selection wins even on the first render. Persist only accepted
  // selections; a tab press is a request, never an optimistic scene mutation.
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean | undefined>(() => {
    const saved = runtime.scene.read('tabs:sidebar-expanded')
    return typeof saved === 'boolean' ? saved : undefined
  })
  const sidebar = {
    expanded: sidebarExpanded,
    setExpanded: (expanded: boolean) => {
      setSidebarExpanded(expanded)
      runtime.scene.write('tabs:sidebar-expanded', expanded)
    },
  }
  const visibleSelection = props.selection ?? selection
  useLayoutEffect(() => {
    if (props.selection !== undefined && props.selection !== selection)
      setSelection(props.selection)
  }, [props.selection, selection, setSelection])
  const used = new Set<string>()
  function declared(id: string) {
    const tab = runtime.structure.tabs!.find(tab => tab.id === id)
    if (!tab) throw new Error(`Unknown tab: ${id}`)
    if (used.has(id)) throw new Error(`Duplicate tab id: ${id}`)
    used.add(id)
    return (
      <EngineTab
        key={tab.id}
        id={tab.id}
        label={tab.label}
        icon={tab.icon}
        symbol={tab.symbol}
        role={tab.role}
      >
        <DeclaredTab id={tab.id} />
      </EngineTab>
    )
  }
  function composeTabs(composition: ReactNode): ReactNode {
    if (composition === undefined) return runtime.structure.tabs!.map(tab => declared(tab.id))
    const result = Children.map(composition, child => {
      if (child == null) return null
      if (isValidElement<TabProps<{ tabs: { id: string }[] }>>(child) && child.type === Tab)
        return declared(child.props.id)
      if (isValidElement<TabSectionProps>(child) && child.type === TabSection)
        return (
          <TabSection {...child.props}>
            {Children.map(child.props.children, tab => {
              if (tab == null) return null
              if (!isValidElement<TabProps<{ tabs: { id: string }[] }>>(tab) || tab.type !== Tab)
                throw new Error('TabSection children must be Tab declarations')
              return declared(tab.props.id)
            })}
          </TabSection>
        )
      throw new Error('TabView children must be Tab or TabSection declarations')
    })
    if (used.size !== runtime.structure.tabs!.length)
      throw new Error('TabView composition must include every declared tab once')
    return result
  }
  return (
    <TabSidebarContext value={sidebar}>
      <EngineTabView
        {...props}
        selection={visibleSelection}
        onSelectionChange={id => {
          if (props.selection === undefined) setSelection(id)
          props.onSelectionChange?.(id)
        }}
      >
        {composeTabs(children)}
      </EngineTabView>
    </TabSidebarContext>
  )
}
