import type { InteractivePopMove } from './interactivePop.ts'
import type { createNavigationReleaseStatistics } from './releaseDecision.ts'
import type { ReleaseVelocityTracker } from './releaseVelocity.ts'
import type { ScrubFrameMetrics } from './scrubFrameLoop.ts'
import type { TransitionController } from './types.ts'

// The navigator's interactive-pop gesture state (NavigatorHost.tsx, touchArbitration.ts,
// pointerPop.ts).

export type InteractivePopDiagnostic = Readonly<{
  averageEventsPerFrame?: number
  claimDeltaX?: number
  claimDeltaY?: number
  deltaX: number
  deltaY: number
  eventsThisFrame?: number
  event:
    | 'lostpointercapture'
    | 'pointercancel'
    | 'pointerdown'
    | 'pointermove'
    | 'pointerup'
    | 'scrubframe'
    | 'touchclaim'
    | 'touchcancel'
    | 'touchend'
    | 'touchmove'
    | 'touchreject'
  pointerId: number
  progress: number
  input?: 'pointer' | 'touch'
  inputCount?: number
  inputHz?: number
  rafCount?: number
  rafHz?: number
  reason?:
    | InteractivePopMove['resolution']
    | 'early-horizontal-claim'
    | 'early-leftward-release'
    | 'early-vertical-release'
    | 'no-pop-target'
    | 'release-cancel'
    | 'release-complete'
    | 'release-pending'
  startX: number
  startY: number
  state: 'cancelled' | 'claimed' | 'completed' | 'ignored' | 'recognized' | 'tracking' | 'released'
  velocityPointsPerSecond: number
  x: number
  y: number
}>

export type EarlyTouchArbitration = {
  previousX: number
  recognitionOffset?: number
  minimumProgress?: number
  pendingPushKey?: string
  claimDeltaX?: number
  claimDeltaY?: number
  currentX: number
  currentY: number
  identifier: number
  /** The private scroll source could be bound to this contact at touch-down. */
  nativeSource?: HTMLElement
  nativeSourceLive: boolean
  rowBlocksNativeSource: boolean
  progress: number
  /** Chosen at recognition. Installed pops scrub from the private source's
   * ScrollTimeline; 'frame-loop' drives the pose from touch input instead,
   * one write per display frame. */
  scrubOwner?: 'frame-loop' | 'scroll-timeline'
  /** The scroll-timeline scrub attached (it attaches one frame after recognition). */
  scrubAttached?: boolean
  releaseStatistics: ReturnType<typeof createNavigationReleaseStatistics>
  releaseVelocity: ReleaseVelocityTracker
  startX: number
  startY: number
  state: 'claimed' | 'recognized' | 'rejected' | 'tracking'
  velocityPointsPerSecond: number
  width: number
}

export type NavigatorHostGeometry = Readonly<{
  left: number
  top: number
  width: number
}>

export type ScrubDiagnosticState = {
  claimDeltaX?: number
  claimDeltaY?: number
  currentX: number
  currentY: number
  input: 'pointer' | 'touch'
  pointerId: number
  progress: number
  startX: number
  startY: number
  velocityPointsPerSecond: number
}

/** Copies a contact's latest sample into the frame loop's diagnostic state, when that state was
 * started by the same kind of input. */
export function updateScrubDiagnostic(
  state: ScrubDiagnosticState | undefined,
  input: ScrubDiagnosticState['input'],
  sample: Readonly<{
    currentX: number
    currentY: number
    progress: number
    velocityPointsPerSecond: number
  }>,
) {
  if (state?.input !== input) return
  state.currentX = sample.currentX
  state.currentY = sample.currentY
  state.progress = sample.progress
  state.velocityPointsPerSecond = sample.velocityPointsPerSecond
}

/** The diagnostic a recognized scrub reports once per display frame. */
export function scrubFrameDiagnostic(
  state: ScrubDiagnosticState,
  metrics: ScrubFrameMetrics,
): InteractivePopDiagnostic {
  return {
    averageEventsPerFrame: metrics.averageEventsPerFrame,
    claimDeltaX: state.claimDeltaX,
    claimDeltaY: state.claimDeltaY,
    deltaX: state.currentX - state.startX,
    deltaY: state.currentY - state.startY,
    event: 'scrubframe',
    eventsThisFrame: metrics.eventsThisFrame,
    input: state.input,
    inputCount: metrics.inputCount,
    inputHz: metrics.inputHz,
    pointerId: state.pointerId,
    progress: state.progress,
    rafCount: metrics.frameCount,
    rafHz: metrics.rafHz,
    reason: 'recognized',
    startX: state.startX,
    startY: state.startY,
    state: 'recognized',
    velocityPointsPerSecond: state.velocityPointsPerSecond,
    x: state.currentX,
    y: state.currentY,
  }
}

export type InteractiveTransitionController = TransitionController &
  Required<Pick<TransitionController, 'cancelInteractive' | 'completeInteractive' | 'setProgress'>>
