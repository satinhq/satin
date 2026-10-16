import { describe, expect, it } from 'vitest'
import type {
  NavigatorState,
  ScreenEntry,
  TransitionController,
  TransitionOperation,
  TransitionPhase,
} from './types.ts'
import {
  createSplitNavigationState,
  reduceSplitNavigation,
  type SplitNavigationTransition,
} from './splitState.ts'

function controller(progress = 0): TransitionController {
  return {
    progress,
    cancel() {},
    finish() {},
  }
}

const settledController = controller(1)

function entry(
  key: string,
  phase: TransitionPhase = 'settled',
  transitionController: TransitionController = settledController,
): ScreenEntry {
  return {
    key,
    params: undefined,
    presentation: 'push',
    screenId: key,
    scrollSnapshot: new Map([['primary', { x: 0, y: key.length * 10 }]]),
    transition: { controller: transitionController, phase },
  }
}

function navigator(...entries: ScreenEntry[]): NavigatorState {
  return { entries }
}

function transition(
  transitionController: TransitionController,
  operation: TransitionOperation,
  interactive = false,
): SplitNavigationTransition {
  return { controller: transitionController, interactive, operation }
}

describe('split navigation state machine', () => {
  it('round-trips one logical stack without changing entry or scroll identity', () => {
    const root = entry('settings')
    const general = entry('general')
    const about = entry('about')
    const stack = navigator(root, general, about)
    let state = createSplitNavigationState('compact', stack)

    state = reduceSplitNavigation(state, {
      horizontal: 'regular',
      type: 'horizontal-class-changed',
    }).state

    expect(state.projection).toMatchObject({
      mode: 'split',
      selectionEntryKey: general.key,
      sidebarEntry: root,
    })
    if (state.projection.mode !== 'split') throw new Error('Expected split projection.')
    expect(state.projection.detailEntries).toEqual([general, about])
    expect(state.projection.detailEntries[0]).toBe(general)
    expect(state.projection.detailEntries[1]?.scrollSnapshot).toBe(about.scrollSnapshot)

    state = reduceSplitNavigation(state, {
      horizontal: 'compact',
      type: 'horizontal-class-changed',
    }).state
    if (state.projection.mode !== 'stack') throw new Error('Expected stack projection.')
    expect(state.projection.entries).toBe(stack.entries)
    expect(state.projection.selectionEntryKey).toBe(general.key)
  })

  it('finishes a mid-push before expanding and selects the entered detail root', () => {
    const push = controller(0.35)
    const root = entry('settings')
    const general = entry('general', 'entering', push)
    let state = createSplitNavigationState('compact', navigator(root, general), [
      transition(push, 'push'),
    ])

    const requested = reduceSplitNavigation(state, {
      horizontal: 'regular',
      type: 'horizontal-class-changed',
    })
    state = requested.state
    expect(requested.commands).toEqual([
      {
        controller: push,
        operation: 'push',
        type: 'finish-transition',
      },
    ])
    expect(state.appliedHorizontalClass).toBe('compact')
    expect(state.pendingHorizontalClass).toBe('regular')

    const settledGeneral = {
      ...general,
      transition: { controller: push, phase: 'settled' as const },
    }
    const synchronized = reduceSplitNavigation(state, {
      navigator: navigator(root, settledGeneral),
      transitions: [],
      type: 'navigator-synchronized',
    })
    expect(synchronized.commands).toEqual([])
    expect(synchronized.state.appliedHorizontalClass).toBe('regular')
    expect(synchronized.state.projection).toMatchObject({
      mode: 'split',
      selectionEntryKey: general.key,
    })
  })

  it('finishes a mid-pop before collapsing', () => {
    const pop = controller(0.6)
    const root = entry('settings')
    const general = entry('general', 'exiting', pop)
    let state = createSplitNavigationState('regular', navigator(root, general), [
      transition(pop, 'pop'),
    ])

    const requested = reduceSplitNavigation(state, {
      horizontal: 'compact',
      type: 'horizontal-class-changed',
    })
    state = requested.state
    expect(requested.commands[0]).toMatchObject({
      controller: pop,
      type: 'finish-transition',
    })

    state = reduceSplitNavigation(state, {
      navigator: navigator(root),
      transitions: [],
      type: 'navigator-synchronized',
    }).state
    expect(state.appliedHorizontalClass).toBe('compact')
    expect(state.projection).toMatchObject({ mode: 'stack' })
    if (state.projection.mode !== 'stack') throw new Error('Expected stack projection.')
    expect(state.projection.entries).toEqual([root])
    expect(state.projection.selectionEntryKey).toBeUndefined()
  })

  it('cancels a mid-gesture interactive pop before changing class', () => {
    const pop = controller(0.42)
    const root = entry('settings')
    const general = entry('general', 'exiting', pop)
    let state = createSplitNavigationState('compact', navigator(root, general), [
      transition(pop, 'pop', true),
    ])

    const requested = reduceSplitNavigation(state, {
      horizontal: 'regular',
      type: 'horizontal-class-changed',
    })
    state = requested.state
    expect(requested.commands).toEqual([
      {
        controller: pop,
        operation: 'pop',
        type: 'cancel-interactive-transition',
      },
    ])

    const restoredGeneral = {
      ...general,
      transition: { controller: pop, phase: 'settled' as const },
    }
    state = reduceSplitNavigation(state, {
      navigator: navigator(root, restoredGeneral),
      transitions: [],
      type: 'navigator-synchronized',
    }).state
    expect(state.appliedHorizontalClass).toBe('regular')
    expect(state.projection).toMatchObject({
      mode: 'split',
      selectionEntryKey: general.key,
    })
  })

  it('settles every 4c stacked-pop controller once before changing class', () => {
    const firstPop = controller(0.5)
    const secondPop = controller(0.2)
    const root = entry('settings')
    const general = entry('general', 'exiting', secondPop)
    const about = entry('about', 'exiting', firstPop)
    let state = createSplitNavigationState('compact', navigator(root, general, about), [
      transition(firstPop, 'pop'),
      transition(secondPop, 'pop'),
    ])

    const requested = reduceSplitNavigation(state, {
      horizontal: 'regular',
      type: 'horizontal-class-changed',
    })
    state = requested.state
    expect(requested.commands.map(command => command.controller)).toEqual([secondPop, firstPop])

    const stillPending = reduceSplitNavigation(state, {
      navigator: navigator(root, general),
      transitions: [transition(secondPop, 'pop')],
      type: 'navigator-synchronized',
    })
    state = stillPending.state
    expect(stillPending.commands).toEqual([])
    expect(state.appliedHorizontalClass).toBe('compact')

    state = reduceSplitNavigation(state, {
      navigator: navigator(root),
      transitions: [],
      type: 'navigator-synchronized',
    }).state
    expect(state.appliedHorizontalClass).toBe('regular')
  })

  it('coalesces a pending class change back to the applied class', () => {
    const push = controller(0.1)
    const root = entry('settings')
    const general = entry('general', 'entering', push)
    let state = createSplitNavigationState('compact', navigator(root, general), [
      transition(push, 'push'),
    ])
    state = reduceSplitNavigation(state, {
      horizontal: 'regular',
      type: 'horizontal-class-changed',
    }).state

    const coalesced = reduceSplitNavigation(state, {
      horizontal: 'compact',
      type: 'horizontal-class-changed',
    })
    expect(coalesced.commands).toEqual([])
    expect(coalesced.state.pendingHorizontalClass).toBeUndefined()
    expect(coalesced.state.appliedHorizontalClass).toBe('compact')
  })

  it('rejects snapshots that cannot identify transition ownership honestly', () => {
    const push = controller()
    expect(() =>
      createSplitNavigationState(
        'compact',
        navigator(entry('settings'), entry('general', 'entering', push)),
      ),
    ).toThrow('Every in-flight Navigator controller needs exactly one transition descriptor')
    expect(() =>
      createSplitNavigationState(
        'compact',
        navigator(entry('settings'), entry('general', 'entering', push)),
        [transition(push, 'replace', true)],
      ),
    ).toThrow('Only a pop transition can own an interactive back gesture')
  })
})
