import { describe, expect, it } from 'vitest'
import {
  createReachabilityState,
  reduceReachability,
  type ReachabilityProfile,
  type ServerReachabilityState,
} from './model.ts'

const serverProfile: ReachabilityProfile = {
  connectivity: 'server',
  reachability: {
    defaultRoutePolicy: 'requires-server',
    probe: { method: 'HEAD', timeoutMs: 4_000, url: '/health' },
    routes: {
      journal: 'local-first',
      settings: 'local-first',
    },
    surfaces: {
      localFirst: 'banner',
      requiresServer: 'full-screen',
    },
  },
}

function serverState(reduction: ReturnType<typeof createReachabilityState>) {
  expect(reduction.state.connectivity).toBe('server')
  return reduction.state as ServerReachabilityState
}

describe('pure reachability model', () => {
  it('starts an online server profile with one foreground probe', () => {
    const initial = createReachabilityState(serverProfile, {
      navigatorOnline: true,
      route: 'home',
    })

    expect(serverState(initial)).toMatchObject({
      nextProbeId: 2,
      pendingProbeId: 1,
      status: 'unknown',
    })
    expect(initial.commands).toEqual([
      {
        probe: serverProfile.reachability.probe,
        probeId: 1,
        trigger: 'initial',
        type: 'probe',
      },
    ])
  })

  it('distinguishes browser-offline from an unreachable app server', () => {
    const initial = createReachabilityState(serverProfile, {
      navigatorOnline: false,
      route: 'home',
    })
    expect(serverState(initial).status).toBe('device-offline')
    expect(initial.commands).toEqual([
      {
        reason: 'device-offline',
        surface: 'full-screen',
        type: 'show-surface',
      },
    ])

    const online = reduceReachability(initial.state, { type: 'browser-online' })
    const failed = reduceReachability(online.state, {
      outcome: 'network-failure',
      type: 'fetch-outcome',
    })

    expect(serverState(failed).status).toBe('server-unreachable')
    expect(failed.commands).toEqual([
      {
        reason: 'server-unreachable',
        surface: 'full-screen',
        type: 'show-surface',
      },
    ])
  })

  it('preserves device-offline precedence over response and abort observations', () => {
    const initial = createReachabilityState(serverProfile, {
      navigatorOnline: false,
      route: 'home',
    })
    const aborted = reduceReachability(initial.state, {
      outcome: 'aborted',
      type: 'fetch-outcome',
    })
    expect(aborted.state).toBe(initial.state)

    const reached = reduceReachability(aborted.state, {
      outcome: 'response',
      type: 'fetch-outcome',
    })
    expect(serverState(reached).status).toBe('device-offline')
    expect(reached.commands).toEqual([])
  })

  it('uses route policy to choose blocking and nonblocking surfaces', () => {
    const initial = createReachabilityState(serverProfile, {
      navigatorOnline: false,
      route: 'home',
    })
    const journal = reduceReachability(initial.state, {
      route: 'journal',
      type: 'route-changed',
    })

    expect(journal.commands).toEqual([
      {
        reason: 'device-offline',
        surface: 'banner',
        type: 'show-surface',
      },
    ])
  })

  it('rechecks on resume without adding a polling loop', () => {
    const initial = createReachabilityState(serverProfile, {
      navigatorOnline: true,
      route: 'home',
    })
    const resumed = reduceReachability(initial.state, {
      navigatorOnline: true,
      type: 'resume',
    })

    expect(serverState(resumed)).toMatchObject({
      nextProbeId: 3,
      pendingProbeId: 2,
    })
    expect(resumed.commands).toEqual([
      expect.objectContaining({ probeId: 2, trigger: 'resume', type: 'probe' }),
    ])
  })

  it('settles the startup probe before claiming server reachability', () => {
    const initial = createReachabilityState(serverProfile, {
      navigatorOnline: true,
      route: 'home',
    })
    expect(serverState(initial).status).toBe('unknown')

    const reached = reduceReachability(initial.state, {
      probeId: 1,
      result: 'reachable',
      type: 'probe-result',
    })
    expect(serverState(reached)).toMatchObject({
      pendingProbeId: undefined,
      status: 'reachable',
    })
    expect(reached.commands).toEqual([])
  })

  it('rejects stale probe results across a flapping network', () => {
    const initial = createReachabilityState(serverProfile, {
      navigatorOnline: true,
      route: 'home',
    })
    const offline = reduceReachability(initial.state, { type: 'browser-offline' })
    const online = reduceReachability(offline.state, { type: 'browser-online' })

    expect(serverState(online).pendingProbeId).toBe(2)

    const stale = reduceReachability(online.state, {
      probeId: 1,
      result: 'reachable',
      type: 'probe-result',
    })
    expect(stale.state).toBe(online.state)
    expect(stale.commands).toEqual([])

    const current = reduceReachability(stale.state, {
      probeId: 2,
      result: 'unreachable',
      type: 'probe-result',
    })
    expect(serverState(current)).toMatchObject({
      pendingProbeId: undefined,
      status: 'server-unreachable',
    })

    const fetchWins = reduceReachability(current.state, {
      outcome: 'response',
      type: 'fetch-outcome',
    })
    const late = reduceReachability(fetchWins.state, {
      probeId: 2,
      result: 'unreachable',
      type: 'probe-result',
    })
    expect(late.state).toBe(fetchWins.state)
    expect(serverState(late).status).toBe('reachable')
  })

  it('short-circuits every event for a fully local app', () => {
    const initial = createReachabilityState(
      { connectivity: 'local' },
      { navigatorOnline: false, route: 'home' },
    )
    const events = [
      { type: 'browser-online' } as const,
      { outcome: 'network-failure', type: 'fetch-outcome' } as const,
      { navigatorOnline: true, type: 'resume' } as const,
      { type: 'recheck' } as const,
      { route: 'settings', type: 'route-changed' } as const,
    ]

    let state = initial.state
    for (const event of events) {
      const reduction = reduceReachability(state, event)
      expect(reduction.commands).toEqual([])
      expect(reduction.state).toBe(state)
      state = reduction.state
    }
  })
})
