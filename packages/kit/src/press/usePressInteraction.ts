import {
  useEffect,
  useRef,
  useState,
  startTransition,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  armPointerClickSuppression,
  beginKeyboardActivation,
  releaseKeyboardActivation,
  resolveClickActivation,
  type KeyboardActivationSession,
  type PressKey,
} from './activation.ts'
import {
  transitionRowFeedback,
  type RowFeedbackState,
  type RowFeedbackEvent,
  beginPointerPress,
  cancelPointerPress,
  movePointerPress,
  updatePointerPressBounds,
  releasePointerPress,
  type PointerPressSession,
  type PressState,
} from './stateMachine.ts'
import { ROW_HIGHLIGHT_DELAY_MS, PRESSABLE_RETENTION_OFFSET_PX } from './tokens.ts'
import { registerPointerPressCancellation } from './gestureArbitration.ts'

const PRESS_KEYS = new Set<PressKey>(['Enter', ' '])
const CLICK_SESSION_TIMEOUT_MS = 1_000

/** Shared contact feedback. Native inputs keep their own browser activation. */
export function usePressInteraction<T extends HTMLButtonElement | HTMLInputElement>({
  disabled = false,
  feedback = 'opacity',
  onPress,
  prefetch,
  onPressStateChange,
  nativeActivation = false,
}: {
  disabled?: boolean
  feedback?: 'opacity' | 'row'
  prefetch?: (signal: AbortSignal) => void | Promise<unknown>
  onPress?: () => void
  onPressStateChange?: (state: PressState) => void
  nativeActivation?: boolean
}) {
  const [pressState, setRenderedPressState] = useState<PressState>('idle')
  const [pressTransition, setPressTransition] = useState<'instant' | 'return' | 'cancel'>('instant')
  const [rowFeedback, setRowFeedback] = useState<RowFeedbackState>('idle')
  const rowFeedbackRef = useRef<RowFeedbackState>('idle')
  const rowDelayRef = useRef<number | undefined>(undefined)
  const elementRef = useRef<T | null>(null)
  const pressStateRef = useRef<PressState>('idle')
  const pointerSessionRef = useRef<PointerPressSession | undefined>(undefined)
  const pointerCancellationCleanupRef = useRef<(() => void) | undefined>(undefined)
  const keyboardSessionRef = useRef<KeyboardActivationSession | undefined>(undefined)
  const keyboardCleanupRef = useRef<number | undefined>(undefined)
  const prefetchControllerRef = useRef<AbortController | undefined>(undefined)
  const prefetchRef = useRef(prefetch)
  const onPressRef = useRef(onPress)
  const onPressStateChangeRef = useRef(onPressStateChange)

  useEffect(() => {
    prefetchRef.current = prefetch
    onPressRef.current = onPress
    onPressStateChangeRef.current = onPressStateChange
  }, [onPress, prefetch, onPressStateChange])

  const cancelPrefetch = () => {
    prefetchControllerRef.current?.abort()
    prefetchControllerRef.current = undefined
  }
  const beginPrefetch = () => {
    cancelPrefetch()
    if (!prefetchRef.current) return
    const controller = new AbortController()
    prefetchControllerRef.current = controller
    try {
      // Preparation never delays or prevents the press action. The destination
      // owns error UI; a rejected speculative request must not escape its event.
      void Promise.resolve(prefetchRef.current(controller.signal)).catch(() => {})
    } catch {
      // Synchronous preparation errors also leave activation available.
    }
  }
  const acceptPrefetch = () => {
    // A successful release hands work to the destination. Do not abort it when
    // navigation unmounts the source control before the destination subscribes.
    prefetchControllerRef.current = undefined
  }

  const renderPressState = (nextState: PressState) => {
    if (pressStateRef.current === nextState) return
    const previousState = pressStateRef.current
    pressStateRef.current = nextState
    setPressTransition(
      previousState === 'deactivated' && nextState === 'pressed' ? 'return' : 'instant',
    )
    setRenderedPressState(nextState)
    // Keep app preparation from suspending live contact feedback.
    startTransition(() => onPressStateChangeRef.current?.(nextState))
  }

  const clearRowDelay = () => {
    if (rowDelayRef.current === undefined) return
    window.clearTimeout(rowDelayRef.current)
    rowDelayRef.current = undefined
  }

  const updateRowFeedback = (event: RowFeedbackEvent) => {
    if (feedback !== 'row') return
    clearRowDelay()
    rowFeedbackRef.current = transitionRowFeedback(rowFeedbackRef.current, event)
    setRowFeedback(rowFeedbackRef.current)
    if (event === 'down') {
      rowDelayRef.current = window.setTimeout(
        () => updateRowFeedback('hold'),
        ROW_HIGHLIGHT_DELAY_MS,
      )
    }
  }

  const clearPointerSession = (element = elementRef.current) => {
    cancelPrefetch()
    const session = pointerSessionRef.current
    // A native input's browser click must retire with its cancelled contact.
    // Buttons already own activation; leave their receipt path unchanged.
    if (nativeActivation && session) {
      armPointerClickSuppression(performance.now(), session.pointerId)
    }
    if (session || rowFeedbackRef.current === 'pending' || rowFeedbackRef.current === 'pressed') {
      updateRowFeedback('cancel')
    }
    pointerSessionRef.current = undefined
    pointerCancellationCleanupRef.current?.()
    pointerCancellationCleanupRef.current = undefined
    if (session && element?.hasPointerCapture(session.pointerId)) {
      element.releasePointerCapture(session.pointerId)
    }
    renderPressState(cancelPointerPress().state)
    setPressTransition('cancel')
  }

  const clearKeyboardSession = () => {
    keyboardSessionRef.current = undefined
    if (keyboardCleanupRef.current !== undefined) {
      window.clearTimeout(keyboardCleanupRef.current)
      keyboardCleanupRef.current = undefined
    }
  }

  const scheduleKeyboardSessionCleanup = (session: KeyboardActivationSession) => {
    if (keyboardCleanupRef.current !== undefined) {
      window.clearTimeout(keyboardCleanupRef.current)
    }
    keyboardCleanupRef.current = window.setTimeout(() => {
      if (keyboardSessionRef.current === session) {
        keyboardSessionRef.current = undefined
      }
      keyboardCleanupRef.current = undefined
    }, CLICK_SESSION_TIMEOUT_MS)
  }

  const handlePointerDown = (event: PointerEvent<T>) => {
    if (disabled || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
      return
    }
    if (pointerSessionRef.current) return

    const element = event.currentTarget
    const bounds = element.getBoundingClientRect()
    pointerSessionRef.current = beginPointerPress(event.pointerId, bounds)
    pointerCancellationCleanupRef.current = registerPointerPressCancellation(
      event.pointerId,
      () => {
        if (pointerSessionRef.current?.pointerId !== event.pointerId) return
        armPointerClickSuppression(performance.now(), event.pointerId)
        clearPointerSession(element)
      },
    )
    // Direct-manipulation pointers receive implicit capture. Asking WebKit
    // for a second explicit capture can keep a control's recognizer alive
    // after a ScrollSurface has won the pan; mouse input still needs it.
    if (event.pointerType === 'mouse') element.setPointerCapture(event.pointerId)
    updateRowFeedback('down')
    renderPressState('pressed')
    beginPrefetch()
  }

  const handlePointerMove = (event: PointerEvent<T>) => {
    const session = pointerSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    const nextSession = movePointerPress(
      updatePointerPressBounds(session, event.currentTarget.getBoundingClientRect()),
      { x: event.clientX, y: event.clientY },
      feedback === 'row' ? 0 : PRESSABLE_RETENTION_OFFSET_PX,
    )
    pointerSessionRef.current = nextSession
    if (nextSession.state === 'deactivated') {
      cancelPrefetch()
      updateRowFeedback('cancel')
    } else if (rowFeedbackRef.current === 'idle') updateRowFeedback('down')
    renderPressState(nextSession.state)
  }

  const handlePointerUp = (event: PointerEvent<T>) => {
    const session = pointerSessionRef.current
    if (!session || session.pointerId !== event.pointerId) {
      if (!event.isPrimary) armPointerClickSuppression(performance.now(), event.pointerId)
      return
    }

    const finalSession = movePointerPress(
      updatePointerPressBounds(session, event.currentTarget.getBoundingClientRect()),
      { x: event.clientX, y: event.clientY },
      feedback === 'row' ? 0 : PRESSABLE_RETENTION_OFFSET_PX,
    )
    const release = releasePointerPress(finalSession)
    if (release.fire) acceptPrefetch()
    else cancelPrefetch()
    pointerSessionRef.current = undefined
    pointerCancellationCleanupRef.current?.()
    pointerCancellationCleanupRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    updateRowFeedback(release.fire ? 'release' : 'cancel')
    renderPressState(release.state)
    // Arm the shared receipt for accepted AND rejected releases: WebKit's
    // synthesized click follows either, and after a navigation unmount it
    // can retarget to a different Pressable entirely.
    if (!nativeActivation || !release.fire) {
      armPointerClickSuppression(performance.now(), event.pointerId)
    }
    if (release.fire && !nativeActivation) onPressRef.current?.()
  }

  const handlePointerCancel = (event: PointerEvent<T>) => {
    const session = pointerSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    clearPointerSession(event.currentTarget)
  }

  const handleLostPointerCapture = (event: PointerEvent<T>) => {
    if (pointerSessionRef.current?.pointerId === event.pointerId) {
      clearPointerSession()
    }
  }

  const handleKeyDown = (event: KeyboardEvent<T>) => {
    if (disabled || !PRESS_KEYS.has(event.key as PressKey)) return
    const result = beginKeyboardActivation(keyboardSessionRef.current, event.key as PressKey)
    keyboardSessionRef.current = result.session
    if (!result.started) return
    beginPrefetch()
    if (result.fire) acceptPrefetch()
    updateRowFeedback('down')
    updateRowFeedback('hold')
    renderPressState('pressed')
    if (result.fire && !nativeActivation) onPressRef.current?.()
  }

  const handleKeyUp = (event: KeyboardEvent<T>) => {
    if (!PRESS_KEYS.has(event.key as PressKey)) return
    const result = releaseKeyboardActivation(keyboardSessionRef.current, event.key as PressKey)
    if (!result) return
    keyboardSessionRef.current = result.session
    acceptPrefetch()
    updateRowFeedback('release')
    renderPressState('idle')
    if (result.fire && !nativeActivation) onPressRef.current?.()
    scheduleKeyboardSessionCleanup(result.session)
  }

  const handleClick = () => {
    if (disabled) return
    const keyboardClick = resolveClickActivation(keyboardSessionRef.current)
    keyboardSessionRef.current = keyboardClick.session
    if (!keyboardClick.fire) {
      if (!keyboardClick.session) clearKeyboardSession()
      return
    }

    beginPrefetch()
    acceptPrefetch()
    onPressRef.current?.()
  }

  const handleBlur = () => {
    const hadKeyboardSession = !!keyboardSessionRef.current
    if (hadKeyboardSession) cancelPrefetch()
    clearKeyboardSession()
    if (!pointerSessionRef.current) {
      // Pointer activation can blur while its release animation is still visible.
      if (hadKeyboardSession) updateRowFeedback('cancel')
      renderPressState('idle')
    }
  }

  useEffect(() => {
    if (!disabled) return
    clearKeyboardSession()
    clearPointerSession()
  }, [disabled])

  useEffect(
    () => () => {
      cancelPrefetch()
      clearKeyboardSession()
      clearRowDelay()
      const session = pointerSessionRef.current
      pointerCancellationCleanupRef.current?.()
      pointerCancellationCleanupRef.current = undefined
      if (session && elementRef.current?.hasPointerCapture(session.pointerId)) {
        elementRef.current.releasePointerCapture(session.pointerId)
      }
    },
    [],
  )

  return {
    elementRef,
    pressState,
    attributes: {
      'data-satin-press-state': pressState,
      'data-satin-press-feedback': feedback,
      'data-satin-row-feedback': feedback === 'row' ? rowFeedback : undefined,
      'data-satin-press-transition': pressTransition,
    },
    handlers: {
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      onKeyUp: handleKeyUp,
      onLostPointerCapture: handleLostPointerCapture,
      onPointerCancel: handlePointerCancel,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
    onClick: handleClick,
  }
}
