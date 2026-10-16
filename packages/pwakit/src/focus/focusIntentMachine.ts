export type FocusReadiness = 'lazy' | 'ready'

export type FocusScopeDefinition = Readonly<{
  initialTarget: string
  key: string
  readiness: FocusReadiness
  title: string
}>

export type FocusLocation = Readonly<{
  scopeKey: string
  target: string
}>

export type FocusReason = 'dismiss' | 'error' | 'pop' | 'present' | 'push' | 'transition-cancel'

export type FocusCommand =
  | Readonly<{
      location: FocusLocation
      type: 'capture'
    }>
  | Readonly<{
      fallback: FocusLocation
      location: FocusLocation
      reason: FocusReason
      type: 'restore'
    }>
  | Readonly<{
      location: FocusLocation
      reason: FocusReason
      type: 'move-to'
    }>
  | Readonly<{
      message: string
      politeness: 'assertive'
      scopeKey: string
      type: 'announce'
    }>

type FocusScopeState = FocusScopeDefinition &
  Readonly<{
    failed: boolean
    focusTarget: string
    ready: boolean
  }>

export type FocusRouteState = FocusScopeState &
  Readonly<{
    phase: 'entering' | 'exiting' | 'settled'
    transitionId?: string
  }>

export type FocusPresentationState = FocusScopeState

export type FocusTransitionState = Readonly<{
  id: string
  kind: 'pop' | 'push'
}>

type PendingFocusIntent = Readonly<{
  kind: 'initial' | 'restore'
  reason: FocusReason
  scopeKey: string
}>

export type FocusIntentState = Readonly<{
  pending?: PendingFocusIntent
  presentations: readonly FocusPresentationState[]
  routes: readonly FocusRouteState[]
  snapshots: ReadonlyMap<string, string>
  transitions: readonly FocusTransitionState[]
}>

export type FocusIntentEvent =
  | Readonly<{
      activeFocus?: FocusLocation
      fromKey: string
      to: FocusScopeDefinition
      transitionId: string
      type: 'push-begin'
    }>
  | Readonly<{
      outcome: 'cancelled' | 'completed'
      transitionId: string
      type: 'push-settle'
    }>
  | Readonly<{
      activeFocus?: FocusLocation
      toKey: string
      transitionId: string
      type: 'pop-begin'
    }>
  | Readonly<{
      outcome: 'cancelled' | 'completed'
      transitionId: string
      type: 'pop-settle'
    }>
  | Readonly<{
      activeFocus?: FocusLocation
      presentation: FocusScopeDefinition
      type: 'present'
    }>
  | Readonly<{
      presentationKey: string
      type: 'dismiss'
    }>
  | Readonly<{
      scopeKey: string
      target?: string
      type: 'lazy-ready'
    }>
  | Readonly<{
      kind: 'screen'
      message: string
      scopeKey: string
      target: string
      type: 'error'
    }>
  | Readonly<{
      kind: 'status'
      message: string
      scopeKey: string
      type: 'error'
    }>

export type FocusIntentResult = Readonly<{
  commands: readonly FocusCommand[]
  state: FocusIntentState
}>

function assertIdentifier(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Focus intent ${label} must not be empty.`)
  }
}

function assertScopeDefinition(scope: FocusScopeDefinition) {
  assertIdentifier(scope.key, 'scope key')
  assertIdentifier(scope.initialTarget, `initial target for "${scope.key}"`)
  assertIdentifier(scope.title, `title for "${scope.key}"`)
}

function createScopeState(scope: FocusScopeDefinition): FocusScopeState {
  assertScopeDefinition(scope)
  return {
    ...scope,
    failed: false,
    focusTarget: scope.initialTarget,
    ready: scope.readiness === 'ready',
  }
}

function scopeLocation(scope: FocusScopeState): FocusLocation {
  return { scopeKey: scope.key, target: scope.focusTarget }
}

function initialLocation(scope: FocusScopeState): FocusLocation {
  return { scopeKey: scope.key, target: scope.initialTarget }
}

function findScope(
  state: FocusIntentState,
  scopeKey: string,
): FocusPresentationState | FocusRouteState | undefined {
  return (
    state.presentations.find(scope => scope.key === scopeKey) ??
    state.routes.find(scope => scope.key === scopeKey)
  )
}

function assertUniqueScopeKey(state: FocusIntentState, scopeKey: string) {
  if (findScope(state, scopeKey)) {
    throw new Error(`Focus intent scope "${scopeKey}" already exists.`)
  }
}

function assertUniqueTransitionId(state: FocusIntentState, transitionId: string) {
  assertIdentifier(transitionId, 'transition id')
  if (state.transitions.some(transition => transition.id === transitionId)) {
    throw new Error(`Focus intent transition "${transitionId}" already exists.`)
  }
}

function withoutPending(state: FocusIntentState): FocusIntentState {
  if (!state.pending) return state
  return { ...state, pending: undefined }
}

function finishTransitions(
  state: FocusIntentState,
  transitionIds: ReadonlySet<string>,
): FocusIntentState {
  if (transitionIds.size === 0) return state

  const routes = state.routes.flatMap((route): readonly FocusRouteState[] => {
    if (!route.transitionId || !transitionIds.has(route.transitionId)) return [route]
    if (route.phase === 'exiting') return []
    return [{ ...route, phase: 'settled', transitionId: undefined }]
  })

  return {
    ...state,
    pending: undefined,
    routes,
    transitions: state.transitions.filter(transition => !transitionIds.has(transition.id)),
  }
}

function cancelTransition(state: FocusIntentState, transitionId: string): FocusIntentState {
  const routes = state.routes.flatMap((route): readonly FocusRouteState[] => {
    if (route.transitionId !== transitionId) return [route]
    if (route.phase === 'entering') return []
    return [{ ...route, phase: 'settled', transitionId: undefined }]
  })

  return {
    ...state,
    pending: undefined,
    routes,
    transitions: state.transitions.filter(transition => transition.id !== transitionId),
  }
}

function finishAllTransitions(state: FocusIntentState): FocusIntentState {
  return finishTransitions(state, new Set(state.transitions.map(transition => transition.id)))
}

function finishEnteringTransitions(state: FocusIntentState): FocusIntentState {
  const enteringIds = new Set(
    state.routes.flatMap(route =>
      route.phase === 'entering' && route.transitionId ? [route.transitionId] : [],
    ),
  )
  return finishTransitions(state, enteringIds)
}

function capture(
  state: FocusIntentState,
  scopeKey: string,
  activeFocus: FocusLocation | undefined,
): FocusIntentResult {
  if (!activeFocus || activeFocus.scopeKey !== scopeKey) {
    return { commands: [], state }
  }

  assertIdentifier(activeFocus.target, `active target for "${scopeKey}"`)
  const snapshots = new Map(state.snapshots)
  snapshots.set(scopeKey, activeFocus.target)
  return {
    commands: [{ location: activeFocus, type: 'capture' }],
    state: { ...state, snapshots },
  }
}

function requestFocus(
  state: FocusIntentState,
  scopeKey: string,
  kind: PendingFocusIntent['kind'],
  reason: FocusReason,
): FocusIntentResult {
  const scope = findScope(state, scopeKey)
  if (!scope) {
    throw new Error(`Focus intent scope "${scopeKey}" does not exist.`)
  }

  if (!scope.ready) {
    return {
      commands: [],
      state: { ...state, pending: { kind, reason, scopeKey } },
    }
  }

  const readyState = withoutPending(state)
  const commandReason = scope.failed ? 'error' : reason
  if (kind === 'restore' && !scope.failed) {
    const snapshot = state.snapshots.get(scopeKey)
    if (snapshot) {
      return {
        commands: [
          {
            fallback: initialLocation(scope),
            location: { scopeKey, target: snapshot },
            reason: commandReason,
            type: 'restore',
          },
        ],
        state: readyState,
      }
    }
  }

  return {
    commands: [{ location: scopeLocation(scope), reason: commandReason, type: 'move-to' }],
    state: readyState,
  }
}

function activeRoute(state: FocusIntentState): FocusRouteState {
  const route = state.routes.at(-1)
  if (!route) throw new Error('Focus intent route stack must not be empty.')
  return route
}

export function activeFocusScopeKey(state: FocusIntentState): string | undefined {
  const presentation = state.presentations.at(-1)
  if (presentation) return presentation.key
  if (state.transitions.length > 0) return undefined
  return activeRoute(state).key
}

export function createFocusIntentState(initial: FocusScopeDefinition): FocusIntentState {
  const scope = createScopeState(initial)
  return {
    presentations: [],
    routes: [{ ...scope, phase: 'settled' }],
    snapshots: new Map(),
    transitions: [],
  }
}

function beginPush(
  state: FocusIntentState,
  event: Extract<FocusIntentEvent, { type: 'push-begin' }>,
): FocusIntentResult {
  if (state.presentations.length > 0) {
    throw new Error('Focus intent cannot push while a presentation is active.')
  }

  let nextState = finishAllTransitions(state)
  assertUniqueTransitionId(nextState, event.transitionId)
  assertUniqueScopeKey(nextState, event.to.key)
  const source = activeRoute(nextState)
  if (source.key !== event.fromKey) {
    throw new Error(
      `Focus intent push expected source "${source.key}", received "${event.fromKey}".`,
    )
  }

  const captured = capture(nextState, source.key, event.activeFocus)
  nextState = withoutPending(captured.state)
  const entering: FocusRouteState = {
    ...createScopeState(event.to),
    phase: 'entering',
    transitionId: event.transitionId,
  }

  return {
    commands: captured.commands,
    state: {
      ...nextState,
      routes: [...nextState.routes, entering],
      transitions: [...nextState.transitions, { id: event.transitionId, kind: 'push' }],
    },
  }
}

function beginPop(
  state: FocusIntentState,
  event: Extract<FocusIntentEvent, { type: 'pop-begin' }>,
): FocusIntentResult {
  if (state.presentations.length > 0) {
    throw new Error('Focus intent cannot pop while a presentation is active.')
  }

  let nextState = finishEnteringTransitions(state)
  assertUniqueTransitionId(nextState, event.transitionId)
  const destinationIndex = nextState.routes.findIndex(route => route.key === event.toKey)
  const destination = nextState.routes[destinationIndex]
  if (destinationIndex < 0 || !destination || destination.phase !== 'settled') {
    throw new Error(`Focus intent pop destination "${event.toKey}" is not a settled route.`)
  }

  const departing = nextState.routes
    .slice(destinationIndex + 1)
    .filter(route => route.phase !== 'exiting')
  const captureScope = departing.at(-1)
  if (!captureScope) {
    throw new Error(`Focus intent pop destination "${event.toKey}" has no departing route.`)
  }

  const captured = capture(nextState, captureScope.key, event.activeFocus)
  nextState = withoutPending(captured.state)
  const departingKeys = new Set(departing.map(route => route.key))

  return {
    commands: captured.commands,
    state: {
      ...nextState,
      routes: nextState.routes.map(route =>
        departingKeys.has(route.key)
          ? {
              ...route,
              phase: 'exiting',
              transitionId: event.transitionId,
            }
          : route,
      ),
      transitions: [...nextState.transitions, { id: event.transitionId, kind: 'pop' }],
    },
  }
}

function settleNavigation(
  state: FocusIntentState,
  event: Extract<FocusIntentEvent, { type: 'pop-settle' | 'push-settle' }>,
): FocusIntentResult {
  const transition = state.transitions.find(candidate => candidate.id === event.transitionId)
  if (!transition) return { commands: [], state }

  const expectedKind = event.type === 'push-settle' ? 'push' : 'pop'
  if (transition.kind !== expectedKind) {
    throw new Error(
      `Focus intent transition "${event.transitionId}" is ${transition.kind}, not ${expectedKind}.`,
    )
  }

  const nextState =
    event.outcome === 'completed'
      ? finishTransitions(state, new Set([event.transitionId]))
      : cancelTransition(state, event.transitionId)

  if (nextState.presentations.length > 0 || nextState.transitions.length > 0) {
    return { commands: [], state: nextState }
  }

  const reason: FocusReason = event.outcome === 'cancelled' ? 'transition-cancel' : transition.kind
  return requestFocus(
    nextState,
    activeRoute(nextState).key,
    transition.kind === 'push' && event.outcome === 'completed' ? 'initial' : 'restore',
    reason,
  )
}

function present(
  state: FocusIntentState,
  event: Extract<FocusIntentEvent, { type: 'present' }>,
): FocusIntentResult {
  if (state.transitions.length > 0) {
    throw new Error('Focus intent cannot present during a navigation transition.')
  }

  assertUniqueScopeKey(state, event.presentation.key)
  const sourceKey = activeFocusScopeKey(state)
  if (!sourceKey) {
    throw new Error('Focus intent presentation has no active source scope.')
  }

  const captured = capture(state, sourceKey, event.activeFocus)
  const presentation = createScopeState(event.presentation)
  const nextState: FocusIntentState = {
    ...withoutPending(captured.state),
    presentations: [...state.presentations, presentation],
  }
  const requested = requestFocus(nextState, presentation.key, 'initial', 'present')

  return {
    commands: [...captured.commands, ...requested.commands],
    state: requested.state,
  }
}

function dismiss(
  state: FocusIntentState,
  event: Extract<FocusIntentEvent, { type: 'dismiss' }>,
): FocusIntentResult {
  const top = state.presentations.at(-1)
  if (!top || top.key !== event.presentationKey) {
    throw new Error(`Focus intent can only dismiss the top presentation "${top?.key ?? 'none'}".`)
  }

  const nextState: FocusIntentState = {
    ...withoutPending(state),
    presentations: state.presentations.slice(0, -1),
  }
  const destinationKey = activeFocusScopeKey(nextState)
  if (!destinationKey) return { commands: [], state: nextState }
  return requestFocus(nextState, destinationKey, 'restore', 'dismiss')
}

function updateScope(
  state: FocusIntentState,
  scopeKey: string,
  update: (scope: FocusScopeState) => FocusScopeState,
): FocusIntentState {
  let found = false
  const presentations = state.presentations.map(scope => {
    if (scope.key !== scopeKey) return scope
    found = true
    return update(scope)
  })
  const routes = state.routes.map((scope): FocusRouteState => {
    if (scope.key !== scopeKey) return scope
    found = true
    return { ...scope, ...update(scope) }
  })
  if (!found) {
    throw new Error(`Focus intent scope "${scopeKey}" does not exist.`)
  }
  return { ...state, presentations, routes }
}

function lazyReady(
  state: FocusIntentState,
  event: Extract<FocusIntentEvent, { type: 'lazy-ready' }>,
): FocusIntentResult {
  const scope = findScope(state, event.scopeKey)
  if (!scope) {
    throw new Error(`Focus intent scope "${event.scopeKey}" does not exist.`)
  }
  if (scope.failed || scope.ready) return { commands: [], state }
  if (event.target) {
    assertIdentifier(event.target, `lazy target for "${event.scopeKey}"`)
  }

  const nextState = updateScope(state, event.scopeKey, candidate => ({
    ...candidate,
    focusTarget: event.target ?? candidate.focusTarget,
    ready: true,
  }))
  if (state.pending?.scopeKey !== event.scopeKey) {
    return { commands: [], state: nextState }
  }

  return requestFocus(nextState, event.scopeKey, state.pending.kind, state.pending.reason)
}

function reportError(
  state: FocusIntentState,
  event: Extract<FocusIntentEvent, { type: 'error' }>,
): FocusIntentResult {
  assertIdentifier(event.message, `error message for "${event.scopeKey}"`)
  const scope = findScope(state, event.scopeKey)
  if (!scope) {
    throw new Error(`Focus intent scope "${event.scopeKey}" does not exist.`)
  }

  if (event.kind === 'status') {
    return activeFocusScopeKey(state) === event.scopeKey
      ? {
          commands: [
            {
              message: event.message,
              politeness: 'assertive',
              scopeKey: event.scopeKey,
              type: 'announce',
            },
          ],
          state,
        }
      : { commands: [], state }
  }

  assertIdentifier(event.target, `error target for "${event.scopeKey}"`)
  const nextState = updateScope(state, event.scopeKey, candidate => ({
    ...candidate,
    failed: true,
    focusTarget: event.target,
    ready: true,
  }))
  if (activeFocusScopeKey(nextState) !== event.scopeKey) {
    return { commands: [], state: nextState }
  }
  return requestFocus(nextState, event.scopeKey, 'initial', 'error')
}

export function reduceFocusIntent(
  state: FocusIntentState,
  event: FocusIntentEvent,
): FocusIntentResult {
  switch (event.type) {
    case 'push-begin':
      return beginPush(state, event)
    case 'push-settle':
    case 'pop-settle':
      return settleNavigation(state, event)
    case 'pop-begin':
      return beginPop(state, event)
    case 'present':
      return present(state, event)
    case 'dismiss':
      return dismiss(state, event)
    case 'lazy-ready':
      return lazyReady(state, event)
    case 'error':
      return reportError(state, event)
  }
}
