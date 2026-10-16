/**
 * Calendar fields for DatePicker, kept apart from instants.
 *
 * A DatePicker edits calendar fields: a day, a time of day, or both. A `Date` selection reads and
 * writes those fields in the device's time zone, as SwiftUI does. A string selection is a civil
 * value with no time zone at all ('2026-10-14', '09:41', '2026-10-14T09:41'), so a due date
 * chosen in New York is still October 14 when the app is opened in Tokyo.
 *
 * Nothing here parses a civil string with `new Date(string)`: that reads 'YYYY-MM-DD' as UTC
 * midnight, which is the previous day west of Greenwich.
 */

/** The fields a DatePicker can edit. Missing fields are not displayed and never change. */
export type CivilFields = {
  year: number
  /** 1–12. */
  month: number
  day: number
  hour: number
  minute: number
}

/** Which civil string shape a selection uses; `instant` means a `Date`. */
export type CivilShape = 'instant' | 'date' | 'time' | 'dateTime'

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timePattern = /^(\d{2}):(\d{2})$/
const dateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

const pad2 = (value: number) => String(value).padStart(2, '0')
const pad4 = (value: number) => String(value).padStart(4, '0')

function daysInMonth(year: number, month: number) {
  // Day 0 of the next month is the last day of this one. UTC avoids any time-zone transition.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function validDay(year: number, month: number, day: number) {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

function validTime(hour: number, minute: number) {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

/** The string shape a civil selection must use for the components it displays. */
export function civilShapeFor(hasDate: boolean, hasTime: boolean): Exclude<CivilShape, 'instant'> {
  if (hasDate && hasTime) return 'dateTime'
  return hasDate ? 'date' : 'time'
}

/**
 * Reads a civil string of the given shape. Returns null for anything malformed, including
 * impossible days such as '2026-02-29'. Fields the shape lacks come from `fallback`.
 */
export function parseCivil(
  text: string,
  shape: Exclude<CivilShape, 'instant'>,
  fallback: CivilFields,
): CivilFields | null {
  const pattern = shape === 'date' ? datePattern : shape === 'time' ? timePattern : dateTimePattern
  const parts = pattern.exec(text)
  if (!parts) return null
  const numbers = parts.slice(1).map(Number)
  const fields = { ...fallback }
  if (shape === 'time') {
    fields.hour = numbers[0]!
    fields.minute = numbers[1]!
  } else {
    fields.year = numbers[0]!
    fields.month = numbers[1]!
    fields.day = numbers[2]!
    if (shape === 'dateTime') {
      fields.hour = numbers[3]!
      fields.minute = numbers[4]!
    }
  }
  if (!validDay(fields.year, fields.month, fields.day)) return null
  if (!validTime(fields.hour, fields.minute)) return null
  return fields
}

/** Writes fields as a civil string of the given shape. */
export function formatCivil(fields: CivilFields, shape: Exclude<CivilShape, 'instant'>) {
  const date = `${pad4(fields.year)}-${pad2(fields.month)}-${pad2(fields.day)}`
  const time = `${pad2(fields.hour)}:${pad2(fields.minute)}`
  if (shape === 'date') return date
  if (shape === 'time') return time
  return `${date}T${time}`
}

/** The calendar fields of an instant in the device's time zone. */
export function fieldsOfInstant(instant: Date): CivilFields {
  return {
    year: instant.getFullYear(),
    month: instant.getMonth() + 1,
    day: instant.getDate(),
    hour: instant.getHours(),
    minute: instant.getMinutes(),
  }
}

/**
 * The instant with `previous`'s seconds and the given local fields. If a daylight-saving gap
 * skips the requested time, JavaScript moves it forward, as UIDatePicker does.
 */
export function instantWithFields(previous: Date, fields: CivilFields, editedTime: boolean) {
  const next = new Date(previous)
  next.setFullYear(fields.year, fields.month - 1, fields.day)
  // A time edit sets whole minutes, like UIDatePicker; a date edit keeps the seconds it had.
  next.setHours(
    fields.hour,
    fields.minute,
    editedTime ? 0 : next.getSeconds(),
    editedTime ? 0 : next.getMilliseconds(),
  )
  return next
}

/** Same-shape civil strings compare correctly as text: every field is fixed width. */
export function compareCivil(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

/** The value a native `<input type="date">` uses. */
export function inputDate(fields: CivilFields) {
  return formatCivil(fields, 'date')
}

/** The value a native `<input type="time">` uses. */
export function inputTime(fields: CivilFields) {
  return formatCivil(fields, 'time')
}

/**
 * Fields as a Date whose UTC reading equals the civil fields. Only for `Intl` formatting with
 * `timeZone: 'UTC'`, so a civil date is displayed exactly as written in every time zone.
 */
export function utcCarrier(fields: CivilFields) {
  return new Date(Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute))
}
