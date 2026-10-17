import { describe, expect, it } from 'vitest'
import { MENU_GESTURE_REST } from '../../menu/menuGesture.ts'
import { presentMenuGesture, presentMenuTrigger } from './menuGesturePresentation.ts'
import { sampleMenuMotion, MENU_BUTTON, MENU_ENVELOPE } from './menuMotion.ts'

describe('menu gesture containment', () => {
  it('keeps every ordinary open/close sample identical in both appearances', () => {
    for (const appearance of ['light', 'dark'] as const) {
      for (const direction of ['open', 'close'] as const) {
        for (let ms = 0; ms <= 600; ms++) {
          const frame = sampleMenuMotion(direction, ms / 1000, appearance, false)
          expect(presentMenuGesture(frame, MENU_GESTURE_REST)).toBe(frame)
          const t = presentMenuTrigger(frame, MENU_GESTURE_REST)
          expect(t.x).toBe(
            frame.returningTrigger
              ? frame.returningTrigger.centerX - (MENU_BUTTON.centerX - MENU_ENVELOPE.frameX)
              : 0,
          )
          expect(t.y).toBe(
            frame.returningTrigger
              ? frame.returningTrigger.centerY - (MENU_BUTTON.centerY - MENU_ENVELOPE.frameY)
              : 0,
          )
          expect(t.scaleX).toBe(frame.returningTrigger ? frame.returningTrigger.radius / 29 : 1)
          expect(t.scaleY).toBe(t.scaleX)
        }
      }
    }
  })
  it('keeps a closed trigger press consistent before and after an ordinary close', () => {
    const gesture = {
      ...MENU_GESTURE_REST,
      trigger: true,
      x: -2,
      y: 1,
      scaleX: 72 / 58,
      scaleY: 72 / 58,
    }
    const cold = sampleMenuMotion('close', 0, 'light', true)
    const closed = sampleMenuMotion('close', 1, 'light', false)
    for (const base of [cold, closed]) {
      const t = presentMenuTrigger(base, gesture)
      expect(t.x).toBe(-2)
      expect(t.y).toBe(1)
      expect(t.scaleX * 58).toBe(72)
      const shape = presentMenuGesture(base, gesture).shape.first
      expect(shape.radius).toBe(shape.halfWidth)
      expect(shape.halfWidth * 2).toBe(72)
    }
  })
  it('does not apply a panel pull to the resting closed trigger', () => {
    const frame = sampleMenuMotion('close', 1, 'light', false)
    expect(
      presentMenuGesture(frame, {
        ...MENU_GESTURE_REST,
        x: -10,
        y: 20,
        scaleX: 0.94,
        scaleY: 1.06,
      }),
    ).toBe(frame)
  })
})
