import { describe, expect, it } from 'vitest'
import {
  activeFocusScopeKey,
  createFocusIntentState,
  reduceFocusIntent,
  type FocusIntentEvent,
  type FocusIntentState,
  type FocusLocation,
  type FocusScopeDefinition,
} from './focusIntentMachine.ts'

function scope(
  key: string,
  readiness: FocusScopeDefinition['readiness'] = 'ready',
): FocusScopeDefinition {
  return {
    initialTarget: `${key}:title`,
    key,
    readiness,
    title: `${key.toUpperCase()} title`,
  }
}

function location(scopeKey: string, target: string): FocusLocation {
  return { scopeKey, target }
}

function send(state: FocusIntentState, event: FocusIntentEvent) {
  return reduceFocusIntent(state, event)
}

function pushAndSettle(
  state: FocusIntentState,
  fromKey: string,
  toKey: string,
  activeTarget: string,
): FocusIntentState {
  const transitionId = `push-${fromKey}-${toKey}`
  const begun = send(state, {
    activeFocus: location(fromKey, activeTarget),
    fromKey,
    to: scope(toKey),
    transitionId,
    type: 'push-begin',
  })
  return send(begun.state, {
    outcome: 'completed',
    transitionId,
    type: 'push-settle',
  }).state
}

describe('focus intent machine', () => {
  it('starts with one settled route and no focus command', () => {
    const state = createFocusIntentState(scope('root'))

    expect(state.routes).toEqual([
      expect.objectContaining({ key: 'root', phase: 'settled', ready: true }),
    ])
    expect(state.transitions).toEqual([])
    expect(activeFocusScopeKey(state)).toBe('root')
  })

  it('captures before push and moves only after the destination settles', () => {
    const initial = createFocusIntentState(scope('root'))
    const begun = send(initial, {
      activeFocus: location('root', 'root:row-2'),
      fromKey: 'root',
      to: scope('detail'),
      transitionId: 'push-detail',
      type: 'push-begin',
    })

    expect(begun.commands).toEqual([{ location: location('root', 'root:row-2'), type: 'capture' }])
    expect(begun.state.routes.map(route => route.phase)).toEqual(['settled', 'entering'])
    expect(activeFocusScopeKey(begun.state)).toBeUndefined()

    const settled = send(begun.state, {
      outcome: 'completed',
      transitionId: 'push-detail',
      type: 'push-settle',
    })

    expect(settled.commands).toEqual([
      {
        location: location('detail', 'detail:title'),
        reason: 'push',
        type: 'move-to',
      },
    ])
    expect(activeFocusScopeKey(settled.state)).toBe('detail')
  })

  it('waits for a lazy destination and consumes lazy-ready once', () => {
    const begun = send(createFocusIntentState(scope('root')), {
      fromKey: 'root',
      to: scope('detail', 'lazy'),
      transitionId: 'push-detail',
      type: 'push-begin',
    })
    const settled = send(begun.state, {
      outcome: 'completed',
      transitionId: 'push-detail',
      type: 'push-settle',
    })

    expect(settled.commands).toEqual([])
    expect(settled.state.pending).toEqual({
      kind: 'initial',
      reason: 'push',
      scopeKey: 'detail',
    })

    const ready = send(settled.state, {
      scopeKey: 'detail',
      target: 'detail:loaded-heading',
      type: 'lazy-ready',
    })
    expect(ready.commands).toEqual([
      {
        location: location('detail', 'detail:loaded-heading'),
        reason: 'push',
        type: 'move-to',
      },
    ])

    const duplicate = send(ready.state, {
      scopeKey: 'detail',
      type: 'lazy-ready',
    })
    expect(duplicate.commands).toEqual([])
    expect(duplicate.state).toBe(ready.state)
  })

  it('restores the source when an entering push is cancelled', () => {
    const begun = send(createFocusIntentState(scope('root')), {
      activeFocus: location('root', 'root:row-4'),
      fromKey: 'root',
      to: scope('detail'),
      transitionId: 'push-detail',
      type: 'push-begin',
    })
    const cancelled = send(begun.state, {
      outcome: 'cancelled',
      transitionId: 'push-detail',
      type: 'push-settle',
    })

    expect(cancelled.state.routes.map(route => route.key)).toEqual(['root'])
    expect(cancelled.commands).toEqual([
      {
        fallback: location('root', 'root:title'),
        location: location('root', 'root:row-4'),
        reason: 'transition-cancel',
        type: 'restore',
      },
    ])
  })

  it('restores the revealed route after a completed pop', () => {
    const detail = pushAndSettle(
      createFocusIntentState(scope('root')),
      'root',
      'detail',
      'root:row-3',
    )
    const begun = send(detail, {
      activeFocus: location('detail', 'detail:button'),
      toKey: 'root',
      transitionId: 'pop-detail',
      type: 'pop-begin',
    })

    expect(begun.commands).toEqual([
      { location: location('detail', 'detail:button'), type: 'capture' },
    ])
    const settled = send(begun.state, {
      outcome: 'completed',
      transitionId: 'pop-detail',
      type: 'pop-settle',
    })

    expect(settled.commands).toEqual([
      {
        fallback: location('root', 'root:title'),
        location: location('root', 'root:row-3'),
        reason: 'pop',
        type: 'restore',
      },
    ])
    expect(settled.state.routes.map(route => route.key)).toEqual(['root'])
  })

  it('moves to the revealed heading when no captured element exists', () => {
    const pushed = send(createFocusIntentState(scope('root')), {
      fromKey: 'root',
      to: scope('detail'),
      transitionId: 'push-detail',
      type: 'push-begin',
    })
    const detail = send(pushed.state, {
      outcome: 'completed',
      transitionId: 'push-detail',
      type: 'push-settle',
    })
    const popping = send(detail.state, {
      toKey: 'root',
      transitionId: 'pop-detail',
      type: 'pop-begin',
    })
    const settled = send(popping.state, {
      outcome: 'completed',
      transitionId: 'pop-detail',
      type: 'pop-settle',
    })

    expect(settled.commands).toEqual([
      {
        location: location('root', 'root:title'),
        reason: 'pop',
        type: 'move-to',
      },
    ])
  })

  it('restores the outgoing route after a cancelled pop', () => {
    const detail = pushAndSettle(
      createFocusIntentState(scope('root')),
      'root',
      'detail',
      'root:row',
    )
    const begun = send(detail, {
      activeFocus: location('detail', 'detail:toggle'),
      toKey: 'root',
      transitionId: 'pop-detail',
      type: 'pop-begin',
    })
    const cancelled = send(begun.state, {
      outcome: 'cancelled',
      transitionId: 'pop-detail',
      type: 'pop-settle',
    })

    expect(cancelled.commands).toEqual([
      {
        fallback: location('detail', 'detail:title'),
        location: location('detail', 'detail:toggle'),
        reason: 'transition-cancel',
        type: 'restore',
      },
    ])
    expect(cancelled.state.routes.map(route => route.key)).toEqual(['root', 'detail'])
  })

  it.each([
    ['pop-top', 'pop-middle'],
    ['pop-middle', 'pop-top'],
  ])(
    'defers restoration across pop-during-pop when %s settles first',
    (firstTransition, secondTransition) => {
      let state = createFocusIntentState(scope('root'))
      state = pushAndSettle(state, 'root', 'middle', 'root:row')
      state = pushAndSettle(state, 'middle', 'top', 'middle:row')

      const firstPop = send(state, {
        activeFocus: location('top', 'top:button'),
        toKey: 'middle',
        transitionId: 'pop-top',
        type: 'pop-begin',
      })
      const secondPop = send(firstPop.state, {
        activeFocus: location('top', 'top:button'),
        toKey: 'root',
        transitionId: 'pop-middle',
        type: 'pop-begin',
      })

      expect(secondPop.state.routes.map(route => route.phase)).toEqual([
        'settled',
        'exiting',
        'exiting',
      ])
      expect(secondPop.commands).toEqual([])

      const firstSettle = send(secondPop.state, {
        outcome: 'completed',
        transitionId: firstTransition,
        type: 'pop-settle',
      })
      expect(firstSettle.commands).toEqual([])

      const secondSettle = send(firstSettle.state, {
        outcome: 'completed',
        transitionId: secondTransition,
        type: 'pop-settle',
      })
      expect(secondSettle.commands).toEqual([
        {
          fallback: location('root', 'root:title'),
          location: location('root', 'root:row'),
          reason: 'pop',
          type: 'restore',
        },
      ])
      expect(secondSettle.state.routes.map(route => route.key)).toEqual(['root'])
    },
  )

  it('supports a single pop-to-root transition over several routes', () => {
    let state = createFocusIntentState(scope('root'))
    state = pushAndSettle(state, 'root', 'middle', 'root:row')
    state = pushAndSettle(state, 'middle', 'top', 'middle:row')

    const begun = send(state, {
      activeFocus: location('top', 'top:button'),
      toKey: 'root',
      transitionId: 'pop-to-root',
      type: 'pop-begin',
    })
    expect(begun.state.routes.map(route => route.phase)).toEqual(['settled', 'exiting', 'exiting'])

    const settled = send(begun.state, {
      outcome: 'completed',
      transitionId: 'pop-to-root',
      type: 'pop-settle',
    })
    expect(settled.state.routes.map(route => route.key)).toEqual(['root'])
    expect(settled.commands.at(-1)).toEqual({
      fallback: location('root', 'root:title'),
      location: location('root', 'root:row'),
      reason: 'pop',
      type: 'restore',
    })
  })

  it('finishes an in-flight pop before push without restoring an intermediate route', () => {
    let state = createFocusIntentState(scope('root'))
    state = pushAndSettle(state, 'root', 'detail', 'root:old-row')
    const popping = send(state, {
      activeFocus: location('detail', 'detail:button'),
      toKey: 'root',
      transitionId: 'pop-detail',
      type: 'pop-begin',
    })

    const pushing = send(popping.state, {
      activeFocus: location('root', 'root:new-row'),
      fromKey: 'root',
      to: scope('next'),
      transitionId: 'push-next',
      type: 'push-begin',
    })
    expect(pushing.commands).toEqual([
      { location: location('root', 'root:new-row'), type: 'capture' },
    ])
    expect(pushing.state.routes.map(route => route.key)).toEqual(['root', 'next'])

    const stalePopSettle = send(pushing.state, {
      outcome: 'completed',
      transitionId: 'pop-detail',
      type: 'pop-settle',
    })
    expect(stalePopSettle.commands).toEqual([])
    expect(stalePopSettle.state).toBe(pushing.state)

    const settled = send(stalePopSettle.state, {
      outcome: 'completed',
      transitionId: 'push-next',
      type: 'push-settle',
    })
    expect(settled.commands).toEqual([
      {
        location: location('next', 'next:title'),
        reason: 'push',
        type: 'move-to',
      },
    ])
  })

  it('finishes an entering push before pop and never focuses the transient route', () => {
    const initial = createFocusIntentState(scope('root'))
    const pushing = send(initial, {
      activeFocus: location('root', 'root:row'),
      fromKey: 'root',
      to: scope('detail'),
      transitionId: 'push-detail',
      type: 'push-begin',
    })
    const popping = send(pushing.state, {
      activeFocus: location('root', 'root:row'),
      toKey: 'root',
      transitionId: 'pop-detail',
      type: 'pop-begin',
    })

    expect(popping.commands).toEqual([])
    expect(popping.state.routes.map(route => route.phase)).toEqual(['settled', 'exiting'])

    const stalePushSettle = send(popping.state, {
      outcome: 'completed',
      transitionId: 'push-detail',
      type: 'push-settle',
    })
    expect(stalePushSettle.commands).toEqual([])

    const settled = send(stalePushSettle.state, {
      outcome: 'completed',
      transitionId: 'pop-detail',
      type: 'pop-settle',
    })
    expect(settled.commands).toEqual([
      {
        fallback: location('root', 'root:title'),
        location: location('root', 'root:row'),
        reason: 'pop',
        type: 'restore',
      },
    ])
  })

  it('keeps the top route when one interleaved pop cancels', () => {
    let state = createFocusIntentState(scope('root'))
    state = pushAndSettle(state, 'root', 'middle', 'root:row')
    state = pushAndSettle(state, 'middle', 'top', 'middle:row')
    const topPop = send(state, {
      activeFocus: location('top', 'top:button'),
      toKey: 'middle',
      transitionId: 'pop-top',
      type: 'pop-begin',
    })
    const middlePop = send(topPop.state, {
      toKey: 'root',
      transitionId: 'pop-middle',
      type: 'pop-begin',
    })
    const topCancelled = send(middlePop.state, {
      outcome: 'cancelled',
      transitionId: 'pop-top',
      type: 'pop-settle',
    })
    expect(topCancelled.commands).toEqual([])

    const middleCompleted = send(topCancelled.state, {
      outcome: 'completed',
      transitionId: 'pop-middle',
      type: 'pop-settle',
    })
    expect(middleCompleted.state.routes.map(route => route.key)).toEqual(['root', 'top'])
    expect(middleCompleted.commands).toEqual([
      {
        fallback: location('top', 'top:title'),
        location: location('top', 'top:button'),
        reason: 'pop',
        type: 'restore',
      },
    ])
  })

  it('captures, enters, traps, and restores a presentation scope', () => {
    const initial = createFocusIntentState(scope('root'))
    const presented = send(initial, {
      activeFocus: location('root', 'root:add-button'),
      presentation: scope('sheet'),
      type: 'present',
    })

    expect(presented.commands).toEqual([
      { location: location('root', 'root:add-button'), type: 'capture' },
      {
        location: location('sheet', 'sheet:title'),
        reason: 'present',
        type: 'move-to',
      },
    ])
    expect(activeFocusScopeKey(presented.state)).toBe('sheet')

    const dismissed = send(presented.state, {
      presentationKey: 'sheet',
      type: 'dismiss',
    })
    expect(dismissed.commands).toEqual([
      {
        fallback: location('root', 'root:title'),
        location: location('root', 'root:add-button'),
        reason: 'dismiss',
        type: 'restore',
      },
    ])
    expect(activeFocusScopeKey(dismissed.state)).toBe('root')
  })

  it('restores nested presentations in stack order', () => {
    const first = send(createFocusIntentState(scope('root')), {
      activeFocus: location('root', 'root:open'),
      presentation: scope('sheet'),
      type: 'present',
    })
    const second = send(first.state, {
      activeFocus: location('sheet', 'sheet:open-alert'),
      presentation: scope('alert'),
      type: 'present',
    })

    expect(activeFocusScopeKey(second.state)).toBe('alert')
    const alertDismissed = send(second.state, {
      presentationKey: 'alert',
      type: 'dismiss',
    })
    expect(alertDismissed.commands).toEqual([
      {
        fallback: location('sheet', 'sheet:title'),
        location: location('sheet', 'sheet:open-alert'),
        reason: 'dismiss',
        type: 'restore',
      },
    ])

    const sheetDismissed = send(alertDismissed.state, {
      presentationKey: 'sheet',
      type: 'dismiss',
    })
    expect(sheetDismissed.commands).toEqual([
      {
        fallback: location('root', 'root:title'),
        location: location('root', 'root:open'),
        reason: 'dismiss',
        type: 'restore',
      },
    ])
  })

  it('inerts the background immediately but delays focus for a lazy presentation', () => {
    const presented = send(createFocusIntentState(scope('root')), {
      activeFocus: location('root', 'root:open'),
      presentation: scope('sheet', 'lazy'),
      type: 'present',
    })

    expect(presented.commands).toEqual([
      { location: location('root', 'root:open'), type: 'capture' },
    ])
    expect(activeFocusScopeKey(presented.state)).toBe('sheet')
    expect(presented.state.pending?.scopeKey).toBe('sheet')

    const ready = send(presented.state, {
      scopeKey: 'sheet',
      target: 'sheet:loaded-title',
      type: 'lazy-ready',
    })
    expect(ready.commands).toEqual([
      {
        location: location('sheet', 'sheet:loaded-title'),
        reason: 'present',
        type: 'move-to',
      },
    ])
  })

  it('focuses an error screen and ignores a later lazy-ready event', () => {
    const begun = send(createFocusIntentState(scope('root')), {
      fromKey: 'root',
      to: scope('detail', 'lazy'),
      transitionId: 'push-detail',
      type: 'push-begin',
    })
    const failed = send(begun.state, {
      kind: 'screen',
      message: 'Could not load details.',
      scopeKey: 'detail',
      target: 'detail:error-heading',
      type: 'error',
    })
    expect(failed.commands).toEqual([])

    const settled = send(failed.state, {
      outcome: 'completed',
      transitionId: 'push-detail',
      type: 'push-settle',
    })
    expect(settled.commands).toEqual([
      {
        location: location('detail', 'detail:error-heading'),
        reason: 'error',
        type: 'move-to',
      },
    ])

    const lateReady = send(settled.state, {
      scopeKey: 'detail',
      target: 'detail:content-heading',
      type: 'lazy-ready',
    })
    expect(lateReady.commands).toEqual([])
    expect(lateReady.state).toBe(settled.state)
  })

  it('moves to an error screen that replaces an active lazy screen', () => {
    const begun = send(createFocusIntentState(scope('root')), {
      fromKey: 'root',
      to: scope('detail', 'lazy'),
      transitionId: 'push-detail',
      type: 'push-begin',
    })
    const settled = send(begun.state, {
      outcome: 'completed',
      transitionId: 'push-detail',
      type: 'push-settle',
    })
    const failed = send(settled.state, {
      kind: 'screen',
      message: 'Could not load details.',
      scopeKey: 'detail',
      target: 'detail:error-heading',
      type: 'error',
    })

    expect(failed.commands).toEqual([
      {
        location: location('detail', 'detail:error-heading'),
        reason: 'error',
        type: 'move-to',
      },
    ])
    expect(failed.state.pending).toBeUndefined()
  })

  it('announces an in-place error only in the active focus scope', () => {
    let state = createFocusIntentState(scope('root'))
    state = pushAndSettle(state, 'root', 'detail', 'root:row')

    const backgroundError = send(state, {
      kind: 'status',
      message: 'Root refresh failed.',
      scopeKey: 'root',
      type: 'error',
    })
    expect(backgroundError.commands).toEqual([])

    const activeError = send(backgroundError.state, {
      kind: 'status',
      message: 'Save failed.',
      scopeKey: 'detail',
      type: 'error',
    })
    expect(activeError.commands).toEqual([
      {
        message: 'Save failed.',
        politeness: 'assertive',
        scopeKey: 'detail',
        type: 'announce',
      },
    ])
  })

  it('rejects stale wiring and invalid presentation order', () => {
    const initial = createFocusIntentState(scope('root'))
    expect(() =>
      send(initial, {
        fromKey: 'wrong',
        to: scope('detail'),
        transitionId: 'push-detail',
        type: 'push-begin',
      }),
    ).toThrow('expected source "root", received "wrong"')

    const sheet = send(initial, {
      presentation: scope('sheet'),
      type: 'present',
    })
    const alert = send(sheet.state, {
      presentation: scope('alert'),
      type: 'present',
    })
    expect(() =>
      send(alert.state, {
        presentationKey: 'sheet',
        type: 'dismiss',
      }),
    ).toThrow('only dismiss the top presentation "alert"')
  })

  it('serializes presentations and navigation transitions', () => {
    const initial = createFocusIntentState(scope('root'))
    const pushing = send(initial, {
      fromKey: 'root',
      to: scope('detail'),
      transitionId: 'push-detail',
      type: 'push-begin',
    })
    expect(() =>
      send(pushing.state, {
        presentation: scope('sheet'),
        type: 'present',
      }),
    ).toThrow('cannot present during a navigation transition')

    const presented = send(initial, {
      presentation: scope('sheet'),
      type: 'present',
    })
    expect(() =>
      send(presented.state, {
        fromKey: 'root',
        to: scope('detail'),
        transitionId: 'push-detail',
        type: 'push-begin',
      }),
    ).toThrow('cannot push while a presentation is active')
    expect(() =>
      send(presented.state, {
        toKey: 'root',
        transitionId: 'pop-root',
        type: 'pop-begin',
      }),
    ).toThrow('cannot pop while a presentation is active')
  })

  it('does not mutate the prior state while beginning a transition', () => {
    const initial = createFocusIntentState(scope('root'))
    const begun = send(initial, {
      activeFocus: location('root', 'root:row'),
      fromKey: 'root',
      to: scope('detail'),
      transitionId: 'push-detail',
      type: 'push-begin',
    })

    expect(initial.routes).toHaveLength(1)
    expect(initial.snapshots.size).toBe(0)
    expect(initial.transitions).toEqual([])
    expect(begun.state).not.toBe(initial)
  })
})
