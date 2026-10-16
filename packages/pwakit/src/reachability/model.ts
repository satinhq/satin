/** The result of the app server reachability probe. */
export type ReachabilityStatus = 'device-offline' | 'server-unreachable' | 'reachable'
/** The server probe result, including an unknown initial state. */
export type ReachabilityStateStatus = ReachabilityStatus | 'unknown'

/** Whether a destination remains usable without the app server. */
export type ReachabilityRoutePolicy = 'local-first' | 'requires-server'
/** The framework connectivity presentation to show for a failed probe. */
export type ReachabilitySurface = 'banner' | 'full-screen' | 'none'

/** The endpoint and deadlines used to probe the app server. */
export interface ReachabilityProbeConfig {
  readonly method: 'GET' | 'HEAD'
  readonly timeoutMs: number
  readonly url: string
}

/** The server probe and presentation policy for an app that requires connectivity. */
export interface ServerReachabilityConfig {
  readonly defaultRoutePolicy: ReachabilityRoutePolicy
  readonly probe: ReachabilityProbeConfig
  readonly routes: Readonly<Record<string, ReachabilityRoutePolicy>>
  readonly surfaces: {
    readonly localFirst: Exclude<ReachabilitySurface, 'full-screen'>
    readonly requiresServer: ReachabilitySurface
  }
}

export type ReachabilityProfile =
  | { readonly connectivity: 'local' }
  | {
      readonly connectivity: 'server'
      readonly reachability: ServerReachabilityConfig
    }

export type ProbeTrigger = 'browser-online' | 'explicit-recheck' | 'initial' | 'resume'

export type ReachabilityEvent =
  | { readonly type: 'browser-offline' }
  | { readonly type: 'browser-online' }
  | {
      readonly outcome: 'aborted' | 'network-failure' | 'response'
      readonly type: 'fetch-outcome'
    }
  | {
      readonly probeId: number
      readonly result: 'reachable' | 'unreachable'
      readonly type: 'probe-result'
    }
  | { readonly navigatorOnline: boolean; readonly type: 'resume' }
  | { readonly type: 'recheck' }
  | { readonly route: string; readonly type: 'route-changed' }

export type ReachabilityCommand =
  | { readonly type: 'hide-surface' }
  | {
      readonly probe: ReachabilityProbeConfig
      readonly probeId: number
      readonly trigger: ProbeTrigger
      readonly type: 'probe'
    }
  | {
      readonly reason: Exclude<ReachabilityStatus, 'reachable'>
      readonly surface: Exclude<ReachabilitySurface, 'none'>
      readonly type: 'show-surface'
    }

/** The connectivity presentation currently shown to the user. */
export interface ReachabilityPresentation {
  readonly reason: Exclude<ReachabilityStatus, 'reachable'>
  readonly surface: Exclude<ReachabilitySurface, 'none'>
}

/** The connectivity state of an app that does not require an app server. */
export interface LocalReachabilityState {
  readonly connectivity: 'local'
  readonly status: 'local'
}

/** The last server probe, retry and connectivity presentation state. */
export interface ServerReachabilityState {
  readonly config: ServerReachabilityConfig
  readonly connectivity: 'server'
  readonly navigatorOnline: boolean
  readonly nextProbeId: number
  readonly pendingProbeId: number | undefined
  readonly presentedSurface: ReachabilityPresentation | undefined
  readonly route: string
  readonly status: ReachabilityStateStatus
}

export type ReachabilityState = LocalReachabilityState | ServerReachabilityState

export interface ReachabilityReduction {
  readonly commands: readonly ReachabilityCommand[]
  readonly state: ReachabilityState
}

function routePolicy(state: ServerReachabilityState) {
  return state.config.routes[state.route] ?? state.config.defaultRoutePolicy
}

function desiredSurface(state: ServerReachabilityState): ReachabilityPresentation | undefined {
  if (state.status === 'reachable' || state.status === 'unknown') return undefined

  const surface =
    routePolicy(state) === 'requires-server'
      ? state.config.surfaces.requiresServer
      : state.config.surfaces.localFirst

  if (surface === 'none') return undefined
  return { reason: state.status, surface }
}

function surfacesEqual(
  left: ReachabilityPresentation | undefined,
  right: ReachabilityPresentation | undefined,
) {
  return left?.reason === right?.reason && left?.surface === right?.surface
}

function settleSurface(
  previous: ServerReachabilityState | undefined,
  next: ServerReachabilityState,
) {
  const presentedSurface = desiredSurface(next)
  const state = { ...next, presentedSurface }

  if (!previous || surfacesEqual(previous.presentedSurface, presentedSurface)) {
    return { commands: [] as ReachabilityCommand[], state }
  }

  if (!presentedSurface) {
    return { commands: [{ type: 'hide-surface' } as const], state }
  }

  return {
    commands: [{ type: 'show-surface', ...presentedSurface } as const],
    state,
  }
}

function startProbe(state: ServerReachabilityState, trigger: ProbeTrigger) {
  const probeId = state.nextProbeId
  return {
    command: {
      probe: state.config.probe,
      probeId,
      trigger,
      type: 'probe',
    } as const,
    state: {
      ...state,
      nextProbeId: probeId + 1,
      pendingProbeId: probeId,
    },
  }
}

export function createReachabilityState(
  profile: ReachabilityProfile,
  input: { readonly navigatorOnline: boolean; readonly route: string },
): ReachabilityReduction {
  if (profile.connectivity === 'local') {
    return {
      commands: [],
      state: { connectivity: 'local', status: 'local' },
    }
  }

  const base: ServerReachabilityState = {
    config: profile.reachability,
    connectivity: 'server',
    navigatorOnline: input.navigatorOnline,
    nextProbeId: 1,
    pendingProbeId: undefined,
    presentedSurface: undefined,
    route: input.route,
    status: input.navigatorOnline ? 'unknown' : 'device-offline',
  }
  const settled = settleSurface(undefined, base)

  if (!input.navigatorOnline) {
    const surface = settled.state.presentedSurface
    return {
      commands: surface ? [{ type: 'show-surface', ...surface }] : [],
      state: settled.state,
    }
  }

  const probe = startProbe(settled.state, 'initial')
  return { commands: [probe.command], state: probe.state }
}

export function reduceReachability(
  state: ReachabilityState,
  event: ReachabilityEvent,
): ReachabilityReduction {
  if (state.connectivity === 'local') return { commands: [], state }

  if (event.type === 'route-changed') {
    return settleSurface(state, { ...state, route: event.route })
  }

  if (event.type === 'browser-offline') {
    return settleSurface(state, {
      ...state,
      navigatorOnline: false,
      pendingProbeId: undefined,
      status: 'device-offline',
    })
  }

  if (event.type === 'browser-online') {
    const probe = startProbe({ ...state, navigatorOnline: true }, 'browser-online')
    return { commands: [probe.command], state: probe.state }
  }

  if (event.type === 'resume') {
    if (!event.navigatorOnline) {
      return settleSurface(state, {
        ...state,
        navigatorOnline: false,
        pendingProbeId: undefined,
        status: 'device-offline',
      })
    }

    const probe = startProbe({ ...state, navigatorOnline: true }, 'resume')
    return { commands: [probe.command], state: probe.state }
  }

  if (event.type === 'recheck') {
    if (!state.navigatorOnline) return { commands: [], state }
    const probe = startProbe(state, 'explicit-recheck')
    return { commands: [probe.command], state: probe.state }
  }

  if (event.type === 'fetch-outcome') {
    if (event.outcome === 'aborted' || !state.navigatorOnline) return { commands: [], state }

    return settleSurface(state, {
      ...state,
      pendingProbeId: undefined,
      status:
        event.outcome === 'response'
          ? 'reachable'
          : state.navigatorOnline
            ? 'server-unreachable'
            : 'device-offline',
    })
  }

  if (event.probeId !== state.pendingProbeId) return { commands: [], state }

  return settleSurface(state, {
    ...state,
    pendingProbeId: undefined,
    status: event.result === 'reachable' ? 'reachable' : 'server-unreachable',
  })
}
