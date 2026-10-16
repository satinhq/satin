import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScreenRegistry, defineScreen } from './registry.ts'
import { interactiveControllerFactory } from '../../test/navigationControllers.ts'
import {
  cancelStackTransition,
  finishStackTransition,
  popStack,
  popToRootStack,
  pushStack,
  replaceStack,
  setEntryScrollSnapshot,
  isEntryCovered,
  shouldRestoreOnUncover,
} from './stack.ts'
import { createNavigator, navigatorScrollRuntime, navigatorTransitionRuntime } from './store.ts'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import type {
  NavigatorState,
  ScreenEntry,
  TransitionCompletion,
  TransitionController,
  TransitionControllerFactory,
} from './types.ts'

function EmptyScreen() {
  return null
}

function controller(progress = 0): TransitionController {
  return {
    progress,
    finish() {},
    cancel() {},
  }
}

function deferredControllerFactory() {
  const controllers: TransitionController[] = []
  const factory: TransitionControllerFactory = (completion: TransitionCompletion) => {
    let completed = false
    let progress = 0
    const transitionController: TransitionController = {
      get progress() {
        return progress
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
    controllers.push(transitionController)
    return transitionController
  }

  return { controllers, factory }
}

function entry(
  key: string,
  screenId: string,
  phase: ScreenEntry['transition']['phase'] = 'settled',
  transitionController = controller(phase === 'settled' ? 1 : 0),
): ScreenEntry {
  return {
    key,
    params: undefined,
    presentation: 'push',
    screenId,
    transition: {
      controller: transitionController,
      phase,
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('pure navigator stack operations', () => {
  it('stores a typed per-surface snapshot without mutating other entries', () => {
    const root = entry('one-0', 'one')
    const second = entry('two-1', 'two')
    const state: NavigatorState = { entries: [root, second] }
    const snapshot = new Map([
      ['feed', { x: 0, y: 412 }],
      ['rail', { x: 88, y: 0 }],
    ])
    const next = setEntryScrollSnapshot(state, root.key, snapshot)

    expect(next).not.toBe(state)
    expect(next.entries[0]?.scrollSnapshot).toBe(snapshot)
    expect(next.entries[1]).toBe(second)
    expect(setEntryScrollSnapshot(next, root.key, new Map(snapshot))).toBe(next)
  })

  it('pushes an entering screen without mutating the covered entry', () => {
    const root = entry('one-0', 'one')
    const state: NavigatorState = { entries: [root] }
    const entering = entry('two-1', 'two', 'entering')
    const next = pushStack(state, entering)

    expect(next).not.toBe(state)
    expect(state.entries).toEqual([root])
    expect(next.entries).toEqual([root, entering])
  })

  it('keeps a popped entry until its transition finishes', () => {
    const transitionController = controller()
    const state: NavigatorState = {
      entries: [entry('one-0', 'one'), entry('two-1', 'two')],
    }
    const exiting = popStack(state, transitionController)

    expect(exiting.entries).toHaveLength(2)
    expect(exiting.entries[1]?.transition).toEqual({
      controller: transitionController,
      phase: 'exiting',
    })
    expect(finishStackTransition(exiting, transitionController).entries).toEqual([state.entries[0]])
  })

  it('targets the next non-exiting entry during stacked pops', () => {
    const firstController = controller()
    const secondController = controller()
    const state: NavigatorState = {
      entries: [entry('one-0', 'one'), entry('two-1', 'two'), entry('three-2', 'three')],
    }
    const firstPop = popStack(state, firstController)
    const secondPop = popStack(firstPop, secondController)

    expect(secondPop.entries.map(item => item.transition.phase)).toEqual([
      'settled',
      'exiting',
      'exiting',
    ])
    expect(secondPop.entries[1]?.transition.controller).toBe(secondController)
    expect(secondPop.entries[2]?.transition.controller).toBe(firstController)
  })

  it('does not pop the root entry', () => {
    const state: NavigatorState = { entries: [entry('one-0', 'one')] }
    expect(popStack(state, controller())).toBe(state)
    expect(popToRootStack(state, controller())).toBe(state)
  })

  it('marks every non-root entry exiting for popToRoot', () => {
    const transitionController = controller()
    const state: NavigatorState = {
      entries: [entry('one-0', 'one'), entry('two-1', 'two'), entry('three-2', 'three')],
    }
    const exiting = popToRootStack(state, transitionController)

    expect(exiting.entries.map(item => item.transition.phase)).toEqual([
      'settled',
      'exiting',
      'exiting',
    ])
    expect(finishStackTransition(exiting, transitionController).entries).toEqual([state.entries[0]])
  })

  it('keeps both sides of replace until completion and restores on cancel', () => {
    const transitionController = controller()
    const state: NavigatorState = {
      entries: [entry('one-0', 'one'), entry('two-1', 'two')],
    }
    const replacement = entry('three-2', 'three', 'entering', transitionController)
    const replacing = replaceStack(state, replacement, transitionController)

    expect(replacing.entries.map(item => item.transition.phase)).toEqual([
      'settled',
      'exiting',
      'entering',
    ])
    expect(finishStackTransition(replacing, transitionController).entries).toEqual([
      state.entries[0],
      expect.objectContaining({ key: 'three-2' }),
    ])
    expect(cancelStackTransition(replacing, transitionController).entries).toEqual([
      state.entries[0],
      expect.objectContaining({
        key: 'two-1',
        transition: expect.objectContaining({ phase: 'settled' }),
      }),
    ])
  })
})

describe('navigator store and screen registry', () => {
  const one = defineScreen('one', { component: EmptyScreen })
  const two = defineScreen<'two', { source: string }>('two', {
    component: EmptyScreen,
  })
  const three = defineScreen('three', { component: EmptyScreen })
  const registry = createScreenRegistry(one, two, three)

  it('rejects duplicate registrations and unregistered pushes', () => {
    expect(() => createScreenRegistry(one, one)).toThrow('already registered')

    const navigator = createNavigator({ registry, initial: { id: 'one' } })
    const compileInvalidCalls = () => {
      // @ts-expect-error Screen two requires its declared params.
      navigator.push('two')
      // @ts-expect-error The source param must be a string.
      navigator.push('two', { source: 2 })
      // @ts-expect-error The registry does not contain this id.
      navigator.push('missing')
    }
    expect(compileInvalidCalls).toBeTypeOf('function')
    expect(() => navigator.push('missing' as 'one')).toThrow('screen "missing" is not registered')
  })

  it('publishes transition phases before the instant controller settles them', () => {
    const navigator = createNavigator({ registry, initial: { id: 'one' } })
    const observed: string[][] = []
    navigator.subscribe(() => {
      observed.push(navigator.getState().entries.map(item => item.transition.phase))
    })

    navigator.push('two', { source: 'unit-test' })

    expect(observed).toEqual([
      ['settled', 'entering'],
      ['settled', 'settled'],
    ])
    expect(navigator.getState().entries[1]).toMatchObject({
      params: { source: 'unit-test' },
      screenId: 'two',
      transition: { phase: 'settled' },
    })
  })

  it('supports pop, popToRoot, and replace without changing the root identity', () => {
    const navigator = createNavigator({ registry, initial: { id: 'one' } })
    const rootKey = navigator.getState().entries[0]?.key

    navigator.push('two', { source: 'unit-test' })
    navigator.replace('three')
    expect(navigator.getState().entries.map(item => item.screenId)).toEqual(['one', 'three'])

    navigator.push('two', { source: 'second-push' })
    navigator.pop()
    expect(navigator.getState().entries.map(item => item.screenId)).toEqual(['one', 'three'])

    navigator.push('two', { source: 'third-push' })
    navigator.popToRoot()
    expect(navigator.getState().entries).toEqual([
      expect.objectContaining({ key: rootKey, screenId: 'one' }),
    ])
  })

  it('captures mounted surfaces into the covered entry before publishing a push', () => {
    const navigator = createNavigator({ registry, initial: { id: 'one' } })
    const root = navigator.getState().entries[0]!
    const surfaceRegistry = createScrollSurfaceRegistry({ development: true })
    const element = {
      scrollLeft: 0,
      scrollTop: 237,
      scrollTo: vi.fn(),
    }
    surfaceRegistry.register({
      axis: 'vertical',
      element,
      id: 'feed',
      primary: true,
    })
    navigator[navigatorScrollRuntime].bind(root.key, surfaceRegistry)

    navigator.push('three')

    expect(navigator.getState().entries[0]?.scrollSnapshot?.get('feed')).toEqual({
      x: 0,
      y: 237,
    })
  })

  it('accepts only push presentation in typed navigation calls', () => {
    const navigator = createNavigator({ registry, initial: { id: 'one' } })
    const compileInvalidCalls = () => {
      // @ts-expect-error Sheet is not a public presentation kind yet.
      createNavigator({ registry, initial: { id: 'one', presentation: 'sheet' } })
      // @ts-expect-error Fullscreen is not a public presentation kind yet.
      navigator.replace('three', undefined, { presentation: 'fullscreen' })
    }

    expect(compileInvalidCalls).toBeTypeOf('function')
    navigator.push('three', undefined, { presentation: 'push' })
    expect(navigator.getState().entries.at(-1)?.presentation).toBe('push')
  })

  it('keeps both controllers owned when pop is requested during pop', () => {
    const deferred = deferredControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory: deferred.factory,
    })
    navigator.push('two', { source: 'first' })
    deferred.controllers.at(-1)?.finish()
    navigator.push('three')
    deferred.controllers.at(-1)?.finish()

    navigator.pop()
    const firstPop = deferred.controllers.at(-1)!
    navigator.pop()
    const secondPop = deferred.controllers.at(-1)!

    expect(navigator.getState().entries.map(item => item.transition.phase)).toEqual([
      'settled',
      'exiting',
      'exiting',
    ])
    expect(navigator.getState().entries[1]?.transition.controller).toBe(secondPop)
    expect(navigator.getState().entries[2]?.transition.controller).toBe(firstPop)

    firstPop.finish()
    expect(navigator.getState().entries.map(item => item.screenId)).toEqual(['one', 'two'])
    secondPop.finish()
    expect(navigator.getState().entries.map(item => item.screenId)).toEqual(['one'])
  })

  it('finishes an in-flight pop before starting a push', () => {
    const deferred = deferredControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory: deferred.factory,
    })
    navigator.push('three')
    deferred.controllers.at(-1)?.finish()

    navigator.pop()
    const popController = deferred.controllers.at(-1)!
    navigator.push('two', { source: 'after-pop' })
    const pushController = deferred.controllers.at(-1)!

    expect(popController.progress).toBe(1)
    expect(pushController).not.toBe(popController)
    expect(navigator.getState().entries).toEqual([
      expect.objectContaining({
        screenId: 'one',
        transition: expect.objectContaining({ phase: 'settled' }),
      }),
      expect.objectContaining({
        screenId: 'two',
        transition: expect.objectContaining({ phase: 'entering' }),
      }),
    ])
  })

  it('finishes an entering push before starting its requested pop', () => {
    const deferred = deferredControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory: deferred.factory,
    })

    navigator.push('three')
    const pushController = deferred.controllers.at(-1)!
    navigator.pop()
    const popController = deferred.controllers.at(-1)!

    expect(pushController.progress).toBe(1)
    expect(popController).not.toBe(pushController)
    expect(navigator.getState().entries.at(-1)?.transition).toEqual({
      controller: popController,
      phase: 'exiting',
    })
    popController.finish()
    expect(navigator.getState().entries.map(item => item.screenId)).toEqual(['one'])
  })

  it('covers an entry only when a settled screen sits above it', () => {
    const deferred = deferredControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory: deferred.factory,
    })

    navigator.push('three')
    expect(isEntryCovered(navigator.getState().entries, 0)).toBe(false)
    expect(shouldRestoreOnUncover(false, false)).toBe(false)
    deferred.controllers.at(-1)?.cancel()
    expect(isEntryCovered(navigator.getState().entries, 0)).toBe(false)
    expect(shouldRestoreOnUncover(false, false)).toBe(false)

    navigator.push('three')
    deferred.controllers.at(-1)?.finish()
    expect(isEntryCovered(navigator.getState().entries, 0)).toBe(true)

    navigator.pop()
    expect(navigator.getState().entries.at(-1)?.transition.phase).toBe('exiting')
    expect(isEntryCovered(navigator.getState().entries, 0)).toBe(false)
  })

  it('reports a history length change caused during an operation', () => {
    let historyLength = 4
    vi.stubGlobal('window', {
      history: {
        get length() {
          return historyLength
        },
      },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const navigator = createNavigator({ registry, initial: { id: 'one' } })
    navigator.subscribe(() => {
      historyLength = 5
    })

    navigator.push('three')

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('history changed from 4 to 5 during push'),
      expect.objectContaining({ operation: 'push' }),
    )
  })

  it('lets a transition subscriber cancel before the instant finish', () => {
    const finish = vi.fn()
    const cancel = vi.fn()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory(completion) {
        let progress = 0
        let completed = false
        return {
          get progress() {
            return progress
          },
          finish() {
            if (completed) return
            completed = true
            progress = 1
            finish()
            completion.finish()
          },
          cancel() {
            if (completed) return
            completed = true
            progress = 0
            cancel()
            completion.cancel()
          },
        }
      },
    })
    const unsubscribe = navigator.subscribe(() => {
      const top = navigator.getState().entries.at(-1)
      if (top?.transition.phase === 'entering') top.transition.controller.cancel()
    })

    navigator.push('three')
    unsubscribe()

    expect(cancel).toHaveBeenCalledOnce()
    expect(finish).not.toHaveBeenCalled()
    expect(navigator.getState().entries.map(item => item.screenId)).toEqual(['one'])
  })

  it('publishes interactive progress only at begin and cancel boundaries', () => {
    const interactive = interactiveControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory: interactive.factory,
    })
    navigator.push('three')
    const published: string[][] = []
    navigator.subscribe(() => {
      published.push(navigator.getState().entries.map(item => item.transition.phase))
    })

    const controller = navigator[navigatorTransitionRuntime].beginInteractivePop()!
    controller.setProgress(0.2)
    controller.setProgress(0.6)

    expect(controller.progress).toBe(0.6)
    expect(published).toEqual([['settled', 'exiting']])
    controller.cancelInteractive(0)
    expect(published).toEqual([
      ['settled', 'exiting'],
      ['settled', 'settled'],
    ])
    expect(navigator.getState().entries.map(item => item.screenId)).toEqual(['one', 'three'])
    expect(interactive.contexts.at(-1)).toEqual({
      interactive: true,
      operation: 'pop',
    })
  })

  it('ignores a second pan while an animated pop is in flight', () => {
    const interactive = interactiveControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory: interactive.factory,
    })
    navigator.push('three')

    const first = navigator[navigatorTransitionRuntime].beginInteractivePop()

    expect(first).toBeDefined()
    expect(navigator[navigatorTransitionRuntime].canBeginInteractivePop()).toBe(false)
    expect(navigator[navigatorTransitionRuntime].beginInteractivePop()).toBeUndefined()
    expect(navigator.getState().entries.at(-1)?.transition.phase).toBe('exiting')
  })

  it('finishes an interactive pan before a push begins', () => {
    const interactive = interactiveControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory: interactive.factory,
    })
    navigator.push('three')
    const pop = navigator[navigatorTransitionRuntime].beginInteractivePop()!
    pop.setProgress(0.35)

    navigator.push('two', { source: 'after-pan' })

    expect(pop.progress).toBe(1)
    expect(navigator.getState().entries).toEqual([
      expect.objectContaining({ screenId: 'one' }),
      expect.objectContaining({
        params: { source: 'after-pan' },
        screenId: 'two',
        transition: expect.objectContaining({ phase: 'settled' }),
      }),
    ])
  })

  it('does not begin an interactive pop on the root screen', () => {
    const interactive = interactiveControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory: interactive.factory,
    })

    expect(navigator[navigatorTransitionRuntime].canBeginInteractivePop()).toBe(false)
    expect(navigator[navigatorTransitionRuntime].beginInteractivePop()).toBeUndefined()
    expect(navigator.getState().entries.map(item => item.screenId)).toEqual(['one'])
  })
})

describe('measured-reference detail selection and controller ownership', () => {
  const registry = createScreenRegistry(
    defineScreen('root', { component: EmptyScreen }),
    defineScreen<'detail', { id: string }>('detail', {
      component: EmptyScreen,
      splitSelection: ({ id }) => id,
    }),
    defineScreen('nested', { component: EmptyScreen }),
  )
  it('publishes a whole replacement detail branch once and retains the sidebar identity', () => {
    const { factory } = interactiveControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'root' },
      transitionControllerFactory: factory,
    })
    navigator.push('detail', { id: 'A' })
    navigator.push('nested')
    const root = navigator.getState().entries[0]
    const seen: string[][] = []
    navigator.subscribe(() => seen.push(navigator.getState().entries.map(entry => entry.screenId)))
    navigator.selectDetail('detail', { id: 'B' })
    expect(seen).toEqual([['root', 'detail']])
    expect(navigator.getState().entries[0]).toBe(root)
    expect(navigator.getState().entries[1]?.params).toEqual({ id: 'B' })
    expect(navigator.getState().entries.every(entry => entry.transition.phase === 'settled')).toBe(
      true,
    )
  })
  it('exposes real interactive descriptors and removes them on cancellation', () => {
    const { factory } = interactiveControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'root' },
      transitionControllerFactory: factory,
    })
    navigator.push('detail', { id: 'A' })
    const controller = navigator[navigatorTransitionRuntime].beginInteractivePop()!
    expect(navigator[navigatorTransitionRuntime].descriptors()).toEqual([
      { controller, interactive: true, operation: 'pop' },
    ])
    controller.cancelInteractive(0)
    expect(navigator[navigatorTransitionRuntime].descriptors()).toEqual([])
    expect(navigator.getState().entries).toHaveLength(2)
  })
})

describe('prepared contacts taking over an entering push', () => {
  function setup() {
    const registry = createScreenRegistry(
      defineScreen('root', { component: EmptyScreen }),
      defineScreen('detail', { component: EmptyScreen }),
    )
    const controlled = interactiveControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'root' },
      transitionControllerFactory: (completion, context) => {
        const controller = controlled.factory(completion, context)
        controller.start = () => {}
        return controller
      },
    })
    navigator.push('detail')
    return {
      navigator,
      controlled,
      runtime: navigator[navigatorTransitionRuntime],
      key: navigator.getState().entries.at(-1)!.key,
    }
  }
  it('settles only the matching push and preserves the route when the new pan cancels', () => {
    const { navigator, controlled, runtime, key } = setup()
    expect(runtime.beginInteractivePop()).toBeUndefined()
    const pan = runtime.beginInteractivePop({ interruptPushTo: key })!
    expect(pan).toBeDefined()
    expect(controlled.controllers[0]!.progress).toBe(1)
    expect(navigator.getState().entries.at(-1)?.transition.phase).toBe('exiting')
    pan.cancelInteractive(0)
    expect(navigator.getState().entries.at(-1)).toMatchObject({
      key,
      screenId: 'detail',
      transition: { phase: 'settled' },
    })
  })
  it('does not finish a push for a stale contact from another route', () => {
    const { navigator, controlled, runtime } = setup()
    expect(runtime.beginInteractivePop({ interruptPushTo: 'stale-route' })).toBeUndefined()
    expect(controlled.controllers[0]!.progress).toBe(0)
    expect(navigator.getState().entries.at(-1)?.transition.phase).toBe('entering')
  })
  it.each([false, true])('does not interrupt an existing pop (interactive=%s)', interactive => {
    const { navigator, controlled, runtime, key } = setup()
    controlled.controllers[0]!.finish()
    if (interactive) runtime.beginInteractivePop()
    else navigator.pop()
    expect(runtime.beginInteractivePop({ interruptPushTo: key })).toBeUndefined()
    expect(navigator.getState().entries.at(-1)?.transition.phase).toBe('exiting')
  })
})

it.each(['held', 'cancelling', 'completing'] as const)(
  'preserves %s pop ownership when destination activation calls push',
  phase => {
    const registry = createScreenRegistry(
      defineScreen('home', { component: EmptyScreen }),
      defineScreen('detail', { component: EmptyScreen }),
    )
    let transfer = vi.fn()
    const navigator = createNavigator({
      registry,
      initial: { id: 'home' },
      transitionControllerFactory(completion, context) {
        transfer = vi.fn(completion.finish)
        return {
          progress: 0,
          interactionPhase: context.operation === 'pop' ? phase : 'completing',
          start() {
            if (context.operation === 'push') completion.finish()
          },
          finish: completion.finish,
          cancel: completion.cancel,
          finishForPush: transfer,
        }
      },
    })
    navigator.push('detail')
    navigator.pop()
    const popTransfer = transfer
    const keys = navigator.getState().entries.map(entry => entry.key)
    navigator.push('detail')
    if (phase === 'completing') {
      expect(popTransfer).toHaveBeenCalledOnce()
      expect(navigator.getState().entries.at(-1)!.key).not.toBe(keys.at(-1))
    } else {
      expect(popTransfer).not.toHaveBeenCalled()
      expect(navigator.getState().entries.map(entry => entry.key)).toEqual(keys)
      expect(navigator.getState().entries.at(-1)!.transition.phase).toBe('exiting')
    }
  },
)

it.each(['finish-old-first', 'cancel-new-first'] as const)(
  'accepts a next swipe during completing pop and preserves ownership: %s',
  order => {
    const registry = createScreenRegistry(
      defineScreen('home', { component: EmptyScreen }),
      defineScreen('detail', { component: EmptyScreen }),
    )
    const navigator = createNavigator({
      registry,
      initial: { id: 'home' },
      transitionControllerFactory(completion, context) {
        let phase: 'held' | 'completing' | 'cancelling' = context.interactive
          ? 'held'
          : 'completing'
        return {
          progress: 0,
          get interactionPhase() {
            return phase
          },
          start() {
            if (context.operation === 'push') completion.finish()
          },
          setProgress() {},
          completeInteractive() {
            phase = 'completing'
          },
          cancelInteractive() {
            phase = 'cancelling'
          },
          finish: completion.finish,
          cancel: completion.cancel,
        }
      },
    })
    navigator.push('detail')
    navigator.push('detail')
    const keys = navigator.getState().entries.map(entry => entry.key)
    const runtime = navigator[navigatorTransitionRuntime]
    const first = runtime.beginInteractivePop()!
    expect(runtime.canBeginInteractivePop()).toBe(false)
    first.completeInteractive(1000)
    expect(runtime.canBeginInteractivePop()).toBe(true)
    const next = runtime.beginInteractivePop()!
    expect(next).toBeDefined()
    expect(runtime.canBeginInteractivePop()).toBe(false)
    if (order === 'finish-old-first') {
      first.finish()
      next.cancel()
    } else {
      next.cancel()
      first.finish()
    }
    expect(navigator.getState().entries.map(entry => entry.key)).toEqual(keys.slice(0, 2))
    expect(runtime.descriptors()).toHaveLength(0)
    expect(runtime.canBeginInteractivePop()).toBe(true)
  },
)
