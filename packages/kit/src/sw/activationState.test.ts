import { describe, expect, it } from 'vitest'
import { initialAppShellActivationState, updateAppShellActivationState } from './activationState.ts'

describe('app-shell activation state machine', () => {
  it('discovers current and waiting build IDs without activating the update', () => {
    const state = updateAppShellActivationState(initialAppShellActivationState, {
      current: 'old-build',
      type: 'discovered',
      waiting: 'new-build',
    })

    expect(state).toEqual({
      current: 'old-build',
      phase: 'idle',
      target: null,
      waiting: 'new-build',
    })
  })

  it('keeps the old build current until an explicit activation completes', () => {
    const discovered = updateAppShellActivationState(initialAppShellActivationState, {
      current: 'old-build',
      type: 'discovered',
      waiting: 'new-build',
    })
    const applying = updateAppShellActivationState(discovered, {
      type: 'apply-requested',
    })
    const activating = updateAppShellActivationState(applying, {
      current: 'old-build',
      type: 'discovered',
      waiting: null,
    })

    expect(applying.phase).toBe('applying')
    expect(applying.current).toBe('old-build')
    expect(activating.waiting).toBe('new-build')

    expect(
      updateAppShellActivationState(activating, {
        buildId: 'new-build',
        type: 'activated',
      }),
    ).toEqual({
      current: 'new-build',
      phase: 'idle',
      target: null,
      waiting: null,
    })
  })

  it('ignores activation requests when no worker is waiting', () => {
    expect(
      updateAppShellActivationState(initialAppShellActivationState, {
        type: 'apply-requested',
      }),
    ).toBe(initialAppShellActivationState)
  })

  it('makes a timed-out waiting build eligible for a retry', () => {
    const discovered = updateAppShellActivationState(initialAppShellActivationState, {
      current: 'old-build',
      type: 'discovered',
      waiting: 'new-build',
    })
    const applying = updateAppShellActivationState(discovered, {
      type: 'apply-requested',
    })
    const failed = updateAppShellActivationState(applying, {
      type: 'activation-failed',
    })

    expect(failed).toEqual({
      current: 'old-build',
      phase: 'idle',
      target: null,
      waiting: 'new-build',
    })
    expect(updateAppShellActivationState(failed, { type: 'apply-requested' }).phase).toBe(
      'applying',
    )
  })
})
