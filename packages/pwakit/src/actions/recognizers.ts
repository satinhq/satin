import {
  createGestureArena,
  deferGesture,
  failGesture,
  recognizeGesture,
  type GestureBounds,
} from '../gestures/arena.ts'
import {
  interactivePopRecognizer,
  nativeScrollRecognizer,
  pressRecognizer,
} from '../gestures/existingCompetitors.ts'
import { horizontalDragBlocksBack } from '../navigation/horizontalDrag.ts'

export type InteractionCalibration = Readonly<{
  claimDistance: number
  holdMilliseconds: number
  holdSlop: number
}>
/** The generic arena receives calibration from the interaction owner. */
export function createRowArena(
  bounds: GestureBounds,
  options: {
    canPop: boolean
    leading: boolean
    trailing: boolean
    context: boolean
    calibration: InteractionCalibration
  },
) {
  const { calibration: c } = options
  return createGestureArena({
    bounds,
    recognizers: [
      {
        ...interactivePopRecognizer,
        evaluate: context =>
          options.canPop
            ? interactivePopRecognizer.evaluate(context)
            : failGesture('no-pop-target'),
      },
      nativeScrollRecognizer,
      {
        ...pressRecognizer,
        evaluate: context =>
          Math.hypot(context.deltaX, context.deltaY) > c.holdSlop
            ? failGesture('moved')
            : pressRecognizer.evaluate(context),
      },
      {
        id: 'row-swipe',
        axis: 'horizontal',
        priority: 50,
        region: { kind: 'all' },
        hysteresis: { claimDistance: c.claimDistance },
        requiresFailureOf: ['interactive-pop'],
        evaluate: context => {
          if (context.sample.phase === 'end') return failGesture('released')
          if (Math.max(Math.abs(context.deltaX), Math.abs(context.deltaY)) < c.claimDistance)
            return deferGesture()
          if (Math.abs(context.deltaY) >= Math.abs(context.deltaX))
            return failGesture('vertical-intent')
          return (context.deltaX > 0 ? options.leading : options.trailing)
            ? recognizeGesture('horizontal-row-action')
            : failGesture('no-actions')
        },
      },
      {
        id: 'context-hold',
        axis: 'any',
        priority: 60,
        region: { kind: 'all' },
        hysteresis: { retentionDistance: c.holdSlop },
        evaluate: context => {
          if (
            !options.context ||
            context.sample.phase === 'end' ||
            Math.hypot(context.deltaX, context.deltaY) > c.holdSlop
          )
            return failGesture('hold-canceled')
          return context.elapsed >= c.holdMilliseconds
            ? recognizeGesture('hold-elapsed')
            : deferGesture()
        },
      },
    ],
  })
}

const navigationOwners = new WeakMap<Element, (target: Element) => boolean>()
export function registerRowNavigationOwner(host: Element, canPop: (target: Element) => boolean) {
  navigationOwners.set(host, canPop)
  return () => {
    navigationOwners.delete(host)
  }
}
export function rowCanPop(target: Element, clientX: number) {
  const host = target.closest('[data-satin-navigator-host]')
  return host
    ? !horizontalDragBlocksBack(target, clientX) && (navigationOwners.get(host)?.(target) ?? false)
    : false
}

/** Set before contact: native horizontal scrolling cannot be enabled after down. */
export function rowSwipeTouchAction(
  nativeDriver: boolean,
  canPop: boolean,
  directionalPanning = true,
) {
  return nativeDriver && canPop && directionalPanning ? 'pan-y pan-right pinch-zoom' : 'pan-y'
}

/** Sample the committed target policy at contact, not after direction lock. */
export function rowBlocksNativeBack(target: Element | undefined) {
  const row = target?.closest('[data-satin-row-swipe="true"]')
  if (!row) return false
  const policy = getComputedStyle(row).touchAction || 'auto'
  return (
    !['auto', 'manipulation'].includes(policy) &&
    !policy.includes('pan-x') &&
    !policy.includes('pan-right')
  )
}
