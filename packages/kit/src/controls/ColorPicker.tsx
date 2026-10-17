import { useId } from 'react'
import { useControlStyle } from '../public/controlStyle.tsx'
import { ControlRow } from './ControlRow.tsx'

/** ColorPicker's label and controlled colour. */
export type ColorPickerProps = {
  label: string
  /** sRGB hexadecimal colour, `#RRGGBB` or `#RRGGBBAA`. */
  selection: string
  onSelectionChange(selection: string): void
  /** Shows the system picker's opacity slider. Defaults to true. */
  supportsOpacity?: boolean
  disabled?: boolean
}

type Channels = { red: number; green: number; blue: number; alpha: number }

const hexPattern = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i
// WebKit reports an input with the `alpha` attribute as `color(srgb r g b / a)`, channels 0–1.
const srgbPattern =
  /^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+))?\)$/i

function readHex(text: string): Channels | null {
  const parts = hexPattern.exec(text)
  if (!parts) return null
  const [red, green, blue] = [parts[1], parts[2], parts[3]].map(part => parseInt(part!, 16))
  const alpha = parts[4] === undefined ? 255 : parseInt(parts[4], 16)
  return { red: red!, green: green!, blue: blue!, alpha }
}

function readSystemValue(text: string): Channels | null {
  const hex = readHex(text)
  if (hex) return hex
  const parts = srgbPattern.exec(text.trim())
  if (!parts) return null
  const unit = [parts[1], parts[2], parts[3], parts[4] ?? '1'].map(Number)
  if (unit.some(value => !Number.isFinite(value))) return null
  const [red, green, blue, alpha] = unit.map(value =>
    Math.round(Math.min(1, Math.max(0, value)) * 255),
  )
  return { red: red!, green: green!, blue: blue!, alpha: alpha! }
}

function writeHex(channels: Channels, withAlpha: boolean) {
  const values = [
    channels.red,
    channels.green,
    channels.blue,
    ...(withAlpha ? [channels.alpha] : []),
  ]
  return '#' + values.map(value => value.toString(16).padStart(2, '0')).join('')
}

/**
 * A row with a colour well that opens the system colour picker: grid, spectrum, sliders,
 * eyedropper and, with `supportsOpacity`, opacity.
 *
 * @example
 * <ColorPicker label="List Colour" selection={color} onSelectionChange={setColor} supportsOpacity={false} />
 */
export function ColorPicker({
  label,
  selection,
  onSelectionChange,
  supportsOpacity = true,
  disabled,
}: ColorPickerProps) {
  const labelId = useId()
  const appearance = useControlStyle({ disabled })
  const channels = readHex(selection)
  if (!channels) {
    // Persisted data can be malformed. Say so, and render an inert well rather than crash.
    console.error('ColorPicker selection must be #RRGGBB or #RRGGBBAA.', { selection })
  }
  const shown = channels && writeHex(channels, supportsOpacity)

  function propose(text: string) {
    if (!channels || appearance.disabled) return
    const next = readSystemValue(text)
    if (!next) return
    const value = writeHex(next, supportsOpacity)
    if (value !== shown) onSelectionChange(value)
  }

  // `alpha` turns on the system picker's opacity slider (WebKit, iOS 26+). React passes it
  // through as a plain attribute.
  const opacityAttribute = supportsOpacity ? { alpha: '' } : {}
  return (
    <ControlRow>
      <div data-satin-color-picker="true">
        <span id={labelId} hidden={appearance.labelsHidden} data-satin-color-picker-label="true">
          {label}
        </span>
        <span data-satin-color-well="true" data-disabled={appearance.disabled || undefined}>
          <span
            aria-hidden="true"
            data-satin-color-swatch="true"
            style={shown ? { background: shown } : undefined}
          />
          {/* The transparent native input is the one activation and keyboard owner. */}
          <input
            type="color"
            {...opacityAttribute}
            aria-label={label}
            disabled={appearance.disabled || !channels}
            value={shown ?? '#000000'}
            onChange={event => propose(event.currentTarget.value)}
          />
        </span>
      </div>
    </ControlRow>
  )
}
