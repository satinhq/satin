import { shouldSubmitField } from './submit.ts'
import {
  forwardRef,
  useId,
  useRef,
  useImperativeHandle,
  useLayoutEffect,
  type InputHTMLAttributes,
} from 'react'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { textFieldAttributes, type SubmitLabel, type TextFieldKind } from './kinds.ts'

export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'onSubmit' | 'size'
> & {
  label: string
  value: string
  onChange(value: string): void
  kind?: TextFieldKind
  submitLabel?: SubmitLabel
  onSubmit?(): void
  /** Shared row contract: no List dependency, no wrapper Pressable. */
  variant?: 'standalone' | 'row' | 'plain'
  labelVisibility?: 'visible' | 'hidden'
  labelPlacement?: 'leading' | 'above'
}
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    autoFocus,
    value,
    onChange,
    kind = 'text',
    submitLabel,
    onSubmit,
    variant = 'standalone',
    labelPlacement = 'leading',
    labelVisibility = 'visible',
    id,
    className,
    onKeyDown,
    style,
    ...props
  },
  forwardedRef,
) {
  const ref = useRef<HTMLInputElement>(null)
  useImperativeHandle(forwardedRef, () => ref.current!, [])
  useLayoutEffect(() => {
    if (autoFocus && ref.current) focusFromFramework(ref.current, { preventScroll: true })
  }, [autoFocus])
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div
      className="satin-text-field"
      data-satin-field-style={variant}
      data-satin-label-placement={labelPlacement}
      data-satin-label-visibility={labelVisibility}
    >
      <label htmlFor={inputId}>{label}</label>
      <input
        {...textFieldAttributes(kind, submitLabel)}
        {...props}
        ref={ref}
        id={inputId}
        className={className}
        style={style}
        data-satin-role="text-input"
        data-satin-text-field="true"
        placeholder={
          props.placeholder ??
          (variant === 'row' && labelPlacement === 'leading' ? label : undefined)
        }
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
        onKeyDown={event => {
          onKeyDown?.(event)
          if (!shouldSubmitField(event)) return
          event.preventDefault()
          if (onSubmit) onSubmit()
          else if (
            (props.enterKeyHint ?? submitLabel ?? textFieldAttributes(kind).enterKeyHint) !== 'next'
          )
            event.currentTarget.blur()
        }}
      />
    </div>
  )
})
export type SecureFieldProps = Omit<TextFieldProps, 'kind' | 'type'> & {
  kind?: 'new-password' | 'current-password'
}
export const SecureField = forwardRef<HTMLInputElement, SecureFieldProps>(function SecureField(
  { kind = 'current-password', ...props },
  ref,
) {
  return <TextField {...props} kind={kind} type="password" ref={ref} />
})
