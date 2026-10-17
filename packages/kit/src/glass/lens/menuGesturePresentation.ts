import type { MenuGestureFrame } from '../../menu/menuGesture.ts'
import { MENU_BUTTON, MENU_ENVELOPE, type MenuMotionFrame } from './menuMotion.ts'

/** Deform the same glass shape that drives its aperture and shadow. */
export function presentMenuGesture(
  base: MenuMotionFrame,
  gesture: MenuGestureFrame,
): MenuMotionFrame {
  if (gesture.x === 0 && gesture.y === 0 && gesture.scaleX === 1 && gesture.scaleY === 1)
    return base
  const amount = gesture.trigger
    ? 1 - Math.max(0, Math.min(1, base.openProgress))
    : Math.max(0, Math.min(1, base.openProgress))
  if (amount === 0) return base
  const shape = (part: MenuMotionFrame['shape']['first']) => ({
    ...part,
    radius: part.radius * (gesture.trigger ? 1 + (gesture.scaleX - 1) * amount : 1),
    centerX: part.centerX + gesture.x * amount,
    centerY: part.centerY + gesture.y * amount,
    halfWidth: part.halfWidth * (1 + (gesture.scaleX - 1) * amount),
    halfHeight: part.halfHeight * (1 + (gesture.scaleY - 1) * amount),
  })
  return {
    ...base,
    shape: {
      ...base.shape,
      first: shape(base.shape.first),
      second: base.shape.second ? shape(base.shape.second) : undefined,
    },
  }
}

/** Keep the ordinary returning glyph transform, then add only active contact. */
export function presentMenuTrigger(frame: MenuMotionFrame, gesture: MenuGestureFrame) {
  const returning = frame.returningTrigger
  const amount = gesture.trigger ? 1 - Math.max(0, Math.min(1, frame.openProgress)) : 0
  const x = MENU_BUTTON.centerX - MENU_ENVELOPE.frameX
  const y = MENU_BUTTON.centerY - MENU_ENVELOPE.frameY
  const scale = (returning?.radius ?? MENU_BUTTON.diameter / 2) / (MENU_BUTTON.diameter / 2)
  return {
    active: Boolean(returning || gesture.trigger),
    x: (returning?.centerX ?? x) - x + gesture.x * amount,
    y: (returning?.centerY ?? y) - y + gesture.y * amount,
    scaleX: scale * (1 + (gesture.scaleX - 1) * amount),
    scaleY: scale * (1 + (gesture.scaleY - 1) * amount),
  }
}
