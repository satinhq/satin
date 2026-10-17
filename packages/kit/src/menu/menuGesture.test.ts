import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bindMenuGestures,
  MENU_GESTURE_REST,
  menuPull,
  menuTriggerPress,
  type MenuGestureFrame,
} from './menuGesture.ts'

class Element extends EventTarget {
  // Model document capture before target listeners in the minimal test DOM.
  override dispatchEvent(event: Event): boolean {
    if (event.type === 'click' || event.type === 'pointerdown') {
      document.dispatchEvent(event)
      if (event.defaultPrevented) return false
    }
    return super.dispatchEvent(event)
  }
  dataset: Record<string, string> = {}
  disabled = false
  capture = -1
  setPointerCapture(id: number) {
    this.capture = id
  }
  hasPointerCapture(id: number) {
    return this.capture === id
  }
  releasePointerCapture() {
    this.capture = -1
  }
  contains(element: unknown) {
    return element === this
  }
  getBoundingClientRect() {
    return { top: 100, left: 100, width: 250, height: 168 }
  }
}

function setup(stableTrigger = false) {
  let now = 0,
    id = 0,
    open = false
  const queued = new Map<number, FrameRequestCallback>()
  const document = Object.assign(new EventTarget(), { hidden: false, elementFromPoint: vi.fn() })
  const window = new EventTarget()
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', window)
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    queued.set(++id, fn)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => queued.delete(key))
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const trigger = new Element(),
    panel = new Element(),
    items = [new Element(), new Element()]
  const motion = vi.fn()
  const select = vi.fn(),
    onOpen = vi.fn(() => {
      open = true
    })
  let frame: MenuGestureFrame = MENU_GESTURE_REST
  const controller = bindMenuGestures({
    trigger: trigger as unknown as HTMLButtonElement,
    panel: panel as unknown as HTMLElement,
    items: items as unknown as HTMLButtonElement[],
    triggerBounds: stableTrigger
      ? () => ({ left: 100, top: 100, width: 58, height: 58 })
      : undefined,
    isOpen: () => open,
    open: onOpen,
    select,
    motion,
    reducedMotion: () => false,
    frame: f => {
      frame = f
    },
  })
  function send(target: EventTarget, type: string, x = 125, y = 120, pointerId = 1) {
    const event = new Event(type, { cancelable: true })
    Object.assign(event, {
      clientX: x,
      clientY: y,
      pointerId,
      isPrimary: pointerId === 1,
      button: 0,
    })
    target.dispatchEvent(event)
  }
  function tick(time: number) {
    now = time
    const work = [...queued.values()]
    queued.clear()
    work.forEach(fn => fn(now))
  }
  return {
    controller,
    trigger,
    panel,
    items,
    document,
    window,
    send,
    tick,
    select,
    onOpen,
    motion,
    setOpen: () => {
      open = true
    },
    frame: () => frame,
    queued,
  }
}
it('keeps a quick menu tap unhighlighted but highlights a sustained contact', () => {
  const s = setup()
  s.setOpen()
  s.document.elementFromPoint.mockReturnValue(s.items[0])
  s.send(s.panel, 'pointerdown')
  s.tick(70)
  expect(s.frame().highlightOpacity).toBe(0)
  s.send(s.document, 'pointerup')
  expect(s.frame().highlightOpacity).toBe(0)
  expect(s.select).toHaveBeenCalledExactlyOnceWith(0)
  s.send(s.panel, 'pointerdown')
  s.tick(400)
  expect(s.frame().highlightOpacity).toBeGreaterThan(0)
  s.send(s.document, 'pointercancel')
  s.tick(1600)
  expect(s.frame().highlightOpacity).toBe(0)
  s.controller.dispose()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Menu pointer ownership', () => {
  it('opens an ordinary trigger tap once and resets press geometry before opening', () => {
    const s = setup()
    s.send(s.trigger, 'pointerdown')
    s.tick(40)
    s.send(s.document, 'pointerup')
    expect(s.onOpen).toHaveBeenCalledTimes(1)
    expect(s.frame()).toBe(MENU_GESTURE_REST)
    s.controller.dispose()
  })
  it('cancels opening for a drag before recognition, even after a long hold', () => {
    const s = setup()
    s.send(s.trigger, 'pointerdown')
    s.send(s.document, 'pointermove', 180, 180)
    s.tick(500)
    s.send(s.document, 'pointerup', 180, 180)
    expect(s.onOpen).not.toHaveBeenCalled()
    expect(s.select).not.toHaveBeenCalled()
    s.tick(1400)
    expect(s.frame()).toBe(MENU_GESTURE_REST)
    s.controller.dispose()
  })
  it('retains trigger capture through opening and selects the release target once', () => {
    const s = setup()
    s.send(s.trigger, 'pointerdown')
    s.tick(350)
    expect(s.trigger.capture).toBe(1)
    s.document.elementFromPoint.mockReturnValue(s.items[1])
    s.send(s.document, 'pointermove', 200, 200)
    s.tick(800)
    s.send(s.document, 'pointerup', 200, 200)
    s.send(s.document, 'pointerup', 200, 200)
    expect(s.select).toHaveBeenCalledExactlyOnceWith(1)
    expect(s.trigger.capture).toBe(-1)
    s.controller.dispose()
  })
  it('outside release and pointer cancellation never activate an item', () => {
    const s = setup()
    s.setOpen()
    s.document.elementFromPoint.mockReturnValue(s.items[0])
    s.send(s.panel, 'pointerdown')
    s.tick(500)
    s.document.elementFromPoint.mockReturnValue(null)
    s.send(s.document, 'pointerup', 0, 500)
    expect(s.select).not.toHaveBeenCalled()
    expect(s.onOpen).not.toHaveBeenCalled()
    s.send(s.panel, 'pointerdown')
    s.document.elementFromPoint.mockReturnValue(s.items[1])
    s.send(s.document, 'pointercancel')
    expect(s.select).not.toHaveBeenCalled()
    s.controller.dispose()
  })
  it('leaves the newly opened menu up when the held trigger is released without dragging', () => {
    const s = setup()
    s.document.elementFromPoint.mockReturnValue(s.items[0])
    s.send(s.trigger, 'pointerdown')
    s.tick(350)
    s.tick(600)
    s.send(s.document, 'pointerup')
    expect(s.onOpen).toHaveBeenCalledTimes(1)
    expect(s.select).not.toHaveBeenCalled()
    s.controller.dispose()
  })
  it('treats a new contact on the expanding trigger overlap as a row tap', () => {
    const s = setup()
    s.setOpen()
    s.document.elementFromPoint.mockReturnValue(s.trigger)
    s.send(s.trigger, 'pointerdown')
    s.tick(80)
    s.send(s.document, 'pointerup')
    expect(s.select).toHaveBeenCalledExactlyOnceWith(0)
    expect(s.onOpen).not.toHaveBeenCalled()
    s.controller.dispose()
  })
  it('retains the primary row contact when a second finger arrives', () => {
    const s = setup()
    s.setOpen()
    s.document.elementFromPoint.mockReturnValue(s.items[1])
    s.send(s.panel, 'pointerdown')
    s.send(s.panel, 'pointerdown', 130, 120, 2)
    s.send(s.document, 'pointerup', 130, 120, 2)
    expect(s.select).not.toHaveBeenCalled()
    s.send(s.document, 'pointerup')
    expect(s.select).toHaveBeenCalledExactlyOnceWith(1)
    const compatibility = Object.assign(new Event('click', { cancelable: true }), {
      detail: 1,
      pointerId: 1,
      pointerType: 'mouse',
    })
    s.trigger.dispatchEvent(compatibility)
    expect(compatibility.defaultPrevented).toBe(true)
    s.controller.dispose()
  })
  it('opens from a fading row using the resting aperture, not the transformed trigger', () => {
    const s = setup(true)
    s.trigger.getBoundingClientRect = () => ({ left: 200, top: 200, width: 10, height: 10 })
    s.document.elementFromPoint.mockReturnValue(s.items[0])
    s.send(s.panel, 'pointerdown')
    s.tick(80)
    s.send(s.document, 'pointerup')
    expect(s.onOpen).toHaveBeenCalledOnce()
    expect(s.select).not.toHaveBeenCalled()
    s.controller.dispose()
  })
  it('rejects secondary pointers and clears captured work on disposal', () => {
    const s = setup()
    s.send(s.trigger, 'pointerdown', 125, 120, 2)
    s.tick(500)
    expect(s.onOpen).not.toHaveBeenCalled()
    s.send(s.trigger, 'pointerdown')
    s.controller.dispose()
    s.tick(1000)
    expect(s.onOpen).not.toHaveBeenCalled()
    expect(s.queued.size).toBe(0)
  })
  it('keeps assistive clicks while consuming the synthetic pointer click', () => {
    const s = setup()
    s.send(s.trigger, 'pointerdown')
    s.send(s.document, 'pointerup')
    const assistive = Object.assign(new Event('click', { cancelable: true }), { detail: 0 })
    s.trigger.dispatchEvent(assistive)
    expect(assistive.defaultPrevented).toBe(false)
    const pointer = Object.assign(new Event('click', { cancelable: true }), { detail: 1 })
    s.trigger.dispatchEvent(pointer)
    expect(pointer.defaultPrevented).toBe(true)
    s.controller.dispose()
  })
  it('selects a sub-frame row tap and publishes native contact feedback without waiting for rAF', () => {
    const s = setup()
    s.setOpen()
    s.document.elementFromPoint.mockReturnValue(s.items[0])
    s.send(s.panel, 'pointerdown')
    s.send(s.document, 'pointerup')
    expect(s.select).toHaveBeenCalledExactlyOnceWith(0)
    expect(s.frame()).toMatchObject({ contact: 1, highlightOpacity: 0, tapFeedback: true })
    const plan = s.motion.mock.calls.at(-1)![0]
    expect(plan.frames[0].contact).toBe(1)
    expect(plan.frames[4].contact).toBe(1)
    expect(plan.frames[24].contact).toBeLessThan(1)
    s.controller.dispose()
  })
  it('publishes the released contact before invoking the host selection callback', () => {
    const s = setup()
    s.setOpen()
    s.document.elementFromPoint.mockReturnValue(s.items[0])
    s.select.mockImplementation(() => {
      const plan = s.motion.mock.calls.at(-1)![0]
      expect(plan.frames[0]).toMatchObject({ contact: 1, highlightOpacity: 0, tapFeedback: true })
      expect(plan.frames[40].highlightOpacity).toBe(0)
    })
    s.send(s.panel, 'pointerdown')
    s.tick(90)
    s.send(s.document, 'pointerup')
    expect(s.select).toHaveBeenCalledOnce()
    s.controller.dispose()
  })
  it('selects only the primary finger when a second contact clicks a row', () => {
    const s = setup()
    s.setOpen()
    s.document.elementFromPoint.mockReturnValue(s.items[0])
    s.panel.addEventListener('click', () => s.select(0))
    s.send(s.panel, 'pointerdown')
    s.send(s.panel, 'pointerdown', 125, 120, 2)
    s.send(s.document, 'pointerup', 125, 120, 2)
    s.panel.dispatchEvent(
      Object.assign(new Event('click', { cancelable: true }), { detail: 1, pointerId: 2 }),
    )
    s.send(s.document, 'pointerup')
    s.panel.dispatchEvent(
      Object.assign(new Event('click', { cancelable: true }), { detail: 1, pointerId: 1 }),
    )
    expect(s.select).toHaveBeenCalledExactlyOnceWith(0)
    s.controller.dispose()
  })
  it('keeps held selection on its existing release curve instead of adding tap feedback', () => {
    const s = setup()
    s.setOpen()
    s.document.elementFromPoint.mockReturnValue(s.items[0])
    s.send(s.panel, 'pointerdown')
    s.tick(800)
    s.send(s.document, 'pointerup')
    expect(s.select).toHaveBeenCalledExactlyOnceWith(0)
    expect(s.frame()).toMatchObject({ tapFeedback: false, highlightOpacity: 0 })
    s.controller.dispose()
  })
  it('shows contact feedback for WebKit-adjusted clicks that had no owned pointerdown', () => {
    const s = setup()
    s.setOpen()
    // Model bubbling from a descendant row in this minimal EventTarget DOM.
    s.items[0].contains = element => element === s.panel
    const click = Object.assign(new Event('click', { cancelable: true }), {
      detail: 1,
      pointerId: 2,
      clientX: 144,
      clientY: 138,
    })
    s.panel.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    expect(s.frame()).toMatchObject({ contact: 1, fingerX: 44, fingerY: 38 })
    // The real button callback remains the activation owner; no duplicate.
    expect(s.select).not.toHaveBeenCalled()
    s.controller.dispose()
  })
  it('keeps autonomous press keyframes active without another display callback', () => {
    const s = setup()
    s.send(s.trigger, 'pointerdown')
    const plan = s.motion.mock.calls.at(-1)![0]
    expect(plan.frames[32].scaleX * 58).toBeCloseTo(
      menuTriggerPress(32 * plan.stepMilliseconds).scale * 58,
      6,
    )
    expect(plan.frames[100].scaleX).toBeGreaterThan(1)
    expect(s.onOpen).not.toHaveBeenCalled()
    s.controller.dispose()
  })
  it('rubber-bands monotonically with a finite bound in both directions', () => {
    const values = [0, 50, 200, 1000, 1e9].map(x => menuPull(x, 0.03, 750))
    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(values.at(-1)).toBeLessThan(22.5)
    expect(menuPull(-200, 0.03, 750)).toBe(-menuPull(200, 0.03, 750))
  })
})

describe('Native closed-trigger press measurements', () => {
  it('passes the measured 50 ms, 134 ms and held diameters without an instant jump', () => {
    expect(menuTriggerPress(0).scale * 58).toBeCloseTo(58)
    expect(menuTriggerPress(50.65).scale * 58).toBeCloseTo(62, 0)
    expect(menuTriggerPress(133.98).scale * 58).toBeCloseTo(72, 0)
    expect(menuTriggerPress(1200).scale * 58).toBeCloseTo(72, 1)
    expect(menuTriggerPress(100).contact).toBeGreaterThan(menuTriggerPress(1200).contact)
  })
})
