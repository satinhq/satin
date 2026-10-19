import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import type { PressState } from './stateMachine.ts'
import { usePressInteraction } from './usePressInteraction.ts'

/** The DOM event handlers `Pressable` owns. Use `onPress` and `onPressStateChange` instead. */
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

/** A pressable's `onPress` action, content and press feedback. An `iconOnly` pressable needs an
 * `aria-label`. */
export type PressableProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, PressableOwnedHandlers> &
  Readonly<{
    children?: ReactNode
    disabled?: boolean
    /** Starts at press begin. Forward the signal to data/image prefetch so a
     * scroll, swipe or cancelled contact releases speculative work. */
    prefetch?: (signal: AbortSignal) => void | Promise<unknown>
    onPress: () => void
    onPressStateChange?: (state: PressState) => void
    /** Grouped rows highlight their background after the scroll-intent delay. */
    feedback?: 'opacity' | 'row'
    pressedStyle?: CSSProperties
  }> &
  (Readonly<{ iconOnly: true; 'aria-label': string }> | Readonly<{ iconOnly?: false }>)

/** A plain tap target with no button chrome. It dims while pressed, and a touch that turns into a
 * scroll does not fire `onPress`. Use it for custom tappable content. */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  {
    children,
    disabled = false,
    onPress,
    prefetch,
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
    usePressInteraction<HTMLButtonElement>({
      disabled,
      feedback,
      onPress,
      prefetch,
      onPressStateChange,
    })

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
