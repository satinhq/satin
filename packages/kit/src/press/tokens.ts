/** Measured from PressableReference on iPhone 17 Pro / iOS 26.5. */
export const PRESSABLE_PRESSED_OPACITY = 0.75

/** The first changed reference frame was already at the pressed plateau. */
export const PRESSABLE_PRESS_IN_DURATION_MS = 0

/** native reference release returned to rest in 400-418 ms at 60 Hz. */
export const PRESSABLE_RELEASE_DURATION_MS = 400

/** Closest named curve to the measured decelerating release envelope. */
export const PRESSABLE_RELEASE_EASING = 'cubic-bezier(0, 0, 0.58, 1)'

/** Native plain-Button retention measured 69 points beyond the label bounds. */
export const PRESSABLE_RETENTION_OFFSET_PX = 69

export const pressableTokens = Object.freeze({
  pressedOpacity: PRESSABLE_PRESSED_OPACITY,
  pressInDurationMs: PRESSABLE_PRESS_IN_DURATION_MS,
  releaseDurationMs: PRESSABLE_RELEASE_DURATION_MS,
  releaseEasing: PRESSABLE_RELEASE_EASING,
  retentionOffsetPx: PRESSABLE_RETENTION_OFFSET_PX,
})

/* Stock Form row scroll-intent deadline. See row-picker-notes.md for the reference. */
export const ROW_HIGHLIGHT_DELAY_MS = 175
