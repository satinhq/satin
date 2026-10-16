import { expect, it } from 'vitest'
import { bindMenuOutside } from './menuOutside.ts'
function setup() {
  const target = new EventTarget()
  let open = true,
    dismissals = 0,
    inside = false
  const dispose = bindMenuOutside({
    target,
    contains: () => inside,
    isOpen: () => open,
    dismiss: () => {
      open = false
      dismissals++
    },
  })
  const send = (type: string, extra: object = {}) => {
    const e = Object.assign(
      new Event(type, { cancelable: true }),
      { pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, detail: 1 },
      extra,
    )
    target.dispatchEvent(e)
    return e
  }
  return {
    send,
    dispose,
    target,
    get dismissals() {
      return dismissals
    },
    setInside() {
      inside = true
    },
  }
}
it('consumes the compatibility click even after dismissal has closed the menu', () => {
  const s = setup()
  s.send('pointerdown')
  s.send('pointerup')
  expect(s.dismissals).toBe(1)
  expect(s.send('click').defaultPrevented).toBe(true)
  s.dispose()
})
it('leaves pan defaults uncancelled and does not dismiss a drag as a tap', () => {
  const s = setup()
  expect(s.send('pointerdown').defaultPrevented).toBe(false)
  expect(s.send('pointermove', { clientY: 80 }).defaultPrevented).toBe(false)
  expect(s.send('pointerup', { clientY: 80 }).defaultPrevented).toBe(false)
  expect(s.dismissals).toBe(0)
  s.dispose()
})
it('does not swallow a fresh contact if WebKit omitted the preceding click', () => {
  const s = setup()
  s.send('pointerdown')
  s.send('pointerup')
  s.send('pointerdown', { pointerId: 2 })
  s.send('pointerup', { pointerId: 2 })
  let activations = 0
  s.target.addEventListener('click', () => activations++)
  s.send('click', { pointerId: 1 })
  s.send('click', { pointerId: 2 })
  expect(s.dismissals).toBe(1)
  expect(activations).toBe(1)
  s.dispose()
})
it('preserves menu-item contacts and assistive clicks', () => {
  const s = setup()
  s.setInside()
  s.send('pointerdown')
  s.send('pointerup')
  expect(s.dismissals).toBe(0)
  expect(s.send('click').defaultPrevented).toBe(false)
  s.dispose()
  const outside = setup()
  outside.send('pointerdown')
  outside.send('pointerup')
  expect(outside.send('click', { detail: 0 }).defaultPrevented).toBe(false)
  outside.dispose()
})
it('cancels ownership on pointer cancellation and removes every listener on disposal', () => {
  const s = setup()
  s.send('pointerdown')
  s.send('pointercancel')
  s.send('pointerup')
  expect(s.dismissals).toBe(0)
  s.dispose()
  s.send('pointerdown')
  s.send('pointerup')
  expect(s.dismissals).toBe(0)
})

it('leaves an open submenu on Escape before it dismisses the menu', () => {
  const target = new EventTarget()
  let submenus = 1
  let dismissals = 0
  bindMenuOutside({
    target,
    contains: () => false,
    isOpen: () => dismissals === 0,
    dismiss: () => dismissals++,
    back: () => submenus-- > 0,
  })
  const escape = () => target.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }))
  escape()
  expect(dismissals).toBe(0)
  escape()
  expect(dismissals).toBe(1)
})
