import { hasActivePresentation, subscribePresentationActivity } from '../presentation/activity.ts'
import { decodePushRoute, type PushRoute, type PushRouteRules } from './routes.ts'
/** One ordered queue for direct URLs and worker deliveries. Rejected navigation
 * stays pending until navigation or presentation ownership changes. */
export function createRouteIntentQueue(subscribeNavigation: (listener: () => void) => () => void) {
  const pending = new Map<string, () => boolean>()
  let draining = false,
    queued = false,
    connections = 0
  const drain = () => {
    if (draining || hasActivePresentation()) return
    draining = true
    try {
      for (const [id, activate] of pending) {
        if (!activate()) break
        pending.delete(id)
      }
    } finally {
      draining = false
    }
  }
  const changed = () => {
    if (!queued) {
      queued = true
      queueMicrotask(() => {
        queued = false
        if (connections) drain()
      })
    }
  }
  return {
    enqueue(id: string, activate: () => boolean) {
      pending.set(id, activate)
      drain()
    },
    drain,
    connect() {
      connections++
      let active = true
      const notify = () => {
        if (active) changed()
      }
      const stopNavigation = subscribeNavigation(notify)
      const stopPresentation = subscribePresentationActivity(notify)
      drain()
      return () => {
        if (!active) return
        active = false
        connections--
        stopNavigation()
        stopPresentation()
      }
    },
  }
}

/** Pending taps are acknowledged after acceptance and the optional durability gate. */
export function connectPushRoutes<
  Params extends Record<string, string | number | boolean> = Record<string, string>,
>(options: {
  scope: string
  queue?: ReturnType<typeof createRouteIntentQueue>
  hasAccepted?: (id: string) => boolean
  didAccept?: (id: string) => void
  /** A restoring scene keeps the worker inbox until its destination is durable. */
  canAcknowledge?: (id: string) => boolean
  routes: PushRouteRules
  navigate: (route: PushRoute<Params>) => boolean
  subscribeNavigation: (listener: () => void) => () => void
}) {
  const scope = new URL(options.scope, location.origin).href
  const seen = new Set<string>()
  const queue = options.queue ?? createRouteIntentQueue(options.subscribeNavigation)
  let worker = navigator.serviceWorker?.controller,
    disposed = false
  const ack = (id: string, result: 'accepted' | 'rejected') => {
    try {
      worker?.postMessage({ type: 'SATIN_PUSH_ACK', id, result })
    } catch {
      /* Retry after reconnect; do not consume the worker inbox. */
    }
  }
  const awaitingPersistence = new Set<string>()
  const acknowledgeReady = () => {
    for (const id of awaitingPersistence) {
      if (options.canAcknowledge && !options.canAcknowledge(id)) continue
      if (decodePushRoute(location.href, scope, options.routes)?.id === id) {
        const clean = new URL(location.href)
        clean.searchParams.delete('satin-push')
        clean.searchParams.delete('satin-delivery')
        window.history.replaceState(window.history.state, '', clean.href)
      }
      ack(id, 'accepted')
      awaitingPersistence.delete(id)
    }
  }
  const accept = (url: string, messageId?: string) => {
    const decoded = decodePushRoute(url, scope, options.routes)
    if (!decoded || (messageId !== undefined && decoded.id !== messageId)) {
      if (messageId) {
        // Do not log the URL or params: notification routes can contain private data.
        console.warn(
          '[Satin push] Rejected delivery: route scope, version, schema or delivery ID did not match.',
        )
        ack(messageId, 'rejected')
      }
      return
    }
    queue.enqueue(`push:${decoded.id}`, () => {
      if (disposed) return true
      if (!seen.has(decoded.id) && !options.hasAccepted?.(decoded.id)) {
        if (!options.navigate(decoded.route as PushRoute<Params>)) return false
        seen.add(decoded.id)
        options.didAccept?.(decoded.id)
      }
      awaitingPersistence.add(decoded.id)
      acknowledgeReady()
      return true
    })
  }
  const claim = () => {
    try {
      if (!disposed) worker?.postMessage({ type: 'SATIN_PUSH_CLAIM' })
    } catch {
      /* Resume/controllerchange retries. */
    }
  }
  const resume = () => {
    accept(location.href)
    queue.drain()
    acknowledgeReady()
    claim()
  }
  const message = (event: MessageEvent) => {
    if (!worker || event.source !== worker) return
    if (event.data?.type === 'SATIN_PUSH_PENDING') claim()
    if (
      event.data?.type === 'SATIN_PUSH_ROUTE' &&
      typeof event.data.url === 'string' &&
      typeof event.data.id === 'string'
    )
      accept(event.data.url, event.data.id)
  }
  const controllerChanged = () => {
    worker = navigator.serviceWorker?.controller
    resume()
  }
  // Durability must not hold the navigation queue hostage when storage fails.
  let persistenceQueued = false
  const unsubscribePersistence = options.canAcknowledge
    ? options.subscribeNavigation(() => {
        if (persistenceQueued) return
        persistenceQueued = true
        queueMicrotask(() => {
          persistenceQueued = false
          if (!disposed) acknowledgeReady()
        })
      })
    : () => {}
  const unsubscribe = queue.connect()
  navigator.serviceWorker?.addEventListener('message', message)
  navigator.serviceWorker?.addEventListener('controllerchange', controllerChanged)
  window.addEventListener('pageshow', resume)
  document.addEventListener('visibilitychange', resume)
  resume()
  // An existing uncontrolled document must claim from the same scoped registration too.
  void navigator.serviceWorker
    ?.getRegistration?.(scope)
    .then(registration => {
      if (!disposed && !worker && registration?.scope === scope && registration.active) {
        worker = registration.active
        resume()
      }
    })
    .catch(() => {})
  return () => {
    disposed = true
    unsubscribe()
    unsubscribePersistence()
    navigator.serviceWorker?.removeEventListener('message', message)
    navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged)
    window.removeEventListener('pageshow', resume)
    document.removeEventListener('visibilitychange', resume)
  }
}

/** Consume a launch/shortcut intent after the navigator accepts it. */
export function consumeSceneLaunchURL(input: string) {
  if (typeof location === 'undefined' || location.href !== input) return
  const clean = new URL(input)
  clean.searchParams.delete('satin-route')
  clean.searchParams.delete('satin-tab')
  window.history.replaceState(window.history.state, '', clean.href)
}

/** Remove authorization response parameters only after the callback is durable. */
export function consumeWebAuthenticationURL(input: string) {
  if (typeof location === 'undefined' || location.href !== input) return
  const clean = new URL(input)
  for (const name of [
    'code',
    'state',
    'error',
    'error_description',
    'error_uri',
    'session_state',
    'iss',
  ])
    clean.searchParams.delete(name)
  window.history.replaceState(window.history.state, '', clean.href)
}
