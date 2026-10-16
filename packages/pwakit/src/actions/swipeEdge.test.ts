import { expect, it } from 'vitest'
import { swipeEdge } from './types.ts'
const action = { id: 'archive', label: 'Archive', onPress() {} }
it('defaults to full swipe on the trailing edge and preserves the original API', () => {
  expect(swipeEdge({ actions: [action] }, 'trailing')).toEqual({
    actions: [action],
    allowsFullSwipe: true,
  })
  expect(swipeEdge({ actions: [action] }, 'leading').actions).toEqual([])
  expect(
    swipeEdge({ edge: 'trailing', actions: [action], allowsFullSwipe: false }, 'trailing')
      .allowsFullSwipe,
  ).toBe(false)
})
it('configures full swipe independently per edge without reversing the primary action', () => {
  const more = { ...action, id: 'more' }
  const configuration = [
    { edge: 'leading' as const, actions: [action], allowsFullSwipe: false },
    { edge: 'trailing' as const, actions: [action, more] },
  ]
  expect(swipeEdge(configuration, 'leading').allowsFullSwipe).toBe(false)
  expect(swipeEdge(configuration, 'trailing')).toEqual({
    actions: [action, more],
    allowsFullSwipe: true,
  })
})
