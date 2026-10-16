import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import type { PressState } from './stateMachine.ts'
import { usePressInteraction } from './usePressInteraction.ts'

/** DOM activation handlers reserved for the Pressable interaction policy. */
export type PressableOwnedHandlers =
  | 'children'
  | 'disabled'
  | 'onBlur'
  | 'onClick'
  | 'onKeyDown'
  | 'onKeyUp'
  | 'onLostPointerCapture'
  | 'onPointerCancel'
  | 'onPointerDown'
  | 'onPointerMove'
  | 'onPointerUp'

export type PressableProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, PressableOwnedHandlers> &
  Readonly<{
    children?: ReactNode
    disabled?: boolean
    onPress: () => void
    onPressStateChange?: (state: PressState) => void
    /** Grouped rows highlight their background after the scroll-intent delay. */
    feedback?: 'opacity' | 'row'
    pressedStyle?: CSSProperties
  }> &
  (Readonly<{ iconOnly: true; 'aria-label': string }> | Readonly<{ iconOnly?: false }>)

export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  {
    children,
    disabled = false,
    onPress,
    onPressStateChange,
    pressedStyle,
    feedback = 'opacity',
    iconOnly = false,
    style,
    type = 'button',
    ...props
  },
  forwardedRef,
) {
  if (iconOnly && !props['aria-label']?.trim())
    throw new Error('An icon-only Pressable requires a meaningful aria-label.')
  const { elementRef, pressState, attributes, handlers, onClick } =
    usePressInteraction<HTMLButtonElement>({ disabled, feedback, onPress, onPressStateChange })

  const renderedStyle =
    pressState === 'pressed' && pressedStyle ? { ...style, ...pressedStyle } : style

  return (
    <button
      {...props}
      ref={element => {
        elementRef.current = element
        if (typeof forwardedRef === 'function') forwardedRef(element)
        else if (forwardedRef) forwardedRef.current = element
      }}
      aria-disabled={disabled || undefined}
      {...attributes}
      data-satin-icon-only={iconOnly || undefined}
      data-satin-pressable="true"
      data-satin-row-intrinsic="true"
      data-satin-role="chrome"
      disabled={disabled}
      {...handlers}
      onClick={onClick}
      style={renderedStyle}
      type={type}
    >
      {children}
    </button>
  )
})
