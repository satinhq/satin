// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Row } from '../list-form/ListForm.tsx'

it('rounds every lifted row independently of its resting section corners', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const section = document.createElement('div')
  section.style.setProperty('--satin-settings-group-radius', '25px')
  section.innerHTML = Array.from(
    { length: 3 },
    (_, index) =>
      `<div data-satin-section-item="true"><div data-satin-row="true">Note ${index}</div></div>`,
  ).join('')
  document.head.append(style)
  document.body.append(section)
  try {
    for (const row of section.querySelectorAll<HTMLElement>('[data-satin-row]')) {
      const resting = getComputedStyle(row).borderRadius
      row.dataset.satinContextLift = 'row'
      expect(getComputedStyle(row).borderRadius).toBe('26px')
      delete row.dataset.satinContextLift
      expect(getComputedStyle(row).borderRadius).toBe(resting)
    }
  } finally {
    section.remove()
    style.remove()
  }
})

it('gives the opaque moving background its section corner shape', () => {
  const css = frameworkStyleDeclarations()
  expect(css.match(/\[data-satin-row-action-content\]\s*\{([^}]+)\}/)?.[1]).toContain(
    'border-radius: inherit',
  )
})

it('keeps section corners throughout a quick tap and lifts only after a recognized hold', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const host = document.createElement('div')
  host.style.setProperty('--satin-settings-group-radius', '25px')
  document.head.append(style)
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() =>
      root.render(
        createElement(
          'div',
          null,
          ...['First', 'Middle', 'Last'].map(label =>
            createElement(
              'div',
              { key: label, 'data-satin-section-item': 'true' },
              createElement(Row, {
                label,
                contextMenu: [{ id: 'pin', label: 'Pin', onPress() {} }],
              }),
            ),
          ),
        ),
      ),
    )
    const rows = [...host.querySelectorAll<HTMLElement>('[data-satin-row]')]
    const send = (row: HTMLElement, type: string) =>
      act(() =>
        row.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
            touches: type === 'touchend' ? [] : [{ identifier: 9, clientX: 80, clientY: 100 }],
            changedTouches: [{ identifier: 9, clientX: 80, clientY: 100 }],
          }),
        ),
      )
    for (const row of rows) {
      const resting = getComputedStyle(row).borderRadius
      const actionHost = row.closest<HTMLElement>('[data-satin-row-actions]')!
      const restingOverflow = getComputedStyle(actionHost).overflow
      send(row, 'touchstart')
      expect(getComputedStyle(actionHost).overflow).toBe(restingOverflow)
      act(() => vi.advanceTimersByTime(120))
      expect(getComputedStyle(row).borderRadius).toBe(resting)
      send(row, 'touchend')
      expect(getComputedStyle(row).borderRadius).toBe(resting)
    }
    send(rows[0]!, 'touchstart')
    act(() => vi.advanceTimersByTime(750))
    expect(getComputedStyle(rows[0]!).borderRadius).toBe('26px')
    send(rows[0]!, 'touchend')
  } finally {
    act(() => root.unmount())
    host.remove()
    style.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})
