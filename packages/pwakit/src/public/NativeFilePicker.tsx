import { useContext, useId, useLayoutEffect, useRef } from 'react'
import { usePressInteraction } from '../press/usePressInteraction.ts'
import { Row } from '../list-form/ListForm.tsx'
import { ScreenContext } from '../navigation/navigationContext.tsx'
import { controlTintStyle, useControlStyle } from './controlStyle.tsx'

/** One image candidate as File bytes, without PhotosUI selection identity. */
export type NativeFilePickerProps = {
  label: string
  /** The app's accepted selection. Never populates the native FileList. */
  value: File | readonly File[] | null
  onChange(files: File[]): void
  accept?: string
  capture?: 'user' | 'environment'
  multiple?: boolean
  disabled?: boolean
  /** Only synchronous activation failures, never cancellation or decoding errors. */
  onError?(error: Error): void
}

/**
 * A native file-input bridge. Decoding, storage and preview URLs belong to the app.
 * Key or unmount this control when replacing a draft whose accepted File is unchanged.
 * Chooser results have no platform session ID; overlapping chooser attribution is not promised.
 */
export function NativeFilePicker({
  label,
  value,
  onChange,
  disabled,
  onError,
  accept,
  capture,
  multiple = false,
}: NativeFilePickerProps) {
  const configuration = useControlStyle({ disabled })
  const screen = useContext(ScreenContext)
  const labelId = useId()
  const owner = useRef({ generation: 0, mounted: false, disabled: true, onChange, onError })
  const activationGeneration = useRef<number | undefined>(undefined)
  const covered = screen?.lifecycle.isCovered ?? false

  const press = usePressInteraction<HTMLInputElement>({
    disabled: configuration.disabled || covered,
    feedback: 'row',
    nativeActivation: true,
  })

  useLayoutEffect(() => {
    const current = owner.current
    current.generation += 1
    current.disabled = configuration.disabled || covered
    current.mounted = true
    return () => {
      current.mounted = false
      current.generation += 1
    }
  }, [configuration.disabled, covered, screen?.key, value, accept, capture, multiple])
  useLayoutEffect(() => {
    owner.current.onChange = onChange
    owner.current.onError = onError
  })

  const available = (input: HTMLInputElement) =>
    owner.current.mounted &&
    !owner.current.disabled &&
    input.isConnected &&
    !input.closest('[inert], [aria-hidden="true"]')

  return (
    <div
      data-satin-file-picker="true"
      {...press.attributes}
      style={controlTintStyle(configuration.tint)}
    >
      <Row
        className="satin-list-button"
        disabled={configuration.disabled}
        label={
          <span id={labelId} data-satin-row-text="true">
            {label}
          </span>
        }
      />
      <input
        ref={press.elementRef}
        {...press.handlers}
        data-satin-role="chrome"
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        aria-labelledby={labelId}
        disabled={configuration.disabled || covered}
        onClick={event => {
          const input = event.currentTarget
          if (!available(input)) {
            event.preventDefault()
            return
          }
          activationGeneration.current = owner.current.generation
          // Preserve the input's native default when showPicker is unavailable.
          if (typeof input.showPicker !== 'function') return
          event.preventDefault()
          try {
            input.showPicker()
          } catch (failure) {
            activationGeneration.current = undefined
            owner.current.onError?.(failure instanceof Error ? failure : new Error(String(failure)))
          }
        }}
        onChange={event => {
          const input = event.currentTarget
          const files = Array.from(input.files ?? [])
          // Retain bytes before clearing so the same file can be chosen again.
          input.value = ''
          const generation = activationGeneration.current
          activationGeneration.current = undefined
          if (files.length === 0 || generation !== owner.current.generation || !available(input))
            return
          queueMicrotask(() => {
            if (owner.current.generation === generation && available(input)) {
              owner.current.onChange(files)
            }
          })
        }}
      />
    </div>
  )
}
