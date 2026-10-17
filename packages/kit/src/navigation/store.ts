import { scrollAfterGlassPrepared } from '../scroll/scrollJump.ts'
import { createNavigationFocusRuntime, navigatorFocusRuntime } from '../focus/navigationFocus.ts'
import { prepareKeyboardForNavigation } from '../keyboard/adapter.ts'
import {
  readNavigation,
  saveNavigation,
  type NavigatorRestoration,
} from '../restoration/navigation.ts'
import { createRouteCodec, sameRouteParams, type SerializedRoute } from './routeCodec.ts'
import { reportNavigatorHistoryChange } from '../fidelity/devAssertions.ts'
import type { SplitNavigationTransition } from './splitState.ts'
import type { ScreenRegistry } from './registry.ts'
import {
  cancelStackTransition,
  finishStackTransition,
  popStack,
  popToRootStack,
  pushStack,
  replaceStack,
  setEntryScrollSnapshot,
} from './stack.ts'
import type { ScrollSurfaceRegistry } from '../scroll/registry.ts'
import { createAnimatedTransitionController, isInteractiveTransitionController } from './motion.ts'
import type {
  NavigatorState,
  PresentationKind,
  ScreenDefinition,
  ScreenEntry,
  TransitionCompletion,
  TransitionController,
  TransitionControllerContext,
  TransitionControllerFactory,
} from './types.ts'

type RegistryDefinitions<Registry> =
  Registry extends ScreenRegistry<infer Definitions> ? Definitions : never

export type ScreenId<Registry extends ScreenRegistry> = RegistryDefinitions<Registry>[number]['id']

export type ScreenParams<Registry extends ScreenRegistry, Id extends ScreenId<Registry>> =
  Extract<
    RegistryDefinitions<Registry>[number],
    ScreenDefinition<Id, any>
  > extends ScreenDefinition<Id, infer Params>
    ? Params
    : never

export type RegistryScreenEntry<Registry extends ScreenRegistry> = {
  [Id in ScreenId<Registry>]: ScreenEntry<Id, ScreenParams<Registry, Id>>
}[ScreenId<Registry>]

type ScreenTarget<Registry extends ScreenRegistry> = {
  [Id in ScreenId<Registry>]: undefined extends ScreenParams<Registry, Id>
    ? Readonly<{
        id: Id
        params?: ScreenParams<Registry, Id>
        presentation?: PresentationKind
      }>
    : Readonly<{
        id: Id
        params: ScreenParams<Registry, Id>
        presentation?: PresentationKind
      }>
}[ScreenId<Registry>]

type NavigationArguments<Params> = [Params] extends [undefined]
  ? [params?: Params, options?: Readonly<{ presentation?: PresentationKind }>]
  : [params: Params, options?: Readonly<{ presentation?: PresentationKind }>]

export interface NavigatorActions<Registry extends ScreenRegistry = ScreenRegistry> {
  selectDetail<Id extends ScreenId<Registry>>(
    id: Id,
    ...arguments_: NavigationArguments<ScreenParams<Registry, Id>>
  ): void
  pop(): void
  popToRoot(): void
  push<Id extends ScreenId<Registry>>(
    id: Id,
    ...arguments_: NavigationArguments<ScreenParams<Registry, Id>>
  ): boolean
  replace<Id extends ScreenId<Registry>>(
    id: Id,
    ...arguments_: NavigationArguments<ScreenParams<Registry, Id>>
  ): void
}

export interface NavigatorStore<
  Registry extends ScreenRegistry = ScreenRegistry,
> extends NavigatorActions<Registry> {
  readonly registry: Registry
  readonly restoration?: NavigatorRestoration
  readonly [navigatorRestoredMounts]: Set<string>
  /** Installs a decoded path atomically without replaying transitions. */
  activatePath(path: readonly SerializedRoute[]): boolean
  getState(): NavigatorState<RegistryScreenEntry<Registry>>
  subscribe(listener: () => void): () => void
  readonly [navigatorFocusRuntime]: ReturnType<typeof createNavigationFocusRuntime>
  readonly [navigatorScrollRuntime]: NavigatorScrollRuntime
  readonly [navigatorTransitionRuntime]: NavigatorTransitionRuntime
}

export interface NavigatorScrollRuntime {
  scrollPrimaryToTop(entryKey: string | undefined): void
  capture(entryKeys: readonly string[]): void
  bind(entryKey: string, registry: ScrollSurfaceRegistry): () => void
}

export const navigatorScrollRuntime = Symbol('satin.navigator.scroll-runtime')

export interface NavigatorTransitionRuntime {
  /** Reuse a live entry without passing its ancestors through a storage codec. */
  activateEntry(key: string): boolean
  /** Internal durability check after scene preparation. */
  hasCheckpointEntry(scene: NavigatorRestoration['scene'], key: string): boolean
  descriptors(): readonly SplitNavigationTransition[]
  beginInteractivePop(
    options?: Readonly<{ interruptPushTo: string }>,
  ):
    | (TransitionController &
        Required<
          Pick<TransitionController, 'cancelInteractive' | 'completeInteractive' | 'setProgress'>
        >)
    | undefined
  canBeginInteractivePop(): boolean
}

export const navigatorRestoredMounts = Symbol('satin.navigator.restored-mounts')
export const navigatorTransitionRuntime = Symbol('satin.navigator.transition-runtime')

export type CreateNavigatorOptions<Registry extends ScreenRegistry> = Readonly<{
  initial: ScreenTarget<Registry>
  restoration?: NavigatorRestoration
  launchPath?: readonly SerializedRoute[]
  registry: Registry
  transitionControllerFactory?: TransitionControllerFactory
}>

function createSettledController(): TransitionController {
  return Object.freeze({
    progress: 1,
    finish() {},
    cancel() {},
  })
}

export function createInstantTransitionController(
  completion: TransitionCompletion,
  _context?: TransitionControllerContext,
): TransitionController {
  let progress = 0
  let completed = false

  const controller: TransitionController = {
    get progress() {
      return progress
    },
    start() {
      controller.finish()
    },
    finish() {
      if (completed) return
      completed = true
      progress = 1
      completion.finish()
    },
    cancel() {
      if (completed) return
      completed = true
      progress = 0
      completion.cancel()
    },
  }

  return Object.freeze(controller)
}

/** A held or cancelling interactive pop still owns the screen it exposes: no other navigation
 * may settle that screen's transition until the finger lets go or the cancel finishes. */
export function gestureOwnsTransition(controller: TransitionController) {
  return controller.interactionPhase === 'held' || controller.interactionPhase === 'cancelling'
}

/** The focus move that follows a finished transition (focus/navigationFocus.ts). */
function focusReasonAfter(operation: TransitionControllerContext['operation']) {
  if (operation === 'push') return 'push'
  if (operation === 'replace') return 'replace'
  return 'pop'
}

function readHistoryLength() {
  return typeof window === 'undefined' ? undefined : window.history.length
}

function assertRegistered(registry: ScreenRegistry, id: string) {
  if (!registry.has(id)) {
    throw new Error(`Satin screen "${id}" is not registered.`)
  }
}

function targetParams(target: { params?: unknown }) {
  return target.params
}

export function createNavigator<Registry extends ScreenRegistry>(
  options: CreateNavigatorOptions<Registry>,
): NavigatorStore<Registry> {
  const { registry } = options
  assertRegistered(registry, options.initial.id)

  let nextKey = 1
  let state: NavigatorState<RegistryScreenEntry<Registry>> = {
    entries: [
      {
        key: `satin-screen-${options.initial.id}-0`,
        params: targetParams(options.initial),
        presentation: 'push',
        screenId: options.initial.id,
        transition: {
          controller: createSettledController(),
          phase: 'settled',
        },
      } as RegistryScreenEntry<Registry>,
    ],
  }
  const restoredMounts = new Set<string>()
  const focusRuntime = createNavigationFocusRuntime()
  if (options.restoration) {
    const restored = readNavigation(options.restoration, registry, options.initial.id)
    if (restored.length) {
      state = { entries: restored as RegistryScreenEntry<Registry>[] }
      if (options.restoration.scene.diagnostics.restored)
        for (const entry of restored) restoredMounts.add(entry.key)
    } else options.restoration.scene.retainEntries(options.restoration.key, [])
  }
  // Keys remain unique across process restarts and repeated pushes of one screen.
  const keyPrefix =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  const controllerContexts = new WeakMap<TransitionController, TransitionControllerContext>()
  const listeners = new Set<() => void>()
  const scrollRegistries = new Map<string, ScrollSurfaceRegistry>()
  const controllerFactory =
    options.transitionControllerFactory ?? createAnimatedTransitionController

  const getState = () => state
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const publish = (nextState: NavigatorState<RegistryScreenEntry<Registry>>) => {
    if (nextState === state) return
    state = nextState
    if (options.restoration) {
      options.restoration.scene.retainEntries(
        options.restoration.key,
        state.entries.map(entry => entry.key),
      )
      checkpointNavigation()
    }
    for (const listener of listeners) listener()
  }
  const runOperation = <Result>(operation: string, run: () => Result): Result => {
    if (!import.meta.env.DEV) return run()

    const historyBefore = readHistoryLength()
    try {
      return run()
    } finally {
      const historyAfter = readHistoryLength()
      if (historyBefore !== undefined && historyAfter !== undefined) {
        reportNavigatorHistoryChange(operation, historyBefore, historyAfter, state)
      }
    }
  }
  const createController = (context: TransitionControllerContext) => {
    let controller: TransitionController
    controller = controllerFactory(
      {
        changed() {
          publish({ ...state })
        },
        finish() {
          const next = finishStackTransition(state, controller)
          if (next === state) return
          focusRuntime.request(next.entries.at(-1)?.key, focusReasonAfter(context.operation))
          publish(next)
        },
        cancel() {
          const next = cancelStackTransition(state, controller)
          if (next === state) return
          focusRuntime.request(next.entries.at(-1)?.key, 'transition-cancel')
          publish(next)
        },
      },
      context,
    )
    controllerContexts.set(controller, context)
    return controller
  }
  const createEntry = (id: ScreenId<Registry>, params: unknown, controller: TransitionController) =>
    ({
      key: `satin-screen-${id}-${keyPrefix}-${nextKey++}`,
      params,
      presentation: 'push',
      screenId: id,
      transition: { controller, phase: 'entering' },
    }) as RegistryScreenEntry<Registry>

  const captureEntries = (
    currentState: NavigatorState<RegistryScreenEntry<Registry>>,
    entryKeys: readonly string[],
    preservePending = false,
  ) => {
    let nextState = currentState
    for (const entryKey of entryKeys) {
      const registry = scrollRegistries.get(entryKey)
      if (!registry) continue
      nextState = setEntryScrollSnapshot(nextState, entryKey, registry.capture({ preservePending }))
    }
    return nextState
  }

  const inFlightControllers = (phase?: 'entering') => {
    const controllers = new Set<TransitionController>()
    for (const entry of state.entries) {
      if (entry.transition.phase !== 'settled' && (!phase || entry.transition.phase === phase)) {
        controllers.add(entry.transition.controller)
      }
    }
    return controllers
  }

  const finishInFlightTransitions = (phase?: 'entering') => {
    for (const controller of inFlightControllers(phase)) controller.finish()
  }

  const topPoppableEntry = () => {
    for (let index = state.entries.length - 1; index > 0; index -= 1) {
      const entry = state.entries[index]
      if (entry?.transition.phase !== 'exiting') return entry
    }
    return undefined
  }

  const beginTransition = (
    outgoingEntryKeys: readonly string[],
    context: TransitionControllerContext,
    apply: (
      capturedState: NavigatorState<RegistryScreenEntry<Registry>>,
      controller: TransitionController,
    ) => NavigatorState<RegistryScreenEntry<Registry>>,
  ) => {
    focusRuntime.capture(outgoingEntryKeys)
    // Keyboard room and a lifted screen layer go back before scroll state is captured and the
    // transition is published: no frame of the slide, and no navigation-glass capture, sees them.
    prepareKeyboardForNavigation()
    const controller = createController(context)
    const capturedState = captureEntries(state, outgoingEntryKeys)
    publish(apply(capturedState, controller))
    controller.start?.()
    return controller
  }

  const scrollRuntime: NavigatorScrollRuntime = Object.freeze({
    scrollPrimaryToTop(entryKey: string | undefined) {
      const primary = entryKey ? scrollRegistries.get(entryKey)?.getPrimary() : undefined
      if (!primary) return
      scrollRegistries.get(entryKey!)?.cancelRestoration(primary.id)
      const scroll = () =>
        primary.element.scrollTo({
          behavior:
            typeof matchMedia !== 'undefined' &&
            matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'auto'
              : 'smooth',
          top: primary.axis === 'vertical' ? 0 : primary.element.scrollTop,
          left: primary.axis === 'horizontal' ? 0 : primary.element.scrollLeft,
        })
      // Glass over a long list holds the list's top before the scroll starts (scroll/scrollJump.ts).
      if (primary.axis === 'vertical') scrollAfterGlassPrepared(primary.element, 0, scroll)
      else scroll()
    },
    capture(entryKeys: readonly string[]) {
      publish(captureEntries(state, entryKeys))
    },
    bind(entryKey: string, registry: ScrollSurfaceRegistry) {
      scrollRegistries.set(entryKey, registry)
      const stop = registry.subscribe(() => {
        checkpointNavigation()
      })
      return () => {
        stop()
        if (scrollRegistries.get(entryKey) === registry) {
          scrollRegistries.delete(entryKey)
        }
      }
    },
  })

  const checkpointNavigation = () => {
    const restoration = options.restoration
    if (restoration)
      restoration.scene.checkpoint(
        `navigation:${restoration.key}`,
        () =>
          saveNavigation(
            restoration,
            registry,
            captureEntries(
              state,
              state.entries.map(entry => entry.key),
              true,
            ),
          ),
        () => state.entries.some(entry => entry.transition.phase !== 'settled'),
        () => transitionRuntime.descriptors().some(transition => transition.interactive),
      )
  }

  const transitionRuntime: NavigatorTransitionRuntime = Object.freeze({
    hasCheckpointEntry(scene: NavigatorRestoration['scene'], key: string) {
      const restoration = options.restoration
      return (
        !!restoration &&
        restoration.scene === scene &&
        readNavigation(restoration, registry, options.initial.id).some(entry => entry.key === key)
      )
    },
    activateEntry(key: string) {
      if (transitionRuntime.descriptors().some(t => gestureOwnsTransition(t.controller)))
        return false
      const index = state.entries.findIndex(entry => entry.key === key)
      if (index < 0) return false
      const retained = new Set(state.entries.slice(0, index + 1).map(entry => entry.key))
      for (const controller of inFlightControllers()) {
        const requested = state.entries.find(
          entry => entry.key === key && entry.transition.controller === controller,
        )
        // A replacement shares one controller. The requested destination's role
        // wins over an exiting ancestor in the retained prefix.
        if (requested?.transition.phase === 'entering') controller.finish()
        else if (
          requested?.transition.phase === 'exiting' ||
          state.entries.some(
            entry =>
              retained.has(entry.key) &&
              entry.transition.phase === 'exiting' &&
              entry.transition.controller === controller,
          )
        )
          controller.cancel()
        else controller.finish()
      }
      if (!state.entries.some(entry => entry.key === key)) return false
      publish({ entries: state.entries.filter(entry => retained.has(entry.key)) })
      return state.entries.at(-1)?.key === key
    },
    descriptors() {
      return [...inFlightControllers()].map(controller => {
        const context = controllerContexts.get(controller)
        if (!context) throw new Error('Active transition has no controller context.')
        return { controller, ...context }
      })
    },
    canBeginInteractivePop() {
      const active = transitionRuntime.descriptors()
      if (
        active.length === 1 &&
        active[0]?.operation === 'pop' &&
        active[0].controller.interactionPhase === 'cancelling' &&
        active[0].controller.resumeInteractive
      )
        return true
      return (
        topPoppableEntry() !== undefined &&
        transitionRuntime
          .descriptors()
          .every(
            transition =>
              transition.operation === 'pop' &&
              transition.controller.interactionPhase === 'completing',
          )
      )
    },
    beginInteractivePop(options?: Readonly<{ interruptPushTo: string }>) {
      return runOperation('interactivePop', () => {
        if (options) {
          // A prepared, recognized contact may take over its own entering push.
          // Never settle a different route, a pop, or another interactive gesture.
          if (
            topPoppableEntry()?.key !== options.interruptPushTo ||
            transitionRuntime.descriptors().some(t => t.interactive || t.operation !== 'push')
          )
            return undefined
          finishInFlightTransitions('entering')
        }
        if (!transitionRuntime.canBeginInteractivePop()) return undefined
        const cancelling = transitionRuntime
          .descriptors()
          .find(transition => transition.controller.interactionPhase === 'cancelling')?.controller
        if (cancelling && isInteractiveTransitionController(cancelling)) {
          cancelling.resumeInteractive?.()
          return cancelling
        }
        let inheritedPose = 0
        for (const transition of transitionRuntime.descriptors()) {
          inheritedPose = transition.controller.yieldForPop?.() ?? inheritedPose
        }
        const targetEntry = topPoppableEntry()
        if (!targetEntry) return undefined
        const controller = beginTransition(
          [targetEntry.key],
          { interactive: true, operation: 'pop' },
          (capturedState, transitionController) => popStack(capturedState, transitionController),
        )
        if (isInteractiveTransitionController(controller)) {
          if (inheritedPose !== 0) controller.setProgress(inheritedPose)
          return controller
        }
        controller.cancel()
        return undefined
      })
    },
  })

  const navigator: NavigatorStore<Registry> = {
    [navigatorRestoredMounts]: restoredMounts,
    [navigatorFocusRuntime]: focusRuntime,
    [navigatorScrollRuntime]: scrollRuntime,
    [navigatorTransitionRuntime]: transitionRuntime,
    registry,
    ...(options.restoration ? { restoration: options.restoration } : {}),
    activatePath(path) {
      if (transitionRuntime.descriptors().some(t => gestureOwnsTransition(t.controller)))
        return false
      const decoded = createRouteCodec(registry).decodePath(path)
      const root = state.entries[0]!
      const targets =
        decoded[0]?.screen === root.screenId
          ? decoded
          : [{ screen: root.screenId, params: root.params }, ...decoded]
      // Cancel a pop whose outgoing entry is part of the requested path. Finishing
      // it first would collect that entry's draft before we could reuse its key.
      for (const controller of inFlightControllers()) {
        const reusesExiting = state.entries.some(
          (entry, index) =>
            entry.transition.controller === controller &&
            entry.transition.phase === 'exiting' &&
            targets[index]?.screen === entry.screenId &&
            sameRouteParams(targets[index]?.params, entry.params),
        )
        if (reusesExiting) controller.cancel()
        else controller.finish()
      }
      const entries = targets.map((route, index) => {
        const previous = state.entries[index]
        if (
          previous &&
          previous.screenId === route.screen &&
          sameRouteParams(previous.params, route.params)
        )
          return previous
        const controller = createSettledController()
        return {
          ...createEntry(route.screen as ScreenId<Registry>, route.params, controller),
          transition: { controller, phase: 'settled' as const },
        }
      })
      prepareKeyboardForNavigation()
      publish({ entries: entries as RegistryScreenEntry<Registry>[] })
      return true
    },
    getState,
    subscribe,
    selectDetail(id, ...arguments_) {
      runOperation('selectDetail', () => {
        assertRegistered(registry, id)
        // Settle before replacing the branch, including interactive cancellation.
        for (const descriptor of transitionRuntime.descriptors()) {
          if (descriptor.interactive) descriptor.controller.cancel()
          else descriptor.controller.finish()
        }
        focusRuntime.capture(state.entries.map(entry => entry.key))
        prepareKeyboardForNavigation()
        const captured = captureEntries(
          state,
          state.entries.map(entry => entry.key),
        )
        const root = captured.entries[0]!
        const controller = createSettledController()
        const entry = createEntry(id, arguments_[0], controller)
        focusRuntime.request(entry.key, 'select-detail')
        publish({ entries: [root, { ...entry, transition: { controller, phase: 'settled' } }] })
      })
    },
    push(id, ...arguments_) {
      return runOperation('push', () => {
        assertRegistered(registry, id)
        const [params] = arguments_
        // A held/cancelling pop owns the exposed destination. Never turn its
        // cancellation into completion because an activation raced React.
        const active = [...inFlightControllers()]
        if (active.some(gestureOwnsTransition)) return false
        for (const controller of active) {
          if (controller.finishForPush) controller.finishForPush()
          else controller.finish()
        }
        const topEntry = state.entries.at(-1)
        beginTransition(
          topEntry ? [topEntry.key] : [],
          { interactive: false, operation: 'push' },
          (capturedState, controller) =>
            pushStack(capturedState, createEntry(id, params, controller)),
        )
        return true
      })
    },
    pop() {
      runOperation('pop', () => {
        finishInFlightTransitions('entering')
        const targetEntry = topPoppableEntry()
        if (!targetEntry) return
        beginTransition(
          [targetEntry.key],
          { interactive: false, operation: 'pop' },
          (capturedState, controller) => popStack(capturedState, controller),
        )
      })
    },
    popToRoot() {
      runOperation('popToRoot', () => {
        finishInFlightTransitions('entering')
        const outgoingEntries = state.entries
          .slice(1)
          .filter(entry => entry.transition.phase !== 'exiting')
        if (outgoingEntries.length === 0) return
        beginTransition(
          outgoingEntries.map(entry => entry.key),
          { interactive: false, operation: 'popToRoot' },
          (capturedState, controller) => popToRootStack(capturedState, controller),
        )
      })
    },
    replace(id, ...arguments_) {
      runOperation('replace', () => {
        assertRegistered(registry, id)
        const [params] = arguments_
        finishInFlightTransitions()
        const topEntry = state.entries.at(-1)
        beginTransition(
          topEntry ? [topEntry.key] : [],
          { interactive: false, operation: 'replace' },
          (capturedState, controller) =>
            replaceStack(capturedState, createEntry(id, params, controller), controller),
        )
      })
    },
  }

  if (options.launchPath) navigator.activatePath(options.launchPath)
  else if (options.restoration) checkpointNavigation()
  return Object.freeze(navigator)
}
