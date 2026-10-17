import { useMemo, useRef, useState } from 'react'
import {
  deferGesture,
  failGesture,
  recognizeGesture,
  type GestureDecision,
  type GestureRecognizerContext,
} from './arena.ts'

export type GesturePoint = Readonly<{ x: number; y: number }>
export type DragGestureValue = Readonly<{
  location: GesturePoint
  startLocation: GesturePoint
  translation: GesturePoint
  velocity: GesturePoint
}>
export type MagnifyGestureValue = Readonly<{ magnification: number; startAnchor: GesturePoint }>
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

/** A React value plus a gesture-owned update/reset binding. Cancellation and release
 * restore the initial value; no mutable proxy is exposed to application code. */
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
export type DragGestureOptions = Callbacks<DragGestureValue> &
  Readonly<{ minimumDistance?: number; axis?: Gesture['axis'] }>
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
export type LongPressGestureOptions = Callbacks<boolean> &
  Readonly<{ minimumDurationMs?: number; maximumDistance?: number }>
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
export type TapGestureOptions = Callbacks<GesturePoint> &
  Readonly<{ count?: number; maximumDistance?: number }>
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
export type MagnifyGestureOptions = Callbacks<MagnifyGestureValue> &
  Readonly<{ minimumScaleDelta?: number }>
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
