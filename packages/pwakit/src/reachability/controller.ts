import {
  createReachabilityState,
  reduceReachability,
  type ReachabilityEvent,
  type ReachabilityProfile,
  type ReachabilityReduction,
} from './model.ts'

export interface ReachabilityEnvironment {
  online(): boolean
  fetch: typeof fetch
  listen(event: 'online' | 'offline' | 'resume', callback: () => void): () => void
  observeImageFailures?(callback: (source: string) => void): () => void
  retryImages?(serverOrigin: string): void
}

export const browserReachabilityEnvironment: ReachabilityEnvironment = {
  online: () => navigator.onLine,
  fetch: (...args) => fetch(...args),
  retryImages(serverOrigin) {
    for (const image of document.images) {
      if (image.dataset.satinImageSource || !image.complete || image.naturalWidth !== 0) continue
      const source = image.currentSrc || image.src
      if (source && new URL(source, location.href).origin === serverOrigin) image.src = source
    }
  },
  observeImageFailures(callback) {
    const failed = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement)) return
      const image = event.target
      callback(image.dataset.satinImageSource || image.currentSrc || image.src)
    }
    document.addEventListener('error', failed, true)
    return () => document.removeEventListener('error', failed, true)
  },
  listen(event, callback) {
    if (event === 'resume') {
      const resume = () => {
        if (document.visibilityState === 'visible') callback()
      }
      document.addEventListener('visibilitychange', resume)
      return () => document.removeEventListener('visibilitychange', resume)
    }
    window.addEventListener(event, callback)
    return () => window.removeEventListener(event, callback)
  },
}

/** Effect-owned adapter: construction is inert, start/dispose own all browser work. */
export function createReachabilityController(
  profile: ReachabilityProfile,
  route: string,
  env: ReachabilityEnvironment,
) {
  let reduction = createReachabilityState(profile, {
    navigatorOnline: profile.connectivity === 'local' ? true : env.online(),
    route,
  })
  let state = reduction.state
  let active = false
  let observationEpoch = 0
  let cancelProbe: (() => void) | undefined
  let cleanups: (() => void)[] = []
  const listeners = new Set<() => void>()
  const notify = (previous: typeof state) => {
    for (const listener of listeners) listener()
    const material =
      previous.connectivity === 'server' &&
      state.connectivity === 'server' &&
      (previous.status === 'device-offline' || previous.status === 'server-unreachable') &&
      state.status === 'reachable'
    if (material && profile.connectivity === 'server') {
      const base = typeof location === 'undefined' ? 'http://satin.local/' : location.href
      env.retryImages?.(new URL(profile.reachability.probe.url, base).origin)
    }
  }
  const apply = (next: ReachabilityReduction) => {
    const previous = state
    reduction = next
    state = next.state
    if (!active) return
    cancelProbe?.()
    cancelProbe = undefined
    for (const command of next.commands) {
      if (command.type !== 'probe') continue
      const controller = new AbortController()
      let cancelled = false
      const timeout = setTimeout(() => controller.abort(), command.probe.timeoutMs)
      cancelProbe = () => {
        cancelled = true
        clearTimeout(timeout)
        controller.abort()
      }
      void env
        .fetch(command.probe.url, {
          method: command.probe.method,
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        })
        .then(
          () => 'reachable' as const,
          () => 'unreachable' as const,
        )
        .then(result => {
          clearTimeout(timeout)
          if (!cancelled && active)
            dispatch({ type: 'probe-result', probeId: command.probeId, result })
        })
    }
    notify(previous)
  }
  const dispatch = (event: ReachabilityEvent) => {
    if (
      event.type === 'browser-offline' ||
      event.type === 'browser-online' ||
      event.type === 'resume'
    )
      observationEpoch++
    const next = reduceReachability(state, event)
    // Route changes and ignored stale/aborted outcomes must not cancel an in-flight probe.
    if (
      state.connectivity === 'server' &&
      next.state.connectivity === 'server' &&
      next.state.pendingProbeId === state.pendingProbeId &&
      !next.commands.some(c => c.type === 'probe')
    ) {
      const previous = state
      state = next.state
      notify(previous)
      return
    }
    apply(next)
  }
  const serverRequest = (input: RequestInfo | URL) => {
    if (profile.connectivity !== 'server') return false
    const base = typeof location === 'undefined' ? 'http://satin.local/' : location.href
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, base)
    return url.origin === new URL(profile.reachability.probe.url, base).origin
  }
  const serverFetch: typeof fetch = async (input, init) => {
    const reportsOutcome = serverRequest(input)
    const epoch = observationEpoch
    const signal =
      init?.signal !== undefined
        ? init.signal
        : typeof input === 'object' && 'signal' in input
          ? input.signal
          : undefined
    const canReport = () => active && epoch === observationEpoch && reportsOutcome
    try {
      const response = await env.fetch(input, init)
      if (
        canReport() &&
        state.connectivity === 'server' &&
        state.navigatorOnline &&
        state.status !== 'reachable' &&
        state.pendingProbeId === undefined
      ) {
        // Fetch preserves the caller's caching policy. A response proves data
        // availability, not transport recovery; only the uncached probe does that.
        dispatch({ type: 'recheck' })
      }
      return response
    } catch (error) {
      if (canReport())
        dispatch({
          type: 'fetch-outcome',
          outcome:
            signal?.aborted || (error instanceof Error && error.name === 'AbortError')
              ? 'aborted'
              : 'network-failure',
        })
      throw error
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setRoute: (nextRoute: string) => dispatch({ type: 'route-changed', route: nextRoute }),
    recheck: () => dispatch({ type: 'recheck' }),
    fetch: serverFetch,
    /** Report only app-server transport outcomes, never JSON or application errors. */
    reportFetchOutcome: (outcome: 'response' | 'network-failure' | 'aborted') =>
      dispatch({ type: 'fetch-outcome', outcome }),
    start() {
      if (active || profile.connectivity === 'local') return
      active = true
      observationEpoch++
      apply(
        createReachabilityState(profile, {
          navigatorOnline: env.online(),
          route: state.connectivity === 'server' ? state.route : route,
        }),
      )
      cleanups = [
        env.listen('online', () => dispatch({ type: 'browser-online' })),
        env.listen('offline', () => dispatch({ type: 'browser-offline' })),
        env.listen('resume', () => dispatch({ type: 'resume', navigatorOnline: env.online() })),
      ]
      if (env.observeImageFailures)
        cleanups.push(
          env.observeImageFailures(source => {
            // An img error cannot distinguish a 404/corrupt image from transport
            // loss. Confirm with the declared probe, and coalesce an error burst.
            if (
              state.connectivity !== 'server' ||
              !serverRequest(source) ||
              state.pendingProbeId !== undefined ||
              (state.status !== 'reachable' && state.status !== 'unknown')
            )
              return
            dispatch({ type: 'recheck' })
          }),
        )
    },
    dispose() {
      active = false
      observationEpoch++
      cancelProbe?.()
      cancelProbe = undefined
      cleanups.forEach(fn => fn())
      cleanups = []
    },
  }
}
