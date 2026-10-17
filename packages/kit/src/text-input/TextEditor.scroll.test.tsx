// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { TextEditor } from './TextEditor.tsx'

// Keyboard construction update, iPhone 17 Pro Max Simulator (scratch kb8/evidence/sim-t1): the keyboard
// reveal scrolled the list to a long note's caret line, then TextEditor re-measured itself
// (height 0, read scrollHeight, set the height) when the list's padding changed. With the editor
// 0 pt tall, the list's content was shorter than its offset and WebKit clamped it: the caret line
// ended under the keyboard again. Measuring must leave every scroll offset where it was.
const LINE = 22
let reactRoot: Root | undefined
afterEach(() => {
  act(() => reactRoot?.unmount())
  reactRoot = undefined
  document.body.replaceChildren()
})

/** A list surface whose scroll offset is clamped to its content, which includes the editor's height. */
function clampingSurface(surface: HTMLElement, editor: () => HTMLTextAreaElement | null) {
  let offset = 0
  const clientHeight = 600
  const scrollHeight = () => 200 + (parseFloat(editor()?.style.height ?? '') || 0)
  Object.defineProperty(surface, 'clientHeight', { get: () => clientHeight, configurable: true })
  Object.defineProperty(surface, 'scrollHeight', { get: scrollHeight, configurable: true })
  Object.defineProperty(surface, 'scrollTop', {
    get: () => {
      offset = Math.max(0, Math.min(offset, scrollHeight() - clientHeight))
      return offset
    },
    set: (value: number) => {
      offset = Math.max(0, Math.min(value, scrollHeight() - clientHeight))
    },
    configurable: true,
  })
}

it('keeps the list and its own text where they were scrolled while it measures itself', () => {
  const surface = document.createElement('div')
  surface.setAttribute('data-satin-scroll-axis', 'vertical')
  document.body.append(surface)
  let textarea: HTMLTextAreaElement | null = null
  clampingSurface(surface, () => textarea)
  const text = Array.from({ length: 60 }, (_, index) => `Line ${index + 1}`).join('\n')
  const ownScroll = new WeakMap<Element, number>()
  const nativeScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  // Reading scrollHeight lays the page out: every scroll offset is clamped to the layout of now.
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    get(this: HTMLTextAreaElement) {
      void surface.scrollTop
      void this.scrollTop
      return 60 * LINE
    },
    configurable: true,
  })
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollTop', {
    get(this: HTMLTextAreaElement) {
      const height = parseFloat(this.style.height) || 0
      const offset = Math.max(0, Math.min(ownScroll.get(this) ?? 0, 60 * LINE - height))
      ownScroll.set(this, offset)
      return offset
    },
    set(this: HTMLTextAreaElement, value: number) {
      const height = parseFloat(this.style.height) || 0
      ownScroll.set(this, Math.max(0, Math.min(value, 60 * LINE - height)))
    },
    configurable: true,
  })
  try {
    reactRoot = createRoot(surface)
    act(() => reactRoot!.render(<TextEditor label="Note" value={text} onChange={() => {}} />))
    textarea = surface.querySelector('textarea')
    surface.scrollTop = 400
    textarea!.scrollTop = 300
    const before = [surface.scrollTop, textarea!.scrollTop]
    act(() => {
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect([surface.scrollTop, textarea!.scrollTop]).toEqual(before)
  } finally {
    delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollTop
    if (nativeScrollHeight)
      delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight
  }
})

it('does not collapse the focused editing viewport while measuring an input or controlled update', () => {
  const surface = document.createElement('div')
  surface.setAttribute('data-satin-scroll-axis', 'vertical')
  Object.defineProperty(surface, 'clientHeight', { value: 600 })
  document.body.append(surface)
  const measuredWhileFocused: number[] = []
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight')
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      const focused = document.activeElement
      if (focused instanceof HTMLTextAreaElement) {
        measuredWhileFocused.push(parseFloat(focused.style.height))
      }
      return Math.max(1, this.value.split('\n').length) * LINE
    },
  })
  try {
    reactRoot = createRoot(surface)
    const render = (value: string) =>
      act(() => reactRoot!.render(<TextEditor label="Note" value={value} onChange={() => {}} />))
    render('one two three')
    const editor = surface.querySelector('textarea')!
    editor.focus()
    editor.setSelectionRange(3, 3)
    act(() => editor.dispatchEvent(new Event('input', { bubbles: true })))
    render('one two three\nfour five six')
    expect(measuredWhileFocused.length).toBeGreaterThan(0)
    expect(measuredWhileFocused.every(height => height >= LINE)).toBe(true)
    expect(document.activeElement).toBe(editor)
    expect(editor.selectionStart).toBe(editor.selectionEnd)
  } finally {
    if (descriptor) Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', descriptor)
    else delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight
  }
})

it('grows a composer by its content outside a scroll surface and caps it at its line limit', () => {
  const host = document.createElement('div')
  document.body.append(host)
  Object.defineProperty(host, 'clientHeight', { value: LINE })
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight')
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return this.value.split('\n').length * LINE
    },
  })
  try {
    reactRoot = createRoot(host)
    const render = (value: string) =>
      act(() =>
        reactRoot!.render(
          <TextEditor minLines={1} maxLines={3} value={value} onChange={() => {}} />,
        ),
      )
    render('one')
    const editor = host.querySelector('textarea')!
    editor.focus()
    render('one\ntwo')
    expect(parseFloat(editor.style.height)).toBe(2 * LINE)
    render('one\ntwo\nthree\nfour')
    expect(parseFloat(editor.style.height)).toBe(3 * LINE)
    expect(document.activeElement).toBe(editor)
  } finally {
    if (descriptor) Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', descriptor)
  }
})
