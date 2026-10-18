import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  currentKeyboardHeight,
  installKeyboardAdapter,
  onKeyboardMotion,
  readKeyboardLayoutHeight,
  subscribeKeyboardMetrics,
} from './adapter.ts'
class Node extends EventTarget {
  get ownerDocument() {
    return document
  }
  querySelector = () => null
  focus = vi.fn()
  setAttribute = vi.fn()
  hasAttribute = () => false
  dataset: Record<string, string> = {}
  style = { paddingBottom: '', setProperty: vi.fn(), removeProperty: vi.fn() }
  scrollTop = 0
  isConnected = true
  type = 'text'
  disabled = false
  readOnly = false
  blur = vi.fn()
  surface: Node | null = null
  dialog: Node | null = null
  top = 700
  bottom = 744
  contains = (_node?: Node) => true
  closest = (selector: string) =>
    selector.startsWith('dialog')
      ? this.dialog
      : selector.includes('data-satin-scroll-axis') || selector.includes('text-input')
        ? this.surface
        : null
  removeAttribute = vi.fn()
  getBoundingClientRect = () => ({
    top: this.top - (this.surface?.scrollTop ?? 0),
    bottom: this.bottom - (this.surface?.scrollTop ?? 0),
  })
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('owns only the nearest surface, restores padding and unsubscribes on disposal', () => {
  const root = new Node(),
    surface = new Node(),
    field = new Node()
  surface.top = 80
  surface.bottom = 894
  surface.style.paddingBottom = '20px'
  field.surface = surface
  const viewport = Object.assign(new EventTarget(), { height: 894, offsetTop: 0, scale: 1 })
  const win = Object.assign(new EventTarget(), {
    visualViewport: viewport,
    innerWidth: 440,
    innerHeight: 894,
    scrollX: 0,
    scrollY: 0,
    scrollTo: vi.fn(),
  })
  const doc = Object.assign(new EventTarget(), { activeElement: null as Node | null })
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  const flush = () => {
    for (const [key, callback] of frames) {
      frames.delete(key)
      callback(0)
    }
  }
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  vi.stubGlobal('getComputedStyle', () => ({ paddingBottom: '20px' }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  doc.activeElement = field
  root.dispatchEvent(new Event('focusin'))
  viewport.height = 550
  viewport.dispatchEvent(new Event('resize'))
  flush()
  expect(surface.style.paddingBottom).toBe('364px')
  expect(surface.scrollTop).toBe(206)
  expect(win.scrollTo).not.toHaveBeenCalled()
  // The shell compensates a visual pan by moving in layout coordinates.
  // Occlusion and reveal distance must not count that offset a second time.
  viewport.offsetTop = 80
  surface.top += 80
  surface.bottom += 80
  field.top += 80
  field.bottom += 80
  surface.scrollTop = 0
  viewport.dispatchEvent(new Event('scroll'))
  flush()
  expect(surface.style.paddingBottom).toBe('364px')
  expect(surface.scrollTop).toBe(206)
  expect(readKeyboardLayoutHeight(440, 858)).toBe(894)
  expect(readKeyboardLayoutHeight(956, 440)).toBe(440)
  viewport.height = 894
  doc.activeElement = null
  root.dispatchEvent(new Event('focusout'))
  flush()
  expect(surface.style.paddingBottom).toBe('20px')
  expect(root.dataset.satinKeyboard).toBe('hidden')
  dispose()
  viewport.dispatchEvent(new Event('resize'))
  expect(frames.size).toBe(0)
})

it('accepts launch growth while focused before measuring keyboard occlusion', () => {
  const root = new Node(),
    field = new Node()
  const viewport = Object.assign(new EventTarget(), { height: 894, offsetTop: 0, scale: 1 })
  const win = Object.assign(new EventTarget(), {
    visualViewport: viewport,
    innerWidth: 440,
    innerHeight: 894,
    scrollX: 0,
    scrollY: 0,
  })
  const doc = Object.assign(new EventTarget(), { activeElement: field })
  let frame: FrameRequestCallback | undefined
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    frame = undefined
  })
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  root.dispatchEvent(new Event('focusin'))
  frame?.(0)
  win.innerHeight = 956
  viewport.height = 956
  viewport.dispatchEvent(new Event('resize'))
  vi.advanceTimersByTime(150)
  frame?.(0)
  viewport.height = 600
  win.innerHeight = 600
  viewport.dispatchEvent(new Event('resize'))
  vi.advanceTimersByTime(150)
  frame?.(0)
  expect(readKeyboardLayoutHeight(440, 600)).toBe(956)
  expect(root.style.setProperty).toHaveBeenCalledWith('--satin-keyboard-height', '356px')
  // Growth is ambiguous with rotation and must preserve editing.
  field.blur = vi.fn()
  viewport.height = 620
  viewport.dispatchEvent(new Event('resize'))
  expect(field.blur).not.toHaveBeenCalled()
  dispose()
})

it('dismisses on a real pan, preserves editing drags, and removes touch listeners', async () => {
  const { installScrollKeyboardDismissal } = await import('./adapter.ts')
  const surface = new Node(),
    field = Object.assign(new Node(), { blur: vi.fn() })
  vi.stubGlobal('Element', Node)
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  vi.stubGlobal('document', { activeElement: field })
  const dispose = installScrollKeyboardDismissal(surface as unknown as HTMLElement, 'immediately')
  const touch = (type: string, y: number) =>
    surface.dispatchEvent(Object.assign(new Event(type), { touches: [{ clientX: 0, clientY: y }] }))
  touch('touchstart', 100)
  touch('touchmove', 105)
  expect(field.blur).not.toHaveBeenCalled()
  touch('touchmove', 120)
  expect(field.blur).toHaveBeenCalledOnce()
  surface.surface = field // closest(text-input) resolves to an editor on this next contact
  touch('touchstart', 100)
  touch('touchmove', 140)
  expect(field.blur).toHaveBeenCalledOnce()
  dispose()
  surface.surface = null
  touch('touchstart', 100)
  touch('touchmove', 140)
  expect(field.blur).toHaveBeenCalledOnce()
})

it('dismisses interactively only when the drag reaches the keyboard, for a composer beside the list', async () => {
  const { installScrollKeyboardDismissal } = await import('./adapter.ts')
  const surface = new Node(),
    inset = new Node(),
    field = Object.assign(new Node(), { blur: vi.fn() })
  // The composer is in the bottom inset's accessory, not in the scroll content.
  surface.contains = node => node !== field
  field.closest = selector => (selector.includes('safe-area-inset') ? inset : null)
  vi.stubGlobal('Element', Node)
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  vi.stubGlobal('document', { activeElement: field })
  vi.stubGlobal('window', { visualViewport: { height: 500, offsetTop: 0 }, innerHeight: 900 })
  const dispose = installScrollKeyboardDismissal(surface as unknown as HTMLElement, 'interactively')
  const touch = (type: string, y: number) =>
    surface.dispatchEvent(Object.assign(new Event(type), { touches: [{ clientX: 0, clientY: y }] }))
  touch('touchstart', 200)
  touch('touchmove', 480)
  expect(field.blur).not.toHaveBeenCalled()
  touch('touchmove', 520)
  expect(field.blur).toHaveBeenCalledOnce()
  dispose()
})
it('uses the observed paint viewport even when a CSS ruler is larger', () => {
  const root = new Node(),
    field = new Node()
  const viewport = Object.assign(new EventTarget(), { height: 894, offsetTop: 0, scale: 1 })
  const win = Object.assign(new EventTarget(), {
    visualViewport: viewport,
    innerWidth: 440,
    innerHeight: 894,
    scrollX: 0,
    scrollY: 0,
  })
  const doc = Object.assign(new EventTarget(), {
    activeElement: field,
    querySelector: () => ({ getBoundingClientRect: () => ({ height: 956 }) }),
  })
  let resized: (() => void) | undefined
  const disconnect = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback
      }
      observe() {}
      disconnect = disconnect
    },
  )
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  viewport.height = 550
  viewport.dispatchEvent(new Event('resize'))
  resized?.()
  expect(root.style.setProperty).toHaveBeenCalledWith('--satin-keyboard-height', '344px')
  expect(root.style.setProperty).toHaveBeenCalledWith('--satin-keyboard-viewport-height', '550px')
  expect(readKeyboardLayoutHeight(440, 956)).toBe(894)
  dispose()
  expect(disconnect).toHaveBeenCalledOnce()
})

it('restores a late document focus scroll without changing the editor surface or selection', () => {
  const root = new Node(),
    surface = new Node(),
    field = new Node()
  field.surface = surface
  surface.top = 0
  surface.bottom = 550
  field.top = 100
  field.bottom = 144
  surface.scrollTop = 17
  const viewport = Object.assign(new EventTarget(), { height: 550, offsetTop: 0, scale: 1 })
  const win = Object.assign(new EventTarget(), {
    visualViewport: viewport,
    innerWidth: 440,
    innerHeight: 894,
    scrollX: 0,
    scrollY: 0,
    scrollTo: vi.fn(() => {
      win.scrollY = 0
      viewport.offsetTop = 0
    }),
  })
  const doc = Object.assign(new EventTarget(), { activeElement: field as Node | null })
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  vi.stubGlobal('getComputedStyle', () => ({ paddingBottom: '0px' }))
  let frame: FrameRequestCallback | undefined
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    frame = undefined
  })
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  // WebKit can scroll the document after its last visualViewport event.
  win.scrollY = 90
  viewport.offsetTop = 90
  root.style.setProperty.mockClear()
  win.dispatchEvent(new Event('scroll'))
  // The next paint must use the normalized pan, without waiting for another event.
  expect(root.style.setProperty).toHaveBeenCalledWith('--satin-keyboard-offset-top', '0px')
  expect(root.style.setProperty).not.toHaveBeenCalledWith('--satin-keyboard-offset-top', '90px')
  frame?.(0)
  expect(win.scrollTo).toHaveBeenCalledWith(0, 0)
  expect(surface.scrollTop).toBe(17)
  dispose()
  win.scrollTo.mockClear()
  win.dispatchEvent(new Event('scroll'))
  frame?.(0)
  expect(win.scrollTo).not.toHaveBeenCalled()
})

it('does not reveal an alert field by scrolling or padding the presenting page', () => {
  const root = new Node(),
    page = new Node(),
    field = new Node(),
    dialog = new Node()
  page.top = 0
  page.bottom = 894
  page.style.paddingBottom = '12px'
  page.scrollTop = 23
  field.surface = page
  field.dialog = dialog
  dialog.contains = (node?: Node) => node === field
  const viewport = Object.assign(new EventTarget(), { height: 550, offsetTop: 0, scale: 1 })
  const win = Object.assign(new EventTarget(), {
    visualViewport: viewport,
    innerWidth: 440,
    innerHeight: 894,
    scrollX: 0,
    scrollY: 0,
  })
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', Object.assign(new EventTarget(), { activeElement: field }))
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  vi.stubGlobal('getComputedStyle', () => ({ paddingBottom: '12px' }))
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  expect(page.scrollTop).toBe(23)
  expect(page.style.paddingBottom).toBe('12px')
  dispose()
})

it('waits for sheet frame ownership before deciding whether its field needs revealing', () => {
  const root = new Node(),
    surface = new Node(),
    field = new Node(),
    dialog = new Node()
  field.surface = surface
  field.dialog = dialog
  surface.top = 0
  surface.bottom = 894
  surface.scrollTop = 23
  dialog.contains = (node?: Node) => node === field || node === surface
  let moving = true,
    mutation: (() => void) | undefined
  Object.assign(dialog, { hasAttribute: () => moving })
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback: () => void) {
        mutation = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const flush = () => {
    for (const callback of frames.splice(0)) callback(0)
  }
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      visualViewport: Object.assign(new EventTarget(), { height: 550, offsetTop: 0, scale: 1 }),
      innerWidth: 440,
      innerHeight: 894,
      scrollX: 0,
      scrollY: 0,
    }),
  )
  vi.stubGlobal('document', Object.assign(new EventTarget(), { activeElement: field }))
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  vi.stubGlobal('getComputedStyle', () => ({ paddingBottom: '0px' }))
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  flush()
  expect(surface.scrollTop).toBe(23)
  // Expansion itself reveals this field. It must not inherit a premature scroll.
  field.top = 100
  field.bottom = 144
  moving = false
  mutation?.()
  flush()
  flush()
  expect(surface.scrollTop).toBe(23)
  // A genuinely occluded field still gets revealed after layout is settled.
  field.top = 700
  field.bottom = 744
  root.dispatchEvent(new Event('input'))
  flush()
  flush()
  expect(surface.scrollTop).toBe(206)
  dispose()
})

it('starts the keyboard carrier in the frame before keyboard readers re-render', () => {
  const root = new Node(),
    field = new Node()
  const viewport = Object.assign(new EventTarget(), { height: 894, offsetTop: 0, scale: 1 })
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      visualViewport: viewport,
      innerWidth: 440,
      innerHeight: 894,
      scrollX: 0,
      scrollY: 0,
    }),
  )
  vi.stubGlobal('document', Object.assign(new EventTarget(), { activeElement: field }))
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  let frames: FrameRequestCallback[] = []
  const drawFrame = () => {
    const callbacks = frames
    frames = []
    for (const callback of callbacks) callback(0)
  }
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  drawFrame()
  const seen: string[] = []
  const stopCarrier = onKeyboardMotion(({ height }) => seen.push(`carrier ${height}`))
  const stopReaders = subscribeKeyboardMetrics(() =>
    seen.push(`readers ${currentKeyboardHeight()}`),
  )

  // WebKit reports the keyboard: the carrier starts in this task, and the geometry is current.
  viewport.height = 550
  viewport.dispatchEvent(new Event('resize'))
  expect(seen.filter(entry => entry.endsWith('344'))).toEqual(['carrier 344'])
  expect(currentKeyboardHeight()).toBe(344)
  // The page draws the carrier's first frame without the readers' re-render in it.
  drawFrame()
  expect(seen.filter(entry => entry.endsWith('344'))).toEqual(['carrier 344'])
  // Readers render in the next task.
  vi.advanceTimersByTime(0)
  expect(seen.filter(entry => entry.endsWith('344'))).toEqual(['carrier 344', 'readers 344'])
  stopCarrier()
  stopReaders()
  dispose()
})

it("keeps the root's keyboard layout out of a carried motion's first frame", () => {
  const root = new Node(),
    field = new Node()
  const viewport = Object.assign(new EventTarget(), {
    height: 894,
    width: 440,
    offsetTop: 0,
    scale: 1,
  })
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      visualViewport: viewport,
      innerWidth: 440,
      innerHeight: 894,
      scrollX: 0,
      scrollY: 0,
    }),
  )
  vi.stubGlobal('document', Object.assign(new EventTarget(), { activeElement: field }))
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  let frames: FrameRequestCallback[] = []
  const drawFrame = () => {
    const callbacks = frames
    frames = []
    for (const callback of callbacks) callback(0)
  }
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  drawFrame()
  const publishedHeight = () =>
    root.style.setProperty.mock.calls.filter(([name]) => name === '--satin-keyboard-height').at(-1)
  const rootAtCarrier: (string | undefined)[] = []
  const stopCarrier = onKeyboardMotion(() => rootAtCarrier.push(root.dataset.satinKeyboard))
  const before = root.dataset.satinKeyboard

  viewport.height = 550
  viewport.dispatchEvent(new Event('resize'))
  // The carrier measures, and its frame is drawn, with the root as it was.
  expect(rootAtCarrier).toEqual([before])
  expect(root.dataset.satinKeyboard).toBe(before)
  expect(publishedHeight()?.[1]).not.toBe('344px')
  expect(root.dataset.satinKeyboardMoving).toBe('true')
  drawFrame()
  expect(root.dataset.satinKeyboard).toBe(before)
  // After that frame the root publishes the keyboard.
  vi.advanceTimersByTime(0)
  expect(root.dataset.satinKeyboard).toBe('visible')
  expect(publishedHeight()?.[1]).toBe('344px')
  stopCarrier()

  // Without a carrier nothing moves on the compositor, so the root publishes in the report's task
  // (the keyboard's dismiss key: the field stays focused).
  viewport.height = 894
  viewport.dispatchEvent(new Event('resize'))
  expect(root.dataset.satinKeyboard).toBe('hidden')
  expect(publishedHeight()?.[1]).toBe('0px')
  dispose()
})

it('carries a keyboard dismissed while its field stays focused without waiting for a rotation to settle', () => {
  const root = new Node(),
    field = new Node()
  const viewport = Object.assign(new EventTarget(), {
    width: 440,
    height: 894,
    offsetTop: 0,
    scale: 1,
  })
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      visualViewport: viewport,
      innerWidth: 440,
      innerHeight: 894,
      scrollX: 0,
      scrollY: 0,
    }),
  )
  vi.stubGlobal('document', Object.assign(new EventTarget(), { activeElement: field }))
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  const carried: number[] = []
  const stop = onKeyboardMotion(({ height }) => carried.push(height))
  viewport.height = 550
  viewport.dispatchEvent(new Event('resize'))
  expect(carried).toEqual([344])
  // The keyboard's own dismiss key: the field keeps focus and the viewport returns to the exact
  // layout height at the same width. That is the keyboard leaving, not a rotation.
  // WebKit may first report intermediate growth, which starts the rotation-settle timer.
  viewport.height = 700
  viewport.dispatchEvent(new Event('resize'))
  expect(carried).toEqual([344])
  viewport.height = 894
  viewport.dispatchEvent(new Event('resize'))
  expect(carried).toEqual([344, 0])
  vi.advanceTimersByTime(150)
  expect(carried).toEqual([344, 0])
  // A rotation's growth (a different height) still waits for the geometry to settle.
  viewport.height = 550
  viewport.dispatchEvent(new Event('resize'))
  viewport.height = 1194
  viewport.dispatchEvent(new Event('resize'))
  expect(carried).toEqual([344, 0, 344])
  stop()
  dispose()
})

it("times a keyboard's motion from the visual viewport's report, not the window resize ahead of it", () => {
  const root = new Node(),
    field = new Node()
  const viewport = Object.assign(new EventTarget(), {
    width: 440,
    height: 894,
    offsetTop: 0,
    scale: 1,
  })
  const page = Object.assign(new EventTarget(), {
    visualViewport: viewport,
    innerWidth: 440,
    innerHeight: 894,
    scrollX: 0,
    scrollY: 0,
  })
  vi.stubGlobal('window', page)
  vi.stubGlobal('document', Object.assign(new EventTarget(), { activeElement: field }))
  vi.stubGlobal('HTMLInputElement', Node)
  vi.stubGlobal('HTMLTextAreaElement', class extends Node {})
  let frames: FrameRequestCallback[] = []
  const drawFrame = () => {
    const callbacks = frames
    frames = []
    for (const callback of callbacks) callback(0)
  }
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
  const stamped = (at: number) => {
    const event = new Event('resize')
    Object.defineProperty(event, 'timeStamp', { value: at })
    return event
  }
  const dispose = installKeyboardAdapter(root as unknown as HTMLElement)
  drawFrame()
  const leads: number[] = []
  const stop = onKeyboardMotion(({ startTime }) =>
    leads.push(Math.round(performance.now() - startTime)),
  )

  // iPad: WebKit stamps the visual viewport's report when the keyboard starts to move, but a busy
  // page dispatches it ~200 ms later, after a window resize stamped at the dispatch. The motion
  // starts from the first report and moves onto the keyboard's clock when the earlier stamp arrives.
  now.mockReturnValue(1300)
  viewport.height = 550
  page.dispatchEvent(stamped(1295))
  viewport.dispatchEvent(stamped(1100))
  drawFrame()
  expect(leads).toEqual([78 + 5, 78 + 200])
  // A report that is not earlier changes nothing.
  viewport.dispatchEvent(stamped(1290))
  expect(leads).toEqual([78 + 5, 78 + 200])
  stop()
  dispose()
  now.mockRestore()
})
