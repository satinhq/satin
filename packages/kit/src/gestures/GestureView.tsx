import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { rowCanPop } from '../actions/recognizers.ts'
import { armPointerClickSuppression } from '../press/activation.ts'
import {
  cancelPointerPressForOwnedGesture,
  observePointerPressCancellation,
} from '../press/gestureArbitration.ts'
import {
  createGestureArena,
  failGesture,
  reduceGestureArena,
  type GestureArenaSession,
  type NormalizedPointerSample,
} from './arena.ts'
import { interactivePopRecognizer, nativeScrollRecognizer } from './existingCompetitors.ts'
import type { Gesture, GesturePoint, GestureSample } from './gesture.ts'

/** The gestures a `GestureView` recognizes: a normal, a simultaneous and a high-priority gesture. */
export type GestureViewProps = Readonly<{
  gesture?: Gesture
  simultaneousGesture?: Gesture
  highPriorityGesture?: Gesture
  children: ReactNode
}>
type Entry = { gesture: Gesture; id: string; priority: number; simultaneous: boolean }
type Contact = { x: number; y: number }
const regions = new WeakMap<Element, () => Entry[]>()

/** A region that recognizes custom gestures on its children. Scrolling and the back swipe still
 * win the touches they own.
 * @experimental Real-touch arbitration and native thresholds remain unqualified.
 */
export function GestureView({
  gesture,
  simultaneousGesture,
  highPriorityGesture,
  children,
}: GestureViewProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const entriesRef = useRef<Entry[]>([])
  const entries: Entry[] = []
  if (gesture) entries.push({ gesture, id: 'gesture', priority: 50, simultaneous: false })
  if (highPriorityGesture)
    entries.push({ gesture: highPriorityGesture, id: 'high', priority: 80, simultaneous: false })
  if (simultaneousGesture)
    entries.push({
      gesture: simultaneousGesture,
      id: 'simultaneous',
      priority: 50,
      simultaneous: true,
    })
  const magnifies = entries.some(entry => entry.gesture.kind === 'magnify')
  const drags = entries.filter(entry => entry.gesture.kind === 'drag')
  const touchAction =
    magnifies || drags.some(entry => entry.gesture.axis === 'any')
      ? 'none'
      : drags.some(entry => entry.gesture.axis === 'vertical')
        ? 'pan-x'
        : drags.length
          ? 'pan-y'
          : 'auto'
  useLayoutEffect(() => {
    entriesRef.current = entries
    const element = elementRef.current!
    if (touchAction === 'pan-y' && rowCanPop(element, element.getBoundingClientRect().left)) {
      element.style.touchAction = 'pan-y pan-right'
    }
  })

  useLayoutEffect(() => {
    const element = elementRef.current!
    const view = element.ownerDocument.defaultView!
    regions.set(element, () => entriesRef.current)
    let session: GestureArenaSession | undefined
    let arena: ReturnType<typeof createGestureArena> | undefined
    let activeEntries: Entry[] = []
    let sample: NormalizedPointerSample | undefined
    let previous: NormalizedPointerSample | undefined
    let sampleValue: GestureSample | undefined
    let stopObserving: (() => void) | undefined
    let claiming = false
    const contacts = new Map<number, Contact>()
    const recognized = new Set<string>()
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const taps = new Map<string, { count: number; time: number; point: GesturePoint }>()
    let pinch: { distance: number; anchor: GesturePoint } | undefined

    const clear = () => {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      stopObserving?.()
      stopObserving = undefined
      session = undefined
      arena = undefined
      sample = undefined
      previous = undefined
      sampleValue = undefined
      pinch = undefined
      contacts.clear()
      recognized.clear()
    }
    const cancel = () => {
      const cancelled = activeEntries.filter(entry => recognized.has(entry.id))
      clear()
      const errors: unknown[] = []
      for (const entry of cancelled) {
        try {
          entry.gesture.cancelled()
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length) throw new AggregateError(errors, 'Gesture cancellation callbacks failed.')
    }
    const values = (next: NormalizedPointerSample): GestureSample => {
      const start = session?.start ?? next
      const elapsed = previous ? (next.time - previous.time) / 1000 : 0
      const points = [...contacts.values()]
      let magnify: GestureSample['magnify']
      if (points.length === 2) {
        const [first, second] = points as [Contact, Contact]
        const length = Math.hypot(second.x - first.x, second.y - first.y)
        if (!pinch && length > 0)
          pinch = {
            distance: length,
            anchor: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
          }
        if (pinch) magnify = { magnification: length / pinch.distance, startAnchor: pinch.anchor }
      }
      return {
        drag: {
          location: { x: next.x, y: next.y },
          startLocation: { x: start.x, y: start.y },
          translation: { x: next.x - start.x, y: next.y - start.y },
          velocity:
            elapsed > 0
              ? { x: (next.x - previous!.x) / elapsed, y: (next.y - previous!.y) / elapsed }
              : { x: 0, y: 0 },
        },
        magnify: magnify ?? sampleValue?.magnify,
      }
    }
    const consume = (next: NormalizedPointerSample) => {
      if (!arena) return
      sampleValue = values(next)
      session = reduceGestureArena(arena, session, next).session
      sample = next
      if (!session) return
      const ending = next.phase === 'end'
      try {
        for (const entry of activeEntries) {
          const state = session.recognizers[entry.id]?.state
          if (state !== 'recognized') {
            if (recognized.delete(entry.id)) entry.gesture.cancelled()
            continue
          }
          if (!recognized.has(entry.id)) {
            recognized.add(entry.id)
            claiming = true
            try {
              cancelPointerPressForOwnedGesture(next.pointerId)
            } finally {
              claiming = false
            }
            armPointerClickSuppression(performance.now(), next.pointerId)
          }
          if (entry.gesture.kind === 'tap' && ending) {
            const last = taps.get(entry.id)
            const consecutive =
              last &&
              next.time - last.time <= 300 &&
              Math.hypot(next.x - last.point.x, next.y - last.point.y) <= 10
            const count = consecutive ? last.count + 1 : 1
            taps.set(entry.id, { count, time: next.time, point: { x: next.x, y: next.y } })
            if (count < (entry.gesture.count ?? 1)) continue
            taps.delete(entry.id)
          }
          if (ending) entry.gesture.ended(sampleValue)
          else entry.gesture.changed(sampleValue)
        }
      } catch (error) {
        try {
          cancel()
        } catch (cancellationError) {
          throw new AggregateError([error, cancellationError], 'Gesture callbacks failed.')
        }
        throw error
      } finally {
        previous = next
        if (ending || next.phase === 'cancel') clear()
      }
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return
      if (event.target.closest('[data-satin-gesture-view]') !== element) return
      if (session) {
        contacts.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (contacts.size > 2) cancel()
        else if (contacts.size === 2 && sample) sampleValue = values(sample)
        return
      }
      if (!event.isPrimary) return
      activeEntries = []
      let ancestor: Element | null = element
      let depth = 0
      while (ancestor) {
        for (const entry of regions.get(ancestor)?.() ?? []) {
          activeEntries.push({
            ...entry,
            id: `${depth}:${entry.id}`,
            priority: entry.priority - depth,
          })
        }
        ancestor = ancestor.parentElement?.closest('[data-satin-gesture-view]') ?? null
        depth++
      }
      contacts.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const canPop =
        !activeEntries.some(entry => entry.gesture.kind === 'magnify') &&
        rowCanPop(event.target, event.clientX)
      arena = createGestureArena({
        bounds: element.getBoundingClientRect(),
        recognizers: [
          {
            ...interactivePopRecognizer,
            evaluate: context =>
              canPop ? interactivePopRecognizer.evaluate(context) : failGesture('no-pop-target'),
          },
          nativeScrollRecognizer,
          ...activeEntries.map(entry => ({
            id: entry.id,
            axis: entry.gesture.axis,
            priority: entry.priority,
            region: { kind: 'all' as const },
            hysteresis: {},
            requiresFailureOf: entry.gesture.kind === 'drag' ? ['interactive-pop'] : [],
            simultaneousWith: activeEntries
              .filter(peer => peer.id !== entry.id && (peer.simultaneous || entry.simultaneous))
              .map(peer => peer.id),
            evaluate: (context: Parameters<Gesture['evaluate']>[0]) =>
              contacts.size > 1 && ['tap', 'longPress'].includes(entry.gesture.kind)
                ? failGesture('multiple-contacts')
                : entry.gesture.evaluate(context, sampleValue!),
          })),
        ],
      })
      consume({
        kind: 'pointer',
        phase: 'start',
        isPrimary: true,
        pointerId: event.pointerId,
        time: event.timeStamp,
        x: event.clientX,
        y: event.clientY,
      })
      stopObserving = observePointerPressCancellation(event.pointerId, () => {
        if (!claiming) cancel()
        return false
      })
      for (const entry of activeEntries) {
        if (entry.gesture.delay === undefined) continue
        const timer = setTimeout(() => {
          timers.delete(timer)
          if (sample && session?.status === 'active')
            consume({ ...sample, phase: 'move', time: event.timeStamp + entry.gesture.delay! })
        }, entry.gesture.delay)
        timers.add(timer)
      }
    }
    const move = (event: PointerEvent) => {
      if (!session || !contacts.has(event.pointerId)) return
      contacts.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const primary = contacts.get(session.primaryPointerId)!
      consume({
        kind: 'pointer',
        phase: 'move',
        isPrimary: true,
        pointerId: session.primaryPointerId,
        time: event.timeStamp,
        x: primary.x,
        y: primary.y,
      })
    }
    const end = (event: PointerEvent) => {
      if (!session || !contacts.has(event.pointerId)) return
      if (event.type === 'pointercancel') {
        cancel()
        return
      }
      // A pinch ends when either finger lifts. Do not promote the remaining finger to a new drag.
      const primary = contacts.get(session.primaryPointerId)!
      consume({
        kind: 'pointer',
        phase: 'end',
        isPrimary: true,
        pointerId: session.primaryPointerId,
        time: event.timeStamp,
        x: event.isPrimary ? event.clientX : primary.x,
        y: event.isPrimary ? event.clientY : primary.y,
      })
    }
    const touchMove = (event: TouchEvent) => {
      if (recognized.size && event.cancelable) event.preventDefault()
    }
    const visibility = () => {
      if (element.ownerDocument.hidden) cancel()
    }
    element.ownerDocument.addEventListener('visibilitychange', visibility)
    element.addEventListener('pointerdown', down)
    element.addEventListener('touchmove', touchMove, { passive: false })
    view.addEventListener('pointermove', move)
    view.addEventListener('pointerup', end)
    view.addEventListener('pointercancel', end)
    view.addEventListener('blur', cancel)
    return () => {
      regions.delete(element)
      element.ownerDocument.removeEventListener('visibilitychange', visibility)
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('touchmove', touchMove)
      view.removeEventListener('pointermove', move)
      view.removeEventListener('pointerup', end)
      view.removeEventListener('pointercancel', end)
      view.removeEventListener('blur', cancel)
      cancel()
    }
  }, [])
  return (
    <div
      ref={elementRef}
      data-satin-gesture-view=""
      data-satin-role={magnifies ? 'zoomable' : undefined}
      style={{ touchAction }}
    >
      {children}
    </div>
  )
}
