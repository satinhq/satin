/** Whether a press is `idle`, held down (`pressed`) or cancelled (`deactivated`). */
export type PressState = 'idle' | 'pressed' | 'deactivated'

export interface PressBounds {
  readonly bottom: number
  readonly left: number
  readonly right: number
  readonly top: number
}

export interface PointerPressSession {
  readonly bounds: PressBounds
  readonly pointerId: number
  readonly state: Exclude<PressState, 'idle'>
}

export interface PressRelease {
  readonly fire: boolean
  readonly state: 'idle'
}

export function beginPointerPress(pointerId: number, bounds: PressBounds): PointerPressSession {
  return { bounds, pointerId, state: 'pressed' }
}

export function updatePointerPressBounds(
  session: PointerPressSession,
  bounds: PressBounds,
): PointerPressSession {
  if (
    session.bounds.bottom === bounds.bottom &&
    session.bounds.left === bounds.left &&
    session.bounds.right === bounds.right &&
    session.bounds.top === bounds.top
  ) {
    return session
  }
  return { ...session, bounds }
}

export function movePointerPress(
  session: PointerPressSession,
  point: Readonly<{ x: number; y: number }>,
  retentionOffset: number,
): PointerPressSession {
  const { bounds } = session
  const insideRetentionRegion =
    point.x >= bounds.left - retentionOffset &&
    point.x <= bounds.right + retentionOffset &&
    point.y >= bounds.top - retentionOffset &&
    point.y <= bounds.bottom + retentionOffset
  const state = insideRetentionRegion ? 'pressed' : 'deactivated'

  return state === session.state ? session : { ...session, state }
}

export function releasePointerPress(session: PointerPressSession): PressRelease {
  return { fire: session.state === 'pressed', state: 'idle' }
}

export function cancelPointerPress(): PressRelease {
  return { fire: false, state: 'idle' }
}

/** Visual feedback is separate from activation while a scroll still owns the touch. */
export type RowFeedbackState = 'idle' | 'pending' | 'pressed' | 'releasing'
export type RowFeedbackEvent = 'down' | 'hold' | 'release' | 'cancel'

export function transitionRowFeedback(
  state: RowFeedbackState,
  event: RowFeedbackEvent,
): RowFeedbackState {
  if (event === 'down') return 'pending'
  if (event === 'cancel') return 'idle'
  if (event === 'hold') return state === 'pending' ? 'pressed' : state
  // A release can fade an existing highlight, but must never create one.
  if (state === 'pending') return 'idle'
  return state === 'pressed' ? 'releasing' : state
}
