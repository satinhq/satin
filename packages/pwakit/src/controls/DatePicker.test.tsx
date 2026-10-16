// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { DatePicker } from './DatePicker.tsx'
import { ControlStyleProvider } from '../public/controlStyle.tsx'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const container = document.createElement('div')
const root = createRoot(container)
const originalZone = process.env.TZ
afterEach(() => {
  act(() => root.render(null))
  process.env.TZ = originalZone
})

/** What the system picker does: set the input's value and fire its events. */
function pick(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const field = (kind: 'date' | 'time') =>
  container.querySelector<HTMLInputElement>(`input[type="${kind}"]`)!
const shown = (kind: 'date' | 'time') =>
  container.querySelector(`[data-satin-date-field="${kind}"] [data-satin-date-value]`)!.textContent

it('keeps a civil due date on the same day in every time zone', () => {
  const saved: string[] = []
  function Reminder({ initial }: { initial: string }) {
    const [due, setDue] = useState(initial)
    return (
      <DatePicker
        label="Due"
        selection={due}
        displayedComponents={['date']}
        onSelectionChange={next => {
          saved.push(next)
          setDue(next)
        }}
      />
    )
  }
  // Chosen in Los Angeles, then reopened in UTC, Tokyo and Kiritimati (UTC+14).
  process.env.TZ = 'America/Los_Angeles'
  act(() => root.render(<Reminder initial="2028-02-28" />))
  pick(field('date'), '2028-02-29')
  expect(saved).toEqual(['2028-02-29'])
  for (const zone of ['UTC', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    process.env.TZ = zone
    act(() => root.render(null))
    act(() => root.render(<Reminder initial={saved.at(-1)!} />))
    expect(field('date').value).toBe('2028-02-29')
    expect(shown('date')).toBe('Feb 29, 2028')
  }
  // An impossible day from the system or from storage never replaces the saved one.
  pick(field('date'), '2027-02-29')
  expect(saved).toEqual(['2028-02-29'])
})

it('clamps choices into its range and follows the controlled selection', () => {
  const proposals: Date[] = []
  let setFromOutside: (date: Date) => void = () => {}
  function Example({ accept }: { accept: boolean }) {
    const [due, setDue] = useState(new Date(2026, 9, 14, 9, 41))
    setFromOutside = setDue
    return (
      <DatePicker
        label="Due"
        selection={due}
        in={{ lowerBound: new Date(2026, 9, 10, 12, 0), upperBound: new Date(2026, 9, 20, 18, 0) }}
        onSelectionChange={next => {
          proposals.push(next)
          if (accept) setDue(next)
        }}
      />
    )
  }
  act(() => root.render(<Example accept />))
  expect(field('date').min).toBe('2026-10-10')
  expect(field('date').max).toBe('2026-10-20')
  // Picking the first day keeps 9:41, which is before the range opens: native selects 12:00.
  pick(field('date'), '2026-10-10')
  expect(proposals.at(-1)).toEqual(new Date(2026, 9, 10, 12, 0))
  expect(field('time').min).toBe('12:00')
  pick(field('date'), '2026-10-25')
  expect(proposals.at(-1)).toEqual(new Date(2026, 9, 20, 18, 0))
  pick(field('time'), '07:05')
  expect(proposals.at(-1)).toEqual(new Date(2026, 9, 20, 7, 5))

  // A parent that declines a proposal keeps its value; the field shows the parent's value.
  act(() => root.render(<Example accept={false} />))
  const before = field('date').value
  pick(field('date'), '2026-10-12')
  expect(field('date').value).toBe(before)
  // An update from outside replaces what is shown, without a proposal of its own.
  const count = proposals.length
  act(() => setFromOutside(new Date(2026, 9, 18, 16, 30)))
  expect(field('date').value).toBe('2026-10-18')
  expect(field('time').value).toBe('16:30')
  expect(proposals).toHaveLength(count)
})

it('ignores the system picker while disabled by an ancestor', () => {
  let changes = 0
  act(() =>
    root.render(
      <ControlStyleProvider disabled>
        <DatePicker
          label="Alarm"
          selection="09:41"
          displayedComponents={['hourAndMinute']}
          onSelectionChange={() => changes++}
        />
      </ControlStyleProvider>,
    ),
  )
  expect(field('time').disabled).toBe(true)
  pick(field('time'), '10:00')
  expect(changes).toBe(0)
})
