// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { createMenuContact } from '../menu/menuContact.ts'
import { ActionMenu } from './ActionMenu.tsx'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach(dispose => dispose())
  vi.useRealTimers()
  vi.restoreAllMocks()
})
function setup(overflow = false) {
  document.dispatchEvent(new Event('pointerdown'))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const host = document.createElement('div')
  if (overflow) {
    host.dataset.satinMenuScroll = 'true'
    Object.defineProperty(host, 'clientHeight', { value: 100 })
    Object.defineProperty(host, 'scrollHeight', { value: 500 })
  }
  document.body.append(host)
  const root = createRoot(host)
  const select = vi.fn()
  function Fixture() {
    const [value, setValue] = useState('Food')
    return (
      <ActionMenu
        actions={['Food', 'Home'].map(label => ({
          id: label,
          label,
          checked: value === label,
          onPress: () => {
            setValue(label)
            select(label)
          },
        }))}
        select={action => action.onPress?.()}
      />
    )
  }
  act(() => root.render(<Fixture />))
  const controller = createMenuContact()
  const detach = controller.attach(host)
  cleanup.push(() => {
    detach()
    act(() => root.unmount())
    host.remove()
  })
  const rows = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
  let hit = rows[0]!
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit })
  const send = (type: string, rowIndex = 0) => {
    const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 30,
      clientY: 50,
    })
    act(() => rows[rowIndex]!.dispatchEvent(event))
  }
  return {
    host,
    controller,
    rows,
    select,
    send,
    hit: (index: number) => {
      hit = rows[index]!
    },
  }
}
it('highlights after a hold, tracks the finger instead of implicit capture, and selects only the release row', () => {
  vi.useFakeTimers()
  const s = setup()
  s.send('pointerdown')
  expect(s.rows[0]!.hasAttribute('data-satin-drag-selected')).toBe(false)
  act(() => vi.advanceTimersByTime(175))
  expect(s.rows[0]!.hasAttribute('data-satin-drag-selected')).toBe(true)
  s.hit(1)
  s.send('pointermove')
  expect(s.rows[0]!.hasAttribute('data-satin-drag-selected')).toBe(false)
  expect(s.rows[1]!.hasAttribute('data-satin-drag-selected')).toBe(true)
  s.send('pointerup')
  expect(s.select.mock.calls).toEqual([['Home']])
  expect(s.rows.filter(row => row.getAttribute('aria-checked') === 'true')).toEqual([s.rows[1]])
  const click = Object.assign(new Event('click', { bubbles: true, cancelable: true }), {
    detail: 1,
  })
  act(() => s.rows[0]!.dispatchEvent(click))
  expect(s.select).toHaveBeenCalledTimes(1)
})
it('cancels without selection or a stuck highlight', () => {
  const s = setup()
  s.send('pointerdown')
  s.send('pointercancel')
  expect(s.select).not.toHaveBeenCalled()
  expect(s.rows.some(row => row.hasAttribute('data-satin-drag-selected'))).toBe(false)
})

it('retains ownership when a context-menu opening contact slides directly into an action', () => {
  const fixture = setup()
  fixture.hit(1)
  act(() => {
    fixture.controller.begin({ pointerId: 91, x: 30, y: 50 }, true)
    fixture.controller.sample({ pointerId: 91, x: 30, y: 50, phase: 'end' })
  })
  const under = document.createElement('button')
  const leak = vi.fn()
  under.addEventListener('click', leak)
  document.body.append(under)
  const click = Object.assign(new Event('click', { bubbles: true, cancelable: true }), {
    detail: 1,
  })
  act(() => under.dispatchEvent(click))
  expect(leak).not.toHaveBeenCalled()
  expect(fixture.select.mock.calls).toEqual([['Home']])
  under.remove()
})

it('preserves native scrolling when menu contents overflow the available viewport', () => {
  const fixture = setup(true)
  const menu = fixture.rows[0]!.closest<HTMLElement>('[data-satin-action-menu]')!
  expect(menu.style.touchAction).toBe('pan-y')
})

it('activates a quick tap without any row highlight or late timer', () => {
  vi.useFakeTimers()
  const s = setup()
  s.hit(1)
  s.send('pointerdown', 1)
  act(() => vi.advanceTimersByTime(70))
  expect(s.rows.some(row => row.hasAttribute('data-satin-drag-selected'))).toBe(false)
  s.send('pointerup', 1)
  expect(s.select).not.toHaveBeenCalled()
  expect(s.rows[0]!.getAttribute('aria-checked')).toBe('true')
  act(() => s.rows[1]!.click())
  act(() => vi.advanceTimersByTime(300))
  expect(s.select).toHaveBeenCalledExactlyOnceWith('Home')
  expect(s.rows[1]!.getAttribute('aria-checked')).toBe('true')
  expect(s.rows.some(row => row.hasAttribute('data-satin-drag-selected'))).toBe(false)
})

it('cancels a pending or held highlight when scrolling cancels the pointer', () => {
  vi.useFakeTimers()
  const s = setup(true)
  for (const duration of [70, 200]) {
    s.send('pointerdown')
    act(() => vi.advanceTimersByTime(duration))
    s.send('pointercancel')
    act(() => vi.advanceTimersByTime(300))
    expect(s.rows.some(row => row.hasAttribute('data-satin-drag-selected'))).toBe(false)
  }
  expect(s.select).not.toHaveBeenCalled()
})
