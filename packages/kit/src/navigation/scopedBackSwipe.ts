// EXPERIMENTAL, PRIVATE. The back swipe re-expressed as a participant of the pane gesture scope
// (gestures/ownership.ts), behind the `__SATIN_GESTURE_SCOPE__` development flag.
//
// Ownership moves to the scope: touch-down admission, the arena's direction lock (the same
// interactive-pop recognizer rows already declare), multi-touch policy, cancelable-move
// listeners and terminal cleanup. The response does not move: the participant drives the same
// contact core as the shipping path (`createBackSwipeContact`), so recognition, the native
// scroller's ScrollTimeline scrub, the frame-loop exception and the release handoff are one
// implementation. `scopedBackSwipe.test.ts` replays identical touch traces through both drivers
// and requires identical controller calls.

import {
  INTERACTIVE_POP_RECOGNIZER_ID,
  interactivePopRecognizer,
} from '../gestures/existingCompetitors.ts'
import { createGestureScope, type GestureScope } from '../gestures/ownership.ts'
import {
  createBackSwipeContact,
  type BackSwipeRejection,
  type TouchArbitrationContext,
} from './touchArbitration.ts'

/** The motion output the back swipe writes: the navigation pop transition. */
export const BACK_SWIPE_OUTPUT = 'navigation-pop'

/** Arena reasons from the interactive-pop recognizer that mean the direction lock refused. */
function rejectionFor(reason: string): BackSwipeRejection | undefined {
  if (reason === 'vertical-intent') return 'vertical'
  if (reason === 'leftward-intent') return 'leftward'
  if (reason.startsWith('lost-to:')) return 'lost'
  // Lift, cancellation and refusal at touch-down are handled by finish/refusedEnd.
  return undefined
}

/**
 * Registers the back swipe in `scope` (or in a scope of its own, bound to `host`, when the
 * navigator is not inside a shared pane scope). Returns the same handle as
 * `bindTouchArbitration`.
 */
export function bindScopedBackSwipe(
  host: HTMLDivElement,
  context: TouchArbitrationContext,
  sharedScope?: GestureScope,
) {
  let rowFallback = false
  const contact = createBackSwipeContact(host, context, active => {
    rowFallback = active
  })
  const scope = sharedScope ?? createGestureScope()
  const unregister = scope.register(INTERACTIVE_POP_RECOGNIZER_ID, {
    recognizer: {
      axis: interactivePopRecognizer.axis,
      evaluate: interactivePopRecognizer.evaluate,
      hysteresis: interactivePopRecognizer.hysteresis,
      priority: interactivePopRecognizer.priority,
    },
    output: BACK_SWIPE_OUTPUT,
    multiTouch: 'ignore',
    // The back swipe cancels the press at its measured recognition point, not at the claim.
    pressPolicy: 'own',
    admit(sample, event) {
      // A shared scope also sees contacts outside this navigator (a drawer overlay).
      if (sample.target && !host.contains(sample.target)) return 'outside-pane'
      return contact.admit(event)
    },
    begin(_sample, event) {
      contact.begin(event)
    },
    cancelableMoves: () => contact.needsCancelableMoves() || rowFallback,
    observe(_sample, event) {
      return contact.observe(event) === 'cancelled' ? 'cancel' : undefined
    },
    recognized(_sample, event) {
      contact.claim(event)
    },
    rejected(reason) {
      const rejection = rejectionFor(reason)
      if (rejection) contact.reject(rejection)
    },
    move(_sample, event) {
      contact.advance(event)
    },
    finish(event, cancelled) {
      if (event) contact.finish(event, cancelled)
      else contact.releaseClaim()
    },
    refusedEnd(event) {
      contact.finish(event, event.type === 'touchcancel')
    },
  })
  const unbind = sharedScope ? undefined : scope.bind(host)
  return {
    scope,
    dispose() {
      contact.releaseClaim()
      unregister()
      unbind?.()
    },
    releaseClaim: contact.releaseClaim,
  }
}
