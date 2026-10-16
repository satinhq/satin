// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

const phases: string[] = []
vi.mock('./pressHighlight.ts', () => ({
  glassPressHighlight: (_target: unknown, phase: string) => {
    phases.push(phase)
  },
  glassPressScale: () => 1,
}))
const { GlassEffect } = await import('./GlassEffect.tsx')
const { MaterialEffectContext } = await import('./liquidContext.ts')
const { GlassRegionRegistry } = await import('./regionRegistry.ts')
const { Glass } = await import('./regions.ts')

const mounted: Array<() => void> = []
afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose()
  vi.unstubAllGlobals()
  phases.length = 0
})

function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const element = document.createElement('div'),
    root = createRoot(element),
    regions = new GlassRegionRegistry()
  document.body.append(element)
  mounted.push(() => {
    act(() => root.unmount())
    element.remove()
  })
  act(() =>
    root.render(
      <MaterialEffectContext value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}>
        <GlassEffect glass={Glass.regular.interactive()} press="button">
          <button>Edit</button>
        </GlassEffect>
      </MaterialEffectContext>,
    ),
  )
  return element.querySelector<HTMLElement>('[data-satin-glass-effect]')!
}
const pointer = (type: string, target: Element) =>
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: 10,
        clientY: 10,
      }),
    )
  })

it('a tap on an uncontrolled glass button releases its label highlight (document capture runs first)', () => {
  const glass = mount()
  pointer('pointerdown', glass.querySelector('button')!)
  pointer('pointerup', glass.querySelector('button')!)
  expect(phases).toEqual(['pressed', 'releasing'])
})

it('a pointer released elsewhere, a cancel, and a window blur end the highlight exactly once', () => {
  const glass = mount()
  pointer('pointerdown', glass)
  pointer('pointerup', document.body)
  pointer('pointerdown', glass)
  pointer('pointercancel', glass)
  pointer('pointerdown', glass)
  act(() => {
    window.dispatchEvent(new Event('blur'))
  })
  // A cancelled touch (a scroll took it) springs back like a release; a blur clears at once.
  expect(phases).toEqual(['pressed', 'releasing', 'pressed', 'releasing', 'pressed', 'rest'])
})

it("a touch on a glass field's own editor presses the glass and keeps the editor's focus", () => {
  const glass = mount()
  const editor = document.createElement('textarea')
  glass.append(editor)
  editor.focus()
  pointer('pointerdown', editor)
  pointer('pointerup', editor)
  expect(document.activeElement).toBe(editor)
  // Native interactive glass fields press (light, grow, squish) under the finger.
  expect(phases).toEqual(['pressed', 'releasing'])
})

it('leaves a contact on one of several text inputs inside a glass to that input', () => {
  const glass = mount()
  const [first, second] = [document.createElement('input'), document.createElement('input')]
  glass.append(first, second)
  first.focus()
  pointer('pointerdown', first)
  pointer('pointerup', first)
  expect(document.activeElement).toBe(first)
  expect(phases).toEqual([])
})

it("a tap on a text field's glass edge presses the glass and focuses its editor", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const host = document.createElement('div'),
    root = createRoot(host),
    regions = new GlassRegionRegistry()
  const pressed: string[] = []
  vi.spyOn(regions, 'interact').mockImplementation(({ phase }) => void pressed.push(phase))
  document.body.append(host)
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  act(() =>
    root.render(
      <MaterialEffectContext value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}>
        <GlassEffect glass={Glass.regular.interactive()}>
          <span data-edge="true">
            <span data-satin-role="text-input" data-wrapper="true">
              <textarea aria-label="Message" defaultValue="Hello" />
            </span>
          </span>
          <button>Send</button>
        </GlassEffect>
      </MaterialEffectContext>,
    ),
  )
  const glass = host.querySelector<HTMLElement>('[data-satin-glass-effect]')!
  const editor = glass.querySelector('textarea')!
  // The field's own click focuses the editor (installed iPad, Chats composer right edge 10/10
  // once the session has shown a keyboard); no <label> is laid over the padding.
  expect(glass.querySelector('label')).toBeNull()
  // The field's padding and rounded edge: the editor takes the tap, at the end of its text.
  pointer('pointerdown', glass.querySelector('[data-edge]')!)
  pointer('pointerup', glass.querySelector('[data-edge]')!)
  // iOS raises the keyboard for focus from the tap's click, so the editor takes it there.
  act(() => glass.querySelector<HTMLElement>('[data-edge]')!.click())
  expect(document.activeElement).toBe(editor)
  expect(editor.selectionStart).toBe(5)
  expect(pressed).toEqual(['pressed', 'releasing'])
  // The editor's own padded wrapper (TextEditor's text-input box) is part of the field too.
  act(() => editor.blur())
  pointer('pointerdown', glass.querySelector('[data-wrapper]')!)
  pointer('pointerup', glass.querySelector('[data-wrapper]')!)
  act(() => glass.querySelector<HTMLElement>('[data-wrapper]')!.click())
  expect(document.activeElement).toBe(editor)
  expect(pressed).toEqual(['pressed', 'releasing', 'pressed', 'releasing'])
  // A control inside the field presses the glass too.
  pointer('pointerdown', glass.querySelector('button')!)
  pointer('pointerup', glass.querySelector('button')!)
  expect(pressed.slice(4)).toEqual(['pressed', 'releasing'])
  // The press light is part of the glass material (drawn under the field's text and
  // placeholder); no separate lift canvas is laid over the field.
  expect(glass.querySelector('[data-satin-glass-lift]')).toBeNull()
})
