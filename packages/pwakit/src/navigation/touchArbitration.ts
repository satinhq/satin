import type { RefObject } from 'react'
import { rowBlocksNativeBack } from '../actions/recognizers.ts'
import { horizontalDragBlocksBack } from './horizontalDrag.ts'
import type { AxisLayoutClass } from '../layout/layoutClass.ts'
import { recordMotionPreparation } from '../motionProbe.ts'
import { armPointerClickSuppression } from '../press/activation.ts'
import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'
import { resolveInteractivePopDirectionLock, type InteractivePopGesture } from './interactivePop.ts'
import {
  updateScrubDiagnostic,
  type EarlyTouchArbitration,
  type InteractivePopDiagnostic,
  type InteractiveTransitionController,
  type NavigatorHostGeometry,
  type ScrubDiagnosticState,
} from './interactivePopTypes.ts'
import { NAVIGATION_HORIZONTAL_INTENT_PX, shouldCompleteInteractivePop } from './motionTokens.ts'
import {
  nativeScrubSourceLiveAt,
  releaseNativeScrubClamp,
  retireNativeScrubSource,
} from './nativeScrubSource.ts'
import { createNavigationReleaseStatistics } from './releaseDecision.ts'
import { createReleaseVelocityTracker } from './releaseVelocity.ts'
import type { ScreenRegistry } from './registry.ts'
import type { InteractiveScrubFrameLoop } from './scrubFrameLoop.ts'
import { navigatorTransitionRuntime, type NavigatorStore } from './store.ts'

/** What the navigator host's touch arbitration reads when its listeners are bound. */
export type TouchArbitrationContext = {
  navigator: NavigatorStore<ScreenRegistry>
  nativeNavigation: boolean
  automaticPushActive: boolean
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
  earlyTouchControllerRef: RefObject<InteractiveTransitionController | undefined>
  scrubFrameLoopRef: RefObject<InteractiveScrubFrameLoop | undefined>
  scrubDiagnosticStateRef: RefObject<ScrubDiagnosticState | undefined>
  gestureRef: RefObject<InteractivePopGesture | undefined>
  interactiveControllerRef: RefObject<InteractiveTransitionController | undefined>
  nativeSourceRef: RefObject<HTMLDivElement | null>
}

/** Motion probe experiment (cadence probe pages only, armed once from motionProbeControls):
 * blocks the main thread for 300 ms, 350 ms after a back swipe touches down, to show whether
 * the native scroll-driven scrub keeps the page moving without the main thread. */
function runArmedNativeBlockExperiment() {
  if (
    new URLSearchParams(location.search).get('cadence') !== '1' ||
    sessionStorage.getItem('satin:probe-native-block') !== '1'
  )
    return
  sessionStorage.removeItem('satin:probe-native-block')
  setTimeout(() => {
    const start = performance.now()
    while (performance.now() - start < 300) {
      /* deliberate ownership experiment */
    }
    recordMotionPreparation({
      kind: 'intentional-native-block',
      start,
      end: performance.now(),
    })
  }, 350)
}

/** Touch arbitration for the interactive pop: a contact is tracked from touch-down, claimed on a
 * horizontal direction lock, recognized past the intent distance (acquiring the pop), scrubbed by
 * the private ScrollTimeline source or a frame loop, and released on touchend/touchcancel.
 * Returns the listeners' cleanup. */
export function bindTouchArbitration(host: HTMLDivElement, context: TouchArbitrationContext) {
  const {
    navigator,
    nativeNavigation,
    automaticPushActive,
    split,
    horizontal,
    appliedHorizontal,
    onInteractivePopDiagnostic,
    startScrubFrameLoop,
    hostGeometryRef,
    earlyTouchArbitrationRef,
    earlyTouchControllerRef,
    scrubFrameLoopRef,
    scrubDiagnosticStateRef,
    gestureRef,
    interactiveControllerRef,
    nativeSourceRef,
  } = context
  const changedTouch = (event: TouchEvent, identifier?: number) => {
    for (let index = 0; index < event.changedTouches.length; index += 1) {
      const touch = event.changedTouches.item(index)
      if (touch && (identifier === undefined || touch.identifier === identifier)) {
        return touch
      }
    }
    return undefined
  }
  const reportEarlyTouch = (
    event: InteractivePopDiagnostic['event'],
    arbitration: EarlyTouchArbitration,
    reason: InteractivePopDiagnostic['reason'],
    finalState?: InteractivePopDiagnostic['state'],
  ) => {
    recordMotionPreparation(() => ({
      kind: 'navigation-arbitration',
      at: performance.now(),
      native: nativeNavigation,
      event,
      reason,
      state: finalState ?? arbitration.state,
      claimDeltaX: arbitration.claimDeltaX,
      claimDeltaY: arbitration.claimDeltaY,
      recognitionOffset: arbitration.recognitionOffset,
      deltaX: arbitration.currentX - arbitration.startX,
      deltaY: arbitration.currentY - arbitration.startY,
      progress: arbitration.progress,
      velocity: arbitration.velocityPointsPerSecond,
    }))
    if (!onInteractivePopDiagnostic) return
    onInteractivePopDiagnostic({
      claimDeltaX: arbitration.claimDeltaX,
      claimDeltaY: arbitration.claimDeltaY,
      deltaX: arbitration.currentX - arbitration.startX,
      deltaY: arbitration.currentY - arbitration.startY,
      event,
      input: 'touch',
      pointerId: arbitration.identifier,
      progress: arbitration.progress,
      reason,
      startX: arbitration.startX,
      startY: arbitration.startY,
      state:
        finalState ??
        (arbitration.state === 'claimed'
          ? 'claimed'
          : arbitration.state === 'recognized'
            ? 'recognized'
            : 'cancelled'),
      velocityPointsPerSecond: arbitration.velocityPointsPerSecond,
      x: arbitration.currentX,
      y: arbitration.currentY,
    })
  }
  let retainedGlassContact: AbortController | undefined
  const retireGlassContact = () => {
    retainedGlassContact?.abort()
    retainedGlassContact = undefined
  }
  let rowFallbackListener = false
  const releaseRowFallback = () => {
    host.removeEventListener('touchmove', handleRowFallbackMove)
    rowFallbackListener = false
  }
  const handleRowFallbackMove = (event: TouchEvent) => handleTouchMove(event)
  const handleCommonMove = (event: TouchEvent) => {
    if (!rowFallbackListener) handleTouchMove(event)
  }
  /** Some entry above the root is not already leaving. */
  const hasPopTarget = () =>
    navigator
      .getState()
      .entries.slice(1)
      .some(entry => entry.transition.phase !== 'exiting')
  /** Why a new contact cannot become a back swipe; undefined when it can be tracked. A contact
   * that touches down during an automatic push (`pendingPush`) may still take that push over. */
  const contactGateReason = (
    event: TouchEvent,
    target: Element | undefined,
    pendingPush: boolean,
  ) => {
    if (target && horizontalDragBlocksBack(target, changedTouch(event)?.clientX))
      return 'horizontal-control'
    if (target?.closest('[data-satin-role="zoomable"]')) return 'zoomable-content'
    if (
      split &&
      (navigator.getState().entries.length <= 2 ||
        target?.closest('[data-satin-pane]')?.getAttribute('data-satin-pane') === 'sidebar')
    )
      return 'split-layout'
    if (horizontal !== appliedHorizontal) return 'layout-changing'
    if (earlyTouchArbitrationRef.current) return 'contact-already-owned'
    if (event.touches.length !== 1) return 'multiple-contacts'
    if (!pendingPush && !navigator[navigatorTransitionRuntime].canBeginInteractivePop()) {
      // A swipe during the last pop's completion has nothing left to pop (owner 101, Oct 5):
      // name that, not the transition that happens to be running.
      return navigator[navigatorTransitionRuntime].descriptors().length && hasPopTarget()
        ? 'transition-owned'
        : 'no-pop-target'
    }
    if (!hostGeometryRef.current?.width) return 'geometry-unavailable'
    return undefined
  }
  const handleTouchStart = (event: TouchEvent) => {
    const target = event.target instanceof Element ? event.target : undefined
    const pendingPush = nativeNavigation && automaticPushActive
    const gateReason = contactGateReason(event, target, pendingPush)
    // A sheet, alert or menu presented from one of this stack's screens is a DOM descendant of
    // this host, so its touches bubble here. They belong to the presentation: measured on the
    // iPad, a sideways swipe on an open sheet popped the screen that presents it.
    const presentation = target?.closest('dialog')
    const reason = presentation && host.contains(presentation) ? 'presentation-contact' : gateReason
    recordMotionPreparation(() => ({
      kind: 'navigation-gesture-gate',
      at: performance.now(),
      inputAt: event.timeStamp,
      stage: 'contact-candidate',
      accepted: !reason,
      reason: reason ?? 'tracking',
      transitions: navigator[navigatorTransitionRuntime].descriptors().map(descriptor => ({
        operation: descriptor.operation,
        phase: descriptor.controller.interactionPhase,
      })),
    }))
    if (reason) return
    for (const transition of navigator[navigatorTransitionRuntime].descriptors())
      transition.controller.prepareForNextGesture?.()
    if (nativeNavigation) runArmedNativeBlockExperiment()
    const touch = changedTouch(event)
    if (!touch) return
    // Read after prepareForNextGesture: a re-arm there is later than touch-down.
    // The contact is bound to the innermost scrolling tree node. A row hands
    // that same source to the back owner; the ancestor source never moved.
    const rowSource = target
      ?.closest('[data-satin-row-compositor="true"]')
      ?.querySelector<HTMLElement>('[data-satin-row-scrub]')
    const nativeSource = rowSource ?? nativeSourceRef.current
    const rowBlocksNativeSource = rowBlocksNativeBack(target)
    const nativeSourceLive =
      nativeNavigation &&
      !rowBlocksNativeSource &&
      nativeScrubSourceLiveAt(nativeSource, event.timeStamp)
    // The next eligible contact owns native scrolling from touch-down. Keeping
    // the retirement clamp until track attachment resets WebKit's first pan
    // samples while recognition is still pending.
    if (nativeSourceLive && nativeSource) releaseNativeScrubClamp(nativeSource)
    scrubFrameLoopRef.current?.dispose()
    scrubFrameLoopRef.current = undefined
    scrubDiagnosticStateRef.current = undefined
    const geometry = hostGeometryRef.current
    if (!geometry || geometry.width <= 0) return
    const x = touch.clientX - geometry.left
    const y = touch.clientY - geometry.top
    const releaseVelocity = createReleaseVelocityTracker()
    releaseVelocity.record(x, event.timeStamp)
    const pendingPushKey = pendingPush ? navigator.getState().entries.at(-1)?.key : undefined
    if (pendingPushKey)
      recordMotionPreparation(() => ({
        kind: 'push-contact-held',
        at: event.timeStamp,
        observedAt: performance.now(),
        screenKey: pendingPushKey,
        identifier: touch.identifier,
      }))
    if (nativeNavigation && rowBlocksNativeSource) {
      rowFallbackListener = true
      host.addEventListener('touchmove', handleRowFallbackMove, { passive: false })
    }
    earlyTouchArbitrationRef.current = {
      previousX: x,
      pendingPushKey,
      currentX: x,
      currentY: y,
      identifier: touch.identifier,
      nativeSource: nativeSource ?? undefined,
      nativeSourceLive,
      rowBlocksNativeSource,
      progress: 0,
      releaseVelocity,
      releaseStatistics: createNavigationReleaseStatistics(),
      startX: x,
      startY: y,
      state: 'tracking',
      velocityPointsPerSecond: 0,
      width: geometry.width,
    }
  }
  const updateArbitration = (
    arbitration: EarlyTouchArbitration,
    x: number,
    y: number,
    time: number,
  ) => {
    const deltaX = x - arbitration.startX
    arbitration.previousX = arbitration.currentX
    arbitration.currentX = x
    arbitration.currentY = y
    arbitration.progress = Math.min(
      1,
      Math.max(
        arbitration.minimumProgress ?? 0,
        (deltaX - (arbitration.recognitionOffset ?? 0)) / arbitration.width,
      ),
    )
    arbitration.velocityPointsPerSecond = arbitration.releaseVelocity.record(x, time)
    arbitration.releaseStatistics.record(x, arbitration.velocityPointsPerSecond, time)
  }
  /** Acquires the pop for a claimed contact that has travelled past the intent distance.
   * Returns undefined, rejecting the contact, when it cannot drive a pop. */
  const recognizeBackSwipe = (arbitration: EarlyTouchArbitration, event: TouchEvent) => {
    if (arbitration.pendingPushKey) {
      // UIKit can retain a contact begun during a push. Preserve its raw
      // samples, but do not hand it a different route. Once accepted, a
      // contact always drives the page: the covered route's glass is retained.
      if (
        split ||
        horizontal !== appliedHorizontal ||
        navigator.getState().entries.at(-1)?.key !== arbitration.pendingPushKey
      ) {
        arbitration.state = 'rejected'
        reportEarlyTouch('touchreject', arbitration, 'no-pop-target')
        return undefined
      }
    }
    const pendingPushKey = arbitration.pendingPushKey
    // Native (iOS 27 NavigationStack reference) turns an interrupted push around at its
    // presented pose. Read it before the store settles the push.
    let inFlightPose = pendingPushKey
      ? navigator[navigatorTransitionRuntime]
          .descriptors()
          .find(transition => transition.operation === 'push' && !transition.interactive)
          ?.controller.presentedPose?.()
      : undefined
    const controller = navigator[navigatorTransitionRuntime].beginInteractivePop(
      pendingPushKey ? { interruptPushTo: pendingPushKey } : undefined,
    )
    recordMotionPreparation({
      kind: 'navigation-gesture-gate',
      stage: 'recognition',
      at: performance.now(),
      inputAt: event.timeStamp,
      accepted: Boolean(controller),
      reason: controller ? 'acquired' : 'transition-or-target-changed',
    })
    if (!controller) {
      arbitration.state = 'rejected'
      reportEarlyTouch('touchreject', arbitration, 'no-pop-target')
      return
    }
    if (inFlightPose === undefined && controller.progress !== 0) inFlightPose = controller.progress
    if (pendingPushKey) {
      // Seed the new binding before React commits it; do not flash a zero
      // pose while waiting for its ScrollTimeline attachment.
      controller.setProgress(arbitration.progress)
      recordMotionPreparation(() => ({
        kind: 'push-contact-acquired',
        at: event.timeStamp,
        observedAt: performance.now(),
        screenKey: pendingPushKey,
        identifier: arbitration.identifier,
        deltaX: arbitration.currentX - arbitration.startX,
      }))
      arbitration.pendingPushKey = undefined
    }
    earlyTouchControllerRef.current = controller
    if (nativeNavigation) {
      // Retain the last contact inside the recognition boundary. A
      // contact exactly on the boundary belongs to that dead zone too;
      // using its predecessor adds a whole delivered segment to motion.
      arbitration.recognitionOffset =
        (arbitration.currentX - arbitration.startX <= NAVIGATION_HORIZONTAL_INTENT_PX
          ? arbitration.currentX
          : arbitration.previousX) - arbitration.startX
      arbitration.progress = Math.max(
        0,
        (arbitration.currentX - arbitration.startX - arbitration.recognitionOffset) /
          arbitration.width,
      )
    }
    if (inFlightPose !== undefined) {
      // The pop starts where the push was on screen; the finger's later movement adds to it.
      // It never snaps to the push's end or to the finger's own progress.
      arbitration.recognitionOffset =
        arbitration.currentX - arbitration.startX - inFlightPose * arbitration.width
      arbitration.progress = inFlightPose
      arbitration.minimumProgress = Math.min(0, inFlightPose)
      controller.setProgress(inFlightPose)
    }
    const pointerId = gestureRef.current?.pointerId
    if (pointerId !== undefined) {
      retireGlassContact()
      retainedGlassContact = new AbortController()
      cancelPointerPressForOwnedGesture(pointerId, 'back-swipe', {
        touchIdentifier: arbitration.identifier,
        retired: retainedGlassContact.signal,
      })
    }
    armPointerClickSuppression(performance.now())
    arbitration.releaseStatistics.begin(
      arbitration.currentX,
      arbitration.velocityPointsPerSecond,
      event.timeStamp,
      arbitration.width,
    )
    arbitration.state = 'recognized'
    reportEarlyTouch('touchmove', arbitration, 'recognized')
    startTouchScrub(arbitration, controller, inFlightPose)
    return controller
  }
  /** Chooses what drives the recognized contact's page (the native scroller's ScrollTimeline or
   * the touch frame loop) and starts it. */
  const startTouchScrub = (
    arbitration: EarlyTouchArbitration,
    controller: InteractiveTransitionController,
    inFlightPose: number | undefined,
  ) => {
    if (nativeNavigation) {
      // A ScrollTimeline scrub must never run beside another pop's
      // document-timeline release. On iOS 27 WebKit that mix leaves a
      // stale scroll-driven pose on the compositor, revealed when the
      // release ends: the settled page reappears shifted (owner phone
      // 2026-09-24; reproduced 3/3 in the Simulator). A contact taken
      // during another transition is driven from touch input instead.
      const inFlight = navigator[navigatorTransitionRuntime]
        .descriptors()
        .some(transition => transition.controller !== controller)
      arbitration.scrubOwner =
        arbitration.nativeSourceLive && !inFlight && inFlightPose === undefined
          ? 'scroll-timeline'
          : 'frame-loop'
      const owner = arbitration.scrubOwner
      recordMotionPreparation(() => ({
        kind: 'navigation-scrub-owner',
        at: performance.now(),
        owner,
        reason: arbitration.rowBlocksNativeSource
          ? 'row-touch-policy'
          : !arbitration.nativeSourceLive
            ? 'source-retired-at-contact'
            : inFlight
              ? 'transition-in-flight'
              : 'source-live-at-contact',
      }))
    }
    if (nativeNavigation && arbitration.scrubOwner === 'scroll-timeline') {
      const source = arbitration.nativeSource ?? nativeSourceRef.current!
      const current = controller
      requestAnimationFrame(() => {
        if (earlyTouchControllerRef.current !== current || arbitration.state !== 'recognized')
          return
        const dx = arbitration.currentX - arbitration.startX
        arbitration.scrubAttached = true
        current.scrubFromScroll?.(
          source,
          source.clientWidth * 2,
          dx - (arbitration.recognitionOffset ?? 0) - (source.clientWidth * 2 - source.scrollLeft),
        )
      })
    } else
      startScrubFrameLoop(controller, {
        claimDeltaX: arbitration.claimDeltaX,
        claimDeltaY: arbitration.claimDeltaY,
        currentX: arbitration.currentX,
        currentY: arbitration.currentY,
        input: 'touch',
        pointerId: arbitration.identifier,
        progress: arbitration.progress,
        startX: arbitration.startX,
        startY: arbitration.startY,
        velocityPointsPerSecond: arbitration.velocityPointsPerSecond,
      })
  }
  const handleTouchMove = (event: TouchEvent) => {
    const arbitration = earlyTouchArbitrationRef.current
    if (!arbitration) return
    const touch = changedTouch(event, arbitration.identifier)
    if (!touch) return
    // A noncancelable move means WebKit has already committed browser panning.
    // Never acquire (or continue) a competing frame-driven navigation gesture.
    if (arbitration.rowBlocksNativeSource && !event.cancelable) {
      releaseRowFallback()
      finishTouch(event, true)
      return
    }
    const geometry = hostGeometryRef.current
    if (!geometry) return
    updateArbitration(
      arbitration,
      touch.clientX - geometry.left,
      touch.clientY - geometry.top,
      event.timeStamp,
    )
    if (arbitration.state === 'tracking') {
      const deltaX = arbitration.currentX - arbitration.startX
      const deltaY = arbitration.currentY - arbitration.startY
      const resolution = resolveInteractivePopDirectionLock(deltaX, deltaY)
      if (resolution === 'tracking') return
      if (resolution !== 'claim-horizontal') {
        arbitration.state = 'rejected'
        releaseRowFallback()
        reportEarlyTouch(
          'touchreject',
          arbitration,
          resolution === 'reject-vertical' ? 'early-vertical-release' : 'early-leftward-release',
        )
        return
      }
      arbitration.claimDeltaX = deltaX
      arbitration.claimDeltaY = deltaY
      arbitration.state = 'claimed'
      if (!nativeNavigation || arbitration.rowBlocksNativeSource) event.preventDefault()
      reportEarlyTouch('touchclaim', arbitration, 'early-horizontal-claim')
      // One delivered sample may cross both lock and recognition thresholds.
      // Acquire on that sample; waiting for another would consume its entire
      // displacement as hysteresis on coarse or delayed input delivery.
    }
    if (arbitration.state === 'claimed' || arbitration.state === 'recognized') {
      if (!nativeNavigation || arbitration.rowBlocksNativeSource) event.preventDefault()
      let controller = earlyTouchControllerRef.current
      if (
        !controller &&
        arbitration.currentX - arbitration.startX >= NAVIGATION_HORIZONTAL_INTENT_PX
      ) {
        controller = recognizeBackSwipe(arbitration, event)
        if (!controller) return
      }
      updateScrubDiagnostic(scrubDiagnosticStateRef.current, 'touch', arbitration)
      if (controller) {
        scrubFrameLoopRef.current?.record(arbitration.progress, event.timeStamp)
      }
    }
  }
  const finishTouch = (event: TouchEvent, cancelled: boolean) => {
    const arbitration = earlyTouchArbitrationRef.current
    if (!arbitration) {
      releaseRowFallback()
      // A contact queued before route readiness never acquires navigation.
      // Return any consumed native range before accepting a later contact.
      if (nativeNavigation && nativeSourceRef.current)
        nativeSourceRef.current.scrollLeft = nativeSourceRef.current.clientWidth * 2
      return
    }
    const touch = changedTouch(event, arbitration.identifier)
    if (
      !touch &&
      Array.from(event.touches).some(
        activeTouch => activeTouch.identifier === arbitration.identifier,
      )
    ) {
      return
    }
    const geometry = hostGeometryRef.current
    if (touch && geometry) {
      const lastMovementX = arbitration.currentX
      arbitration.currentX = touch.clientX - geometry.left
      arbitration.currentY = touch.clientY - geometry.top
      arbitration.progress = Math.min(
        1,
        Math.max(
          arbitration.minimumProgress ?? 0,
          (arbitration.currentX - arbitration.startX - (arbitration.recognitionOffset ?? 0)) /
            arbitration.width,
        ),
      )
      arbitration.velocityPointsPerSecond = arbitration.releaseVelocity.release(event.timeStamp)
      arbitration.releaseStatistics.record(
        lastMovementX,
        arbitration.velocityPointsPerSecond,
        event.timeStamp,
      )
    }
    const controller = earlyTouchControllerRef.current
    if (arbitration.state === 'claimed' || arbitration.state === 'recognized') {
      // Row fallback ownership was established by canceling moves. Native-mode
      // end/cancel listeners stay passive and need no further cancellation.
      if (!nativeNavigation) event.preventDefault()
    }
    if (controller) {
      const completes =
        !cancelled &&
        shouldCompleteInteractivePop(arbitration.progress, arbitration.velocityPointsPerSecond)
      reportEarlyTouch(
        cancelled ? 'touchcancel' : 'touchend',
        arbitration,
        nativeNavigation && controller.resolveInteractive
          ? 'release-pending'
          : completes
            ? 'release-complete'
            : 'release-cancel',
        nativeNavigation && controller.resolveInteractive
          ? 'released'
          : completes
            ? 'completed'
            : 'cancelled',
      )
      updateScrubDiagnostic(scrubDiagnosticStateRef.current, 'touch', arbitration)
      if (nativeNavigation) {
        if (arbitration.scrubOwner === 'scroll-timeline' && !arbitration.scrubAttached) {
          // Lifted before the scroll timeline attached: no page track followed the source, the
          // page is still at its pre-gesture pose and releases from there. Return the source's
          // consumed range so the next contact does not start offset.
          const source = nativeSourceRef.current
          if (source && source.scrollLeft !== source.clientWidth * 2)
            retireNativeScrubSource(source, source.clientWidth * 2)
        }
        if (arbitration.scrubOwner === 'frame-loop') {
          // Touch-driven scrub: its last painted frame is the release origin.
          // No queued frame may repaint the page after the release begins.
          scrubFrameLoopRef.current?.dispose()
          scrubFrameLoopRef.current = undefined
          // Nothing followed the private source during this contact. If the
          // contact scrolled it anyway, recentre it without momentum.
          const source = arbitration.nativeSource ?? nativeSourceRef.current
          if (source && source.scrollLeft !== source.clientWidth * 2)
            retireNativeScrubSource(source, source.clientWidth * 2)
        }
        // The controller hands off attached native scroll tracks in this task, from the
        // further-along of their pose and the lift, on a clock that starts when the release tracks are installed.
        // Custom controllers without reconciliation retain the raw fallback.
        if (controller.resolveInteractive)
          controller.resolveInteractive(
            arbitration.velocityPointsPerSecond,
            arbitration.progress,
            cancelled,
            arbitration.releaseStatistics.snapshot(),
            event.timeStamp,
          )
        else if (completes)
          controller.completeInteractive(arbitration.velocityPointsPerSecond, arbitration.progress)
        else controller.cancelInteractive(arbitration.velocityPointsPerSecond, arbitration.progress)
      } else
        scrubFrameLoopRef.current?.resolve(
          completes ? 'complete' : 'cancel',
          arbitration.progress,
          arbitration.velocityPointsPerSecond,
          event.timeStamp,
        )
    }
    if (nativeNavigation && !controller && nativeSourceRef.current) {
      // A sub-intent or rejected contact must not consume the next contact's
      // native scroll range. No navigation track was visible for this contact.
      nativeSourceRef.current.scrollLeft = nativeSourceRef.current.clientWidth * 2
    }
    releaseRowFallback()
    retireGlassContact()
    earlyTouchControllerRef.current = undefined
    earlyTouchArbitrationRef.current = undefined
    gestureRef.current = undefined
    interactiveControllerRef.current = undefined
  }
  // finishTouch releases the fallback listener only when the owning contact is
  // over; another finger lifting keeps the owner's moves on the cancelable path.
  const handleTouchEnd = (event: TouchEvent) => finishTouch(event, false)
  const handleTouchCancel = (event: TouchEvent) => finishTouch(event, true)

  host.addEventListener('touchstart', handleTouchStart, { passive: true })
  host.addEventListener('touchmove', handleCommonMove, { passive: nativeNavigation })
  host.addEventListener('touchend', handleTouchEnd, { passive: nativeNavigation })
  host.addEventListener('touchcancel', handleTouchCancel, { passive: nativeNavigation })
  const dispose = () => {
    retireGlassContact()
    host.removeEventListener('touchstart', handleTouchStart)
    releaseRowFallback()
    host.removeEventListener('touchmove', handleCommonMove)
    host.removeEventListener('touchend', handleTouchEnd)
    host.removeEventListener('touchcancel', handleTouchCancel)
  }
  return {
    dispose,
    releaseClaim: () => {
      retireGlassContact()
      releaseRowFallback()
    },
  }
}
