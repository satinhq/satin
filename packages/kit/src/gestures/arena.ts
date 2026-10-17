export type GestureRecognizerState = 'began' | 'possible' | 'recognized' | 'failed' | 'canceled'

export type GestureAxis = 'horizontal' | 'vertical' | 'any'

export type GestureBounds = Readonly<{
  bottom: number
  left: number
  right: number
  top: number
}>

export type GestureRegion =
  | Readonly<{ kind: 'all' }>
  | Readonly<{
      bottom: number
      kind: 'rect'
      left: number
      right: number
      top: number
    }>
  | Readonly<{
      edge: 'bottom' | 'left' | 'right' | 'top'
      kind: 'edge'
      size: number
    }>

export type GestureHysteresis = Readonly<{
  /** Distance at which the recognizer may take ownership of the sequence. */
  claimDistance?: number
  /** Distance at which an already-owned gesture may first become visible. */
  activationDistance?: number
  /** Distance outside a control that still retains a possible press. */
  retentionDistance?: number
}>

export type NormalizedPointerSample = Readonly<{
  isPrimary: boolean
  kind: 'pointer'
  phase: 'start' | 'move' | 'end' | 'cancel'
  pointerId: number
  time: number
  x: number
  y: number
}>

export type ExternalGestureObservation = Readonly<{
  kind: 'external-recognition'
  pointerId: number
  recognizerId: string
  time: number
}>

export type GestureArenaInput = NormalizedPointerSample | ExternalGestureObservation

export type GestureDecision =
  | Readonly<{ disposition: 'defer' }>
  | Readonly<{ disposition: 'recognize'; reason?: string }>
  | Readonly<{ disposition: 'fail'; reason?: string }>

export type GestureRecognizerContext = Readonly<{
  current: Readonly<{ time: number; x: number; y: number }>
  declaration: GestureRecognizerDeclaration
  deltaX: number
  deltaY: number
  elapsed: number
  sample: NormalizedPointerSample
  start: Readonly<{ time: number; x: number; y: number }>
}>

export type GestureRecognizerDeclaration = Readonly<{
  axis: GestureAxis
  evaluate?: (context: GestureRecognizerContext) => GestureDecision
  hysteresis: GestureHysteresis
  id: string
  participation?: 'javascript' | 'observed-native'
  previewWhilePossible?: boolean
  priority: number
  region: GestureRegion
  requiresFailureOf?: readonly string[]
  simultaneousWith?: readonly string[]
}>

export type GestureExclusion = Readonly<{
  id: string
  recognizerIds: 'all' | readonly string[]
  region: GestureRegion
}>

export type GestureArenaDefinition = Readonly<{
  bounds: GestureBounds
  exclusions?: readonly GestureExclusion[]
  recognizers: readonly GestureRecognizerDeclaration[]
}>

export type GestureRecognizerSnapshot = Readonly<{
  id: string
  previewActive: boolean
  ready: boolean
  readyReason?: string
  state: GestureRecognizerState
}>

export type GestureArenaSession = Readonly<{
  activePointerIds: readonly number[]
  current: Readonly<{ time: number; x: number; y: number }>
  primaryPointerId: number
  recognizers: Readonly<Record<string, GestureRecognizerSnapshot>>
  start: Readonly<{ time: number; x: number; y: number }>
  status: 'active' | 'canceled' | 'ended'
}>

export type GestureArenaTransition = Readonly<{
  from?: GestureRecognizerState
  reason: string
  recognizerId: string
  to: GestureRecognizerState
}>

export type GesturePreviewChange = Readonly<{
  active: boolean
  recognizerId: string
}>

export type GestureArenaStep = Readonly<{
  ignored?: 'duplicate-primary' | 'foreign-pointer' | 'inactive-session'
  previews: readonly GesturePreviewChange[]
  session?: GestureArenaSession
  transitions: readonly GestureArenaTransition[]
}>

type MutableRecognizerSnapshot = {
  id: string
  previewActive: boolean
  ready: boolean
  readyReason?: string
  state: GestureRecognizerState
}

type Reduction = {
  previews: GesturePreviewChange[]
  recognizers: Record<string, MutableRecognizerSnapshot>
  transitions: GestureArenaTransition[]
}

const DEFER = Object.freeze({ disposition: 'defer' } as const)

export function deferGesture(): GestureDecision {
  return DEFER
}

export function recognizeGesture(reason?: string): GestureDecision {
  return reason ? { disposition: 'recognize', reason } : { disposition: 'recognize' }
}

export function failGesture(reason?: string): GestureDecision {
  return reason ? { disposition: 'fail', reason } : { disposition: 'fail' }
}

function contains(
  region: GestureRegion,
  point: Readonly<{ x: number; y: number }>,
  bounds: GestureBounds,
) {
  if (region.kind === 'all') return true
  if (region.kind === 'rect') {
    return (
      point.x >= region.left &&
      point.x <= region.right &&
      point.y >= region.top &&
      point.y <= region.bottom
    )
  }

  switch (region.edge) {
    case 'bottom':
      return point.y >= bounds.bottom - region.size && point.y <= bounds.bottom
    case 'left':
      return point.x >= bounds.left && point.x <= bounds.left + region.size
    case 'right':
      return point.x >= bounds.right - region.size && point.x <= bounds.right
    case 'top':
      return point.y >= bounds.top && point.y <= bounds.top + region.size
  }
}

function assertDistance(name: string, value: number | undefined) {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`Satin gesture arena ${name} must be a finite non-negative number.`)
  }
}

function validateDefinition(definition: GestureArenaDefinition) {
  const ids = new Set<string>()
  for (const recognizer of definition.recognizers) {
    if (!recognizer.id) {
      throw new Error('Satin gesture arena recognizer ids must not be empty.')
    }
    if (ids.has(recognizer.id)) {
      throw new Error(`Satin gesture arena recognizer "${recognizer.id}" is duplicated.`)
    }
    if (!Number.isFinite(recognizer.priority)) {
      throw new Error(`Satin gesture arena priority for "${recognizer.id}" must be finite.`)
    }
    if ((recognizer.participation ?? 'javascript') === 'javascript' && !recognizer.evaluate) {
      throw new Error(
        `Satin gesture arena JavaScript recognizer "${recognizer.id}" needs an evaluator.`,
      )
    }
    assertDistance('claimDistance', recognizer.hysteresis.claimDistance)
    assertDistance('activationDistance', recognizer.hysteresis.activationDistance)
    assertDistance('retentionDistance', recognizer.hysteresis.retentionDistance)
    ids.add(recognizer.id)
  }

  const byId = new Map(definition.recognizers.map(recognizer => [recognizer.id, recognizer]))
  for (const recognizer of definition.recognizers) {
    for (const requirement of recognizer.requiresFailureOf ?? []) {
      if (!byId.has(requirement)) {
        throw new Error(
          `Satin gesture arena recognizer "${recognizer.id}" requires unknown recognizer "${requirement}" to fail.`,
        )
      }
      if (requirement === recognizer.id) {
        throw new Error(
          `Satin gesture arena recognizer "${recognizer.id}" cannot require itself to fail.`,
        )
      }
    }
    for (const simultaneousId of recognizer.simultaneousWith ?? []) {
      const peer = byId.get(simultaneousId)
      if (!peer) {
        throw new Error(
          `Satin gesture arena recognizer "${recognizer.id}" names unknown simultaneous recognizer "${simultaneousId}".`,
        )
      }
      if (!(peer.simultaneousWith ?? []).includes(recognizer.id)) {
        throw new Error(
          `Satin gesture arena simultaneity must be mutual between "${recognizer.id}" and "${simultaneousId}".`,
        )
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) {
      throw new Error(`Satin gesture arena failure requirements contain a cycle at "${id}".`)
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of byId.get(id)?.requiresFailureOf ?? []) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const recognizer of definition.recognizers) visit(recognizer.id)

  for (const exclusion of definition.exclusions ?? []) {
    if (exclusion.recognizerIds === 'all') continue
    for (const recognizerId of exclusion.recognizerIds) {
      if (!ids.has(recognizerId)) {
        throw new Error(
          `Satin gesture arena exclusion "${exclusion.id}" names unknown recognizer "${recognizerId}".`,
        )
      }
    }
  }
}

export function createGestureArena(definition: GestureArenaDefinition): GestureArenaDefinition {
  validateDefinition(definition)
  return Object.freeze({
    bounds: Object.freeze({ ...definition.bounds }),
    exclusions: Object.freeze([...(definition.exclusions ?? [])]),
    recognizers: Object.freeze([...definition.recognizers]),
  })
}

function cloneRecognizers(session: GestureArenaSession) {
  return Object.fromEntries(
    Object.entries(session.recognizers).map(([id, snapshot]) => [id, { ...snapshot }]),
  ) as Record<string, MutableRecognizerSnapshot>
}

function snapshotSession(
  session: GestureArenaSession,
  recognizers: Record<string, MutableRecognizerSnapshot>,
  changes: Partial<Pick<GestureArenaSession, 'activePointerIds' | 'current' | 'status'>> = {},
): GestureArenaSession {
  return Object.freeze({
    ...session,
    ...changes,
    activePointerIds: Object.freeze([...(changes.activePointerIds ?? session.activePointerIds)]),
    current: Object.freeze({ ...(changes.current ?? session.current) }),
    recognizers: Object.freeze(
      Object.fromEntries(
        Object.entries(recognizers).map(([id, snapshot]) => [id, Object.freeze({ ...snapshot })]),
      ),
    ),
  })
}

function transition(
  reduction: Reduction,
  recognizerId: string,
  to: GestureRecognizerState,
  reason: string,
) {
  const snapshot = reduction.recognizers[recognizerId]
  if (!snapshot || snapshot.state === to) return
  const from = snapshot.state
  snapshot.state = to
  snapshot.ready = false
  snapshot.readyReason = undefined
  reduction.transitions.push({ from, reason, recognizerId, to })
  if (snapshot.previewActive && to !== 'possible' && to !== 'began') {
    snapshot.previewActive = false
    reduction.previews.push({ active: false, recognizerId })
  }
}

function isExcluded(
  definition: GestureArenaDefinition,
  recognizerId: string,
  point: Readonly<{ x: number; y: number }>,
) {
  return (definition.exclusions ?? []).find(exclusion => {
    const applies =
      exclusion.recognizerIds === 'all' || exclusion.recognizerIds.includes(recognizerId)
    return applies && contains(exclusion.region, point, definition.bounds)
  })
}

function beginSession(
  definition: GestureArenaDefinition,
  sample: NormalizedPointerSample,
): GestureArenaStep {
  const recognizers: Record<string, MutableRecognizerSnapshot> = {}
  const transitions: GestureArenaTransition[] = []
  const previews: GesturePreviewChange[] = []

  for (const declaration of definition.recognizers) {
    const snapshot: MutableRecognizerSnapshot = {
      id: declaration.id,
      previewActive: false,
      ready: false,
      state: 'began',
    }
    recognizers[declaration.id] = snapshot
    transitions.push({
      reason: 'sequence-started',
      recognizerId: declaration.id,
      to: 'began',
    })
    const exclusion = isExcluded(definition, declaration.id, sample)
    if (!contains(declaration.region, sample, definition.bounds)) {
      snapshot.state = 'failed'
      transitions.push({
        from: 'began',
        reason: 'outside-region',
        recognizerId: declaration.id,
        to: 'failed',
      })
      continue
    }
    if (exclusion) {
      snapshot.state = 'failed'
      transitions.push({
        from: 'began',
        reason: `excluded:${exclusion.id}`,
        recognizerId: declaration.id,
        to: 'failed',
      })
      continue
    }
    snapshot.state = 'possible'
    transitions.push({
      from: 'began',
      reason: 'eligible',
      recognizerId: declaration.id,
      to: 'possible',
    })
    if (declaration.previewWhilePossible) {
      snapshot.previewActive = true
      previews.push({ active: true, recognizerId: declaration.id })
    }
  }

  const point = Object.freeze({ time: sample.time, x: sample.x, y: sample.y })
  const session: GestureArenaSession = Object.freeze({
    activePointerIds: Object.freeze([sample.pointerId]),
    current: point,
    primaryPointerId: sample.pointerId,
    recognizers: Object.freeze(
      Object.fromEntries(
        Object.entries(recognizers).map(([id, snapshot]) => [id, Object.freeze({ ...snapshot })]),
      ),
    ),
    start: point,
    status: 'active',
  })
  return reducePrimaryPointer(definition, session, sample, transitions, previews)
}

function simultaneous(
  byId: ReadonlyMap<string, GestureRecognizerDeclaration>,
  first: string,
  second: string,
) {
  if (first === second) return true
  return byId.get(first)?.simultaneousWith?.includes(second) ?? false
}

function requirementsFailed(
  declaration: GestureRecognizerDeclaration,
  recognizers: Record<string, MutableRecognizerSnapshot>,
) {
  return (declaration.requiresFailureOf ?? []).every(id => recognizers[id]?.state === 'failed')
}

function resolveReadyRecognizers(definition: GestureArenaDefinition, reduction: Reduction) {
  const byId = new Map(definition.recognizers.map(recognizer => [recognizer.id, recognizer]))
  const existingWinners = definition.recognizers
    .filter(recognizer => reduction.recognizers[recognizer.id]?.state === 'recognized')
    .map(recognizer => recognizer.id)
  const eligible = definition.recognizers
    .map((recognizer, order) => ({ order, recognizer }))
    .filter(({ recognizer }) => {
      const snapshot = reduction.recognizers[recognizer.id]
      return (
        snapshot?.state === 'possible' &&
        snapshot.ready &&
        requirementsFailed(recognizer, reduction.recognizers)
      )
    })
    .sort(
      (first, second) =>
        second.recognizer.priority - first.recognizer.priority || first.order - second.order,
    )

  const winners = [...existingWinners]
  for (const { recognizer } of eligible) {
    if (winners.every(winner => simultaneous(byId, recognizer.id, winner))) {
      const reason = reduction.recognizers[recognizer.id]?.readyReason ?? 'arena-won'
      transition(reduction, recognizer.id, 'recognized', reason)
      winners.push(recognizer.id)
    }
  }
  if (winners.length === existingWinners.length) return

  for (const recognizer of definition.recognizers) {
    const snapshot = reduction.recognizers[recognizer.id]
    if (!snapshot || snapshot.state !== 'possible') continue
    // A local decision cannot cancel a platform recognizer. It stays possible
    // until the adapter observes a native win or the sequence ends without one.
    if ((recognizer.participation ?? 'javascript') === 'observed-native') continue
    if (!winners.every(winner => simultaneous(byId, recognizer.id, winner))) {
      transition(reduction, recognizer.id, 'canceled', `lost-to:${winners.join(',')}`)
    }
  }
}

function evaluatePossibleRecognizers(
  definition: GestureArenaDefinition,
  session: GestureArenaSession,
  sample: NormalizedPointerSample,
  reduction: Reduction,
) {
  const decisions = new Map<string, GestureDecision>()
  for (const declaration of definition.recognizers) {
    const snapshot = reduction.recognizers[declaration.id]
    if (
      snapshot?.state !== 'possible' ||
      (declaration.participation ?? 'javascript') !== 'javascript'
    ) {
      continue
    }
    decisions.set(
      declaration.id,
      declaration.evaluate?.({
        current: { time: sample.time, x: sample.x, y: sample.y },
        declaration,
        deltaX: sample.x - session.start.x,
        deltaY: sample.y - session.start.y,
        elapsed: Math.max(0, sample.time - session.start.time),
        sample,
        start: session.start,
      }) ?? DEFER,
    )
  }

  for (const declaration of definition.recognizers) {
    const decision = decisions.get(declaration.id)
    if (decision?.disposition === 'fail') {
      transition(reduction, declaration.id, 'failed', decision.reason ?? 'recognizer-failed')
    }
  }
  for (const declaration of definition.recognizers) {
    const decision = decisions.get(declaration.id)
    const snapshot = reduction.recognizers[declaration.id]
    if (decision?.disposition === 'recognize' && snapshot?.state === 'possible') {
      snapshot.ready = true
      snapshot.readyReason = decision.reason
    }
  }

  if (sample.phase === 'end') {
    for (const declaration of definition.recognizers) {
      const snapshot = reduction.recognizers[declaration.id]
      if (snapshot?.state === 'possible' && !snapshot.ready) {
        transition(reduction, declaration.id, 'failed', 'sequence-ended')
      }
    }
  }

  resolveReadyRecognizers(definition, reduction)
}

function reducePrimaryPointer(
  definition: GestureArenaDefinition,
  session: GestureArenaSession,
  sample: NormalizedPointerSample,
  initialTransitions: GestureArenaTransition[] = [],
  initialPreviews: GesturePreviewChange[] = [],
): GestureArenaStep {
  const reduction: Reduction = {
    previews: [...initialPreviews],
    recognizers: cloneRecognizers(session),
    transitions: [...initialTransitions],
  }
  const current = { time: sample.time, x: sample.x, y: sample.y }

  if (sample.phase === 'cancel') {
    for (const declaration of definition.recognizers) {
      const snapshot = reduction.recognizers[declaration.id]
      if (!snapshot) continue
      if (snapshot.state === 'possible' && declaration.participation === 'observed-native') {
        transition(
          reduction,
          declaration.id,
          'failed',
          'pointer-canceled-without-native-observation',
        )
      } else if (
        (snapshot.state === 'possible' || snapshot.state === 'recognized') &&
        (declaration.participation ?? 'javascript') === 'javascript'
      ) {
        transition(reduction, declaration.id, 'canceled', 'pointer-canceled')
      }
    }
    return {
      previews: reduction.previews,
      session: snapshotSession(session, reduction.recognizers, {
        activePointerIds: session.activePointerIds.filter(
          pointerId => pointerId !== sample.pointerId,
        ),
        current,
        status: 'canceled',
      }),
      transitions: reduction.transitions,
    }
  }

  evaluatePossibleRecognizers(definition, session, sample, reduction)
  if (sample.phase === 'end') {
    for (const declaration of definition.recognizers) {
      const snapshot = reduction.recognizers[declaration.id]
      if (snapshot?.state === 'possible') {
        transition(reduction, declaration.id, 'failed', 'sequence-ended')
      }
    }
  }

  return {
    previews: reduction.previews,
    session: snapshotSession(session, reduction.recognizers, {
      activePointerIds:
        sample.phase === 'end'
          ? session.activePointerIds.filter(pointerId => pointerId !== sample.pointerId)
          : session.activePointerIds,
      current,
      status: sample.phase === 'end' ? 'ended' : 'active',
    }),
    transitions: reduction.transitions,
  }
}

function observeExternalRecognition(
  definition: GestureArenaDefinition,
  session: GestureArenaSession,
  input: ExternalGestureObservation,
): GestureArenaStep {
  const declaration = definition.recognizers.find(
    recognizer => recognizer.id === input.recognizerId,
  )
  if (!declaration || (declaration.participation ?? 'javascript') !== 'observed-native') {
    return { ignored: 'inactive-session', previews: [], session, transitions: [] }
  }

  const reduction: Reduction = {
    previews: [],
    recognizers: cloneRecognizers(session),
    transitions: [],
  }
  const byId = new Map(definition.recognizers.map(recognizer => [recognizer.id, recognizer]))
  transition(reduction, declaration.id, 'recognized', 'native-recognition-observed')
  for (const recognizer of definition.recognizers) {
    if (recognizer.id === declaration.id) continue
    const snapshot = reduction.recognizers[recognizer.id]
    if (
      snapshot &&
      (snapshot.state === 'possible' || snapshot.state === 'recognized') &&
      !simultaneous(byId, declaration.id, recognizer.id)
    ) {
      transition(reduction, recognizer.id, 'canceled', `lost-to:${declaration.id}`)
    }
  }

  return {
    previews: reduction.previews,
    session: snapshotSession(session, reduction.recognizers, {
      current: { ...session.current, time: input.time },
    }),
    transitions: reduction.transitions,
  }
}

export function reduceGestureArena(
  definition: GestureArenaDefinition,
  session: GestureArenaSession | undefined,
  input: GestureArenaInput,
): GestureArenaStep {
  if (!session || session.status !== 'active') {
    if (input.kind === 'pointer' && input.phase === 'start' && input.isPrimary) {
      return beginSession(definition, input)
    }
    return { ignored: 'inactive-session', previews: [], session, transitions: [] }
  }

  if (input.pointerId !== session.primaryPointerId) {
    if (input.kind === 'pointer' && input.phase === 'start') {
      return {
        ignored: 'foreign-pointer',
        previews: [],
        session: snapshotSession(session, cloneRecognizers(session), {
          activePointerIds: session.activePointerIds.includes(input.pointerId)
            ? session.activePointerIds
            : [...session.activePointerIds, input.pointerId],
        }),
        transitions: [],
      }
    }
    if (input.kind === 'pointer' && (input.phase === 'end' || input.phase === 'cancel')) {
      return {
        ignored: 'foreign-pointer',
        previews: [],
        session: snapshotSession(session, cloneRecognizers(session), {
          activePointerIds: session.activePointerIds.filter(
            pointerId => pointerId !== input.pointerId,
          ),
        }),
        transitions: [],
      }
    }
    return { ignored: 'foreign-pointer', previews: [], session, transitions: [] }
  }

  if (input.kind === 'external-recognition') {
    return observeExternalRecognition(definition, session, input)
  }
  if (input.phase === 'start') {
    return { ignored: 'duplicate-primary', previews: [], session, transitions: [] }
  }
  return reducePrimaryPointer(definition, session, input)
}

export function recognizerState(
  session: GestureArenaSession,
  recognizerId: string,
): GestureRecognizerSnapshot {
  const snapshot = session.recognizers[recognizerId]
  if (!snapshot) {
    throw new Error(`Satin gesture arena has no recognizer named "${recognizerId}".`)
  }
  return snapshot
}
