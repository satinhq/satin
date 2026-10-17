import {
  NAVIGATION_DIRECTION_LOCK_PX,
  NAVIGATION_HORIZONTAL_INTENT_PX,
  shouldCompleteInteractivePop,
} from '../navigation/motion.ts'
import { PRESSABLE_RETENTION_OFFSET_PX } from '../press/tokens.ts'
import {
  createGestureArena,
  deferGesture,
  failGesture,
  recognizeGesture,
  recognizerState,
  type GestureArenaDefinition,
  type GestureArenaSession,
  type GestureBounds,
  type GestureExclusion,
  type GestureRecognizerDeclaration,
} from './arena.ts'

export const INTERACTIVE_POP_RECOGNIZER_ID = 'interactive-pop'
export const NATIVE_SCROLL_RECOGNIZER_ID = 'native-scroll'
export const PRESS_RECOGNIZER_ID = 'press'

const allRegion = Object.freeze({ kind: 'all' } as const)

export const interactivePopRecognizer = Object.freeze({
  axis: 'horizontal',
  evaluate(context) {
    if (context.sample.phase === 'end') {
      return failGesture('released-before-horizontal-claim')
    }
    if (context.sample.phase === 'start') return deferGesture()

    const absoluteX = Math.abs(context.deltaX)
    const absoluteY = Math.abs(context.deltaY)
    if (Math.max(absoluteX, absoluteY) < NAVIGATION_DIRECTION_LOCK_PX) {
      return deferGesture()
    }
    if (context.deltaX > 0 && absoluteX > absoluteY) {
      return recognizeGesture('rightward-horizontal-claim')
    }
    return failGesture(absoluteY >= absoluteX ? 'vertical-intent' : 'leftward-intent')
  },
  hysteresis: Object.freeze({
    activationDistance: NAVIGATION_HORIZONTAL_INTENT_PX,
    claimDistance: NAVIGATION_DIRECTION_LOCK_PX,
  }),
  id: INTERACTIVE_POP_RECOGNIZER_ID,
  priority: 100,
  region: allRegion,
} satisfies GestureRecognizerDeclaration)

export const pressRecognizer = Object.freeze({
  axis: 'any',
  evaluate(context) {
    return context.sample.phase === 'end' ? recognizeGesture('pointer-released') : deferGesture()
  },
  hysteresis: Object.freeze({
    retentionDistance: PRESSABLE_RETENTION_OFFSET_PX,
  }),
  id: PRESS_RECOGNIZER_ID,
  previewWhilePossible: true,
  priority: 0,
  region: allRegion,
} satisfies GestureRecognizerDeclaration)

export const nativeScrollRecognizer = Object.freeze({
  axis: 'vertical',
  hysteresis: Object.freeze({}),
  id: NATIVE_SCROLL_RECOGNIZER_ID,
  participation: 'observed-native',
  priority: 0,
  region: allRegion,
} satisfies GestureRecognizerDeclaration)

export function createExistingCompetitorArena(
  bounds: GestureBounds,
  exclusions: readonly GestureExclusion[] = [],
): GestureArenaDefinition {
  return createGestureArena({
    bounds,
    exclusions,
    recognizers: [interactivePopRecognizer, pressRecognizer, nativeScrollRecognizer],
  })
}

/**
 * The early claim owns the touch at 10 points, but the screen stays still until
 * the separately measured 30-point visibility gate.
 */
export function interactivePopVisualProgress(session: GestureArenaSession, width: number) {
  if (
    width <= 0 ||
    recognizerState(session, INTERACTIVE_POP_RECOGNIZER_ID).state !== 'recognized'
  ) {
    return 0
  }
  const deltaX = session.current.x - session.start.x
  if (deltaX < NAVIGATION_HORIZONTAL_INTENT_PX) return 0
  return Math.min(1, Math.max(0, deltaX / width))
}

export function interactivePopReleaseTarget(session: GestureArenaSession, width: number) {
  const elapsedSeconds = Math.max(0.001, (session.current.time - session.start.time) / 1_000)
  const deltaX = session.current.x - session.start.x
  const progress = width <= 0 ? 0 : Math.min(1, Math.max(0, deltaX / width))
  const velocityPointsPerSecond = deltaX / elapsedSeconds
  return shouldCompleteInteractivePop(progress, velocityPointsPerSecond) ? 'complete' : 'cancel'
}
