// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { GlassInteraction } from './rendererContract.ts'

// Label animations are not under test here (happy-dom rejects cancelled animations).
vi.mock('./pressHighlight.ts', () => ({ glassPressHighlight: () => {}, glassPressScale: () => 1 }))
const { GlassBackground, GlassButton, GlassEffect } = await import('./GlassEffect.tsx')
const { MaterialEffectContext } = await import('./liquidContext.ts')
const { GlassRegionRegistry } = await import('./regionRegistry.ts')
const { Glass } = await import('./regions.ts')
const { GLASS_BACK_SWIPE, GLASS_CONTACT_PHYSICS, glassContactKind } =
  await import('./contactPhysics.ts')
const { interactivePressScale } = await import('./lens/interactivePress.ts')
const { Pressable } = await import('../press/Pressable.tsx')
const { cancelPointerPressForOwnedGesture } = await import('../press/gestureArbitration.ts')
const { horizontalDragBlocksBack } = await import('../navigation/horizontalDrag.ts')
const { Slider, Toggle } = await import('../list-form/ListForm.tsx')

const mounted: Array<() => void> = []
afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose()
  if (GLASS_BACK_SWIPE) GLASS_BACK_SWIPE.yieldingKinds = ['button']
  vi.unstubAllGlobals()
})

function mount(node: ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const host = document.createElement('div')
  const root = createRoot(host)
  const regions = new GlassRegionRegistry()
  const inputs: GlassInteraction[] = []
  vi.spyOn(regions, 'interact').mockImplementation(input => void inputs.push(input))
  const register = vi.spyOn(regions, 'register')
  document.body.append(host)
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const render = (next: ReactNode) =>
    act(() =>
      root.render(
        <MaterialEffectContext
          value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}
        >
          {next}
        </MaterialEffectContext>,
      ),
    )
  render(node)
  return { host, inputs, register, render }
}

function pointer(type: string, target: EventTarget, clientX: number, pointerId = 3) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        clientX,
        clientY: 20,
      }),
    )
  })
}

const noop = () => {}

/** A thumb control with a 360 pt track (happy-dom lays out at 0 width). */
function thumbControl(host: HTMLElement) {
  const slider = host.querySelector<HTMLElement>('[data-satin-slider]')
  if (slider) Object.defineProperty(slider, 'clientWidth', { value: 360 })
  return host.querySelector('[role=switch], [data-satin-slider]')!
}

// Track thumbs take their finger through the same GlassContact as every interactive glass: a
// gesture that claims the touch before the thumb drags cancels it, as it cancels a glass button.
const thumbs: Record<string, { node: (changed: () => void) => ReactNode; at: number }> = {
  Toggle: {
    node: changed => <Toggle checked={false} onChange={changed} label="Wi-Fi" />,
    at: 10,
  },
  Slider: {
    node: changed => <Slider label="Volume" value={0} onChange={changed} />,
    // The thumb centre at the minimum end (happy-dom lays out at 0).
    at: 18.5,
  },
}

it.each(Object.keys(thumbs))(
  '%s thumb: a scroll that claims the touch before it drags cancels its contact',
  name => {
    const { node, at } = thumbs[name]!
    const changed = vi.fn()
    const { host } = mount(node(changed))
    const control = thumbControl(host)
    pointer('pointerdown', control, at)
    act(() => void cancelPointerPressForOwnedGesture(3))
    pointer('pointermove', document.body, at + 60)
    pointer('pointerup', document.body, at + 60)
    expect(changed).not.toHaveBeenCalled()
  },
)

it.each(Object.keys(thumbs))('%s thumb: a dragging thumb keeps its finger', name => {
  const { node, at } = thumbs[name]!
  const changed = vi.fn()
  const { host } = mount(node(changed))
  const control = thumbControl(host)
  pointer('pointerdown', control, at)
  pointer('pointermove', document.body, at + 30)
  act(() => void cancelPointerPressForOwnedGesture(3))
  pointer('pointermove', document.body, at + 60)
  pointer('pointerup', document.body, at + 60)
  expect(changed).toHaveBeenCalled()
})

it.each(Object.keys(thumbs))('%s thumb: leaving the window ends its contact', name => {
  const { node, at } = thumbs[name]!
  const changed = vi.fn()
  const { host } = mount(node(changed))
  const control = thumbControl(host)
  pointer('pointerdown', control, at)
  act(() => void window.dispatchEvent(new Event('blur')))
  pointer('pointermove', document.body, at + 60)
  pointer('pointerup', document.body, at + 60)
  expect(changed).not.toHaveBeenCalled()
})

it('Toggle and Slider track their finger only through the one contact path', () => {
  const source = (file: string) => readFileSync(join(import.meta.dirname, '..', file), 'utf8')
  for (const file of ['list-form/Toggle.tsx', 'list-form/Slider.tsx']) {
    const text = source(file)
    expect(text).toMatch(/trackThumbContact\(/)
    expect(text).not.toMatch(/addEventListener\(\s*'pointer/)
  }
  expect(source('glass/ControlLens.tsx')).toMatch(/new GlassContact\(/)
})

// Owner decision (Oct 13): native mode for content buttons is the default. The owning mode stays
// tested so the switch remains a one-line change.
it('owning mode: glass buttons and chrome own their horizontal drag; a back swipe claim releases them', () => {
  GLASS_BACK_SWIPE.yieldingKinds = []
  const { host, inputs } = mount(
    <>
      <GlassButton onPress={noop}>Actions</GlassButton>
      <Pressable aria-label="Back" onPress={noop}>
        <span>
          <GlassBackground shape="circle" interactive />
        </span>
      </Pressable>
    </>,
  )
  const [button, back] = host.querySelectorAll('button')
  expect(horizontalDragBlocksBack(button!)).toBe(true)
  expect(horizontalDragBlocksBack(back!)).toBe(true)
  pointer('pointerdown', button!, 10)
  act(() => void cancelPointerPressForOwnedGesture(3, 'back-swipe'))
  expect(inputs.map(input => input.phase)).toEqual(['pressed', 'releasing'])
})

it('native mode (default): a glass button lets the back swipe through and stays pressed while the page moves', () => {
  expect(GLASS_BACK_SWIPE.yieldingKinds).toEqual(['button'])
  const pressed = vi.fn()
  const { host, inputs } = mount(
    <>
      <GlassButton onPress={pressed}>Actions</GlassButton>
      <GlassEffect glass={Glass.regular.interactive()}>
        <textarea aria-label="Message" />
      </GlassEffect>
    </>,
  )
  const button = host.querySelector('button')!
  const field = host.querySelector('textarea')!
  expect(horizontalDragBlocksBack(button)).toBe(false)
  // A field always owns its drag (the composer must not open the split pane).
  expect(horizontalDragBlocksBack(field)).toBe(true)
  pointer('pointerdown', button, 10)
  act(() => void cancelPointerPressForOwnedGesture(3, 'back-swipe'))
  pointer('pointermove', document.body, 120)
  pointer('pointerup', document.body, 120)
  // Held through the swipe (no release at the claim), released with the finger; no tap.
  expect(inputs.map(input => input.phase)).toEqual(['pressed', 'dragging', 'releasing'])
  expect(pressed).not.toHaveBeenCalled()
  // Any other claim (a scroll) still releases it at once.
  inputs.length = 0
  pointer('pointerdown', button, 10, 4)
  act(() => void cancelPointerPressForOwnedGesture(4, 'back-swipe'))
  act(() => void cancelPointerPressForOwnedGesture(4))
  expect(inputs.map(input => input.phase)).toEqual(['pressed', 'releasing'])
})

it('native mode for bar buttons: chrome glass lets the back swipe through', () => {
  GLASS_BACK_SWIPE.yieldingKinds = ['button', 'bar']
  const { host } = mount(
    <Pressable aria-label="Back" onPress={noop}>
      <span>
        <GlassBackground shape="circle" interactive />
      </span>
    </Pressable>,
  )
  expect(horizontalDragBlocksBack(host.querySelector('button')!)).toBe(false)
})

it('interactive glass around one text editor presses as a field: 8 pt growth (native iPad)', () => {
  const { register } = mount(
    <>
      <GlassEffect glass={Glass.regular.interactive()}>
        <textarea aria-label="Message" />
      </GlassEffect>
      <GlassEffect glass={Glass.regular.interactive()}>
        <span>Card</span>
      </GlassEffect>
    </>,
  )
  const kinds = new Map<string, string>()
  for (const [entry] of register.mock.calls)
    kinds.set(
      entry.element.textContent ? 'card' : 'field',
      glassContactKind(entry.descriptor.material),
    )
  expect(Object.fromEntries(kinds)).toEqual({ field: 'field', card: 'surface' })
  expect(GLASS_CONTACT_PHYSICS.field.growthPt).toBe(8)
  expect(interactivePressScale('field', 400, 1)).toBeCloseTo(1.02)
  expect(interactivePressScale('surface', 400, 1)).toBeCloseTo(1.01)
})

it('disabling a held button retires its visual contact and prevents later drag feedback', () => {
  const pressed = vi.fn()
  const view = (disabled: boolean) => (
    <GlassButton disabled={disabled} onPress={pressed}>
      Save
    </GlassButton>
  )
  const { host, inputs, render } = mount(view(false))
  const button = host.querySelector('button')!
  pointer('pointerdown', button, 10)
  // Disabling must still work after navigation already retired the activation session.
  act(() => void cancelPointerPressForOwnedGesture(3, 'back-swipe'))
  render(view(true))
  expect(inputs.at(-1)?.phase).toBe('rest')
  const afterDisable = inputs.length
  pointer('pointermove', document.body, 100)
  pointer('pointerup', document.body, 100)
  expect(inputs).toHaveLength(afterDisable)
  expect(pressed).not.toHaveBeenCalled()
})

it.each(['slider', 'toggle'] as const)(
  'retains a %s thumb pan before WebKit cancels pointer delivery',
  kind => {
    const { host } = mount(
      kind === 'slider' ? (
        <Slider label="Volume" value={0.5} onChange={noop} />
      ) : (
        <Toggle label="Enabled" checked={false} onChange={noop} />
      ),
    )
    const control = host.querySelector<HTMLElement>(
      kind === 'slider' ? '[data-satin-slider]' : '[data-satin-toggle]',
    )!
    Object.defineProperty(control, 'clientWidth', { value: 360 })
    const start = kind === 'slider' ? 180 : 20
    const moveTouch = (target: Element, count = 1) => {
      const touches = Array.from({ length: count }, (_, identifier) => ({
        identifier,
        target,
        clientX: start + 15,
        clientY: 20,
        pageX: start + 15,
        pageY: 20,
        screenX: start + 15,
        screenY: 20,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1,
      }))
      const event = new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches,
        changedTouches: touches,
      })
      act(() => target.dispatchEvent(event))
      return event.defaultPrevented
    }
    pointer('pointerdown', control, start)
    // Before horizontal intent, WebKit may scroll the Form. Other contacts stay independent.
    expect(moveTouch(control)).toBe(false)
    pointer('pointermove', control, start + 15)
    expect(moveTouch(document.body)).toBe(false)
    expect(moveTouch(control, 2)).toBe(false)
    expect(moveTouch(control)).toBe(true)
    pointer('pointerup', control, start + 30)
    expect(moveTouch(control)).toBe(false)
  },
)
