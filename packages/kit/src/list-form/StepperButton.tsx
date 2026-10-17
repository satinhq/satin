import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Pressable } from '../press/Pressable.tsx'
import type { PressState } from '../press/stateMachine.ts'

/** Native iOS 27 Stepper repeat observations are recorded in controls-1a-notes.md. */
export function StepperButton({
  disabled,
  label,
  onStep,
  onEditingChange,
  children,
}: {
  disabled: boolean
  label: string
  onStep(): void
  onEditingChange?(editing: boolean): void
  children: ReactNode
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const state = useRef<PressState>('idle')
  const repetitions = useRef(0)
  const repeated = useRef(false)
  const current = useRef({ disabled, onStep, onEditingChange })
  useLayoutEffect(() => {
    current.current = { disabled, onStep, onEditingChange }
  })
  const stop = () => {
    clearTimeout(timer.current)
    timer.current = undefined
  }
  useLayoutEffect(() => {
    if (disabled) stop()
    return () => {
      stop()
      if (state.current !== 'idle') {
        state.current = 'idle'
        current.current.onEditingChange?.(false)
      }
    }
  }, [disabled])
  const repeat = () => {
    if (current.current.disabled || state.current !== 'pressed') return
    repeated.current = true
    repetitions.current++
    current.current.onStep()
    timer.current = setTimeout(repeat, repetitions.current < 6 ? 500 : 100)
  }
  return (
    <Pressable
      disabled={disabled}
      aria-label={label}
      onPressStateChange={next => {
        const previous = state.current
        state.current = next
        stop()
        if (next === 'pressed') {
          if (previous === 'idle') {
            repeated.current = false
            repetitions.current = 0
            current.current.onEditingChange?.(true)
          }
          timer.current = setTimeout(repeat, 500)
        } else if (next === 'idle' && previous !== 'idle') {
          current.current.onEditingChange?.(false)
          queueMicrotask(() => {
            if (state.current === 'idle') repeated.current = false
          })
        }
      }}
      onPress={() => {
        if (!repeated.current) current.current.onStep()
      }}
    >
      {children}
    </Pressable>
  )
}
