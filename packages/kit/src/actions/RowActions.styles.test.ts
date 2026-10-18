// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Row } from '../list-form/ListForm.tsx'
import { symbolWeightForFont } from '../symbols/metrics.ts'

it('uses the measured stock inline caption size and image gap', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const host = document.createElement('div')
  host.dataset.satinSwipeLabelLayout = 'inline'
  host.innerHTML =
    '<button data-satin-swipe-action><span data-satin-swipe-label><svg></svg><span>Delete</span></span></button>'
  document.head.append(style)
  document.body.append(host)
  try {
    const label = host.querySelector<HTMLElement>('[data-satin-swipe-label]')!
    // Native r17 UILabel and UIImageView frames, after the open spring settles.
    expect(getComputedStyle(label).fontSize).toBe('12px')
    expect(getComputedStyle(label).lineHeight).toBe('14.5px')
    expect(getComputedStyle(label).columnGap).toBe('4px')
    const caption = label.querySelector('span')!
    // The below-icon caption has its own font rule; inline must override it too.
    expect(getComputedStyle(caption).fontSize).toBe('12px')
    expect(getComputedStyle(caption).lineHeight).toBe('14.5px')
  } finally {
    host.remove()
    style.remove()
  }
})

it("draws a short row's inline symbol bold and a tall row's symbol regular, as stock List does", () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  document.head.append(style)
  const hosts = (['inline', 'below'] as const).map(layout => {
    const host = document.createElement('div')
    host.dataset.satinSwipeLabelLayout = layout
    host.innerHTML =
      '<button data-satin-swipe-action><span data-satin-swipe-label>' +
      '<svg data-satin-symbol="trash"></svg><span>Delete</span></span></button>'
    document.body.append(host)
    return host
  })
  try {
    const [inline, below] = hosts.map(host => host.querySelector('svg')!)
    // Same glyph box as native, 1.45x its regular ink: Satin's bold stroke (1.47x).
    expect(symbolWeightForFont(getComputedStyle(inline!).fontWeight)).toBe('bold')
    expect(symbolWeightForFont(getComputedStyle(below!).fontWeight)).toBe('regular')
    const title = hosts[0]!.querySelector('[data-satin-swipe-label] > span')!
    expect(symbolWeightForFont(getComputedStyle(title).fontWeight)).toBe('regular')
  } finally {
    for (const host of hosts) host.remove()
    style.remove()
  }
})

it('presents swipe action opacity without the pressable release fade', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const host = document.createElement('div')
  host.innerHTML =
    '<button data-satin-pressable="true" data-satin-swipe-action></button><button data-satin-pressable="true"></button>'
  document.head.append(style)
  document.body.append(host)
  try {
    const [action, ordinary] = [...host.querySelectorAll('button')]
    // Every frame writes the action's opacity; a transition would lag each write.
    expect(getComputedStyle(action!).transition).toMatch(/^none/)
    expect(getComputedStyle(ordinary!).transition).toContain('opacity')
  } finally {
    host.remove()
    style.remove()
  }
})

it('clips an active swipe at the stationary row boundary', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  host.dataset.satinSwipeActive = 'true'
  document.head.append(style)
  document.body.append(host)
  try {
    expect(getComputedStyle(host).clipPath).toBe('border-box')
    const activeOverflow = getComputedStyle(host).overflow
    delete host.dataset.satinSwipeActive
    expect(getComputedStyle(host).overflow).toBe(activeOverflow)
  } finally {
    host.remove()
    style.remove()
  }
})

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

it('uses the measured below-pill caption box without the old extra vertical space', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const host = document.createElement('div')
  host.dataset.satinSwipeLabelLayout = 'below'
  host.innerHTML =
    '<button data-satin-swipe-action data-satin-swipe-icon="true" data-satin-swipe-title="true"><span data-satin-swipe-label><svg></svg><span>Delete</span></span></button>'
  document.head.append(style)
  document.body.append(host)
  try {
    const button = host.querySelector('button')!
    const caption = host.querySelector('[data-satin-swipe-label] > span')!
    expect(getComputedStyle(caption).fontSize).toBe('12px')
    expect(getComputedStyle(caption).lineHeight).toBe('14.5px')
    expect(getComputedStyle(caption).top).toContain('+ 4px')
    expect(getComputedStyle(button).height).toContain('+ 18.5px')
  } finally {
    host.remove()
    style.remove()
  }
})

it('sizes the below-caption trash independently of the row body font', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const host = document.createElement('div')
  host.dataset.satinSwipeLabelLayout = 'below'
  host.style.fontSize = '16px'
  host.innerHTML = '<span data-satin-swipe-label><svg data-satin-symbol="trash"></svg></span>'
  document.head.append(style)
  document.body.append(host)
  try {
    expect(getComputedStyle(host.querySelector('svg')!).fontSize).toBe('18.5px')
  } finally {
    host.remove()
    style.remove()
  }
})
