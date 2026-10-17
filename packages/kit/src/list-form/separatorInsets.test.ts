// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeSeparatorInsets, separatorInset } from './separatorInsets.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('retains in-flow separator alignment through lift and replacement of the row label', async () => {
  const container = document.createElement('div')
  container.innerHTML =
    '<div data-satin-section-item><div data-satin-row><span data-satin-row-label>Note</span></div></div>'
  document.body.append(container)
  const item = container.firstElementChild as HTMLElement
  const row = item.firstElementChild as HTMLElement
  const label = row.firstElementChild as HTMLElement
  item.getBoundingClientRect = () => new DOMRect(20, 0, 400, 52)
  let labelLeft = 40
  label.getBoundingClientRect = () => new DOMRect(labelLeft, 0, 100, 20)
  let resize!: () => void
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  const stop = observeSeparatorInsets(container)
  const inset = () => item.style.getPropertyValue('--satin-row-separator-inset')
  expect(inset()).toBe('20px')
  item.dataset.satinContextPending = 'true'
  labelLeft = 38
  resize()
  expect(inset()).toBe('20px')
  delete item.dataset.satinContextPending
  row.dataset.satinContextLift = 'row'
  labelLeft = 36
  resize()
  expect(inset()).toBe('20px')
  delete row.dataset.satinContextLift
  labelLeft = 78
  resize()
  expect(inset()).toBe('58px')
  const replacement = label.cloneNode(true) as HTMLElement
  replacement.getBoundingClientRect = () => new DOMRect(62, 0, 100, 20)
  label.replaceWith(replacement)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(inset()).toBe('42px')
  replacement.getBoundingClientRect = () => new DOMRect(72, 0, 100, 20)
  replacement.style.marginInlineStart = '10px'
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(inset()).toBe('52px')
  stop()
})

describe('label-aligned list separators', () => {
  it('aligns standalone button separators to content and preserves a row label with a trailing button', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <div data-satin-section-item>
        <button><span data-satin-button-content>Save</span></button>
      </div>
      <div data-satin-section-item>
        <span data-satin-row-label>Account</span>
        <button><span data-satin-button-content>Edit</span></button>
      </div>`
    document.body.append(container)
    const items = Array.from(container.children) as HTMLElement[]
    const labels = Array.from(container.querySelectorAll('span'))
    for (const item of items) item.getBoundingClientRect = () => new DOMRect(20, 0, 400, 64)
    labels[0]!.getBoundingClientRect = () => new DOMRect(52, 0, 60, 20)
    labels[1]!.getBoundingClientRect = () => new DOMRect(40, 0, 80, 20)
    labels[2]!.getBoundingClientRect = () => new DOMRect(300, 0, 60, 20)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    const stop = observeSeparatorInsets(container)
    expect(items.map(item => item.style.getPropertyValue('--satin-row-separator-inset'))).toEqual([
      '32px',
      '20px',
    ])
    stop()
  })
  it.each([2, 3])(
    'snaps arbitrary accessories to the %dx pixel grid in either direction',
    resolution => {
      const item = { left: 20, right: 420 }
      const label = { left: 93.2, right: 346.8 }
      const ltr = separatorInset(item, label, 'ltr', resolution)
      const rtl = separatorInset(item, label, 'rtl', resolution)
      expect(ltr).toBe(rtl)
      expect(ltr * resolution).toBe(Math.round(73.2 * resolution))
    },
  )
  it('handles text, stock icons, and custom accessories without an icon assumption', () => {
    for (const inset of [20, 58, 86]) {
      expect(separatorInset({ left: 0, right: 300 }, { left: inset, right: 250 }, 'ltr', 2)).toBe(
        inset,
      )
    }
  })
})
