import type { AxisLayoutClass } from '../layout/layoutClass.ts'
import type {
  NavigatorState,
  ScreenEntry,
  TransitionController,
  TransitionOperation,
} from './types.ts'

export type SplitNavigationTransition = Readonly<{
  controller: TransitionController
  interactive: boolean
  operation: TransitionOperation
}>

export type CompactNavigationProjection<Entry extends ScreenEntry> = Readonly<{
  entries: readonly Entry[]
  mode: 'stack'
  selectionEntryKey?: string
}>

export type RegularNavigationProjection<Entry extends ScreenEntry> = Readonly<{
  detailEntries: readonly Entry[]
  mode: 'split'
  selectionEntryKey?: string
  sidebarEntry: Entry
}>

export type SplitNavigationProjection<Entry extends ScreenEntry> =
  CompactNavigationProjection<Entry> | RegularNavigationProjection<Entry>

export type SplitNavigationState<Entry extends ScreenEntry> = Readonly<{
  appliedHorizontalClass: AxisLayoutClass
  navigator: NavigatorState<Entry>
  pendingHorizontalClass?: AxisLayoutClass
  projection: SplitNavigationProjection<Entry>
  requestedControllers: readonly TransitionController[]
  transitions: readonly SplitNavigationTransition[]
}>

export type SplitNavigationCommand = Readonly<{
  controller: TransitionController
  operation: TransitionOperation
  type: 'cancel-interactive-transition' | 'finish-transition'
}>

export type SplitNavigationEvent<Entry extends ScreenEntry> =
  | Readonly<{
      horizontal: AxisLayoutClass
      type: 'horizontal-class-changed'
    }>
  | Readonly<{
      navigator: NavigatorState<Entry>
      transitions: readonly SplitNavigationTransition[]
      type: 'navigator-synchronized'
    }>

export type SplitNavigationReduction<Entry extends ScreenEntry> = Readonly<{
  commands: readonly SplitNavigationCommand[]
  state: SplitNavigationState<Entry>
}>

const EMPTY_COMMANDS: readonly SplitNavigationCommand[] = Object.freeze([])

function activeControllers<Entry extends ScreenEntry>(navigator: NavigatorState<Entry>) {
  const controllers: TransitionController[] = []
  for (const entry of navigator.entries) {
    const { controller, phase } = entry.transition
    if (phase === 'settled' || controllers.includes(controller)) continue
    controllers.push(controller)
  }
  return controllers
}

function normalizeTransitions<Entry extends ScreenEntry>(
  navigator: NavigatorState<Entry>,
  transitions: readonly SplitNavigationTransition[],
) {
  if (navigator.entries.length === 0) {
    throw new Error('Split navigation requires the Navigator root entry.')
  }

  const active = activeControllers(navigator)
  for (const controller of active) {
    const matches = transitions.filter(transition => transition.controller === controller)
    if (matches.length !== 1) {
      throw new Error(
        'Every in-flight Navigator controller needs exactly one transition descriptor.',
      )
    }
    if (matches[0]?.interactive && matches[0].operation !== 'pop') {
      throw new Error('Only a pop transition can own an interactive back gesture.')
    }
  }

  for (const transition of transitions) {
    if (!active.includes(transition.controller)) {
      throw new Error('A transition descriptor does not belong to the active Navigator stack.')
    }
  }

  return active.map(controller =>
    transitions.find(transition => transition.controller === controller)!,
  )
}

function project<Entry extends ScreenEntry>(
  horizontal: AxisLayoutClass,
  navigator: NavigatorState<Entry>,
): SplitNavigationProjection<Entry> {
  const sidebarEntry = navigator.entries[0]
  if (!sidebarEntry) {
    throw new Error('Split navigation requires the Navigator root entry.')
  }
  const selectionEntryKey = navigator.entries[1]?.key

  if (horizontal === 'compact') {
    return {
      entries: navigator.entries,
      mode: 'stack',
      ...(selectionEntryKey ? { selectionEntryKey } : {}),
    }
  }

  return {
    detailEntries: navigator.entries.slice(1),
    mode: 'split',
    ...(selectionEntryKey ? { selectionEntryKey } : {}),
    sidebarEntry,
  }
}

function requestedForActiveControllers(
  requested: readonly TransitionController[],
  transitions: readonly SplitNavigationTransition[],
) {
  return requested.filter(controller =>
    transitions.some(transition => transition.controller === controller),
  )
}

function settlementCommands(
  transitions: readonly SplitNavigationTransition[],
  requestedControllers: readonly TransitionController[],
): readonly SplitNavigationCommand[] {
  return transitions
    .filter(transition => !requestedControllers.includes(transition.controller))
    .map(transition => ({
      controller: transition.controller,
      operation: transition.operation,
      type: transition.interactive
        ? ('cancel-interactive-transition' as const)
        : ('finish-transition' as const),
    }))
}

function settlePendingClass<Entry extends ScreenEntry>(
  state: SplitNavigationState<Entry>,
): SplitNavigationReduction<Entry> {
  if (!state.pendingHorizontalClass) {
    return { commands: EMPTY_COMMANDS, state }
  }

  if (state.transitions.length === 0) {
    const appliedHorizontalClass = state.pendingHorizontalClass
    return {
      commands: EMPTY_COMMANDS,
      state: {
        ...state,
        appliedHorizontalClass,
        pendingHorizontalClass: undefined,
        projection: project(appliedHorizontalClass, state.navigator),
        requestedControllers: [],
      },
    }
  }

  const commands = settlementCommands(state.transitions, state.requestedControllers)
  if (commands.length === 0) return { commands: EMPTY_COMMANDS, state }
  return {
    commands,
    state: {
      ...state,
      requestedControllers: [
        ...state.requestedControllers,
        ...commands.map(command => command.controller),
      ],
    },
  }
}

export function createSplitNavigationState<Entry extends ScreenEntry>(
  horizontal: AxisLayoutClass,
  navigator: NavigatorState<Entry>,
  transitions: readonly SplitNavigationTransition[] = [],
): SplitNavigationState<Entry> {
  const normalizedTransitions = normalizeTransitions(navigator, transitions)
  return {
    appliedHorizontalClass: horizontal,
    navigator,
    projection: project(horizontal, navigator),
    requestedControllers: [],
    transitions: normalizedTransitions,
  }
}

export function reduceSplitNavigation<Entry extends ScreenEntry>(
  state: SplitNavigationState<Entry>,
  event: SplitNavigationEvent<Entry>,
): SplitNavigationReduction<Entry> {
  if (event.type === 'horizontal-class-changed') {
    const pendingHorizontalClass =
      event.horizontal === state.appliedHorizontalClass ? undefined : event.horizontal
    const nextState: SplitNavigationState<Entry> = {
      ...state,
      pendingHorizontalClass,
      requestedControllers: pendingHorizontalClass ? state.requestedControllers : [],
    }
    return settlePendingClass(nextState)
  }

  const transitions = normalizeTransitions(event.navigator, event.transitions)
  const requestedControllers = state.pendingHorizontalClass
    ? requestedForActiveControllers(state.requestedControllers, transitions)
    : []
  const synchronized: SplitNavigationState<Entry> = {
    ...state,
    navigator: event.navigator,
    projection: project(state.appliedHorizontalClass, event.navigator),
    requestedControllers,
    transitions,
  }
  return settlePendingClass(synchronized)
}
