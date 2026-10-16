// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createMenuContact } from './menuContact.ts'
import type { GlassInteraction } from '../glass/rendererContract.ts'
import { MenuTouchLight } from '../glass/lens/menuTouchLight.ts'
import { ownMenuCompatibilityClick } from '../press/contactReceipt.ts'

afterEach(() => {
  vi.useRealTimers()
})
it('preserves keyboard activation', () => {
  vi.useFakeTimers()
  const target = new EventTarget()
  ownMenuCompatibilityClick(target)
  const click = Object.assign(new Event('click', { cancelable: true }), { detail: 0 })
  target.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(false)
  vi.runAllTimers()
})

it('expires the menu receipt at its existing 750 ms deadline', () => {
  vi.useFakeTimers()
  const target = new EventTarget()
  ownMenuCompatibilityClick(target)
  vi.advanceTimersByTime(750)
  const click = Object.assign(new Event('click', { cancelable: true }), { detail: 1 })
  target.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(false)
})

function contactFixture() {
  const panel = document.createElement('div')
  const glass = document.createElement('div')
  glass.dataset.satinGlassRegionId = 'menu'
  panel.append(glass)
  document.body.append(panel)
  Object.defineProperties(glass, {
    offsetWidth: { value: 200 },
    offsetHeight: { value: 100 },
  })
  glass.getBoundingClientRect = () => new DOMRect(20, 30, 240, 120)
  panel.getBoundingClientRect = () => new DOMRect(20, 30, 240, 120)
  panel.style.transformOrigin = '120px 60px'
  const samples: GlassInteraction[] = []
  const controller = createMenuContact()
  const detach = controller.attach(panel, input => samples.push(input))
  return {
    panel,
    samples,
    controller,
    dispose: () => {
      detach()
      panel.remove()
    },
  }
}

it('keeps a transferred finger light under contact as the menu stretches and releases outside', () => {
  const fixture = contactFixture()
  try {
    fixture.controller.transfer({ pointerId: 7, x: 80, y: 90 }, fixture.panel)
    expect(fixture.samples.at(-1)?.contact).toEqual({ x: 50, y: 50 })
    fixture.controller.sample({ pointerId: 7, x: 320, y: 150, phase: 'move' })
    const local = fixture.samples.at(-1)!.contact!
    const transform = /translate3d\(([^p]+)px, ([^p]+)px, 0\) scale\(([^,]+), ([^)]+)\)/
      .exec(fixture.panel.style.transform)!
      .slice(1)
      .map(Number)
    const [translateX, translateY, scaleX, scaleY] = transform
    // Project the emitted local light through the CSS pose actually painted on the menu.
    expect(140 + translateX + (local.x * 1.2 - 120) * scaleX).toBeCloseTo(320)
    expect(90 + translateY + (local.y * 1.2 - 60) * scaleY).toBeCloseTo(150)
    fixture.controller.sample({ pointerId: 7, x: 320, y: 150, phase: 'end' })
    expect(fixture.samples.at(-1)?.phase).toBe('releasing')
    expect(fixture.controller.active).toBe(false)
  } finally {
    fixture.dispose()
  }
})

it('leaves the opening hold unlit until its finger enters the menu', () => {
  vi.useFakeTimers({ toFake: ['performance'] })
  const fixture = contactFixture()
  const field = new MenuTouchLight()
  const sampleField = () => {
    for (const input of fixture.samples.splice(0)) field.input(input)
    return field.sample('light', performance.timeOrigin + performance.now())
  }
  try {
    fixture.controller.transfer({ pointerId: 7, x: 80, y: 0 }, fixture.panel)
    expect(sampleField()).toBeUndefined()
    fixture.controller.sample({ pointerId: 7, x: 80, y: 0, phase: 'end' })
    expect(sampleField()).toBeUndefined()

    fixture.controller.transfer({ pointerId: 8, x: 80, y: 0 }, fixture.panel)
    fixture.controller.sample({ pointerId: 8, x: 80, y: 90, phase: 'move' })
    vi.advanceTimersByTime(160)
    expect(sampleField()?.intensity).toBeGreaterThan(0)
    fixture.controller.sample({ pointerId: 8, x: 80, y: 0, phase: 'end' })
    vi.advanceTimersByTime(160)
    expect(sampleField()?.intensity).toBeGreaterThan(0)
  } finally {
    fixture.dispose()
  }
})

it('lights disabled menu glass without selecting it and clears the light on focus loss', () => {
  const fixture = contactFixture()
  const disabled = document.createElement('button')
  disabled.disabled = true
  disabled.setAttribute('role', 'menuitem')
  fixture.panel.firstElementChild!.append(disabled)
  try {
    disabled.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        isPrimary: true,
        pointerId: 4,
        button: 0,
        clientX: 80,
        clientY: 90,
      }),
    )
    expect(fixture.samples.at(-1)?.phase).toBe('pressed')
    fixture.controller.sample({ pointerId: 5, x: 0, y: 0, phase: 'cancel' })
    expect(fixture.controller.active).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(fixture.samples.at(-1)?.phase).toBe('rest')
    expect(fixture.controller.active).toBe(false)
  } finally {
    fixture.dispose()
  }
})
