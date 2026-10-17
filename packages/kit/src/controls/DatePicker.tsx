import { useId, type ReactNode } from 'react'
import { useControlStyle } from '../public/controlStyle.tsx'
import { ControlRow } from './ControlRow.tsx'
import {
  civilShapeFor,
  compareCivil,
  fieldsOfInstant,
  formatCivil,
  inputDate,
  inputTime,
  instantWithFields,
  parseCivil,
  utcCarrier,
  type CivilFields,
} from './civilDate.ts'

/** `DatePickerComponents`. */
export type DatePickerComponent = 'date' | 'hourAndMinute'

/** `DatePickerStyle`. `automatic` is `compact`. */
export type DatePickerStyle = 'automatic' | 'compact'

/**
 * A DatePicker's selectable range. Omit a bound for a one-sided range
 * (`start...` or `...end`). Bounds use the same kind of value as the selection.
 */
export type DatePickerRange<Selection extends Date | string> = {
  lowerBound?: Selection
  upperBound?: Selection
}

/**
 * DatePicker's label, controlled selection, range and the components it edits.
 *
 * `selection` is a `Date`, or a civil string with no time zone: `'2026-10-14'` for a date,
 * `'09:41'` for a time, `'2026-10-14T09:41'` for both. The callback returns the same kind.
 */
export type DatePickerProps<Selection extends Date | string = Date> = {
  label: ReactNode
  selection: Selection
  // The selection alone decides the type; a `useState` setter must not widen it.
  onSelectionChange(selection: NoInfer<Selection>): void
  in?: DatePickerRange<NoInfer<Selection>>
  /** Defaults to `['date', 'hourAndMinute']`. */
  displayedComponents?: readonly DatePickerComponent[]
  datePickerStyle?: DatePickerStyle
  disabled?: boolean
  'aria-label'?: string
}

type Field = 'date' | 'time'

/** A selection read into calendar fields, plus how to write fields back as the same kind. */
type SelectionModel<Selection extends Date | string> = {
  fields: CivilFields
  write(fields: CivilFields, editedTime: boolean): Selection
  compare(left: Selection, right: Selection): number
}

// Fields a civil string doesn't carry. They are never displayed or written back.
const unusedFields: CivilFields = { year: 2000, month: 1, day: 1, hour: 0, minute: 0 }

function readSelection<Selection extends Date | string>(
  selection: Selection,
  hasDate: boolean,
  hasTime: boolean,
): SelectionModel<Selection> | null {
  if (selection instanceof Date) {
    if (!Number.isFinite(selection.getTime())) return null
    return {
      fields: fieldsOfInstant(selection),
      write: (fields, editedTime) => instantWithFields(selection, fields, editedTime) as Selection,
      compare: (left, right) => (left as Date).getTime() - (right as Date).getTime(),
    }
  }
  if (typeof selection !== 'string') return null
  const shape = civilShapeFor(hasDate, hasTime)
  const fields = parseCivil(selection, shape, unusedFields)
  if (!fields) return null
  return {
    fields,
    write: next => formatCivil(next, shape) as Selection,
    compare: (left, right) => compareCivil(left as string, right as string),
  }
}

/** True when a bound is the same kind of value as the selection and readable in its shape. */
function validBound<Selection extends Date | string>(
  bound: Selection | undefined,
  selection: Selection,
  hasDate: boolean,
  hasTime: boolean,
) {
  if (bound === undefined) return true
  if (selection instanceof Date) return bound instanceof Date && Number.isFinite(bound.getTime())
  return typeof bound === 'string' && readSelection(bound, hasDate, hasTime) !== null
}

/**
 * Keeps a proposal inside the range. UIDatePicker clamps rather than refusing: picking today
 * when the range starts at noon selects noon.
 */
function clamp<Selection extends Date | string>(
  value: Selection,
  range: DatePickerRange<Selection>,
  compare: (left: Selection, right: Selection) => number,
) {
  if (range.lowerBound !== undefined && compare(value, range.lowerBound) < 0)
    return range.lowerBound
  if (range.upperBound !== undefined && compare(value, range.upperBound) > 0)
    return range.upperBound
  return value
}

function sameDay(left: CivilFields, right: CivilFields) {
  return left.year === right.year && left.month === right.month && left.day === right.day
}

/**
 * The native input's `min`/`max`. The date input gets the bound's day. The time input only
 * gets a bound on that bound's own day (or always, for a time-only picker); on any other day
 * every time is in range.
 */
function inputBound(
  field: Field,
  bound: CivilFields | null,
  selected: CivilFields,
  hasDate: boolean,
) {
  if (!bound) return undefined
  if (field === 'date') return inputDate(bound)
  if (!hasDate || sameDay(bound, selected)) return inputTime(bound)
  return undefined
}

/** What the capsule shows, in the user's locale: "Oct 14, 2026" and "9:41 AM" in en-US. */
function displayText(field: Field, fields: CivilFields) {
  // The fields are already local (or civil), so format them in UTC to keep them as they are.
  const options: Intl.DateTimeFormatOptions =
    field === 'date'
      ? { dateStyle: 'medium', timeZone: 'UTC' }
      : { timeStyle: 'short', timeZone: 'UTC' }
  const parts = new Intl.DateTimeFormat(undefined, options).formatToParts(utcCarrier(fields))
  return parts
    .map((part, index) => {
      // WebKit's Intl turns ICU's narrow no-break space before "AM"/"PM" into a plain space for
      // web compatibility. UIKit keeps the narrow one, so "9:41 AM" sets tighter natively.
      const nextToDayPeriod =
        parts[index + 1]?.type === 'dayPeriod' || parts[index - 1]?.type === 'dayPeriod'
      return part.type === 'literal' && nextToDayPeriod
        ? part.value.replace(/ /g, '\u202f')
        : part.value
    })
    .join('')
}

/**
 * `DatePicker` in its compact style: the row's grey value capsules open the system date
 * or time picker.
 *
 * Use a civil string selection (`'2026-10-14'`) for a day that must stay the same day in every
 * time zone, such as a due date; use a `Date` for a moment in time.
 *
 * @example
 * <DatePicker label="Due" selection={due} onSelectionChange={setDue} displayedComponents={['date']} />
 */
export function DatePicker<Selection extends Date | string = Date>({
  label,
  selection,
  onSelectionChange,
  in: range = {},
  displayedComponents = ['date', 'hourAndMinute'],
  datePickerStyle = 'automatic',
  disabled,
  'aria-label': accessibleLabel,
}: DatePickerProps<Selection>) {
  const labelId = useId()
  const appearance = useControlStyle({ disabled })
  if (datePickerStyle !== 'automatic' && datePickerStyle !== 'compact') {
    throw new Error(`DatePicker style "${String(datePickerStyle)}" is not available.`)
  }
  const hasDate = displayedComponents.includes('date')
  const hasTime = displayedComponents.includes('hourAndMinute')
  if (
    (!hasDate && !hasTime) ||
    displayedComponents.some(component => component !== 'date' && component !== 'hourAndMinute')
  ) {
    throw new Error('DatePicker displayedComponents must include date or hourAndMinute.')
  }

  const model = readSelection(selection, hasDate, hasTime)
  const rangeValid =
    validBound(range.lowerBound, selection, hasDate, hasTime) &&
    validBound(range.upperBound, selection, hasDate, hasTime) &&
    !(
      model &&
      range.lowerBound !== undefined &&
      range.upperBound !== undefined &&
      model.compare(range.lowerBound, range.upperBound) > 0
    )
  if (!model || !rangeValid) {
    // Persisted data can be malformed. Say so, and render an inert row rather than crash.
    console.error(
      'DatePicker needs a valid selection of the documented shape and an ordered range.',
      { selection, range },
    )
  }
  const usable = model !== null && rangeValid
  const lower =
    usable && range.lowerBound !== undefined
      ? readSelection(range.lowerBound, hasDate, hasTime)
      : null
  const upper =
    usable && range.upperBound !== undefined
      ? readSelection(range.upperBound, hasDate, hasTime)
      : null

  function propose(field: Field, text: string) {
    if (!model || !usable || appearance.disabled) return
    // The system picker's Reset clears the input. A DatePicker always has a value, so the
    // selection stays and React restores the input.
    const shape = field === 'date' ? 'date' : 'time'
    const fields = parseCivil(text, shape, model.fields)
    if (!fields) return
    const candidate = clamp(model.write(fields, field === 'time'), range, model.compare)
    if (model.compare(candidate, selection) !== 0) onSelectionChange(candidate)
  }

  const fieldsShown: Field[] = [
    ...(hasDate ? ['date' as const] : []),
    ...(hasTime ? ['time' as const] : []),
  ]
  const nameOf = (field: Field) =>
    accessibleLabel ?? (typeof label === 'string' ? `${label}, ${field}` : undefined)

  return (
    <ControlRow>
      <div data-satin-date-picker="compact">
        <span id={labelId} hidden={appearance.labelsHidden} data-satin-date-picker-label="true">
          {label}
        </span>
        <div data-satin-date-fields="true" data-components={fieldsShown.join(' ')}>
          {fieldsShown.map(field => (
            <DateField
              key={field}
              field={field}
              selected={usable ? model.fields : null}
              lower={lower?.fields ?? null}
              upper={upper?.fields ?? null}
              hasDate={hasDate}
              disabled={appearance.disabled}
              name={nameOf(field)}
              labelId={labelId}
              onPick={text => propose(field, text)}
            />
          ))}
        </div>
      </div>
    </ControlRow>
  )
}

/** One capsule. `selected` is null when the selection is unusable: the capsule is then inert. */
function DateField({
  field,
  selected,
  lower,
  upper,
  hasDate,
  disabled,
  name,
  labelId,
  onPick,
}: {
  field: Field
  selected: CivilFields | null
  lower: CivilFields | null
  upper: CivilFields | null
  hasDate: boolean
  disabled: boolean
  name: string | undefined
  labelId: string
  onPick(text: string): void
}) {
  const inputValue = selected ? (field === 'date' ? inputDate(selected) : inputTime(selected)) : ''
  return (
    <span data-satin-date-field={field}>
      <span aria-hidden="true" data-satin-date-value="true">
        {selected ? displayText(field, selected) : ''}
      </span>
      {/* The transparent native input is the one activation and keyboard owner: a tap opens the
          system picker, and VoiceOver reads its value. */}
      <input
        type={field}
        required
        disabled={disabled || !selected}
        aria-label={name}
        aria-labelledby={name === undefined ? labelId : undefined}
        value={inputValue}
        min={selected ? inputBound(field, lower, selected, hasDate) : undefined}
        max={selected ? inputBound(field, upper, selected, hasDate) : undefined}
        onChange={event => onPick(event.currentTarget.value)}
      />
    </span>
  )
}
