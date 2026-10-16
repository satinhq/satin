import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react'
import type { Context } from 'react'
import type { ScreenRegistry } from './registry.ts'
import type { NavigatorActions, NavigatorStore, RegistryScreenEntry } from './store.ts'
import type { NavigatorState, ScreenLifecycle, ScreenLifecycleCallbacks } from './types.ts'
import { createScrollSurfaceRegistry, type ScrollSurfaceRegistry } from '../scroll/registry.ts'

type ScreenContextValue = Readonly<{
  key: string
  lifecycle: ScreenLifecycle
  params: unknown
  scrollRegistry: ScrollSurfaceRegistry
}>

export const NavigationPaneContext = createContext<'stack' | 'sidebar' | 'detail'>('stack')

const EMPTY_LIFECYCLE_CALLBACKS: ScreenLifecycleCallbacks = Object.freeze({})

export const NavigatorContext: Context<NavigatorStore | undefined> = createContext<
  NavigatorStore | undefined
>(undefined)
export const ScreenContext: Context<ScreenContextValue | undefined> = createContext<
  ScreenContextValue | undefined
>(undefined)

// Framework-owned system presentations can scroll without joining an app screen's
// registry or its restoration snapshot. Bare app content owns a local registry.
export const SystemScrollRegistryContext = createContext<ScrollSurfaceRegistry | undefined>(
  undefined,
)

export function useNavigator<
  Registry extends ScreenRegistry = ScreenRegistry,
>(): NavigatorActions<Registry> {
  const navigator = useContext(NavigatorContext)
  if (!navigator) {
    throw new Error('useNavigator must be called inside NavigatorHost.')
  }

  return navigator as NavigatorStore<Registry>
}

export function useNavigatorState<
  Registry extends ScreenRegistry = ScreenRegistry,
>(): NavigatorState<RegistryScreenEntry<Registry>> {
  const navigator = useContext(NavigatorContext)
  if (!navigator) {
    throw new Error('useNavigatorState must be called inside NavigatorHost.')
  }

  return useSyncExternalStore(
    navigator.subscribe,
    navigator.getState,
    navigator.getState,
  ) as NavigatorState<RegistryScreenEntry<Registry>>
}

export function useParams<Params = unknown>(): Params {
  const screen = useContext(ScreenContext)
  if (!screen) {
    throw new Error('useParams must be called inside a NavigatorHost screen.')
  }

  return screen.params as Params
}

export function useScreenScrollRegistry(): ScrollSurfaceRegistry {
  const systemRegistry = useContext(SystemScrollRegistryContext)
  const screen = useContext(ScreenContext)
  const standalone = useRef<ScrollSurfaceRegistry | null>(null)
  if (systemRegistry) return systemRegistry
  if (screen) return screen.scrollRegistry
  // Onboarding and bare presentation content own their scroll state for this mount.
  // They never join a navigation entry's restoration snapshot.
  if (!standalone.current) {
    standalone.current = createScrollSurfaceRegistry()
    standalone.current.setUncovered(true)
  }
  return standalone.current
}

/** `onAppear` and `onDisappear`: callbacks for a retained navigation entry's visible lifecycle. */
export function useScreenLifecycle(
  callbacks: ScreenLifecycleCallbacks = EMPTY_LIFECYCLE_CALLBACKS,
): ScreenLifecycle {
  const screen = useContext(ScreenContext)
  if (!screen) {
    throw new Error('useScreenLifecycle must be called inside a NavigatorHost screen.')
  }

  const callbacksRef = useRef(callbacks)
  const isAppeared = !screen.lifecycle.isCovered

  useEffect(() => {
    callbacksRef.current = callbacks
  }, [callbacks])

  useEffect(() => {
    if (!isAppeared) return

    callbacksRef.current.appear?.()
    return () => callbacksRef.current.disappear?.()
  }, [isAppeared])

  return screen.lifecycle
}
