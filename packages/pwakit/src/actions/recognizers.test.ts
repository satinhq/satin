import { describe, expect, it } from 'vitest'
import { createRowArena, rowSwipeTouchAction } from './recognizers.ts'
import {
  reduceGestureArena,
  type GestureArenaSession,
  type NormalizedPointerSample,
} from '../gestures/arena.ts'
import { actionItems } from './types.ts'
const calibration = { claimDistance: 10, holdMilliseconds: 500, holdSlop: 10 }
const bounds = { left: 0, top: 0, right: 400, bottom: 52 }
function sequence(canPop = false) {
  const arena = createRowArena(bounds, {
    canPop,
    leading: true,
    trailing: true,
    context: true,
    calibration,
  })
  let session: GestureArenaSession | undefined
  return (x: number, y: number, time: number, phase: NormalizedPointerSample['phase'] = 'move') => {
    session = reduceGestureArena(arena, session, {
      kind: 'pointer',
      pointerId: 1,
      isPrimary: true,
      x,
      y,
      time,
      phase,
    }).session
    return session!
  }
}
describe('row gesture arena', () => {
  it('gives a rightward gesture to navigation while allowing a leftward row action', () => {
    let step = sequence(true)
    step(100, 20, 0, 'start')
    let state = step(115, 20, 50)
    expect(state.recognizers['interactive-pop'].state).toBe('recognized')
    expect(state.recognizers['row-swipe'].state).toBe('canceled')
    step = sequence(true)
    step(100, 20, 0, 'start')
    state = step(85, 20, 50)
    expect(state.recognizers['row-swipe'].state).toBe('recognized')
    expect(['failed', 'canceled']).toContain(state.recognizers.press.state)
  })
  it('permits leading actions at root and cancels the hold on vertical motion', () => {
    let step = sequence()
    step(100, 20, 0, 'start')
    expect(step(115, 20, 50).recognizers['row-swipe'].state).toBe('recognized')
    step = sequence()
    step(100, 20, 0, 'start')
    step(102, 40, 50)
    const state = step(102, 40, 600)
    expect(state.recognizers['context-hold'].state).toBe('failed')
    expect(state.recognizers['native-scroll'].state).not.toBe('recognized')
  })
  it('lets a stationary hold defeat pending navigation and tap', () => {
    const step = sequence(true)
    step(100, 20, 0, 'start')
    const state = step(100, 20, 500)
    expect(state.recognizers['context-hold'].state).toBe('recognized')
    expect(state.recognizers['interactive-pop'].state).toBe('canceled')
    expect(['failed', 'canceled']).toContain(state.recognizers.press.state)
  })
  it('keeps a short tap and cancels a terminated hold', () => {
    let step = sequence()
    step(100, 20, 0, 'start')
    expect(step(100, 20, 100, 'end').recognizers.press.state).toBe('recognized')
    step = sequence()
    step(100, 20, 0, 'start')
    expect(step(100, 20, 100, 'cancel').status).toBe('canceled')
  })
  it('preserves leaf order and disabled actions through groups', () => {
    const item = { id: 'one', label: 'One', onPress() {} }
    expect(
      actionItems([
        {
          section: [
            item,
            { id: 'more', label: 'More', submenu: [{ ...item, id: 'two', disabled: true }] },
          ],
        },
      ]).map(a => a.id),
    ).toEqual(['one', 'two'])
  })
})

it('accepts actual native scroll as authoritative even after a JS claim', () => {
  const arena = createRowArena(bounds, {
    canPop: false,
    leading: true,
    trailing: true,
    context: true,
    calibration,
  })
  let session = reduceGestureArena(arena, undefined, {
    kind: 'pointer',
    phase: 'start',
    pointerId: 7,
    isPrimary: true,
    x: 100,
    y: 20,
    time: 0,
  }).session
  session = reduceGestureArena(arena, session, {
    kind: 'pointer',
    phase: 'move',
    pointerId: 7,
    isPrimary: true,
    x: 80,
    y: 20,
    time: 50,
  }).session
  session = reduceGestureArena(arena, session, {
    kind: 'external-recognition',
    pointerId: 7,
    recognizerId: 'native-scroll',
    time: 60,
  }).session
  expect(session?.recognizers['row-swipe'].state).toBe('canceled')
  expect(session?.recognizers['native-scroll'].state).toBe('recognized')
})

it('reserves horizontal row panning only when navigation does not need native scrolling', () => {
  expect(rowSwipeTouchAction(true, true)).toBe('pan-y pan-right pinch-zoom')
  expect(rowSwipeTouchAction(false, true)).toBe('pan-y')
  expect(rowSwipeTouchAction(true, false)).toBe('pan-y')
  expect(rowSwipeTouchAction(true, true, false)).toBe('pan-y')
})
