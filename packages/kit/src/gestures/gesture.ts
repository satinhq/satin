import { useMemo, useRef, useState } from 'react'
import {
  deferGesture,
  failGesture,
  recognizeGesture,
  type GestureDecision,
  type GestureRecognizerContext,
} from './arena.ts'

/** A point in CSS pixels. */
export type GesturePoint = Readonly<{ x: number; y: number }>
/** A drag's current and start locations, its translation and its velocity. */
export type DragGestureValue = Readonly<{
  location: GesturePoint
  startLocation: GesturePoint
  translation: GesturePoint
  velocity: GesturePoint
}>
/** A pinch's scale relative to its start, and the point it started around. */
export type MagnifyGestureValue = Readonly<{ magnification: number; startAnchor: GesturePoint }>
/** The binding `useGestureState` returns. A gesture updates it while active and resets it when it
 * ends. */
export type GestureState<Value> = Readonly<{ update(value: Value): void; reset(): void }>
type Callbacks<Value> = Readonly<{
  onChanged?: (value: Value) => void
  onEnded?: (value: Value) => void
  onCancelled?: () => void
  state?: GestureState<Value>
}>
export type GestureSample = Readonly<{
  drag: DragGestureValue
  magnify: MagnifyGestureValue | undefined
}>
/** A gesture made by `DragGesture`, `LongPressGesture`, `TapGesture` or `MagnifyGesture`, for a
 * `GestureView`. */
export type Gesture = Readonly<{
  kind: 'drag' | 'longPress' | 'tap' | 'magnify'
  axis: 'horizontal' | 'vertical' | 'any'
  delay?: number
  count?: number
  evaluate(context: GestureRecognizerContext, sample: GestureSample): GestureDecision
  changed(sample: GestureSample): void
  ended(sample: GestureSample): void
  cancelled(): void
}>

/** Returns a value that a gesture drives, and the binding to pass as the gesture's `state`. The
 * value goes back to `initialValue` when the gesture ends or is cancelled. */
export function useGestureState<Value>(initialValue: Value): readonly [Value, GestureState<Value>] {
  const [value, setValue] = useState(initialValue)
  const initial = useRef(initialValue)
  const binding = useMemo(() => ({ update: setValue, reset: () => setValue(initial.current) }), [])
  return [value, binding]
}
function callbacks<Value>(options: Callbacks<Value>, value: (sample: GestureSample) => Value) {
  return {
    changed(sample: GestureSample) {
      const next = value(sample)
      options.state?.update(next)
      options.onChanged?.(next)
    },
    ended(sample: GestureSample) {
      try {
        options.onEnded?.(value(sample))
      } finally {
        options.state?.reset()
      }
    },
    cancelled() {
      try {
        options.onCancelled?.()
      } finally {
        options.state?.reset()
      }
    },
  }
}
function distance(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be finite and non-negative.`)
  return value
}
/** A drag's callbacks and state, the distance it must travel before it starts (10 by default) and
 * the axis it accepts. */
export type DragGestureOptions = Callbacks<DragGestureValue> &
  Readonly<{ minimumDistance?: number; axis?: Gesture['axis'] }>
/** A drag that starts after the finger moves `minimumDistance` along the accepted axis. */
export function DragGesture({
  minimumDistance = 10,
  axis = 'any',
  ...options
}: DragGestureOptions = {}): Gesture {
  distance(minimumDistance, 'Drag minimumDistance')
  return Object.freeze({
    kind: 'drag',
    axis,
    ...callbacks(options, sample => sample.drag),
    evaluate(context) {
      if (context.sample.phase === 'end') return failGesture('released-before-drag')
      const x = Math.abs(context.deltaX),
        y = Math.abs(context.deltaY)
      if (Math.hypot(x, y) < minimumDistance) return deferGesture()
      if ((axis === 'horizontal' && y >= x) || (axis === 'vertical' && x >= y))
        return failGesture('other-axis')
      return recognizeGesture('drag-distance')
    },
  })
}
/** A long press's callbacks and state, how long it must be held (500 ms by default) and how far
 * the finger may move (10 by default). */
export type LongPressGestureOptions = Callbacks<boolean> &
  Readonly<{ minimumDurationMs?: number; maximumDistance?: number }>
/** A press held for `minimumDurationMs` without moving more than `maximumDistance`. */
export function LongPressGesture({
  minimumDurationMs = 500,
  maximumDistance = 10,
  ...options
}: LongPressGestureOptions = {}): Gesture {
  distance(minimumDurationMs, 'Long press minimumDurationMs')
  distance(maximumDistance, 'Long press maximumDistance')
  return Object.freeze({
    kind: 'longPress',
    axis: 'any',
    delay: minimumDurationMs,
    ...callbacks(options, () => true),
    evaluate(context) {
      if (
        context.sample.phase === 'end' ||
        Math.hypot(context.deltaX, context.deltaY) > maximumDistance
      )
        return failGesture('hold-ended-or-moved')
      return context.elapsed >= minimumDurationMs
        ? recognizeGesture('hold-duration')
        : deferGesture()
    },
  })
}
/** A tap's callbacks and state, the number of taps (1 by default) and how far the finger may
 * move (10 by default). */
export type TapGestureOptions = Callbacks<GesturePoint> &
  Readonly<{ count?: number; maximumDistance?: number }>
/** A tap, or `count` taps, that ends without moving more than `maximumDistance`. It reports where
 * the finger lifted. */
export function TapGesture({
  count = 1,
  maximumDistance = 10,
  ...options
}: TapGestureOptions = {}): Gesture {
  if (!Number.isInteger(count) || count < 1)
    throw new Error('Tap count must be a positive integer.')
  distance(maximumDistance, 'Tap maximumDistance')
  return Object.freeze({
    kind: 'tap',
    axis: 'any',
    count,
    ...callbacks(options, sample => sample.drag.location),
    evaluate(context) {
      if (Math.hypot(context.deltaX, context.deltaY) > maximumDistance)
        return failGesture('tap-moved')
      return context.sample.phase === 'end' ? recognizeGesture('tap-ended') : deferGesture()
    },
  })
}
/** A pinch's callbacks and state, and how far the scale must change before it starts (0.01 by
 * default). */
export type MagnifyGestureOptions = Callbacks<MagnifyGestureValue> &
  Readonly<{ minimumScaleDelta?: number }>
/** A two-finger pinch that starts once the scale changes by `minimumScaleDelta`. */
export function MagnifyGesture({
  minimumScaleDelta = 0.01,
  ...options
}: MagnifyGestureOptions = {}): Gesture {
  distance(minimumScaleDelta, 'Magnify minimumScaleDelta')
  return Object.freeze({
    kind: 'magnify',
    axis: 'any',
    ...callbacks(options, sample => sample.magnify!),
    evaluate(context, sample) {
      if (context.sample.phase === 'end') return failGesture('pinch-ended')
      return sample.magnify && Math.abs(sample.magnify.magnification - 1) >= minimumScaleDelta
        ? recognizeGesture('pinch-scale')
        : deferGesture()
    },
  })
}
