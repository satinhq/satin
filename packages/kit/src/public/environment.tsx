import type { JustUpdated } from '../app/coldLaunchUpdate.ts'
import type { GlassError } from '../glass/errors.ts'
import { PresentationLayoutClassContext } from '../layout/navigationLayoutContext.ts'
import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useSatinLayoutRuntime } from '../root/runtimeContext.ts'
import {
  edgeInsetsEqual,
  useSafeAreaSelector,
  type SafeAreaMetrics,
} from '../safe-area/useSafeAreaMetrics.ts'
import { getGlassErrors, subscribeGlassErrors } from '../glass/errors.ts'
import { useSceneStorage as useEntryStorage } from '../restoration/react.ts'
import { isSerializableState, type StateSchema } from '../restoration/scene.ts'
import { useAppContext } from './context.ts'
import { setAppBadge, type PushNotificationState } from '../push/notifications.ts'
import { PushPermissionExplainer } from '../push/PushPermissionExplainer.tsx'

/**
 * Reports whether this launch applied an app update: `justUpdated` holds the previous and current
 * build ids after an update, null otherwise (and until launch settles). Release updates apply
 * at launch, before first input after foregrounding, or at a clean suspension.
 */
export function useAppUpdate(): Readonly<{ justUpdated: JustUpdated | null }> {
  const { justUpdated, launchReady } = useSatinLayoutRuntime()
  return { justUpdated: launchReady ? justUpdated : null }
}
/** `horizontalSizeClass`: a presentation's own class inside it, else the window's. */
export function useHorizontalSizeClass(): UserInterfaceSizeClass {
  const presentation = useContext(PresentationLayoutClassContext)
  const runtime = useSatinLayoutRuntime().layoutClass
  return (presentation ?? runtime).horizontal
}
/** `verticalSizeClass`: a presentation's own class inside it, else the window's. */
export function useVerticalSizeClass(): UserInterfaceSizeClass {
  const presentation = useContext(PresentationLayoutClassContext)
  const runtime = useSatinLayoutRuntime().layoutClass
  return (presentation ?? runtime).vertical
}
const selectInsets = (metrics: SafeAreaMetrics) => metrics.insets
/** The live safe-area insets in CSS pixels. Use them instead of `env(safe-area-inset-*)`. */
export function useSafeAreaInsets(): EdgeInsets {
  const { top, left, bottom, right } = useSafeAreaSelector(selectInsets, edgeInsetsEqual)
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
  return { top, leading: rtl ? right : left, bottom, trailing: rtl ? left : right }
}
const sceneSnapshot = (): ScenePhase =>
  document.visibilityState === 'hidden' ? 'background' : document.hasFocus() ? 'active' : 'inactive'
function subscribeScene(listener: () => void) {
  document.addEventListener('visibilitychange', listener)
  window.addEventListener('focus', listener)
  window.addEventListener('blur', listener)
  return () => {
    document.removeEventListener('visibilitychange', listener)
    window.removeEventListener('focus', listener)
    window.removeEventListener('blur', listener)
  }
}
/** `scenePhase`: `active` in the foreground with focus, `inactive` without focus,
 * `background` when hidden. */
export function useScenePhase(): ScenePhase {
  return useSyncExternalStore(subscribeScene, sceneSnapshot, () => 'inactive' as const)
}
/** `colorScheme`: the appearance Satin is currently drawing, `light` or `dark`. */
export function useColorScheme(): ColorScheme {
  const store = window.__SATIN_APPEARANCE__
  if (!store) throw new Error('useColorScheme requires the Satin appearance runtime')
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).dark
    ? 'dark'
    : 'light'
}
/** Every glass renderer error so far, re-rendering when one is added. For diagnostics screens;
 * `runApp`'s `onGlassError` is the way to report them. */
export function useGlassErrors(): readonly GlassError[] {
  const [errors, setErrors] = useState(getGlassErrors)
  useEffect(() => subscribeGlassErrors(() => setErrors(getGlassErrors())), [])
  return errors
}
function schema<T>(initial: T): StateSchema<T> {
  return {
    version: 1,
    initial,
    validate: (value): value is T => isSerializableState(value),
  }
}
/**
 * `@SceneStorage`: state kept with the current navigation entry in the scene checkpoint,
 * so a draft survives a relaunch. Each pushed entry owns its own value. Values must be
 * JSON-serializable. Keep saved records in a collection, not here.
 *
 * @example
 * const [draft, setDraft] = useSceneStorage('draft', '')
 */
export function useSceneStorage<T>(key: string, initial: T) {
  const [contract] = useState(() => schema(initial))
  return useEntryStorage(key, contract)
}
const preferenceListeners = new Set<() => void>()
/**
 * `@AppStorage`: a small JSON-serializable preference, kept across launches and shared by
 * every component that reads the same key.
 *
 * @example
 * const [units, setUnits] = useAppStorage('units', 'kg')
 */
export function useAppStorage<T>(
  key: string,
  initial: T,
): readonly [T, (next: SetStateAction<T>) => void] {
  const { app } = useAppContext(),
    storageKey = `satin-preference:${app.id}:${key}`
  const [contract] = useState(() => schema(initial))
  const read = useCallback(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      const value: unknown = raw === null ? contract.initial : JSON.parse(raw)
      return contract.validate(value) ? value : contract.initial
    } catch {
      return contract.initial
    }
  }, [storageKey, contract])
  const [value, setValue] = useState(read)
  useEffect(() => {
    const update = () => setValue(read())
    update()
    preferenceListeners.add(update)
    window.addEventListener('storage', update)
    return () => {
      preferenceListeners.delete(update)
      window.removeEventListener('storage', update)
    }
  }, [read])
  const set = useCallback(
    (next: SetStateAction<T>) => {
      const value = typeof next === 'function' ? (next as (value: T) => T)(read()) : next
      if (!contract.validate(value)) throw new Error('App storage requires serializable values')
      localStorage.setItem(storageKey, JSON.stringify(value))
      preferenceListeners.forEach(fn => fn())
    },
    [read, contract, storageKey],
  )
  return [value, set]
}
const unsupported: PushNotificationState = {
  status: 'unsupported',
  subscription: null,
  error: null,
}
const noop = () => () => {}
const fallback = () => unsupported
/**
 * The app's notification permission and badge. Call `requestAuthorization` from a user gesture,
 * after explaining why (see `NotificationPermissionExplainer`). Without `runApp`'s
 * `notifications` option the status is `unsupported`.
 */
export function useNotifications() {
  const { notifications } = useAppContext()
  const state = useSyncExternalStore(
    notifications?.subscribe ?? noop,
    notifications?.getSnapshot ?? fallback,
    fallback,
  )
  return {
    status: notificationAuthorization(state),
    error: state.error,
    requestAuthorization: () => {
      notifications?.educate()
      return notifications?.enable() ?? Promise.resolve()
    },
    setBadge: async (value: Parameters<typeof setAppBadge>[0]): Promise<boolean> =>
      (await setAppBadge(value)) === 'applied-visibility-unknown',
  }
}
/** Notification permission, independent of subscription setup and token rotation. */
export type NotificationAuthorizationStatus =
  'unsupported' | 'notDetermined' | 'denied' | 'authorized'
function notificationAuthorization(state: PushNotificationState): NotificationAuthorizationStatus {
  if (state.status === 'unsupported' || typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'authorized'
  if (Notification.permission === 'denied') return 'denied'
  return 'notDetermined'
}
/** The notification permission explanation's title and app-authored content. */
export type NotificationPermissionExplainerProps = { title?: string; children: ReactNode }
/** Explains what notifications are for before the user asks for them; its button requests
 * authorization from that gesture. */
export function NotificationPermissionExplainer({
  title,
  children,
}: NotificationPermissionExplainerProps) {
  const { notifications } = useAppContext()
  return notifications ? (
    <PushPermissionExplainer controller={notifications} title={title}>
      {children}
    </PushPermissionExplainer>
  ) : (
    <p role="status">Notifications are not configured.</p>
  )
}

/** `EdgeInsets`: logical safe-area padding in points. */
export type EdgeInsets = Readonly<{
  top: number
  leading: number
  bottom: number
  trailing: number
}>
/** `UserInterfaceSizeClass`: the available size along one axis. */
export type UserInterfaceSizeClass = 'compact' | 'regular'
/** `ScenePhase`: the foreground, focus and suspension state. */
export type ScenePhase = 'active' | 'inactive' | 'background'
/** `ColorScheme`: the appearance currently drawn by the scene. */
export type ColorScheme = 'light' | 'dark'
