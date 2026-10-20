// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { registerPointerPressCancellation } from '../press/gestureArbitration.ts'
import {
  deferGesture,
  failGesture,
  recognizeGesture,
  type GestureRecognizerContext,
} from './arena.ts'
import { INTERACTIVE_POP_RECOGNIZER_ID, interactivePopRecognizer } from './existingCompetitors.ts'
import {
  createGestureScope,
  createReleaseTransaction,
  type GestureParticipant,
  type GestureScope,
} from './ownership.ts'

type Log = string[]

const popRecognizer = {
  axis: interactivePopRecognizer.axis,
  evaluate: interactivePopRecognizer.evaluate,
  hysteresis: interactivePopRecognizer.hysteresis,
  priority: interactivePopRecognizer.priority,
}

/** Rightward-only horizontal claim at 10 points (the drawer's borrowed lock). */
function rightwardClaim(context: GestureRecognizerContext) {
  if (context.sample.phase === 'end') return failGesture('released')
  const x = Math.abs(context.deltaX)
  const y = Math.abs(context.deltaY)
  if (Math.max(x, y) < 10) return deferGesture()
  if (y >= x) return failGesture('vertical-intent')
  return context.deltaX > 0 ? recognizeGesture() : failGesture('closing-direction')
}

function participant(
  id: string,
  log: Log,
  options: Partial<GestureParticipant> & { refuse?: () => string | undefined } = {},
): GestureParticipant {
  return {
    recognizer: { axis: 'horizontal', priority: 50, hysteresis: {}, evaluate: rightwardClaim },
    admit: (_contact, _event, foreign) => (foreign ? 'foreign' : options.refuse?.()),
    recognized: () => log.push(`${id}:recognized`),
    rejected: reason => log.push(`${id}:rejected:${reason}`),
    finish: (_event, cancelled, reason) =>
      log.push(`${id}:finish:${cancelled ? 'cancel' : 'end'}:${reason}`),
    ...options,
  }
}

function touch(
  host: HTMLElement,
  type: string,
  x: number,
  y: number,
  identifier = 1,
  down?: number,
) {
  const point = { identifier, clientX: x, clientY: y }
  const list = (points: (typeof point)[]) =>
    Object.assign(points, { item: (index: number) => points[index] ?? null })
  const lifting = type === 'touchend' || type === 'touchcancel'
  const event = new Event(type, { bubbles: true, cancelable: true })
  const active =
    down === undefined ? (lifting ? [] : [point]) : Array.from({ length: down }, () => point)
  Object.defineProperties(event, {
    timeStamp: { value: performance.now() },
    touches: { value: list(active) },
    changedTouches: { value: list([point]) },
  })
  host.dispatchEvent(event)
}

function drag(host: HTMLElement, from: [number, number], by: [number, number], end = 'touchend') {
  touch(host, 'touchstart', from[0], from[1])
  for (let step = 1; step <= 8; step++) {
    touch(host, 'touchmove', from[0] + (by[0] * step) / 8, from[1] + (by[1] * step) / 8)
  }
  touch(host, end, from[0] + by[0], from[1] + by[1])
}

const unbinds: (() => void)[] = []
function scopeOn(): { scope: GestureScope; host: HTMLElement } {
  const host = document.createElement('div')
  document.body.append(host)
  const scope = createGestureScope()
  unbinds.push(scope.bind(host))
  return { scope, host }
}

afterEach(() => {
  for (const unbind of unbinds.splice(0)) unbind()
  document.body.innerHTML = ''
})

describe('registration', () => {
  it('rejects failure-requirement cycles, one-sided simultaneity and two writers of one output', () => {
    const scope = createGestureScope()
    const log: Log = []
    scope.register('a', participant('a', log, { requiresFailureOf: ['b'] }))
    expect(() => scope.register('b', participant('b', log, { requiresFailureOf: ['a'] }))).toThrow(
      /cycle/,
    )
    expect(() => scope.register('c', participant('c', log, { simultaneousWith: ['a'] }))).toThrow(
      /mutual/,
    )
    const first = participant('d', log, { output: 'axis', simultaneousWith: ['e'] })
    scope.register('d', first)
    expect(() =>
      scope.register('e', participant('e', log, { output: 'axis', simultaneousWith: ['d'] })),
    ).toThrow(/both write output "axis"/)
    expect(() => scope.register('a', participant('a', log))).toThrow(/duplicated/)
  })

  it('rejects an exclusive group containing a simultaneous pair', () => {
    const scope = createGestureScope()
    const log: Log = []
    scope.register('x', participant('x', log, { simultaneousWith: ['y'] }))
    scope.register('y', participant('y', log, { simultaneousWith: ['x'] }))
    expect(() => scope.exclusive(['x', 'y'])).toThrow(/exclusive and simultaneous/)
  })
})

describe('back vs drawer vs row arbitration in one scope', () => {
  /** The three competitors with the relationships the prototype declares. */
  function competitors(state: { atRoot: boolean; edge: (x: number) => boolean; onRow: boolean }) {
    const log: Log = []
    const { scope, host } = scopeOn()
    scope.register(
      INTERACTIVE_POP_RECOGNIZER_ID,
      participant('back', log, {
        recognizer: popRecognizer,
        output: 'navigation-pop',
        refuse: () => (state.atRoot ? 'no-pop-target' : undefined),
      }),
    )
    let lastX = 0
    host.addEventListener(
      'touchstart',
      event => (lastX = (event as TouchEvent).changedTouches[0]!.clientX),
      {
        capture: true,
      },
    )
    scope.register(
      'drawer-open',
      participant('drawer', log, {
        recognizer: { axis: 'horizontal', priority: 90, hysteresis: {}, evaluate: rightwardClaim },
        requiresFailureOf: [INTERACTIVE_POP_RECOGNIZER_ID],
        output: 'drawer-axis',
        multiTouch: 'cancel',
        refuse: () =>
          !state.atRoot ? 'content-not-at-root' : !state.edge(lastX) ? 'outside-edge' : undefined,
      }),
    )
    scope.register(
      'row-swipe',
      participant('row', log, {
        requiresFailureOf: [INTERACTIVE_POP_RECOGNIZER_ID, 'drawer-open'],
        output: 'row-offset',
        refuse: () => (state.onRow ? undefined : 'no-row'),
      }),
    )
    scope.exclusive([INTERACTIVE_POP_RECOGNIZER_ID, 'drawer-open', 'row-swipe'])
    return { log, host }
  }

  it('compact detail: the leading edge is Back; the drawer never claims it', () => {
    const { log, host } = competitors({ atRoot: false, edge: () => true, onRow: true })
    drag(host, [4, 300], [160, 6])
    expect(log).toContain('back:recognized')
    expect(log.filter(entry => entry.endsWith(':recognized'))).toEqual(['back:recognized'])
    expect(log).toContain('row:rejected:lost-to:interactive-pop')
  })

  it('list root: an edge contact opens the drawer and the row under it yields', () => {
    const { log, host } = competitors({ atRoot: true, edge: x => x < 24, onRow: true })
    drag(host, [4, 300], [160, 6])
    expect(log.filter(entry => entry.endsWith(':recognized'))).toEqual(['drawer:recognized'])
    expect(log).toContain('row:rejected:lost-to:drawer-open')
  })

  it('list root: a row contact outside the edge region keeps its row swipe', () => {
    const { log, host } = competitors({ atRoot: true, edge: x => x < 24, onRow: true })
    drag(host, [120, 300], [140, 4])
    expect(log.filter(entry => entry.endsWith(':recognized'))).toEqual(['row:recognized'])
  })

  it('a vertical pan recognizes nothing (no sideways flash) and each participant ends once', () => {
    const { log, host } = competitors({ atRoot: true, edge: () => true, onRow: true })
    drag(host, [4, 300], [6, 180])
    expect(log.some(entry => entry.endsWith(':recognized'))).toBe(false)
    expect(log.filter(entry => entry.startsWith('drawer:finish'))).toEqual([
      'drawer:finish:end:touchend',
    ])
    expect(log.filter(entry => entry.startsWith('row:finish'))).toEqual(['row:finish:end:touchend'])
  })
})

describe('cancellation', () => {
  it('touchcancel and a geometry change end each participant once, as cancelled', () => {
    const log: Log = []
    const { scope, host } = scopeOn()
    scope.register('drawer', participant('drawer', log))
    touch(host, 'touchstart', 4, 300)
    touch(host, 'touchmove', 40, 302)
    scope.invalidateGeometry()
    touch(host, 'touchmove', 80, 302)
    touch(host, 'touchend', 80, 302)
    expect(log).toEqual(['drawer:recognized', 'drawer:finish:cancel:geometry-changed'])
    expect(scope.generation).toBe(2)

    log.length = 0
    drag(host, [4, 300], [120, 2], 'touchcancel')
    expect(log).toEqual(['drawer:recognized', 'drawer:finish:cancel:touchcancel'])
  })

  it('a second finger cancels a one-finger participant and leaves an ignoring one tracking', () => {
    const log: Log = []
    const { scope, host } = scopeOn()
    scope.register('one-finger', participant('one-finger', log, { multiTouch: 'cancel' }))
    touch(host, 'touchstart', 4, 300)
    touch(host, 'touchmove', 40, 300)
    touch(host, 'touchstart', 200, 500, 2, 2)
    touch(host, 'touchend', 60, 300)
    expect(log).toEqual(['one-finger:recognized', 'one-finger:finish:cancel:multiple-contacts'])
  })
})

describe('press ownership', () => {
  it('a claimed contact cancels the press under it; a participant that owns presses keeps its own timing', () => {
    const log: Log = []
    const { scope, host } = scopeOn()
    scope.register('drawer', participant('drawer', log))
    const cancelled: string[] = []
    registerPointerPressCancellation(7, () => cancelled.push('row press'))
    host.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), {
        pointerType: 'touch',
        isPrimary: true,
        pointerId: 7,
      }),
    )
    touch(host, 'touchstart', 4, 300)
    touch(host, 'touchmove', 6, 300)
    expect(cancelled).toEqual([])
    touch(host, 'touchmove', 40, 300)
    expect(cancelled).toEqual(['row press'])
    touch(host, 'touchend', 40, 300)

    const own = scopeOn()
    own.scope.register('back', participant('back', log, { pressPolicy: 'own' }))
    registerPointerPressCancellation(8, () => cancelled.push('kept'))
    own.host.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), {
        pointerType: 'touch',
        isPrimary: true,
        pointerId: 8,
      }),
    )
    drag(own.host, [4, 300], [120, 2])
    expect(cancelled).toEqual(['row press'])
  })
})

describe('release transaction', () => {
  it('commits once, never after supersession, a retired generation or a cancel outcome', () => {
    const commits: boolean[] = []
    let generation = 1
    const make = (outcome: 'cancel' | 'commit') =>
      createReleaseTransaction({
        destination: true,
        outcome,
        generation: 1,
        currentGeneration: () => generation,
        commit: value => commits.push(value),
      })
    const committed = make('commit')
    expect(committed.settled()).toBe(true)
    expect(committed.settled()).toBe(false)
    const caught = make('commit')
    caught.supersede('caught')
    expect(caught.settled()).toBe(false)
    const cancelled = make('cancel')
    expect(cancelled.settled()).toBe(false)
    const retired = make('commit')
    generation = 2
    expect(retired.settled()).toBe(false)
    expect(retired.supersededReason).toBe('geometry-generation-retired')
    expect(commits).toEqual([true])
  })
})
