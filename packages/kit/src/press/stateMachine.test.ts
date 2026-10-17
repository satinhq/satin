import { describe, expect, it } from 'vitest'
import {
  transitionRowFeedback,
  beginPointerPress,
  cancelPointerPress,
  movePointerPress,
  releasePointerPress,
  updatePointerPressBounds,
} from './stateMachine.ts'
import { PRESSABLE_RETENTION_OFFSET_PX } from './tokens.ts'

const bounds = { bottom: 160, left: 100, right: 220, top: 80 }

describe('Pressable pointer state machine', () => {
  it('fires after a pointer remains inside the retention region', () => {
    const pressed = beginPointerPress(7, bounds)
    const jittered = movePointerPress(pressed, { x: 225, y: 165 }, 20)

    expect(jittered.state).toBe('pressed')
    expect(releasePointerPress(jittered)).toEqual({ fire: true, state: 'idle' })
  })

  it('deactivates outside the retention region and does not fire there', () => {
    const pressed = beginPointerPress(7, bounds)
    const outside = movePointerPress(
      pressed,
      { x: bounds.right + PRESSABLE_RETENTION_OFFSET_PX + 1, y: 120 },
      PRESSABLE_RETENTION_OFFSET_PX,
    )

    expect(outside.state).toBe('deactivated')
    expect(releasePointerPress(outside)).toEqual({ fire: false, state: 'idle' })
  })

  it('reactivates when a pointer returns before release', () => {
    const pressed = beginPointerPress(7, bounds)
    const outside = movePointerPress(
      pressed,
      { x: bounds.right + PRESSABLE_RETENTION_OFFSET_PX + 1, y: 120 },
      PRESSABLE_RETENTION_OFFSET_PX,
    )
    const returned = movePointerPress(
      outside,
      { x: bounds.right + PRESSABLE_RETENTION_OFFSET_PX, y: 120 },
      PRESSABLE_RETENTION_OFFSET_PX,
    )

    expect(returned.state).toBe('pressed')
    expect(releasePointerPress(returned).fire).toBe(true)
  })

  it('cancels without firing when scrolling wins the pointer sequence', () => {
    expect(cancelPointerPress()).toEqual({ fire: false, state: 'idle' })
  })

  it('re-measures retention bounds while an owning screen translates', () => {
    const pressed = beginPointerPress(7, bounds)
    const translated = updatePointerPressBounds(pressed, {
      bottom: 160,
      left: 180,
      right: 300,
      top: 80,
    })
    const moved = movePointerPress(translated, { x: 290, y: 120 }, PRESSABLE_RETENTION_OFFSET_PX)

    expect(moved.state).toBe('pressed')
    expect(moved.bounds.left).toBe(180)
  })
})

describe('row feedback state machine', () => {
  it('keeps an accepted quick tap unhighlighted on lift', () => {
    const pending = transitionRowFeedback('idle', 'down')
    expect(pending).toBe('pending')
    expect(transitionRowFeedback(pending, 'release')).toBe('idle')
  })
  it('shows a hold only after the scroll-intent deadline', () => {
    expect(transitionRowFeedback('pending', 'hold')).toBe('pressed')
    expect(transitionRowFeedback('pressed', 'release')).toBe('releasing')
  })
  it('cancels a scroll without a release flash or late hold', () => {
    expect(transitionRowFeedback('pending', 'cancel')).toBe('idle')
    expect(transitionRowFeedback('pressed', 'cancel')).toBe('idle')
    expect(transitionRowFeedback('idle', 'hold')).toBe('idle')
    expect(transitionRowFeedback('idle', 'release')).toBe('idle')
  })
})
