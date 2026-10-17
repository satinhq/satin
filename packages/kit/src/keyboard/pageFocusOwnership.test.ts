// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installKeyboardAdapter, prepareKeyboardForNavigation } from './adapter.ts'

// Owner's iPhone 17 Pro Max, Oct 2 (scratch findings/owner-notes-1002, "Text area focus"): tapping
// a note's text area on a pushed screen displaced the whole page, navigation bar included, by up
// to ~80 px for 2-3 frames. Keyboard construction update focuses every editor in the app with preventScroll, so
// WebKit never pans; construction update makes the framework reveal what WebKit used to: the field (a tall
// editor: its caret line) ends above the keyboard on any page, and editing gestures stay native.
//
// happy-dom has no layout and no keyboard. This file gives elements boxes and scroll offsets, and
// models WebKit as measured on the installed iPad (rounds 6 and 7): when the keyboard arrives,
// an editing session whose focus did not carry preventScroll pans the visual viewport to reveal
// the field (a phone centres it); a focus made by the default action of a mouse press keeps that
// pan even if repeated (modes1); any other focus takes the options of the latest focus call
// (modes2); with the keyboard already up, the focus call that moves focus pans at once unless it
// carried preventScroll (iPhone Simulator, construction update: the accessory bar's next key and an app's
// focus() call). Assertions are on the final geometry, never on how focus() was called.
//
// What this file cannot prove (construction update review): the model is not WebKit. The layer's scrollTop
// always "sticks", a `top: 100%` child always counts as scroll overflow, rects add every ancestor
// scrollTop without clipping, the caret mirror is replaced by a 10 pt grid, and the pan rules
// above are encoded, not observed. These tests check the framework's decisions under those
// assumptions. That a lifted overflow:hidden layer, a revealed caret line and the next-key
// handoff actually behave this way is shown only by the installed-app runs (measured-reference notes,
// rounds 8 and 9, iPhone Simulator).

const SCREEN_HEIGHT = 1024
const KEYBOARD_HEIGHT = 498
const KEYBOARD_TOP = SCREEN_HEIGHT - KEYBOARD_HEIGHT
const BAR_BOTTOM = 74
const LINE = 22
const PADDING = 8
const CHAR = 10
const SLOW_TAP_MS = 450

type Box = { top: number; height: number; left: number; width: number }
const boxes = new Map<Element, Box>()
function place(element: Element, top: number, height: number, left = 0, width = 1366) {
  boxes.set(element, { top, height, left, width })
}
/** A clamped scroll offset over `contentHeight` (plus the element's own bottom padding and spacers). */
function makeScroller(element: HTMLElement, contentHeight: () => number) {
  let offset = 0
  const clientHeight = () => boxes.get(element)!.height
  const scrollHeight = () => {
    let extent = contentHeight()
    for (const child of element.children) {
      const style = (child as HTMLElement).style
      if (style.getPropertyValue('top') !== '100%') continue
      extent = Math.max(
        extent,
        clientHeight() + (parseFloat(style.getPropertyValue('height')) || 0),
      )
    }
    return extent + (parseFloat(element.style.paddingBottom) || 0)
  }
  Object.defineProperty(element, 'clientHeight', { get: clientHeight, configurable: true })
  Object.defineProperty(element, 'scrollHeight', { get: scrollHeight, configurable: true })
  Object.defineProperty(element, 'scrollTop', {
    get: () => offset,
    set: (value: number) => {
      offset = Math.max(0, Math.min(value, scrollHeight() - clientHeight()))
    },
    configurable: true,
  })
}
function rectOf(element: Element) {
  const box = boxes.get(element)
  if (!box) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 }
  let scrolled = 0
  for (let node = element.parentElement; node; node = node.parentElement) scrolled += node.scrollTop
  const top = box.top - scrolled
  return {
    top,
    bottom: top + box.height,
    left: box.left,
    right: box.left + box.width,
    width: box.width,
    height: box.height,
    x: box.left,
    y: top,
  }
}

// Text layout the DOM cannot do here: lines of LINE pt, characters of CHAR pt, PADDING inside.
function lineStarts(value: string) {
  const starts = [0]
  for (let index = 0; index < value.length; index++)
    if (value[index] === '\n') starts.push(index + 1)
  return starts
}
function offsetAtPoint(editor: HTMLInputElement | HTMLTextAreaElement, x: number, y: number) {
  const rect = rectOf(editor)
  if (editor instanceof HTMLTextAreaElement) {
    const starts = lineStarts(editor.value)
    const line = Math.floor((y - rect.top - PADDING + editor.scrollTop) / LINE)
    return starts[Math.max(0, Math.min(line, starts.length - 1))]!
  }
  return Math.max(0, Math.min(Math.round((x - rect.left - PADDING) / CHAR), editor.value.length))
}
function caretLine(editor: HTMLTextAreaElement) {
  const line = lineStarts(editor.value).filter(start => start <= editor.selectionEnd).length - 1
  const top = rectOf(editor).top + PADDING + line * LINE - editor.scrollTop
  return { top, bottom: top + LINE }
}
vi.mock('./caretMirror.ts', () => ({
  caretOffsetAt: (editor: HTMLInputElement, x: number, y: number) => offsetAtPoint(editor, x, y),
  caretLineAt: (editor: HTMLInputElement | HTMLTextAreaElement, offset: number) => {
    if (!(editor instanceof HTMLTextAreaElement)) return null
    const line = lineStarts(editor.value).filter(start => start <= offset).length - 1
    const top = rectOf(editor).top + PADDING + line * LINE - editor.scrollTop
    return { top, bottom: top + LINE }
  },
}))

// The measured WebKit reveal (see the header).
let revealSession: 'none' | 'pan' | 'sticky-pan' = 'none'
const viewport = Object.assign(new EventTarget(), {
  height: SCREEN_HEIGHT,
  offsetTop: 0,
  scale: 1,
})
const nativeFocus = HTMLElement.prototype.focus
let focusDepth = 0
let focusDecided = false
/** The options of the focus call WebKit kept (the one that moved focus). */
let decidingFocus: FocusOptions | undefined
/** Measured on the iPhone Simulator (construction update): with the keyboard up, a focus without preventScroll pans at once. */
function webkitFocused(element: HTMLElement, options?: FocusOptions) {
  if (viewport.height < SCREEN_HEIGHT) {
    if (options?.preventScroll) return
    const rect = rectOf(element)
    viewport.offsetTop = Math.max(0, rect.bottom + 50 - viewport.height)
    viewport.dispatchEvent(new Event('scroll'))
    return
  }
  if (revealSession !== 'sticky-pan') revealSession = options?.preventScroll ? 'none' : 'pan'
}
function showKeyboard(height = KEYBOARD_HEIGHT) {
  viewport.height = SCREEN_HEIGHT - height
  const active = document.activeElement
  if (revealSession !== 'none' && active instanceof HTMLElement && boxes.has(active)) {
    // A phone centres the field above the keyboard; the iPad pans when it is under the keyboard.
    const rect = rectOf(active)
    viewport.offsetTop = Math.max(0, rect.bottom + 50 - viewport.height)
  }
  viewport.dispatchEvent(new Event('resize'))
}
function hideKeyboard() {
  viewport.height = SCREEN_HEIGHT
  viewport.offsetTop = 0
  viewport.dispatchEvent(new Event('resize'))
}

let now = 0
let dispose: () => void
let host: HTMLElement
beforeEach(() => {
  // Control callback ordering; `now` separately models the measured press/keyboard durations.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  now = 0
  boxes.clear()
  revealSession = 'none'
  viewport.height = SCREEN_HEIGHT
  viewport.offsetTop = 0
  localStorage.clear()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: SCREEN_HEIGHT, configurable: true })
  Object.defineProperty(window, 'innerWidth', { value: 1366, configurable: true })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return rectOf(this) as DOMRect
  })
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
    this: HTMLElement,
    options?: FocusOptions,
  ) {
    focusDepth++
    const was = document.activeElement
    try {
      nativeFocus.call(this, options)
    } finally {
      focusDepth--
    }
    // WebKit abandons a focus change that a blur handler already made: the call that moved focus
    // decides. A repeat on the focused element takes its options while no keyboard shows (modes2).
    const moved = was !== this && document.activeElement === this
    if (moved && !focusDecided) {
      focusDecided = true
      decidingFocus = options
      webkitFocused(this, options)
    } else if (was === this && viewport.height === SCREEN_HEIGHT) webkitFocused(this, options)
    if (focusDepth === 0) focusDecided = false
  })
  // WebKit's hit test of a text-control mirror (for an implementation that measures one): the
  // mirror is the last element outside the app holding the pressed editor's text.
  const caretDocument = document as Document & { caretRangeFromPoint?: unknown }
  caretDocument.caretRangeFromPoint = (x: number, y: number) => {
    const mirror = [...document.querySelectorAll('body *')]
      .reverse()
      .find(node => node.firstChild instanceof Text && !host.contains(node))
    if (!mirror || !pressed) return null
    const range = document.createRange()
    range.setStart(mirror.firstChild!, offsetAtPoint(pressed, x, y))
    return range
  }
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => {
  dispose?.()
  host.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

let pressed: HTMLInputElement | HTMLTextAreaElement | null = null
const center = (element: Element) => {
  const rect = rectOf(element)
  return {
    x: rect.left + Math.min(rect.width / 2, 120),
    y: rect.top + Math.min(rect.height / 2, 11),
  }
}
function pointer(target: Element, type: string, init: PointerEventInit = {}) {
  if (
    type === 'pointerdown' &&
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  )
    pressed = target
  const point = center(target)
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: point.x,
      clientY: point.y,
      pointerType: 'touch',
      ...init,
    }),
  )
}
/** A compatibility mouse event; its default action is WebKit focusing the editor (no preventScroll). */
function mouse(target: Element, type: string, init: MouseEventInit = {}) {
  const point = center(target)
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    detail: 1,
    clientX: point.x,
    clientY: point.y,
    ...init,
  })
  target.dispatchEvent(event)
  // WebKit starts an editing session at a mouse press it handles, unless the editor is already
  // being edited with a keyboard on screen.
  const editor = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  const editing = target === document.activeElement && viewport.height < SCREEN_HEIGHT
  if (type === 'mousedown' && !event.defaultPrevented && editor && !editing) {
    revealSession = 'sticky-pan'
    if (target !== document.activeElement) nativeFocus.call(target)
  }
  return event
}
function tap(target: Element, init: PointerEventInit = {}) {
  pointer(target, 'pointerdown', init)
  pointer(target, 'pointerup', init)
  return [mouse(target, 'mousedown'), mouse(target, 'click')]
}
async function flushKeyboardLayout() {
  // Focus/viewport changes schedule an update, which defers reveal to the following frame
  // so layout owners can commit first. Flush both stages and their microtasks explicitly.
  vi.advanceTimersToNextFrame()
  await vi.advanceTimersByTimeAsync(0)
  vi.advanceTimersToNextFrame()
  await vi.advanceTimersByTimeAsync(0)
}
const field = <T extends HTMLElement = HTMLInputElement>(id: string) =>
  host.querySelector<T>('#' + id)!
/** Visible: below the navigation bar, above the keyboard, and the page has not panned. */
function expectAboveKeyboard(range: { top: number; bottom: number }) {
  expect(viewport.offsetTop).toBe(0)
  expect(window.scrollY).toBe(0)
  expect(range.top).toBeGreaterThanOrEqual(BAR_BOTTOM)
  expect(range.bottom).toBeLessThanOrEqual(KEYBOARD_TOP)
}

function mount(screen: string) {
  host.innerHTML = `
    <div data-satin-navigation-chrome="true"></div>
    <div data-satin-screen-container="true">
      <div data-satin-navigation-motion-layer="true">${screen}<span data-satin-navigation-dim="true"></span></div>
    </div>`
  place(host.querySelector('[data-satin-navigation-chrome]')!, 24, BAR_BOTTOM - 24)
  const layer = host.querySelector<HTMLElement>('[data-satin-navigation-motion-layer]')!
  place(layer, 0, SCREEN_HEIGHT)
  makeScroller(layer, () => SCREEN_HEIGHT)
  dispose = installKeyboardAdapter(host)
  return layer
}

describe('WebKit model: a page with a scroll surface', () => {
  function list() {
    const layer = mount(`
      <div id="list" data-satin-scroll-axis="vertical">
        <label for="search">Search notes</label>
        <input id="search" value="milk">
        <input id="second">
        <input id="bottom" value="Bottom">
      </div>`)
    const surface = field<HTMLElement>('list')
    place(surface, 0, SCREEN_HEIGHT)
    makeScroller(surface, () => 1200)
    place(field('search'), 140, 22, 20, 400)
    place(field('second'), 600, 22, 20, 400)
    place(field('bottom'), 900, 22, 20, 400)
    return { layer, surface }
  }

  it('does not scroll a hidden list even when queued focus and viewport events arrive', async () => {
    const { surface } = list()
    tap(field('bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      const restored = surface.scrollTop
      viewport.dispatchEvent(new Event('scroll'))
      host.dispatchEvent(new Event('focusin'))
      await flushKeyboardLayout()
      await flushKeyboardLayout()
      expect(surface.scrollTop).toBe(restored)
      expect(surface.style.paddingBottom).toBe('')
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await flushKeyboardLayout()
      expectAboveKeyboard(rectOf(field('bottom')))
    } finally {
      visibility.mockRestore()
    }
  })

  it('reveals a bottom field tapped quickly by scrolling its list, without panning the page', async () => {
    const { surface } = list()
    tap(field('bottom'))
    expect(document.activeElement).toBe(field('bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('bottom')))
    expect(surface.scrollTop).toBeGreaterThan(0)
  })

  it('reveals a field focused by the mouse press of a slow tap, which WebKit would otherwise pan to', async () => {
    list()
    pointer(field('bottom'), 'pointerdown')
    now = SLOW_TAP_MS
    pointer(field('bottom'), 'pointerup')
    expect(mouse(field('bottom'), 'mousedown').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(field('bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('bottom')))
  })

  it('keeps the tapped caret', () => {
    list()
    const search = field('search')
    // "milk": the tap lands after the second character.
    const rect = rectOf(search)
    const x = rect.left + PADDING + 2 * CHAR
    pointer(search, 'pointerdown', { clientX: x, clientY: rect.top + 11 })
    pointer(search, 'pointerup', { clientX: x, clientY: rect.top + 11 })
    expect(document.activeElement).toBe(search)
    expect(search.selectionStart).toBe(2)
    expect(search.selectionEnd).toBe(2)
  })

  it('moves editing between two fields with neither revealed by a pan', async () => {
    list()
    tap(field('search'))
    showKeyboard()
    await flushKeyboardLayout()
    tap(field('bottom'))
    await flushKeyboardLayout()
    expect(document.activeElement).toBe(field('bottom'))
    expectAboveKeyboard(rectOf(field('bottom')))
  })

  it('reveals a field the app focuses itself, or the keyboard next key moves to', async () => {
    list()
    tap(field('search'))
    showKeyboard()
    await flushKeyboardLayout()
    field('bottom').focus()
    await flushKeyboardLayout()
    expect(document.activeElement).toBe(field('bottom'))
    expectAboveKeyboard(rectOf(field('bottom')))
  })

  it('owns a tapped label, and leaves one activated without a pointer (VoiceOver, keyboard) native', async () => {
    list()
    const label = host.querySelector('label')!
    expect(mouse(label, 'click').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(field('search'))
    field('search').blur()
    expect(mouse(label, 'click', { detail: 0 }).defaultPrevented).toBe(false)
  })

  it('keeps the keyboard room when an app render rewrites the list padding', async () => {
    const { surface } = list()
    tap(field('bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    const room = parseFloat(surface.style.paddingBottom)
    expect(room).toBeGreaterThan(0)
    surface.style.paddingBottom = '10px'
    await Promise.resolve()
    expect(parseFloat(surface.style.paddingBottom)).toBe(10 + room)
    expectAboveKeyboard(rectOf(field('bottom')))
    field('bottom').blur()
    hideKeyboard()
    await flushKeyboardLayout()
    expect(surface.style.paddingBottom).toBe('10px')
  })

  it('leaves a Tab key traversal its own focus call (its owner reveals what it focuses)', async () => {
    list()
    tap(field('search'))
    showKeyboard()
    await flushKeyboardLayout()
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    const tabFocus = {}
    field('second').focus(tabFocus)
    expect(document.activeElement).toBe(field('second'))
    expect(decidingFocus).toBe(tabFocus)
  })

  it('never takes over focus that crosses into or out of a dialog', async () => {
    list()
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    dialog.innerHTML = '<input id="in-dialog">'
    host.append(dialog)
    place(field('in-dialog'), 300, 22, 20, 400)
    tap(field('search'))
    showKeyboard()
    await flushKeyboardLayout()
    const dialogFocus = { preventScroll: true }
    field('in-dialog').focus(dialogFocus)
    expect(decidingFocus).toBe(dialogFocus)
  })

  it('restores its list padding when editing ends', async () => {
    const { surface } = list()
    tap(field('bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    expect(parseFloat(surface.style.paddingBottom)).toBeGreaterThan(0)
    field('bottom').blur()
    hideKeyboard()
    await flushKeyboardLayout()
    expect(surface.style.paddingBottom).toBe('')
  })
})

describe('WebKit model: a page without a scroll surface (Plain lab)', () => {
  function plain() {
    const layer = mount(`
      <div class="plain">
        <input id="top">
        <input id="plain-bottom" value="Bottom">
      </div>`)
    place(field('top'), 120, 22, 20, 400)
    place(field('plain-bottom'), 735, 22, 20, 400)
    return layer
  }

  it('lifts the screen content until the bottom field is above the keyboard; the bar stays', async () => {
    const layer = plain()
    tap(field('plain-bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('plain-bottom')))
    expect(rectOf(host.querySelector('[data-satin-navigation-chrome]')!).top).toBe(24)
    expect(rectOf(layer).top).toBe(0)
  })

  it('releases a screen lift when keyboard layout brings the focused field into view', async () => {
    const layer = plain()
    const editor = field('plain-bottom')
    tap(editor)
    showKeyboard()
    await flushKeyboardLayout()
    expect(layer.scrollTop).toBeGreaterThan(0)

    // A keyboard subscriber commits its new layout after the adapter's first reveal.
    place(editor, 400, 22, 20, 400)
    viewport.dispatchEvent(new Event('scroll'))
    await flushKeyboardLayout()
    expect(layer.scrollTop).toBe(0)
    expect(rectOf(editor).top).toBe(400)
    expect(layer.querySelector('satin-keyboard-spacer')).toBeNull()
    expectAboveKeyboard(rectOf(editor))
  })

  it('provides enough lift after rotation when content extends beyond the shorter layer', async () => {
    const layer = plain()
    tap(field('plain-bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    place(layer, 0, 440)
    showKeyboard(SCREEN_HEIGHT - 148)
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('plain-bottom')))
    expect(rectOf(layer).top).toBe(0)
  })

  it('keeps a bottom safe-area composer in its frame without lifting the conversation for a reveal gap', async () => {
    const layer = plain()
    const accessory = document.createElement('div')
    accessory.dataset.satinInsetAccessory = 'true'
    field('plain-bottom').replaceWith(accessory)
    const editor = document.createElement('input')
    editor.id = 'composer'
    accessory.append(editor)
    place(accessory, 0, SCREEN_HEIGHT)
    place(editor, KEYBOARD_TOP - 30, 22, 20, 400)
    tap(editor)
    showKeyboard()
    await flushKeyboardLayout()
    expect(layer.scrollTop).toBe(0)
    expect(rectOf(editor).bottom).toBe(KEYBOARD_TOP - 8)
  })

  it('puts the content back when editing ends', async () => {
    const layer = plain()
    const children = layer.children.length
    tap(field('plain-bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    field('plain-bottom').blur()
    hideKeyboard()
    await flushKeyboardLayout()
    expect(layer.scrollTop).toBe(0)
    expect(layer.children.length).toBe(children)
    expect(rectOf(field('plain-bottom')).top).toBe(735)
  })

  it('reveals a field the keyboard next key or the app moves to', async () => {
    plain()
    tap(field('top'))
    showKeyboard()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('top')))
    field('plain-bottom').focus()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('plain-bottom')))
    // And back up: the top field is not left under the bar.
    field('top').focus()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('top')))
  })

  it('preserves an editor focused by button activation before pointerup reaches the root', async () => {
    plain()
    tap(field('top'))
    showKeyboard()
    await flushKeyboardLayout()
    const button = document.createElement('button')
    host.append(button)
    button.addEventListener('pointerup', () => field('plain-bottom').focus({ preventScroll: true }))
    pointer(button, 'pointerdown')
    pointer(button, 'pointerup')
    expect(document.activeElement).toBe(field('plain-bottom'))
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('plain-bottom')))
  })

  it('puts the lift back before a navigation transition starts, and ends editing', async () => {
    const layer = plain()
    const children = layer.children.length
    tap(field('plain-bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    expect(layer.scrollTop).toBeGreaterThan(0)
    // Synchronously, before the store captures scroll state or publishes the transition.
    prepareKeyboardForNavigation()
    expect(layer.scrollTop).toBe(0)
    expect(layer.children.length).toBe(children)
    expect(document.activeElement).not.toBe(field('plain-bottom'))
  })

  it('puts the lift back while the field stays focused and no keyboard shows, and lifts again when it returns', async () => {
    const layer = plain()
    const children = layer.children.length
    tap(field('plain-bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('plain-bottom')))
    // Rotation: the width changes and the keyboard is reported gone; editing does not end.
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    hideKeyboard()
    await vi.advanceTimersByTimeAsync(150)
    await flushKeyboardLayout()
    expect(document.activeElement).toBe(field('plain-bottom'))
    expect(layer.scrollTop).toBe(0)
    expect(layer.children.length).toBe(children)
    showKeyboard()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('plain-bottom')))
  })

  it('restores a backgrounded screen synchronously even when animation frames stop', async () => {
    const layer = plain()
    const children = layer.children.length
    tap(field('plain-bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    expect(layer.scrollTop).toBeGreaterThan(0)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      // No frame is advanced: background cleanup cannot depend on a visible document.
      expect(layer.scrollTop).toBe(0)
      expect(layer.children.length).toBe(children)
      expect(document.activeElement).toBe(field('plain-bottom'))
      await flushKeyboardLayout()
      await flushKeyboardLayout()
      expect(layer.scrollTop).toBe(0)
      expect(layer.children.length).toBe(children)
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await flushKeyboardLayout()
      expectAboveKeyboard(rectOf(field('plain-bottom')))
    } finally {
      visibility.mockRestore()
    }
  })

  it('defers incoming autofocus and viewport updates until a transition settles', async () => {
    const layer = plain()
    // The navigator marker is a descendant of SatinRoot.
    layer.setAttribute('data-satin-transition-active', 'true')
    field('plain-bottom').focus({ preventScroll: true })
    showKeyboard()
    await flushKeyboardLayout()
    expect(layer.scrollTop).toBe(0)
    expect(layer.querySelector('satin-keyboard-spacer')).toBeNull()
    expect(document.activeElement).toBe(field('plain-bottom'))
    layer.setAttribute('data-satin-transition-active', 'false')
    await flushKeyboardLayout()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('plain-bottom')))
  })

  it('freezes keyboard geometry through resize while a navigation transition is held', async () => {
    const layer = plain()
    tap(field('plain-bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    layer.setAttribute('data-satin-transition-active', 'true')
    await flushKeyboardLayout()
    const before = host.style.getPropertyValue('--satin-keyboard-height')
    hideKeyboard()
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await vi.advanceTimersByTimeAsync(150)
    await flushKeyboardLayout()
    expect(document.activeElement).toBe(field('plain-bottom'))
    expect(layer.scrollTop).toBe(0)
    expect(host.style.getPropertyValue('--satin-keyboard-height')).toBe(before)
    layer.setAttribute('data-satin-transition-active', 'false')
    await flushKeyboardLayout()
    await flushKeyboardLayout()
    expect(host.style.getPropertyValue('--satin-keyboard-height')).toBe('0px')
  })

  it('preserves focus when viewport growth precedes the rotation width event', async () => {
    const layer = plain()
    tap(field('plain-bottom'))
    showKeyboard()
    await flushKeyboardLayout()
    hideKeyboard()
    expect(document.activeElement).toBe(field('plain-bottom'))
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    window.dispatchEvent(new Event('resize'))
    await vi.advanceTimersByTimeAsync(150)
    await flushKeyboardLayout()
    expect(document.activeElement).toBe(field('plain-bottom'))
    expect(layer.scrollTop).toBe(0)
    showKeyboard()
    await flushKeyboardLayout()
    expectAboveKeyboard(rectOf(field('plain-bottom')))
  })

  it('leaves a field that is already clear where it is', async () => {
    const layer = plain()
    tap(field('top'))
    showKeyboard()
    await flushKeyboardLayout()
    expect(layer.scrollTop).toBe(0)
    expect(rectOf(field('top')).top).toBe(120)
  })
})

describe('WebKit model: nested scrollers', () => {
  function nested(withPageSurface: boolean) {
    const inner = `<div id="inner" data-satin-scroll-axis="vertical"><input id="deep" value="Deep"></div>`
    mount(
      withPageSurface ? `<div id="outer" data-satin-scroll-axis="vertical">${inner}</div>` : inner,
    )
    if (withPageSurface) {
      place(field('outer'), 0, SCREEN_HEIGHT)
      makeScroller(field('outer'), () => 1400)
    }
    place(field('inner'), 700, 300, 20, 600)
    makeScroller(field('inner'), () => 700)
    place(field('deep'), 960, 22, 30, 400)
  }

  it('scrolls the page surface to bring an inner scroller and its field above the keyboard', async () => {
    nested(true)
    tap(field('deep'))
    showKeyboard()
    await flushKeyboardLayout()
    const deep = rectOf(field('deep'))
    expectAboveKeyboard(deep)
    const inner = rectOf(field('inner'))
    expect(deep.top).toBeGreaterThanOrEqual(inner.top)
    expect(deep.bottom).toBeLessThanOrEqual(inner.bottom)
  })

  it('lifts the screen when an inner scroller sits under the keyboard on a page that does not scroll', async () => {
    nested(false)
    tap(field('deep'))
    showKeyboard()
    await flushKeyboardLayout()
    const deep = rectOf(field('deep'))
    expectAboveKeyboard(deep)
    expect(deep.bottom).toBeLessThanOrEqual(rectOf(field('inner')).bottom)
  })
})

describe('WebKit model: a tall text editor', () => {
  const NOTE = Array.from({ length: 60 }, (_, index) => `Line ${index + 1}`).join('\n')
  function note(height: number) {
    mount(`<div id="list" data-satin-scroll-axis="vertical"><textarea id="note"></textarea></div>`)
    place(field('list'), 0, SCREEN_HEIGHT)
    makeScroller(field('list'), () => 100 + 60 * LINE + 2 * PADDING + 200)
    const textarea = field<HTMLTextAreaElement>('note')
    textarea.value = NOTE
    place(textarea, 100, height, 20, 800)
    makeScroller(textarea, () => 60 * LINE + 2 * PADDING)
    return textarea
  }
  function tapLineAt(textarea: HTMLTextAreaElement, y: number) {
    const x = rectOf(textarea).left + 40
    pointer(textarea, 'pointerdown', { clientX: x, clientY: y })
    pointer(textarea, 'pointerup', { clientX: x, clientY: y })
  }

  it('does not scroll a tall note card when its tapped top caret line is already in the room', async () => {
    const textarea = note(200)
    // The card extends below the keyboard but its first caret line is already visible.
    place(textarea, 400, 200, 20, 800)
    tapLineAt(textarea, 412)
    showKeyboard()
    await flushKeyboardLayout()
    await flushKeyboardLayout()
    expectAboveKeyboard(caretLine(textarea))
    expect(field('list').scrollTop).toBe(0)
    expect(textarea.scrollTop).toBe(0)
    expect(rectOf(textarea).top).toBe(400)
  })

  it('ends with the tapped caret line above the keyboard, not just the top of the editor', async () => {
    const textarea = note(60 * LINE + 2 * PADDING)
    tapLineAt(textarea, 900)
    const tapped = lineStarts(NOTE)[36]
    expect(textarea.selectionStart).toBe(tapped)
    showKeyboard()
    await flushKeyboardLayout()
    expect(textarea.selectionStart).toBe(tapped)
    expectAboveKeyboard(caretLine(textarea))
  })

  it('scrolls its own text to the caret when it shrinks to the room above the keyboard (TextEditor)', async () => {
    const textarea = note(60 * LINE + 2 * PADDING)
    // TextEditor caps its height to the visible room in the React commit after the keyboard.
    viewport.addEventListener('resize', () => {
      if (viewport.height < SCREEN_HEIGHT) place(textarea, 100, KEYBOARD_TOP - 24, 20, 800)
    })
    tapLineAt(textarea, 900)
    showKeyboard()
    await flushKeyboardLayout()
    await flushKeyboardLayout()
    // This model checks framework caret placement only. Native recentering after a clipped
    // editor is a device acceptance concern, not a synthetic assignment to list.scrollTop.
    const line = caretLine(textarea)
    expectAboveKeyboard(line)
    const box = rectOf(textarea)
    expect(line.top).toBeGreaterThanOrEqual(box.top)
    expect(line.bottom).toBeLessThanOrEqual(box.bottom)
  })

  it('does not realign a fitting textarea card while its first caret line is visible', async () => {
    const textarea = note(KEYBOARD_TOP - 100 - 5)
    textarea.value = 'one two three'
    tapLineAt(textarea, 110)
    showKeyboard()
    await flushKeyboardLayout()
    const list = field('list')
    const settled = list.scrollTop
    now += 1000
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await flushKeyboardLayout()
    expect(list.scrollTop).toBe(settled)
  })

  it('does not move the editor while typing (WebKit keeps the caret in view)', async () => {
    const textarea = note(60 * LINE + 2 * PADDING)
    tapLineAt(textarea, 900)
    showKeyboard()
    await flushKeyboardLayout()
    const list = field('list')
    const settled = list.scrollTop
    now += 1000
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await flushKeyboardLayout()
    expect(list.scrollTop).toBe(settled)
  })
})

describe('WebKit model: editing gestures stay native once a press started editing', () => {
  function words() {
    mount(
      `<div id="list" data-satin-scroll-axis="vertical"><input id="words" value="hello world again"></div>`,
    )
    place(field('list'), 0, SCREEN_HEIGHT)
    makeScroller(field('list'), () => SCREEN_HEIGHT)
    place(field('words'), 200, 22, 20, 400)
    return field('words')
  }
  /** WebKit selected "world" (a double tap, or a selection handle drag). */
  function selectWorld(input: HTMLInputElement) {
    input.setSelectionRange(6, 11)
  }

  it('with a hardware keyboard (the viewport never shrinks): double tap and selection drags', () => {
    const input = words()
    tap(input)
    expect(document.activeElement).toBe(input)
    now += 2000
    // A double tap: neither tap's mouse press or click is cancelled, and the selection is WebKit's.
    selectWorld(input)
    for (const detail of [1, 2]) {
      pointer(input, 'pointerdown')
      pointer(input, 'pointerup')
      expect(mouse(input, 'mousedown', { detail }).defaultPrevented).toBe(false)
      expect(mouse(input, 'click', { detail }).defaultPrevented).toBe(false)
      now += 120
    }
    expect([input.selectionStart, input.selectionEnd]).toEqual([6, 11])
    // A short drag of a selection handle.
    pointer(input, 'pointerdown')
    pointer(input, 'pointerup', { clientX: center(input).x + 4 })
    expect([input.selectionStart, input.selectionEnd]).toEqual([6, 11])
  })

  it('in the ~100 ms before WebKit reports a software keyboard', () => {
    const input = words()
    tap(input)
    now += 60
    selectWorld(input)
    pointer(input, 'pointerdown')
    pointer(input, 'pointerup')
    expect(mouse(input, 'mousedown', { detail: 2 }).defaultPrevented).toBe(false)
    expect([input.selectionStart, input.selectionEnd]).toEqual([6, 11])
  })

  it("with a hardware keyboard, a field the app focused: its first double tap is WebKit's", () => {
    const input = words()
    input.focus()
    now += 2000
    selectWorld(input)
    for (const detail of [1, 2]) {
      pointer(input, 'pointerdown')
      pointer(input, 'pointerup')
      expect(mouse(input, 'mousedown', { detail }).defaultPrevented).toBe(false)
      expect(mouse(input, 'click', { detail }).defaultPrevented).toBe(false)
      now += 120
    }
    expect([input.selectionStart, input.selectionEnd]).toEqual([6, 11])
  })

  it('still brings back the keyboard of a field the app focused without a press', async () => {
    const input = words()
    input.focus()
    now += 2000
    tap(input)
    showKeyboard()
    await flushKeyboardLayout()
    expect(viewport.offsetTop).toBe(0)
  })

  it('a mouse or trackpad press stays native through pointer-up', () => {
    const input = words()
    input.setSelectionRange(0, 0)
    pointer(input, 'pointerdown', { pointerType: 'mouse' })
    pointer(input, 'pointerup', { pointerType: 'mouse' })
    // Nothing focused it at pointer-up: its mouse press is WebKit's (focus, then a drag selects).
    expect(document.activeElement).not.toBe(input)
    expect(mouse(input, 'mousedown').defaultPrevented).toBe(false)
  })

  it('leaves read-only fields native', () => {
    mount(`<input id="readonly" readonly value="Fixed">`)
    place(field('readonly'), 200, 22, 20, 400)
    pointer(field('readonly'), 'pointerdown')
    now += SLOW_TAP_MS
    pointer(field('readonly'), 'pointerup')
    expect(mouse(field('readonly'), 'mousedown').defaultPrevented).toBe(false)
  })
})

it('keeps editing when a bottom accessory action sends a message', () => {
  mount(
    '<div data-satin-inset-accessory="true"><input id="message"><button id="send">Send</button></div>',
  )
  place(field('message'), 900, 44)
  tap(field('message'))
  pointer(field('send'), 'pointerdown')
  pointer(field('send'), 'pointerup')
  expect(document.activeElement).toBe(field('message'))
})

describe('the bottom inset chain follows the system keyboard', () => {
  // Installed iPad (native measurements): WebKit reports the keyboard once, as it starts to move. The
  // chain's inset transition starts as far into the keyboard's curve as the keyboard already is.
  it('starts a shown keyboard partway into its curve', () => {
    mount('<div data-satin-inset-accessory="true"><textarea id="message"></textarea></div>')
    place(field('message'), 980, 36)
    tap(field('message'))
    now = 1000
    showKeyboard()
    expect(host.style.getPropertyValue('--satin-keyboard-height')).toBe(`${KEYBOARD_HEIGHT}px`)
    expect(host.style.getPropertyValue('--satin-keyboard-phase')).toBe('-36ms')
    expect(host.dataset.satinKeyboardMoving).toBe('true')
  })
  it('follows a keyboard that leaves after editing ended at once', () => {
    mount('<div data-satin-inset-accessory="true"><textarea id="message"></textarea></div>')
    place(field('message'), 980, 36)
    tap(field('message'))
    showKeyboard()
    field('message').blur()
    now = 2000
    hideKeyboard()
    // No settling wait: the composer leaves with the keyboard, not 120 ms after it.
    expect(host.style.getPropertyValue('--satin-keyboard-height')).toBe('0px')
    expect(host.style.getPropertyValue('--satin-keyboard-phase')).toBe('-23ms')
  })
})
