import { useSyncExternalStore } from 'react'
import { registerDefinedAppShell } from '../app/runtime.ts'
import type { AppDefinition } from '../app/definition.ts'

export interface PushSubscriptionPayload {
  endpoint: string
  p256dh: string
  auth: string
  applicationServerKey: string
}
export interface PushServerAdapter {
  upsertSubscription(input: {
    subscription: PushSubscriptionPayload
    replacesEndpoint: string | null
  }): Promise<unknown>
  removeSubscription(input: { endpoint: string; reason: string }): Promise<void>
}
export interface PushNotificationState {
  status:
    | 'loading'
    | 'unsupported'
    | 'needs-education'
    | 'ready'
    | 'requesting'
    | 'subscribed'
    | 'denied'
    | 'revoked'
    | 'rotation-needed'
  subscription: PushSubscriptionPayload | null
  error: string | null
}
function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}
function keyBytes(key: string) {
  const bytes = Uint8Array.from(atob(key.replaceAll('-', '+').replaceAll('_', '/')), c =>
    c.charCodeAt(0),
  )
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('Invalid public VAPID key')
  return bytes
}
function serialize(subscription: PushSubscription): PushSubscriptionPayload {
  const p256dh = subscription.getKey('p256dh'),
    auth = subscription.getKey('auth'),
    key = subscription.options.applicationServerKey
  if (!p256dh || !auth || !key) throw new Error('Incomplete subscription')
  return {
    endpoint: subscription.endpoint,
    p256dh: base64(p256dh),
    auth: base64(auth),
    applicationServerKey: base64(key),
  }
}
/** Create once outside React. Only enable() requests permission, synchronously from a gesture. */
export function createPushNotifications(options: {
  app: AppDefinition
  applicationServerKey: string
  server: PushServerAdapter
}) {
  const publicKey = keyBytes(options.applicationServerKey)
  const listeners = new Set<() => void>()
  let state: PushNotificationState = { status: 'loading', subscription: null, error: null }
  let manager: PushManager | undefined
  let observedSubscription: PushSubscription | null = null
  let busy = false,
    educated = false,
    serverRejected = false
  let acknowledged: PushSubscriptionPayload | null = null
  const storageKey = `satin:push:${options.app.id}`
  try {
    acknowledged = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
  } catch {
    /* Storage may be unavailable. */
  }
  const publish = (
    status: PushNotificationState['status'],
    subscription = state.subscription,
    error: string | null = null,
  ) => {
    state = { status, subscription, error }
    listeners.forEach(listener => listener())
  }
  const remember = (value: PushSubscriptionPayload | null) => {
    acknowledged = value
    try {
      if (value) localStorage.setItem(storageKey, JSON.stringify(value))
      else localStorage.removeItem(storageKey)
    } catch {
      /* Next foreground sync remains idempotent. */
    }
  }
  const handoff = async (subscription: PushSubscriptionPayload) => {
    try {
      await options.server.upsertSubscription({
        subscription,
        replacesEndpoint: acknowledged?.endpoint ?? null,
      })
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'subscription-expired'
      )
        serverRejected = true
      throw error
    }
    serverRejected = false
    remember(subscription)
    publish('subscribed', subscription)
  }
  const remove = async (reason: string) => {
    if (acknowledged)
      await options.server.removeSubscription({ endpoint: acknowledged.endpoint, reason })
    remember(null)
  }
  const reconcile = async () => {
    if (busy) return
    busy = true
    try {
      if (
        !window.isSecureContext ||
        !(
          matchMedia('(display-mode: standalone)').matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone
        ) ||
        typeof Notification === 'undefined'
      ) {
        publish('unsupported', null)
        return
      }
      // Worker-owned delivery requires the app-shell registration, even at root scope.
      manager = (await registerDefinedAppShell(options.app))?.registration.pushManager
      if (!manager) {
        publish('unsupported', null)
        return
      }
      const current = await manager.getSubscription()
      observedSubscription = current
      if (Notification.permission !== 'granted' || !current) {
        const previous = !!acknowledged
        if (previous)
          await remove(
            Notification.permission === 'granted' ? 'subscription-missing' : 'permission-revoked',
          )
        publish(
          Notification.permission === 'denied'
            ? 'denied'
            : previous
              ? 'revoked'
              : educated
                ? 'ready'
                : 'needs-education',
          null,
        )
        return
      }
      const subscription = serialize(current)
      if (subscription.applicationServerKey !== options.applicationServerKey) {
        publish('rotation-needed', subscription)
        return
      }
      // Re-upsert at declared foreground opportunities also repairs server record loss.
      await handoff(subscription)
    } catch {
      publish(
        'rotation-needed',
        state.subscription,
        'Could not sync notifications. Check your connection and try again.',
      )
    } finally {
      busy = false
    }
  }
  const enable = async () => {
    if (
      busy ||
      !manager ||
      !educated ||
      !navigator.userActivation?.isActive ||
      Notification.permission === 'denied'
    )
      return
    busy = true
    publish('requesting')
    try {
      // No await precedes this prompt. The explainer Enable button owns the gesture.
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission
      if (permission !== 'granted') {
        publish(permission === 'denied' ? 'denied' : 'ready', null)
        return
      }
      let current = observedSubscription
      if (
        current &&
        (serverRejected || serialize(current).applicationServerKey !== options.applicationServerKey)
      ) {
        if (!(await current.unsubscribe())) throw new Error('Unsubscribe failed')
        current = null
        observedSubscription = null
      }
      current ??= await manager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      })
      observedSubscription = current
      const subscription = serialize(current)
      publish('rotation-needed', subscription)
      await handoff(subscription)
    } catch {
      publish(
        'rotation-needed',
        state.subscription,
        'Could not enable notifications. Try again while online.',
      )
    } finally {
      busy = false
    }
  }
  const unsubscribe = async () => {
    if (busy || !manager) return
    busy = true
    try {
      const current = await manager.getSubscription()
      observedSubscription = current
      if (current && !(await current.unsubscribe())) throw new Error('Unsubscribe failed')
      observedSubscription = null
      await remove('user-disabled')
      publish('ready', null)
    } catch {
      publish(
        'rotation-needed',
        state.subscription,
        'Could not finish turning off notifications. Try again.',
      )
    } finally {
      busy = false
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    educate: () => {
      educated = true
      if (state.status === 'needs-education') publish('ready')
    },
    enable,
    unsubscribe,
    reconcile,
    start: () => {
      const foreground = () => {
        if (document.visibilityState === 'visible') void reconcile()
      }
      void reconcile()
      document.addEventListener('visibilitychange', foreground)
      window.addEventListener('online', foreground)
      return () => {
        document.removeEventListener('visibilitychange', foreground)
        window.removeEventListener('online', foreground)
      }
    },
  }
}
export type PushNotifications = ReturnType<typeof createPushNotifications>
export function usePushNotifications(controller: PushNotifications) {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
}
export async function setAppBadge(
  count: number | 'clear',
): Promise<'unavailable' | 'applied-visibility-unknown' | 'failed'> {
  if (count !== 'clear' && (!Number.isSafeInteger(count) || count < 0))
    throw new Error('Badge must be a non-negative integer')
  try {
    if (count === 'clear' || count === 0) {
      if (!navigator.clearAppBadge) return 'unavailable'
      await navigator.clearAppBadge()
    } else {
      if (!navigator.setAppBadge) return 'unavailable'
      await navigator.setAppBadge(count)
    }
    return 'applied-visibility-unknown'
  } catch {
    return 'failed'
  }
}
/** Obtain a user-scoped token at runtime. Never bundle the relay sender token. */
export function createPushRelayAdapter(options: {
  url: string
  token: () => string | Promise<string>
}) {
  const base = new URL(options.url)
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new Error('Use a trusted HTTPS relay URL')
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  const request = async (path: string, body: unknown) => {
    const response = await fetch(new URL(path, base), {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await options.token()}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok)
      throw Object.assign(new Error('Push relay request failed'), {
        code: response.status === 409 ? 'subscription-expired' : 'relay-unavailable',
      })
    return response.json()
  }
  return {
    upsertSubscription: (input: {
      subscription: PushSubscriptionPayload
      replacesEndpoint: string | null
    }) => request('subscriptions', input),
    removeSubscription: async (input: { endpoint: string; reason: string }) => {
      await request('unsubscribe', input)
    },
    sendTest: () => request('test', {}),
  }
}
