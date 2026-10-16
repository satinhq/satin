export interface AppShellActivationState {
  readonly current: string | null
  readonly phase: 'idle' | 'applying'
  readonly target: string | null
  readonly waiting: string | null
}

export type AppShellActivationEvent =
  | {
      readonly current: string | null
      readonly type: 'discovered'
      readonly waiting: string | null
    }
  | { readonly type: 'apply-requested' }
  | { readonly type: 'activation-failed' }
  | { readonly buildId: string | null; readonly type: 'activated' }

export const initialAppShellActivationState: AppShellActivationState = {
  current: null,
  phase: 'idle',
  target: null,
  waiting: null,
}

export function updateAppShellActivationState(
  state: AppShellActivationState,
  event: AppShellActivationEvent,
): AppShellActivationState {
  if (event.type === 'discovered') {
    const waiting =
      state.phase === 'applying' && event.waiting === null ? state.target : event.waiting
    if (state.current === event.current && state.waiting === waiting) return state
    return { ...state, current: event.current, waiting }
  }

  if (event.type === 'apply-requested') {
    if (!state.waiting || state.phase === 'applying') return state
    return {
      ...state,
      phase: 'applying',
      target: state.waiting,
    }
  }

  if (event.type === 'activation-failed') {
    if (state.phase === 'idle') return state
    return {
      ...state,
      phase: 'idle',
      target: null,
    }
  }

  const current = event.buildId ?? state.target ?? state.current
  return {
    current,
    phase: 'idle',
    target: null,
    waiting: null,
  }
}
