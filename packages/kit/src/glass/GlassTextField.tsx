import { forwardRef } from 'react'
import { TextField, type TextFieldProps } from '../text-input/TextField.tsx'
import { GlassEffect } from './GlassEffect.tsx'
import { Glass } from './regions.ts'
export type GlassTextFieldProps = TextFieldProps & { glass?: Glass }
/** Shares the 12b editing/IME/keyboard-intent contract. Glass never captures field touches. */
export const GlassTextField = forwardRef<HTMLInputElement, GlassTextFieldProps>(
  function GlassTextField({ glass = Glass.regular, ...props }, ref) {
    return (
      <GlassEffect
        glass={glass}
        shape={{ kind: 'roundedRectangle', cornerRadius: 22 }}
        data-satin-glass-field="true"
      >
        <TextField {...props} ref={ref} />
      </GlassEffect>
    )
  },
)
export const GlassSearchField = forwardRef<
  HTMLInputElement,
  Omit<GlassTextFieldProps, 'kind' | 'label'> & { label?: string }
>(function GlassSearchField({ label = 'Search', ...props }, ref) {
  return <GlassTextField {...props} label={label} kind="search" submitLabel="search" ref={ref} />
})
