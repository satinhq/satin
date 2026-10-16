// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { SafeAreaInset } from './SafeAreaInset.tsx'
import { Overlay } from './Overlay.tsx'
import { createBottomInsetGeometry } from './bottomInsetGeometry.ts'
import { BottomInsetContext } from './SafeAreaInset.tsx'
import { IgnoresSafeArea } from './modifiers.tsx'

// Owner's iPhone, Oct 8 (keyboard-chat r1/r2): a composer that grew by a line covered the newest
// message for a frame before the thread caught up, and tapping Send took the keyboard down.
let reactRoot: Root | undefined
afterEach(() => {
  act(() => reactRoot?.unmount())
  reactRoot = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function renderComposer() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.matches('[data-satin-inset-accessory]') ? 52 : 0
    return { top: 0, bottom: height, height, left: 0, right: 0, width: 0 } as DOMRect
  })
  const container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() =>
    reactRoot!.render(
      <SafeAreaInset
        edge="bottom"
        content={
          <div>
            <textarea aria-label="Message" />
            <button>Send</button>
          </div>
        }
      >
        <div>Thread</div>
      </SafeAreaInset>,
    ),
  )
  return container.querySelector<HTMLElement>('[data-satin-safe-area-inset]')!
}

it("gives the content its accessory's height in the commit that measured it", () => {
  const inset = renderComposer()
  // No later React render: the scroll inset (styles.css) reads this in the same frame.
  expect(inset.style.getPropertyValue('--satin-inset-accessory-height')).toBe('52px')
  // SwiftUI's default safeAreaInset spacing keeps the last line 8 pt clear of the composer (reference).
  expect(inset.style.getPropertyValue('--satin-inset-spacing')).toBe('8px')
})

it('keeps editing when an accessory control is pressed', () => {
  const inset = renderComposer()
  const editor = inset.querySelector('textarea')!
  editor.focus()
  const send = inset.querySelector('button')!
  const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 })
  send.dispatchEvent(press)
  // WebKit moves focus at an unprevented mouse-down: Send would end editing.
  expect(press.defaultPrevented).toBe(true)
  const caret = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 })
  editor.dispatchEvent(caret)
  expect(caret.defaultPrevented).toBe(false)
})

it('ignoresSafeArea(.keyboard) keeps a bottom inset above the home indicator (reference)', () => {
  const container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() =>
    reactRoot!.render(
      <IgnoresSafeArea regions="keyboard">
        <SafeAreaInset edge="bottom" content={<input aria-label="Message" />}>
          <div>Thread</div>
        </SafeAreaInset>
      </IgnoresSafeArea>,
    ),
  )
  const boundary = container.querySelector<HTMLElement>('[data-satin-bottom-boundary]')!
  expect(boundary.dataset.satinBottomBoundary).toBe('root')
  expect(boundary.dataset.satinKeyboardIgnored).toBe('true')
  // The container region is untouched: the wrapper extends no edge.
  expect(container.firstElementChild?.hasAttribute('data-satin-ignores-safe-area-edges')).toBe(
    false,
  )
})

it('lays a floating control against the same reduced bottom area as the transcript as the composer grows', () => {
  const geometry = createBottomInsetGeometry()
  geometry.publish(60)
  const container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  act(() =>
    reactRoot!.render(
      <BottomInsetContext value={{ consumed: true, geometry }}>
        <Overlay alignment="bottom" content={<button>Latest</button>}>
          <div>Transcript</div>
        </Overlay>
      </BottomInsetContext>,
    ),
  )
  const layer = container.querySelector<HTMLElement>('[data-satin-overlay-layer]')!
  expect(layer.style.getPropertyValue('--satin-scroll-inset-bottom')).toBe('60px')
  geometry.publish(92)
  expect(layer.style.getPropertyValue('--satin-scroll-inset-bottom')).toBe('92px')
  expect(geometry.attached().has(layer)).toBe(true)
  act(() => reactRoot!.unmount())
  reactRoot = undefined
  expect(geometry.attached().size).toBe(0)
})
