import { forwardRef, useRef, type HTMLAttributes, type ReactNode } from 'react'
import {
  beginKeyboardActivation,
  releaseKeyboardActivation,
  resolveClickActivation,
  type KeyboardActivationSession,
} from '../press/activation.ts'
import { PRESS_CONTACT_CLICK_WINDOW_MS } from '../press/contactReceipt.ts'

/** The native switch selection tick. Other feedback kinds are unsupported. */
export type SensoryFeedback = 'selection'

/** A tap target's action, content and the feedback it plays. */
export type SensoryButtonProps = Omit<HTMLAttributes<HTMLLabelElement>, 'onClick' | 'onChange'> & {
  children?: ReactNode
  disabled?: boolean
  sensoryFeedback?: SensoryFeedback | false
  onPress: () => void
}

/**
 * A tap affordance backed by browser label activation. No imperative haptic API exists.
 * Use plain content only: links, buttons and other labelable controls cannot be nested.
 * Keyboard and assistive activation preserve the action, but do not promise a tick.
 */
export const SensoryButton = forwardRef<HTMLLabelElement, SensoryButtonProps>(
  function SensoryButton(
    {
      children,
      disabled = false,
      sensoryFeedback = 'selection',
      onPress,
      onClickCapture,
      onKeyDown,
      onKeyUp,
      onBlur,
      onPointerDown,
      role = 'button',
      tabIndex,
      ...props
    }: SensoryButtonProps,
    forwardedRef,
  ) {
    if (sensoryFeedback !== 'selection' && sensoryFeedback !== false)
      throw new TypeError('SensoryButton supports only selection feedback or false.')
    const keyboard = useRef<KeyboardActivationSession | undefined>(undefined)
    const keyboardDeadline = useRef(0)
    const nativeActivation = useRef(false)
    const tickEnabled = sensoryFeedback === 'selection'
    return (
      <label
        {...props}
        ref={forwardedRef}
        role={role}
        tabIndex={disabled ? -1 : (tabIndex ?? 0)}
        aria-disabled={disabled || undefined}
        data-satin-sensory-button="true"
        data-satin-role="chrome"
        onClickCapture={event => {
          onClickCapture?.(event)
          if (event.target instanceof HTMLInputElement) return
          nativeActivation.current = false
          if (event.defaultPrevented) return
          if (keyboard.current?.released && performance.now() >= keyboardDeadline.current)
            keyboard.current = undefined
          const activation = resolveClickActivation(keyboard.current)
          keyboard.current = activation.session
          if (!activation.fire) {
            event.preventDefault()
            return
          }
          if (disabled || !tickEnabled) {
            event.preventDefault()
            if (!disabled) onPress()
          } else nativeActivation.current = true
        }}
        onClick={event => {
          if (event.target instanceof HTMLInputElement) return
          if (disabled) {
            event.preventDefault()
            return
          }
        }}
        onPointerDown={event => {
          keyboard.current = undefined
          onPointerDown?.(event)
        }}
        onKeyDown={event => {
          onKeyDown?.(event)
          if (event.defaultPrevented || disabled || (event.key !== 'Enter' && event.key !== ' '))
            return
          event.preventDefault()
          const activation = beginKeyboardActivation(keyboard.current, event.key)
          keyboard.current = activation.session
          if (activation.fire) onPress()
        }}
        onKeyUp={event => {
          onKeyUp?.(event)
          if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          const activation = releaseKeyboardActivation(keyboard.current, event.key)
          if (!activation) return
          keyboard.current = activation.session
          keyboardDeadline.current = performance.now() + PRESS_CONTACT_CLICK_WINDOW_MS
          if (activation.fire && !disabled) onPress()
        }}
        onBlur={event => {
          keyboard.current = undefined
          onBlur?.(event)
        }}
      >
        {children}
        <input
          {...{ switch: '' }}
          type="checkbox"
          aria-hidden="true"
          tabIndex={-1}
          disabled={disabled || !tickEnabled}
          data-satin-sensory-switch="true"
          onFocus={event => event.currentTarget.parentElement?.focus({ preventScroll: true })}
          onClick={event => event.stopPropagation()}
          onChange={event => {
            event.stopPropagation()
            const activate = nativeActivation.current && !disabled
            nativeActivation.current = false
            if (activate) onPress()
          }}
        />
      </label>
    )
  },
)
