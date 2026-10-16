// The back gesture driven by pointer events: the fallback when the installed native scroller
// does not drive the pop (no ScrollTimeline), and the pointer half of arbitration on every host
// (a recognized touch contact cancels the pointer press this tracks). Touch contacts are
// arbitrated in touchArbitration.ts.

import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { horizontalDragBlocksBack } from './horizontalDrag.ts'
import type { AxisLayoutClass } from '../layout/layoutClass.ts'
import { armPointerClickSuppression } from '../press/activation.ts'
import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'
import {
  beginInteractivePopGesture,
  moveInteractivePopGesture,
  type InteractivePopGesture,
} from './interactivePop.ts'
import {
  updateScrubDiagnostic,
  type EarlyTouchArbitration,
  type InteractivePopDiagnostic,
  type InteractiveTransitionController,
  type NavigatorHostGeometry,
  type ScrubDiagnosticState,
} from './interactivePopTypes.ts'
import { shouldCompleteInteractivePop } from './motionTokens.ts'
import type { ScreenRegistry } from './registry.ts'
import type { InteractiveScrubFrameLoop } from './scrubFrameLoop.ts'
import { navigatorTransitionRuntime, type NavigatorStore } from './store.ts'

/** What the navigator host's pointer handlers read; recreated with the host on every render. */
export type PointerPopContext = {
  navigator: NavigatorStore<ScreenRegistry>
  tabActive: boolean
  nativeNavigation: boolean
  split: boolean
  horizontal: AxisLayoutClass
  appliedHorizontal: AxisLayoutClass
  onInteractivePopDiagnostic: ((diagnostic: InteractivePopDiagnostic) => void) | undefined
  startScrubFrameLoop: (
    controller: InteractiveTransitionController,
    diagnosticState: ScrubDiagnosticState,
  ) => InteractiveScrubFrameLoop
  hostGeometryRef: RefObject<NavigatorHostGeometry | undefined>
  earlyTouchArbitrationRef: RefObject<EarlyTouchArbitration | undefined>
  scrubFrameLoopRef: RefObject<InteractiveScrubFrameLoop | undefined>
  scrubDiagnosticStateRef: RefObject<ScrubDiagnosticState | undefined>
  gestureRef: RefObject<InteractivePopGesture | undefined>
  interactiveControllerRef: RefObject<InteractiveTransitionController | undefined>
}

/** The host's pointer handlers for the back gesture. */
export function createPointerPopHandlers(context: PointerPopContext) {
  const {
    navigator,
    tabActive,
    nativeNavigation,
    split,
    horizontal,
    appliedHorizontal,
    onInteractivePopDiagnostic,
    startScrubFrameLoop,
    hostGeometryRef,
    earlyTouchArbitrationRef,
    scrubFrameLoopRef,
    scrubDiagnosticStateRef,
    gestureRef,
    interactiveControllerRef,
  } = context
  const reportGesture = (
    eventName: InteractivePopDiagnostic['event'],
    event: ReactPointerEvent<HTMLDivElement>,
    gesture: InteractivePopGesture | undefined,
    state: InteractivePopDiagnostic['state'],
    reason?: InteractivePopDiagnostic['reason'],
  ) => {
    if (!onInteractivePopDiagnostic) return
    const geometry = hostGeometryRef.current
    if (!geometry) return
    const hasCancellationCoordinates =
      (eventName === 'pointercancel' || eventName === 'lostpointercapture') &&
      event.clientX === 0 &&
      event.clientY === 0
    const x =
      hasCancellationCoordinates && gesture ? gesture.currentX : event.clientX - geometry.left
    const y =
      hasCancellationCoordinates && gesture ? gesture.currentY : event.clientY - geometry.top
    onInteractivePopDiagnostic({
      claimDeltaX: earlyTouchArbitrationRef.current?.claimDeltaX,
      claimDeltaY: earlyTouchArbitrationRef.current?.claimDeltaY,
      deltaX: gesture ? x - gesture.startX : 0,
      deltaY: gesture ? y - gesture.startY : 0,
      event: eventName,
      input: 'pointer',
      pointerId: event.pointerId,
      progress: gesture?.progress ?? 0,
      reason,
      startX: gesture?.startX ?? x,
      startY: gesture?.startY ?? y,
      state,
      velocityPointsPerSecond: gesture?.velocityPointsPerSecond ?? 0,
      x,
      y,
    })
  }

  const clearGesture = (element: HTMLDivElement, pointerId: number) => {
    gestureRef.current = undefined
    interactiveControllerRef.current = undefined
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId)
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && horizontalDragBlocksBack(event.target, event.clientX))
      return
    if (!tabActive) return
    // Native Settings accepts fixed back chrome during an automatic push.
    // It does not consume the route's glass source or acquire a content pan.
    if (
      event.target instanceof Element &&
      event.target.closest('[data-satin-navigation-back-button]')
    )
      return
    if (event.target instanceof Element && event.target.closest('[data-satin-role="zoomable"]'))
      return
    if (
      (split &&
        (navigator.getState().entries.length <= 2 ||
          (event.target as Element)
            .closest('[data-satin-pane]')
            ?.getAttribute('data-satin-pane') === 'sidebar')) ||
      horizontal !== appliedHorizontal ||
      event.pointerType === 'mouse'
    )
      return
    if (!navigator[navigatorTransitionRuntime].canBeginInteractivePop()) {
      reportGesture('pointerdown', event, undefined, 'ignored', 'no-pop-target')
      return
    }
    const geometry = hostGeometryRef.current
    if (!geometry || geometry.width <= 0) return
    scrubFrameLoopRef.current?.dispose()
    scrubFrameLoopRef.current = undefined
    scrubDiagnosticStateRef.current = undefined
    gestureRef.current = beginInteractivePopGesture(gestureRef.current, {
      isPrimary: event.isPrimary,
      pointerId: event.pointerId,
      time: event.timeStamp,
      width: geometry.width,
      x: event.clientX - geometry.left,
      y: event.clientY - geometry.top,
    })
    reportGesture(
      'pointerdown',
      event,
      gestureRef.current,
      gestureRef.current ? 'tracking' : 'ignored',
    )
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (nativeNavigation) return
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (
      earlyTouchArbitrationRef.current?.state === 'claimed' ||
      earlyTouchArbitrationRef.current?.state === 'recognized'
    ) {
      return
    }
    const geometry = hostGeometryRef.current
    if (!geometry) return
    const moved = moveInteractivePopGesture(gesture, {
      pointerId: event.pointerId,
      time: event.timeStamp,
      x: event.clientX - geometry.left,
      y: event.clientY - geometry.top,
    })
    gestureRef.current = moved.gesture
    if (!moved.gesture) {
      reportGesture('pointermove', event, gesture, 'cancelled', moved.resolution)
      clearGesture(event.currentTarget, event.pointerId)
      return
    }

    if (moved.recognized) {
      const controller = navigator[navigatorTransitionRuntime].beginInteractivePop()
      if (!controller) {
        reportGesture('pointermove', event, moved.gesture, 'ignored', 'no-pop-target')
        gestureRef.current = undefined
        return
      }
      interactiveControllerRef.current = controller
      cancelPointerPressForOwnedGesture(event.pointerId, 'back-swipe')
      armPointerClickSuppression(performance.now())
      event.currentTarget.setPointerCapture(event.pointerId)
      startScrubFrameLoop(controller, {
        currentX: moved.gesture.currentX,
        currentY: moved.gesture.currentY,
        input: 'pointer',
        pointerId: moved.gesture.pointerId,
        progress: moved.gesture.progress,
        startX: moved.gesture.startX,
        startY: moved.gesture.startY,
        velocityPointsPerSecond: moved.gesture.velocityPointsPerSecond,
      })
    }

    reportGesture('pointermove', event, moved.gesture, moved.gesture.state, moved.resolution)
    if (moved.gesture.state !== 'recognized') return
    event.preventDefault()
    updateScrubDiagnostic(scrubDiagnosticStateRef.current, 'pointer', moved.gesture)
    scrubFrameLoopRef.current?.record(moved.gesture.progress, event.timeStamp)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (
      earlyTouchArbitrationRef.current?.state === 'claimed' ||
      earlyTouchArbitrationRef.current?.state === 'recognized'
    ) {
      return
    }
    const geometry = hostGeometryRef.current
    if (!geometry) return
    const moved = moveInteractivePopGesture(gesture, {
      pointerId: event.pointerId,
      time: event.timeStamp,
      x: event.clientX - geometry.left,
      y: event.clientY - geometry.top,
    })
    const finalGesture = moved.gesture
    const controller = interactiveControllerRef.current
    if (finalGesture?.state === 'recognized' && controller) {
      event.preventDefault()
      const completes = shouldCompleteInteractivePop(
        finalGesture.progress,
        finalGesture.velocityPointsPerSecond,
      )
      if (completes) {
        reportGesture('pointerup', event, finalGesture, 'completed', 'release-complete')
      } else {
        reportGesture('pointerup', event, finalGesture, 'cancelled', 'release-cancel')
      }
      updateScrubDiagnostic(scrubDiagnosticStateRef.current, 'pointer', finalGesture)
      scrubFrameLoopRef.current?.resolve(
        completes ? 'complete' : 'cancel',
        finalGesture.progress,
        finalGesture.velocityPointsPerSecond,
        event.timeStamp,
      )
    } else {
      reportGesture('pointerup', event, finalGesture ?? gesture, 'cancelled', moved.resolution)
    }
    clearGesture(event.currentTarget, event.pointerId)
  }

  const cancelPointerGesture = (
    event: ReactPointerEvent<HTMLDivElement>,
    eventName: 'lostpointercapture' | 'pointercancel',
  ) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (gesture.state === 'recognized') {
      scrubFrameLoopRef.current?.resolve(
        'cancel',
        gesture.progress,
        gesture.velocityPointsPerSecond,
        event.timeStamp,
      )
    }
    reportGesture(eventName, event, gesture, 'cancelled')
    clearGesture(event.currentTarget, event.pointerId)
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    cancelPointerGesture(event, 'pointercancel')
  }

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    cancelPointerGesture(event, 'lostpointercapture')
  }

  return {
    onLostPointerCapture: handleLostPointerCapture,
    onPointerCancel: handlePointerCancel,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
  }
}
