// EXPERIMENTAL, PRIVATE. Pane-scoped gesture ownership built on the measured-reference arena (arena.ts).
//
// One scope owns the direct-manipulation contacts of one pane. Features (back swipe, a sidebar
// drawer, row actions) register participants into the scope. A participant declares:
//
// - an arena recognizer (its claim/fail predicate) and its relationships: failure requirements,
//   explicit simultaneity and exclusive groups;
// - the motion output it writes, so that two simultaneous participants can never both own one
//   visual output;
// - its contact hooks. The scope calls them synchronously, in the input task, in one fixed
//   order. It never schedules a frame, a microtask or a React update, and it never paints.
//
// The scope does not move anything. Visible motion is the participant's connection: a native
// scroller's ScrollTimeline (compositor) or an explicitly unqualified frame loop. Release and
// commit go through `createReleaseTransaction`, which commits at most once and never for a
// retired geometry generation.
//
// Not exported from the public entry.

import { armPointerClickSuppression } from '../press/activation.ts'
import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'
import {
  createGestureArena,
  failGesture,
  reduceGestureArena,
  type GestureArenaDefinition,
  type GestureArenaSession,
  type GestureArenaStep,
  type GestureRecognizerDeclaration,
  type NormalizedPointerSample,
} from './arena.ts'

/** One touch as the scope delivers it to participants, in viewport coordinates. */
export type ScopeContact = Readonly<{
  identifier: number
  clientX: number
  clientY: number
  target: Element | undefined
  time: number
}>

/** What a participant may express about its arena recognizer. Region and relationships are
 * scope data; the participant supplies the intent predicate and measured hysteresis. */
export type ParticipantRecognizer = Omit<
  GestureRecognizerDeclaration,
  'id' | 'requiresFailureOf' | 'simultaneousWith' | 'region' | 'participation'
>

export type GestureParticipant = Readonly<{
  recognizer: ParticipantRecognizer
  /** Directed failure requirements. A missing (unregistered) participant counts as failed. */
  requiresFailureOf?: readonly string[]
  /** Mutual permission to recognize together. Both sides must declare it. */
  simultaneousWith?: readonly string[]
  /** The motion output this participant writes (an axis id). Two participants that may be
   * recognized together must not write the same output. */
  output?: string
  /** 'claim' (default): when this participant is recognized, the scope cancels the press under
   * the contact and suppresses its synthesized click, in the same input task, so the control
   * under a claimed contact can never activate. 'own': the participant does this itself (the
   * back swipe keeps its measured timing). */
  pressPolicy?: 'claim' | 'own'
  /** 'ignore' keeps the primary contact when a second finger lands (the existing back swipe);
   * 'cancel' ends this participant's contact as cancelled (the drawer's one-finger contract). */
  multiTouch?: 'cancel' | 'ignore'
  /**
   * Touch-down gate. Returns the reason this contact cannot become the gesture, or undefined to
   * admit it. Called for every touchstart, including a second finger (`foreign`), so a feature
   * can keep its own diagnostics; a foreign result never admits anything.
   */
  admit(contact: ScopeContact, event: TouchEvent, foreign: boolean): string | undefined
  /** The contact was admitted: start this participant's bookkeeping for it. */
  begin?(contact: ScopeContact, event: TouchEvent): void
  /** Moves must be cancelable for this contact (a non-passive listener is added for it). */
  cancelableMoves?(): boolean
  /** Every primary move while this participant is possible or recognized, before arbitration.
   * Bookkeeping only (positions, velocity). Must not paint. Returns 'cancel' when the browser
   * has taken the contact (for example a noncancelable move after native panning began); the
   * scope then finishes this participant as cancelled. */
  observe?(contact: ScopeContact, event: TouchEvent): 'cancel' | undefined
  /** The arena recognized this participant (its claim), in this input task. */
  recognized?(contact: ScopeContact, event: TouchEvent): void
  /** The arena failed or cancelled this participant before the sequence ended. */
  rejected?(reason: string, event: TouchEvent | undefined): void
  /** Every primary move after reduction while recognized. */
  move?(contact: ScopeContact, event: TouchEvent): void
  /** The sequence ended for an admitted participant: lift (`cancelled` false) or
   * cancellation (touchcancel, geometry change, multi-touch, unmount). Called exactly once. */
  finish(event: TouchEvent | undefined, cancelled: boolean, reason: string): void
  /** A contact this participant refused at touch-down has ended (for example, to return a
   * native range the refused contact consumed). */
  refusedEnd?(event: TouchEvent): void
}>

export type ScopeRelationships = Readonly<{
  exclusiveGroups: readonly (readonly string[])[]
}>

type Registration = { id: string; participant: GestureParticipant }

type ActiveSequence = {
  generation: number
  identifier: number
  /** The Pointer Events id of the same finger, when WebKit delivered its pointerdown first. */
  pointerId: number | undefined
  admitted: Set<string>
  refused: Set<string>
  finished: Set<string>
  session: GestureArenaSession | undefined
  definition: GestureArenaDefinition
  cancelableMoves: boolean
}

export type GestureScopeOptions = Readonly<{
  /** Diagnostic sink for arena transitions (tests and motion probes). */
  onTransition?: (record: ScopeTransitionRecord) => void
}>

export type ScopeTransitionRecord = Readonly<{
  generation: number
  recognizerId: string
  from?: string
  to: string
  reason: string
}>

/** A pane-scoped gesture owner. Create one per pane host; bind it to that host's element. */
export type GestureScope = Readonly<{
  /** Adds a participant. Throws on a duplicate id, a failure-requirement cycle, one-sided
   * simultaneity or a duplicate output writer. Returns its removal. */
  register(id: string, participant: GestureParticipant): () => void
  /** Declares ids that may never be recognized together. Throws if any pair is simultaneous. */
  exclusive(ids: readonly string[]): () => void
  /** Listens for touches on `host`. Returns the listeners' removal. */
  bind(host: HTMLElement): () => void
  /** Pane geometry changed (width, idiom, orientation): cancel the active contact and retire
   * every transaction begun against the old geometry. */
  invalidateGeometry(reason?: string): void
  /** Cancels the active contact, if any (unmount, backgrounding, presentation). */
  cancel(reason: string): void
  /** The current geometry generation. Release transactions capture it. */
  readonly generation: number
  /** Ids admitted to the active contact, for cooperation checks (a native source in use). */
  activeParticipants(): readonly string[]
  /** Ids currently registered. */
  participants(): readonly string[]
}>

function assertKnownIdentifiers(registrations: readonly Registration[]) {
  const ids = new Set<string>()
  for (const { id } of registrations) {
    if (ids.has(id)) throw new Error(`Satin gesture scope participant "${id}" is duplicated.`)
    ids.add(id)
  }
}

/** Two participants that may recognize together must not write the same output. */
function assertSingleWriter(registrations: readonly Registration[]) {
  for (const first of registrations) {
    for (const second of registrations) {
      if (first.id >= second.id) continue
      const output = first.participant.output
      if (!output || output !== second.participant.output) continue
      const together = (first.participant.simultaneousWith ?? []).includes(second.id)
      if (together) {
        throw new Error(
          `Satin gesture scope participants "${first.id}" and "${second.id}" are simultaneous ` +
            `and both write output "${output}".`,
        )
      }
    }
  }
}

function assertExclusiveGroups(
  registrations: readonly Registration[],
  groups: readonly (readonly string[])[],
) {
  const byId = new Map(registrations.map(registration => [registration.id, registration]))
  for (const group of groups) {
    for (const id of group) {
      const simultaneous = byId.get(id)?.participant.simultaneousWith ?? []
      const conflict = simultaneous.find(other => group.includes(other))
      if (conflict) {
        throw new Error(
          `Satin gesture scope participants "${id}" and "${conflict}" are declared exclusive ` +
            'and simultaneous.',
        )
      }
    }
  }
}

/**
 * The arena definition for one contact. Relationships naming participants that are not
 * registered are dropped: an absent participant can never win, so it has already failed.
 */
export function scopeArenaDefinition(
  registrations: readonly Registration[],
  admission: ReadonlyMap<string, string | undefined> = new Map(),
): GestureArenaDefinition {
  const present = new Set(registrations.map(registration => registration.id))
  const recognizers = registrations.map(({ id, participant }) => {
    const reason = admission.get(id)
    const declaration: GestureRecognizerDeclaration = {
      ...participant.recognizer,
      id,
      region: { kind: 'all' },
      participation: 'javascript',
      requiresFailureOf: (participant.requiresFailureOf ?? []).filter(other => present.has(other)),
      simultaneousWith: (participant.simultaneousWith ?? []).filter(other => present.has(other)),
    }
    if (reason === undefined) return declaration
    // Refused at touch-down: fail on the start sample with the participant's own reason.
    return { ...declaration, evaluate: () => failGesture(`not-admitted:${reason}`) }
  })
  return createGestureArena({ bounds: { bottom: 0, left: 0, right: 0, top: 0 }, recognizers })
}

/** Validates a candidate registration set the same way the scope does. */
export function validateScopeRegistrations(
  registrations: readonly Registration[],
  relationships: ScopeRelationships = { exclusiveGroups: [] },
) {
  assertKnownIdentifiers(registrations)
  // Cycles, unknown targets and one-sided simultaneity are the arena's own validation.
  scopeArenaDefinition(registrations)
  assertSingleWriter(registrations)
  assertExclusiveGroups(registrations, relationships.exclusiveGroups)
}

function touchById(list: TouchList | undefined, identifier?: number) {
  if (!list) return undefined
  for (let index = 0; index < list.length; index += 1) {
    const touch = list.item(index)
    if (touch && (identifier === undefined || touch.identifier === identifier)) return touch
  }
  return undefined
}

function contactFrom(touch: Touch, event: TouchEvent): ScopeContact {
  return {
    identifier: touch.identifier,
    clientX: touch.clientX,
    clientY: touch.clientY,
    target: event.target instanceof Element ? event.target : undefined,
    time: event.timeStamp,
  }
}

function sampleFrom(
  contact: ScopeContact,
  phase: NormalizedPointerSample['phase'],
): NormalizedPointerSample {
  return {
    isPrimary: true,
    kind: 'pointer',
    phase,
    pointerId: contact.identifier,
    time: contact.time,
    x: contact.clientX,
    y: contact.clientY,
  }
}

export function createGestureScope(options: GestureScopeOptions = {}): GestureScope {
  let registrations: Registration[] = []
  let exclusiveGroups: (readonly string[])[] = []
  let generation = 1
  let active: ActiveSequence | undefined
  let lastTouchPointerId: number | undefined
  const moveListeners = new Map<HTMLElement, { cancelable: (event: TouchEvent) => void }>()

  const participant = (id: string) =>
    registrations.find(registration => registration.id === id)?.participant

  const report = (step: GestureArenaStep, sequence: ActiveSequence) => {
    if (!options.onTransition) return
    for (const transition of step.transitions) {
      options.onTransition({
        generation: sequence.generation,
        recognizerId: transition.recognizerId,
        from: transition.from,
        to: transition.to,
        reason: transition.reason,
      })
    }
  }

  /** Ends one admitted participant exactly once. */
  const finishParticipant = (
    sequence: ActiveSequence,
    id: string,
    event: TouchEvent | undefined,
    cancelled: boolean,
    reason: string,
  ) => {
    if (sequence.finished.has(id)) return
    sequence.finished.add(id)
    participant(id)?.finish(event, cancelled, reason)
  }

  const endSequence = (
    sequence: ActiveSequence,
    event: TouchEvent | undefined,
    cancelled: boolean,
    reason: string,
  ) => {
    if (active === sequence) active = undefined
    for (const id of sequence.admitted) finishParticipant(sequence, id, event, cancelled, reason)
    if (!event) return
    for (const id of sequence.refused) participant(id)?.refusedEnd?.(event)
  }

  /** Applies one arena step: rejection hooks for admitted participants that lost or failed,
   * then recognition hooks, in declaration order. */
  const applyStep = (sequence: ActiveSequence, step: GestureArenaStep, event: TouchEvent) => {
    report(step, sequence)
    sequence.session = step.session
    if (!step.session) return
    const contact = touchById(event.changedTouches, sequence.identifier)
    for (const transition of step.transitions) {
      if (!sequence.admitted.has(transition.recognizerId)) continue
      if (sequence.finished.has(transition.recognizerId)) continue
      const target = participant(transition.recognizerId)
      if (transition.to === 'failed' || transition.to === 'canceled') {
        if (transition.from !== 'began') target?.rejected?.(transition.reason, event)
      } else if (transition.to === 'recognized' && contact) {
        if ((target?.pressPolicy ?? 'claim') === 'claim') claimPresses(sequence)
        target?.recognized?.(contactFrom(contact, event), event)
      }
    }
  }

  const claimPresses = (sequence: ActiveSequence) => {
    if (sequence.pointerId !== undefined) cancelPointerPressForOwnedGesture(sequence.pointerId)
    armPointerClickSuppression(performance.now())
  }

  const live = (sequence: ActiveSequence, id: string) => {
    const state = sequence.session?.recognizers[id]?.state
    return state === 'possible' || state === 'recognized'
  }

  const handleStart = (event: TouchEvent) => {
    const touch = touchById(event.changedTouches)
    if (!touch) return
    const contact = contactFrom(touch, event)
    if (active) {
      // A second finger. Participants keep their diagnostics; the primary keeps the sequence
      // unless an admitted participant's contract is one finger.
      for (const { participant: other } of registrations) other.admit(contact, event, true)
      const sequence = active
      for (const id of sequence.admitted) {
        if (participant(id)?.multiTouch !== 'cancel') continue
        finishParticipant(sequence, id, event, true, 'multiple-contacts')
      }
      return
    }
    const admission = new Map<string, string | undefined>()
    for (const { id, participant: candidate } of registrations) {
      admission.set(id, candidate.admit(contact, event, false))
    }
    const admitted = new Set(
      [...admission].filter(([, reason]) => reason === undefined).map(([id]) => id),
    )
    const sequence: ActiveSequence = {
      generation,
      identifier: contact.identifier,
      pointerId: lastTouchPointerId,
      admitted,
      refused: new Set([...admission.keys()].filter(id => !admitted.has(id))),
      finished: new Set(),
      session: undefined,
      definition: scopeArenaDefinition(registrations, admission),
      cancelableMoves: false,
    }
    // A sequence exists even when every participant refused, so its end reaches them.
    active = sequence
    for (const id of admitted) participant(id)?.begin?.(contact, event)
    if (admitted.size === 0) return
    const step = reduceGestureArena(sequence.definition, undefined, sampleFrom(contact, 'start'))
    applyStep(sequence, step, event)
    sequence.cancelableMoves = [...admitted].some(id => participant(id)?.cancelableMoves?.())
    if (sequence.cancelableMoves) {
      const host = event.currentTarget as HTMLElement
      addCancelableMoveListener(host)
    }
  }

  const handleMove = (event: TouchEvent, fromCancelableListener: boolean) => {
    const sequence = active
    if (!sequence || sequence.admitted.size === 0) return
    // One listener delivers each move: the cancelable one while a participant needs it.
    if (sequence.cancelableMoves !== fromCancelableListener) return
    const touch = touchById(event.changedTouches, sequence.identifier)
    if (!touch) return
    const contact = contactFrom(touch, event)
    for (const id of sequence.admitted) {
      if (sequence.finished.has(id) || !live(sequence, id)) continue
      if (participant(id)?.observe?.(contact, event) === 'cancel') {
        finishParticipant(sequence, id, event, true, 'browser-took-contact')
      }
    }
    if (active !== sequence) return
    const step = reduceGestureArena(
      sequence.definition,
      sequence.session,
      sampleFrom(contact, 'move'),
    )
    applyStep(sequence, step, event)
    for (const id of sequence.admitted) {
      if (sequence.finished.has(id)) continue
      if (sequence.session?.recognizers[id]?.state !== 'recognized') continue
      participant(id)?.move?.(contact, event)
    }
  }

  const handleEnd = (event: TouchEvent, cancelled: boolean) => {
    const sequence = active
    if (!sequence) {
      // A finger this scope never tracked (it lifted after the primary sequence ended).
      for (const { participant: other } of registrations) other.refusedEnd?.(event)
      return
    }
    const touch = touchById(event.changedTouches, sequence.identifier)
    const stillDown = touchById(event.touches, sequence.identifier)
    // Another finger lifted; the primary is still down.
    if (!touch && stillDown) return
    if (touch && sequence.session) {
      const phase = cancelled ? 'cancel' : 'end'
      const step = reduceGestureArena(
        sequence.definition,
        sequence.session,
        sampleFrom(contactFrom(touch, event), phase),
      )
      report(step, sequence)
      sequence.session = step.session
    }
    removeCancelableMoveListener(event.currentTarget as HTMLElement)
    endSequence(sequence, event, cancelled, cancelled ? 'touchcancel' : 'touchend')
  }

  const addCancelableMoveListener = (host: HTMLElement) => {
    const entry = moveListeners.get(host)
    if (!entry) return
    host.addEventListener('touchmove', entry.cancelable, { passive: false })
  }

  const removeCancelableMoveListener = (host: HTMLElement | null) => {
    const entry = host ? moveListeners.get(host) : undefined
    if (host && entry) host.removeEventListener('touchmove', entry.cancelable)
  }

  const cancelActive = (reason: string) => {
    const sequence = active
    if (!sequence) return
    for (const host of moveListeners.keys()) removeCancelableMoveListener(host)
    endSequence(sequence, undefined, true, reason)
  }

  const scope: GestureScope = {
    register(id, next) {
      const candidate = [...registrations, { id, participant: next }]
      validateScopeRegistrations(candidate, { exclusiveGroups })
      registrations = candidate
      return () => {
        if (active?.admitted.has(id)) {
          const sequence = active
          finishParticipant(sequence, id, undefined, true, 'unregistered')
          sequence.admitted.delete(id)
        }
        registrations = registrations.filter(registration => registration.participant !== next)
      }
    },
    exclusive(ids) {
      const groups = [...exclusiveGroups, [...ids]]
      assertExclusiveGroups(registrations, groups)
      exclusiveGroups = groups
      return () => {
        exclusiveGroups = exclusiveGroups.filter(group => group !== groups.at(-1))
      }
    },
    bind(host) {
      const pointerDown = (event: PointerEvent) => {
        if (event.pointerType === 'touch' && event.isPrimary) lastTouchPointerId = event.pointerId
      }
      const start = (event: TouchEvent) => handleStart(event)
      const passiveMove = (event: TouchEvent) => handleMove(event, false)
      const cancelableMove = (event: TouchEvent) => handleMove(event, true)
      const end = (event: TouchEvent) => handleEnd(event, false)
      const cancel = (event: TouchEvent) => handleEnd(event, true)
      moveListeners.set(host, { cancelable: cancelableMove })
      host.addEventListener('pointerdown', pointerDown, { capture: true, passive: true })
      host.addEventListener('touchstart', start, { passive: true })
      host.addEventListener('touchmove', passiveMove, { passive: true })
      // End events never block scrolling. A participant without a native driver may still
      // cancel the synthesized click at its claimed lift.
      host.addEventListener('touchend', end, { passive: false })
      host.addEventListener('touchcancel', cancel, { passive: false })
      return () => {
        cancelActive('unbound')
        host.removeEventListener('pointerdown', pointerDown, { capture: true })
        host.removeEventListener('touchstart', start)
        host.removeEventListener('touchmove', passiveMove)
        host.removeEventListener('touchmove', cancelableMove)
        host.removeEventListener('touchend', end)
        host.removeEventListener('touchcancel', cancel)
        moveListeners.delete(host)
      }
    },
    invalidateGeometry(reason = 'geometry-changed') {
      generation += 1
      cancelActive(reason)
    },
    cancel(reason) {
      cancelActive(reason)
    },
    get generation() {
      return generation
    },
    activeParticipants() {
      if (!active) return []
      const sequence = active
      return [...sequence.admitted].filter(id => !sequence.finished.has(id))
    },
    participants() {
      return registrations.map(registration => registration.id)
    },
  }
  return Object.freeze(scope)
}

/** The outcome a release chose. `cancel` returns to the pre-gesture state without a commit. */
export type ReleaseOutcome = 'cancel' | 'commit'

export type ReleaseTransaction<Destination> = Readonly<{
  readonly destination: Destination
  readonly outcome: ReleaseOutcome
  /** The settle reached its destination: commit once, if still current. */
  settled(): boolean
  /** A newer contact caught the presented pose, or geometry changed: never commit. */
  supersede(reason: string): void
  readonly state: 'committed' | 'pending' | 'superseded'
  readonly supersededReason: string | undefined
}>

/**
 * The transactional end of a contact. A release chooses a destination once; the visible settle
 * runs elsewhere (compositor tracks); `settled` commits semantic state at most once and only
 * when the geometry generation the contact began with is still current. A cancelled contact
 * creates a `cancel` transaction, which never commits.
 */
export function createReleaseTransaction<Destination>(input: {
  destination: Destination
  outcome: ReleaseOutcome
  generation: number
  currentGeneration: () => number
  commit: (destination: Destination) => void
}): ReleaseTransaction<Destination> {
  let state: 'committed' | 'pending' | 'superseded' = 'pending'
  let supersededReason: string | undefined
  return {
    destination: input.destination,
    outcome: input.outcome,
    settled() {
      if (state !== 'pending') return false
      if (input.currentGeneration() !== input.generation) {
        state = 'superseded'
        supersededReason = 'geometry-generation-retired'
        return false
      }
      state = 'committed'
      if (input.outcome === 'commit') input.commit(input.destination)
      return input.outcome === 'commit'
    },
    supersede(reason) {
      if (state !== 'pending') return
      state = 'superseded'
      supersededReason = reason
    },
    get state() {
      return state
    },
    get supersededReason() {
      return supersededReason
    },
  }
}
