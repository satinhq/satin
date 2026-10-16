// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { NavigationSearchRow, liftNavigationSearchRow } from './NavigationSearchRow.tsx'
import { createAnimatedTransitionController } from './motion.ts'

it('keeps field identity and edits while lifting above both pages, restoring and unmounting', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  host.setAttribute('data-satin-navigator-host', '')
  document.body.append(host)
  const root = createRoot(host)
  function Field() {
    const [value, setValue] = useState('Work')
    return <input value={value} onChange={event => setValue(event.target.value)} />
  }
  try {
    act(() =>
      root.render(
        <>
          <div data-satin-screen-container="true">
            <div data-satin-search="" data-satin-search-presented="">
              <NavigationSearchRow>
                <Field />
              </NavigationSearchRow>
            </div>
          </div>
          <div data-satin-screen-container="true">Incoming page</div>
        </>,
      ),
    )
    const screen = host.firstElementChild!
    const row = screen.querySelector<HTMLElement>('[data-satin-search-row]')!
    const input = row.querySelector('input')!
    input.value = 'Changed'
    const controller = createAnimatedTransitionController(
      { finish() {}, cancel() {} },
      { interactive: true, operation: 'pop' },
    )
    const binding = {
      direction: 'pop' as const,
      width: 440,
      primary: host.children[1] as HTMLElement,
      secondary: screen as HTMLElement,
    }
    const restore = controller.bind!(binding)
    expect(screen.contains(row)).toBe(false)
    expect(row.parentElement?.parentElement).toBe(host)
    expect(row.parentElement?.hasAttribute('data-satin-search-presented')).toBe(true)
    expect(row.querySelector('input')).toBe(input)
    expect(input.value).toBe('Changed')
    restore()
    expect(screen.contains(row)).toBe(true)
    expect(input.value).toBe('Changed')
    controller.bind!({ ...binding })
    act(() => root.unmount())
    expect(host.children.length).toBe(0)
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('keeps a pinned field painted after cancelling search and returning from a detail', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  host.setAttribute('data-satin-navigator-host', '')
  const styles = document.createElement('style')
  const css = readFileSync('src/styles.css', 'utf8')
  styles.textContent = css.slice(
    css.indexOf('[data-satin-search-row] {'),
    css.indexOf('[data-satin-search-fill] {'),
  )
  document.head.append(styles)
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() =>
      root.render(
        <div data-satin-screen-container="true">
          <div data-satin-search="" data-satin-search-pinned="">
            <NavigationSearchRow>
              <div data-satin-search-field="">
                <canvas data-satin-glass-region-canvas="true" />
                <input defaultValue="Atlas" />
              </div>
            </NavigationSearchRow>
          </div>
        </div>,
      ),
    )
    const drawer = host.querySelector<HTMLElement>('[data-satin-search]')!
    const row = drawer.querySelector<HTMLElement>('[data-satin-search-row]')!
    const canvas = row.querySelector('canvas')!
    drawer.setAttribute('data-satin-search-presented', '')
    drawer.removeAttribute('data-satin-search-presented')
    row.querySelector('input')!.value = ''
    expect(getComputedStyle(canvas).display).toBe('block')
    const restorePush = liftNavigationSearchRow(row)!
    expect(getComputedStyle(canvas).display).toBe('block')
    restorePush()
    const restorePop = liftNavigationSearchRow(row)!
    expect(getComputedStyle(canvas).display).toBe('block')
    restorePop()
    expect(getComputedStyle(canvas).display).toBe('block')
    expect(row.querySelector('input')!.value).toBe('')
    const screen = host.firstElementChild as HTMLElement
    const detail = document.createElement('div')
    detail.textContent = 'Conversation'
    host.append(detail)
    for (const direction of ['push', 'pop'] as const) {
      const controller = createAnimatedTransitionController(
        { finish() {}, cancel() {} },
        { interactive: true, operation: direction },
      )
      const restore = controller.bind!({
        direction,
        width: 440,
        primary: detail,
        secondary: screen,
      })
      controller.setProgress!(0.6)
      // A cancelled search belongs to its page, so it stays painted as that page is revealed.
      expect(screen.contains(row)).toBe(true)
      expect(row.style.opacity).not.toBe('0')
      expect(row.style.transform).toBe('')
      expect(getComputedStyle(canvas).display).toBe('block')
      restore()
    }
  } finally {
    act(() => root.unmount())
    host.remove()
    styles.remove()
  }
})
