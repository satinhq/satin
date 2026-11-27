// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createScrollSurfaceRegistry } from './registry.ts'
import { insertionMotion } from './insertionMotion.ts'
import { createBottomInsetGeometry } from '../safe-area/bottomInsetGeometry.ts'
import { createScrollPositionController, type ScrollPositionOptions } from './position.ts'

let deliverLayout: (elements?: Element[]) => void
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach(stop => stop())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function fixture(
  options: ScrollPositionOptions = {
    defaultScrollAnchor: 'bottom',
    maintainVisibleContentPosition: true,
  },
) {
  const surface = document.createElement('div')
  const content = document.createElement('div')
  surface.append(content)
  const owner = document.createElement('div')
  owner.dataset.satinSafeAreaInset = 'bottom'
  const accessory = document.createElement('div')
  accessory.dataset.satinInsetAccessory = 'true'
  owner.append(surface, accessory)
  document.body.append(owner)
  let width = 100
  let viewport = 100
  let extent = 300
  let shift = 0
  let offset = 0
  let unclampedOffset = false
  let synchronousScroll = false
  let writingScroll = false
  let frameId = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const advanceFrame = () => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback(performance.now()))
  }
  const targets = new Map<string, HTMLElement>()
  const scrollHeight = () =>
    extent + (Number.parseFloat(surface.style.getPropertyValue('--satin-scroll-inset-bottom')) || 0)
  Object.defineProperties(surface, {
    scrollTop: {
      get: () => {
        if (!unclampedOffset) offset = Math.max(0, Math.min(scrollHeight() - viewport, offset))
        return offset
      },
      set: value => {
        const changed = offset !== value
        offset = value
        if (synchronousScroll && changed) {
          writingScroll = true
          surface.dispatchEvent(new Event('scroll'))
          writingScroll = false
        }
      },
    },
    clientWidth: { get: () => width },
    clientHeight: { get: () => viewport },
    scrollHeight: { get: scrollHeight },
  })
  const add = (id: string, position: number) => {
    const target = document.createElement('div')
    target.getBoundingClientRect = () =>
      ({
        top:
          position +
          shift -
          surface.scrollTop +
          (parseFloat(content.style.translate.split(' ')[1] ?? '0') || 0),
        height: 50,
      }) as DOMRect
    content.append(target)
    targets.set(id, target)
  }
  for (let index = 0; index < 6; index++) add(String(index), index * 50)
  surface.scrollTop = options.defaultScrollAnchor === 'bottom' ? extent - viewport : 0
  const NativeResizeObserver = ResizeObserver
  vi.stubGlobal(
    'ResizeObserver',
    class extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback)
        deliverLayout = (elements = [surface, content, owner, accessory]) =>
          callback(
            elements.map(target => ({ target }) as unknown as ResizeObserverEntry),
            this,
          )
      }
    },
  )
  const controller = createScrollPositionController(
    surface,
    content,
    targets,
    () => options,
    () => {},
  )
  cleanup.push(controller.dispose)
  return {
    surface,
    controller,
    add,
    frame: advanceFrame,
    layout: (elements?: Element[]) => deliverLayout(elements),
    settleLayout() {
      deliverLayout()
      advanceFrame()
      advanceFrame()
    },
    writingScroll: () => writingScroll,
    unclampedOffset(value: number) {
      unclampedOffset = true
      offset = value
    },
    clampOffset() {
      unclampedOffset = false
      controller.reconcile()
    },
    moveRows(amount: number) {
      shift += amount
      controller.reconcile()
    },
    synchronousScroll() {
      synchronousScroll = true
    },
    remove(id: string, height: number) {
      targets.get(id)?.remove()
      targets.delete(id)
      shift -= height
      extent -= height
      controller.targetsChanged()
      controller.reconcile()
    },
    grow(amount: number, notify = true) {
      extent += amount
      if (notify) controller.reconcile()
    },
    prepend(amount: number) {
      shift += amount
      extent += amount
      controller.reconcile()
    },
    reflow(amount: number) {
      width += 100
      shift += amount
      extent += amount
      controller.reconcile()
    },
    resize(height: number) {
      viewport = height
      controller.reconcile()
    },
    read(offset: number) {
      surface.scrollTop = offset
      surface.dispatchEvent(new Event('scroll'))
      surface.dispatchEvent(new Event('scrollend'))
    },
  }
}
it('follows appended and streamed content only while pinned, then resumes after jump to latest', () => {
  const run = fixture()
  expect(run.surface.scrollTop).toBe(200)
  run.grow(40)
  expect(run.surface.scrollTop).toBe(240)
  // WebKit can paint the new scroll offset before dispatching its scroll event.
  run.surface.scrollTop = 60
  run.grow(40)
  expect(run.surface.scrollTop).toBe(60)
  run.add('latest', 330)
  run.controller.targetsChanged()
  run.controller.scrollTo('latest', 'bottom')
  expect(run.surface.scrollTop).toBe(280)
  run.grow(30)
  expect(run.surface.scrollTop).toBe(310)
  // Navigation restoration takes precedence over the default bottom anchor.
  run.surface.scrollTop = 0
  run.controller.adoptRestoredOffset()
  run.grow(50)
  expect(run.surface.scrollTop).toBe(0)
})
it('follows an overflowing append after the transcript fits the viewport', () => {
  const run = fixture()
  run.read(0)
  run.resize(400)
  expect(run.surface.scrollTop).toBe(0)

  run.add('sent', 300)
  run.controller.targetsChanged()
  run.grow(150)

  expect(run.surface.scrollTop).toBe(50)
  expect(run.controller.followsEnd()).toBe(true)
})

it('retains a scrolled-up reader when an incoming message extends a long thread', () => {
  const run = fixture()
  run.read(60)
  run.add('incoming', 300)
  run.controller.targetsChanged()
  run.grow(50)

  expect(run.surface.scrollTop).toBe(60)
  expect(run.controller.followsEnd()).toBe(false)
})

it('keeps following its bottom when the page was resized while hidden', () => {
  const run = fixture()
  let visibility: DocumentVisibilityState = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
  const setVisibility = (next: DocumentVisibilityState) => {
    visibility = next
    document.dispatchEvent(new Event('visibilitychange'))
  }
  // iPadOS snapshots a hidden page at another size, and WebKit clamps the offset to that layout.
  // The clamp's scroll event arrives on return, after the size is back.
  setVisibility('hidden')
  run.surface.scrollTop = 120
  visibility = 'visible'
  run.surface.dispatchEvent(new Event('scroll'))
  setVisibility('visible')
  expect(run.surface.scrollTop).toBe(200)
  expect(run.controller.followsEnd()).toBe(true)
  // The visibility change can also come first.
  setVisibility('hidden')
  run.surface.scrollTop = 120
  setVisibility('visible')
  run.surface.dispatchEvent(new Event('scroll'))
  expect(run.surface.scrollTop).toBe(200)
  // A reader's own scroll after returning still leaves the bottom.
  run.read(50)
  expect(run.controller.followsEnd()).toBe(false)

  // A fitting app-switcher snapshot must not turn a reader into a bottom follower.
  setVisibility('hidden')
  run.resize(400)
  run.resize(100)
  setVisibility('visible')
  expect(run.controller.followsEnd()).toBe(false)
  const restored = run.surface.scrollTop
  run.grow(50)
  expect(run.surface.scrollTop).toBe(restored)
})
it('preserves the visible message through prepends and viewport changes while keeping a pinned bottom', () => {
  const run = fixture()
  run.read(65)
  run.prepend(150)
  expect(run.surface.scrollTop).toBe(215)
  run.resize(80)
  expect(run.surface.scrollTop).toBe(215)
  run.controller.scrollTo('5', 'bottom')
  expect(run.surface.scrollTop).toBe(370)
  run.resize(140)
  expect(run.surface.scrollTop).toBe(310)
})
it('resolves a late ID within its own scroller and lets user scrolling cancel an unresolved request', () => {
  const run = fixture()
  expect(run.controller.scrollTo('late', 'top')).toBe(false)
  run.add('late', 100)
  run.controller.targetsChanged()
  run.controller.reconcile()
  expect(run.surface.scrollTop).toBe(100)
  run.controller.scrollTo('cancelled', 'top')
  run.read(30)
  run.add('cancelled', 180)
  run.controller.targetsChanged()
  run.controller.reconcile()
  expect(run.surface.scrollTop).toBe(30)
  expect(document.documentElement.scrollTop).toBe(0)
})

it('aligns a requested message above the combined bottom accessory instead of beneath its glass', () => {
  const run = fixture({ defaultScrollAnchor: 'top' })
  run.surface.style.setProperty('--satin-scroll-inset-bottom', '30px')
  run.controller.scrollTo('2', 'bottom')
  expect(run.surface.scrollTop).toBe(80)
})

it("aligns a target below a primary scroll view's bar inset, not under the bar (reference)", () => {
  const run = fixture({})
  run.surface.dataset.satinPrimary = 'true'
  run.surface.style.paddingTop = '30px'
  run.surface.style.paddingBottom = '20px'
  run.controller.scrollTo('3', 'top')
  expect(run.surface.scrollTop).toBe(120)
  run.controller.scrollTo('1')
  expect(run.surface.scrollTop).toBe(20)
})
it('waits for laid-out row sizes before following streamed text', () => {
  let mutation!: MutationCallback
  let resized!: ResizeObserverCallback
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback: MutationCallback) {
        mutation = callback
      }
      observe() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  const run = fixture()
  const original = run.surface.getBoundingClientRect.bind(run.surface)
  run.surface.getBoundingClientRect = () => {
    throw Error('Layout read during token delivery')
  }
  const text = document.createTextNode('next token')
  expect(() =>
    mutation(
      [{ type: 'childList', addedNodes: [text], removedNodes: [] }] as unknown as MutationRecord[],
      {} as MutationObserver,
    ),
  ).not.toThrow()
  run.surface.getBoundingClientRect = original
  run.grow(40, false)
  resized([], {} as ResizeObserver)
  expect(run.surface.scrollTop).toBe(240)
})

it('publishes a complete geometry snapshot before consumer callbacks can change layout', () => {
  let callbackRan = false
  const run = fixture({
    defaultScrollAnchor: 'bottom',
    onScrollGeometryChange: () => {
      callbackRan = true
    },
  })
  callbackRan = false
  const original = run.surface.getBoundingClientRect.bind(run.surface)
  run.surface.getBoundingClientRect = () => {
    if (callbackRan) throw Error('Layout read after consumer write')
    return original()
  }
  expect(() => run.grow(30)).not.toThrow()
  expect(callbackRan).toBe(true)
  expect(run.surface.scrollTop).toBe(230)
})

it('keeps the latest message above a growing or cleared composer in the inset publication turn', () => {
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))

  // An accessory ResizeObserver can publish after the transcript's observer has
  // already run. The new terminal inset must not wait for another observer turn.
  inset.publish(66)
  expect(run.surface.scrollTop).toBe(266)
  inset.publish(22)
  expect(run.surface.scrollTop).toBe(222)

  run.read(65)
  inset.publish(88)
  expect(run.surface.scrollTop).toBe(65)
})

it('hands an in-flight insertion to native scrolling without pulling the reader back down', () => {
  const run = fixture()
  animatePresentedContent(run.surface)
  run.add('new-message', 300)
  run.controller.targetsChanged()
  run.grow(50)
  expect(run.surface.scrollTop).toBe(250)
  run.surface.dispatchEvent(new Event('pointerdown'))
  expect(run.surface.scrollTop).toBe(250)
  const reading = run.surface.scrollTop
  run.add('next-message', 350)
  run.controller.targetsChanged()
  run.grow(50)
  expect(run.surface.scrollTop).toBe(reading)
  window.dispatchEvent(new Event('pointerup'))
  run.surface.dispatchEvent(new Event('scrollend'))
  expect(run.surface.scrollTop).toBeCloseTo(200, 0)
})

it('keeps a following bottom when idle arrives during insertion presentation without input', () => {
  const run = fixture()
  animatePresentedContent(run.surface)
  let visibility: DocumentVisibilityState = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  run.add('new-message', 300)
  run.grow(50)
  run.resize(200)
  run.resize(100)
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  expect(run.surface.scrollTop).toBe(250)
  expect(insertionMotion(run.surface)).toBeDefined()
  run.surface.dispatchEvent(new Event('scrollend'))
  expect(run.surface.scrollTop).toBe(250)
  expect(run.controller.followsEnd()).toBe(true)
  // A composer or inset delivered after resume must still extend the pinned bottom.
  run.grow(65)
  expect(run.surface.scrollTop).toBe(315)
  expect(run.controller.followsEnd()).toBe(true)
})

function animatePresentedContent(surface: HTMLElement) {
  const content = surface.firstElementChild as HTMLElement
  const animate = vi.fn((frames: Keyframe[]) => {
    content.style.translate = String(frames[0]!.translate)
    return {
      cancel() {
        content.style.translate = ''
      },
      finished: new Promise(() => {}),
    } as unknown as Animation
  })
  content.animate = animate as typeof content.animate
  return animate
}

it('fulfills a pending terminal request with one insertion, without replaying it on resize', () => {
  vi.spyOn(performance, 'now').mockReturnValue(100)
  const run = fixture()
  const animate = animatePresentedContent(run.surface)
  run.controller.scrollTo('sent', 'bottom')
  run.add('sent', 300)
  run.grow(50)
  expect(animate).toHaveBeenCalledOnce()
  expect(animate.mock.calls[0]![0][0]!.translate).toBe('0 50px')
  run.controller.reconcile()
  expect(animate).toHaveBeenCalledOnce()
})

it('combines a pending send with the presented composer collapse', () => {
  vi.spyOn(performance, 'now').mockReturnValue(100)
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  run.surface.style.paddingBottom = '66px'
  inset.publish(66)
  const animate = animatePresentedContent(run.surface)
  run.settleLayout()
  run.controller.scrollTo('sent', 'bottom')
  run.surface.style.paddingBottom = '22px'
  inset.publish(22)
  expect(animate.mock.calls[0]![0][0]!.translate).toBe('0 -44px')
  expect(insertionMotion(run.surface)?.stops).toEqual([
    [0, -44],
    [1, -44],
  ])
  run.add('sent', 300)
  run.grow(50)
  // New 50pt row minus the 44pt composer collapse, not a second 50pt rise.
  expect(animate.mock.calls[1]![0][0]!.translate).toBe('0 6px')
  run.controller.reconcile()
  expect(animate).toHaveBeenCalledTimes(2)
})

it('opens at the first composer inset, then animates composer growth and a new message', () => {
  vi.spyOn(performance, 'now').mockReturnValue(100)
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  const animate = animatePresentedContent(run.surface)
  inset.publish(0)
  run.frame()
  run.surface.style.paddingBottom = '96px'
  inset.publish(96)
  expect(run.surface.scrollTop).toBe(296)
  expect(animate).not.toHaveBeenCalled()
  run.settleLayout()
  run.surface.style.paddingBottom = '118px'
  inset.publish(118)
  expect(animate.mock.calls[0]![0][0]!.translate).toBe('0 22px')
  run.add('sent', 300)
  run.grow(50)
  expect(animate.mock.calls[1]![0][0]!.translate).toBe('0 72px')
})

it('settles a positive inner inset and the later parent contribution without insertion', () => {
  const run = fixture()
  const outer = createBottomInsetGeometry()
  const inner = createBottomInsetGeometry()
  cleanup.push(inner.attach(run.surface))
  let accessoryHeight = 0
  cleanup.push(
    outer.attach(
      document.createElement('div'),
      () => inner.publish(accessoryHeight + outer.value),
      inner,
    ),
  )
  const animate = animatePresentedContent(run.surface)
  accessoryHeight = 70
  run.surface.style.paddingBottom = '70px'
  inner.publish(accessoryHeight)
  run.frame()
  run.surface.style.paddingBottom = '96px'
  outer.publish(26)
  expect(run.surface.scrollTop).toBe(296)
  expect(animate).not.toHaveBeenCalled()
})

it('animates a message added by a reentrant scroll geometry callback during the initial inset', () => {
  vi.spyOn(performance, 'now').mockReturnValue(100)
  let append = false
  const run = fixture({
    defaultScrollAnchor: 'bottom',
    onScrollGeometryChange() {
      if (!append) return
      append = false
      run.add('sent', 300)
      run.grow(50)
    },
  })
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  const animate = animatePresentedContent(run.surface)
  run.synchronousScroll()
  append = true
  run.surface.style.paddingBottom = '96px'
  inset.publish(96)
  expect(animate.mock.calls[0]?.[0][0]?.translate).toBe('0 50px')
})

it.each([true, false])('baselines the first inset before a pending target, present=%s', present => {
  const binding = { id: null as string | null, anchor: 'bottom' as const, onChange() {} }
  const run = fixture({ defaultScrollAnchor: 'bottom', scrollPosition: binding })
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  const animate = animatePresentedContent(run.surface)
  binding.id = present ? '5' : 'later'
  run.surface.style.paddingBottom = '96px'
  inset.publish(96)
  run.controller.reconcile()
  expect(animate).not.toHaveBeenCalled()
})

it.each([false, true])('animates the first inset after zero has settled, appended=%s', appended => {
  vi.spyOn(performance, 'now').mockReturnValue(100)
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  run.settleLayout()
  const animate = animatePresentedContent(run.surface)
  if (appended) {
    run.add('sent', 300)
    run.grow(50, false)
  }
  run.surface.style.paddingBottom = '52px'
  inset.publish(52)
  expect(animate.mock.calls[0]?.[0][0]?.translate).toBe(appended ? '0 102px' : '0 52px')
})

it('animates an actual append while the initial inset layout is still settling', () => {
  vi.spyOn(performance, 'now').mockReturnValue(100)
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  const animate = animatePresentedContent(run.surface)
  run.add('sent', 300)
  run.grow(50, false)
  run.surface.style.paddingBottom = '52px'
  inset.publish(52)
  expect(animate.mock.calls[0]?.[0][0]?.translate).toBe('0 50px')
  run.surface.style.paddingBottom = '78px'
  inset.publish(78)
  expect(animate).toHaveBeenCalledOnce()
  expect(run.surface.style.clipPath).toBe('inset(0 0 78px 0)')
})

it('does not insert a fitting transcript while its initial inset settles', () => {
  const run = fixture()
  run.resize(500)
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  const animate = animatePresentedContent(run.surface)
  run.surface.style.paddingBottom = '52px'
  inset.publish(52)
  expect(run.surface.scrollTop).toBe(0)
  expect(animate).not.toHaveBeenCalled()
})

it('cancels a same-height synchronous scroll before publishing its completed geometry', () => {
  const seen: { translate: string; writing: boolean }[] = []
  let record = false
  const options = {
    defaultScrollAnchor: 'bottom' as 'top' | 'bottom',
    maintainVisibleContentPosition: true,
    onScrollGeometryChange() {
      if (record)
        seen.push({
          translate: run.surface.firstElementChild!.getAttribute('style') ?? '',
          writing: run.writingScroll(),
        })
    },
  }
  const run = fixture(options)
  run.settleLayout()
  animatePresentedContent(run.surface)
  run.add('sent', 300)
  run.grow(50)
  expect(insertionMotion(run.surface)).toBeDefined()
  options.defaultScrollAnchor = 'top'
  run.surface.dispatchEvent(new Event('scrollend'))
  run.synchronousScroll()
  record = true
  run.moveRows(-20)
  expect(run.surface.scrollTop).toBe(230)
  expect(insertionMotion(run.surface)).toBeUndefined()
  expect(seen).toHaveLength(1)
  expect(seen[0]?.writing).toBe(false)
  expect(seen[0]?.translate).not.toContain('50px')
})

it('adopts an explicit jump from a scrolled-up position without replaying an append', () => {
  const run = fixture()
  const animate = animatePresentedContent(run.surface)
  run.read(60)
  run.controller.scrollTo('sent', 'bottom')
  run.add('sent', 300)
  run.grow(50)
  expect(run.surface.scrollTop).toBe(250)
  run.controller.reconcile()
  expect(animate).not.toHaveBeenCalled()
})

it('sees a queued typing replacement before a React layout-effect reconciliation', () => {
  const run = fixture()
  const content = run.surface.firstElementChild as HTMLElement
  const terminal = content.lastElementChild!
  const typing = document.createElement('span')
  terminal.append(typing, document.createElement('svg'))
  run.controller.reconcile()
  content.animate = vi.fn(() => ({ cancel() {} }) as unknown as Animation)
  typing.replaceWith(document.createElement('p'))
  run.grow(-2)
  expect(insertionMotion(run.surface)?.stops[0]?.[1]).toBe(-2)
  expect(content.animate).toHaveBeenCalledOnce()
  run.controller.reconcile()
  expect(content.animate).toHaveBeenCalledOnce()
})

it('waits for the inset owner layout delivery rather than elapsed frames', () => {
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  const animate = animatePresentedContent(run.surface)
  run.frame()
  run.frame()
  run.surface.style.paddingBottom = '96px'
  inset.publish(96)
  expect(animate).not.toHaveBeenCalled()
  run.settleLayout()
  run.surface.style.paddingBottom = '118px'
  inset.publish(118)
  expect(animate.mock.calls[0]?.[0][0]?.translate).toBe('0 22px')
})

it.each([false, true])('keeps a hidden initial inset pending, delivered=%s', delivered => {
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  const animate = animatePresentedContent(run.surface)
  if (delivered) run.layout()
  run.resize(0)
  run.surface.style.paddingBottom = '96px'
  inset.publish(96)
  run.layout()
  run.frame()
  run.frame()
  run.resize(100)
  expect(run.surface.scrollTop).toBe(296)
  expect(animate).not.toHaveBeenCalled()
  run.settleLayout()
  run.surface.style.paddingBottom = '118px'
  inset.publish(118)
  expect(animate.mock.calls[0]?.[0][0]?.translate).toBe('0 22px')
})

it.each([20, 50, 80])(
  'animates the append independently of an initial inset shrink of %s',
  shrink => {
    const run = fixture()
    const inset = createBottomInsetGeometry()
    cleanup.push(inset.attach(run.surface))
    run.surface.style.paddingBottom = '96px'
    inset.publish(96)
    const animate = animatePresentedContent(run.surface)
    run.add('sent', 300)
    run.grow(50, false)
    run.surface.style.paddingBottom = `${96 - shrink}px`
    inset.publish(96 - shrink)
    expect(animate.mock.calls[0]?.[0][0]?.translate).toBe('0 50px')
  },
)

it('keeps a nonzero subpixel append when an initial inset shrinks', () => {
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  run.surface.style.paddingBottom = '96px'
  inset.publish(96)
  const animate = animatePresentedContent(run.surface)
  run.add('sent', 300)
  run.grow(0.25, false)
  run.surface.style.paddingBottom = '16px'
  inset.publish(16)
  expect(animate.mock.calls[0]?.[0][0]?.translate).toBe('0 0.25px')
})

it('waits for separately delivered inset owners before closing initial layout', () => {
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  const animate = animatePresentedContent(run.surface)
  run.layout([run.surface, run.surface.firstElementChild!])
  run.frame()
  run.frame()
  run.surface.style.paddingBottom = '96px'
  inset.publish(96)
  expect(animate).not.toHaveBeenCalled()
  run.settleLayout()
  run.surface.style.paddingBottom = '118px'
  inset.publish(118)
  expect(animate.mock.calls[0]?.[0][0]?.translate).toBe('0 22px')
})

it('keeps initial layout open when its closing reconcile cannot adopt the inset', () => {
  const run = fixture()
  const inset = createBottomInsetGeometry()
  cleanup.push(inset.attach(run.surface))
  const animate = animatePresentedContent(run.surface)
  run.layout()
  // WebKit can leave the old offset beyond the shrunken range until it clamps.
  run.unclampedOffset(400)
  run.surface.style.paddingBottom = '96px'
  inset.publish(96)
  run.frame()
  expect(animate).not.toHaveBeenCalled()
  run.clampOffset()
  expect(run.surface.scrollTop).toBe(296)
  expect(animate).not.toHaveBeenCalled()
  // Successful adoption closes the window without another owner delivery.
  run.surface.style.paddingBottom = '118px'
  inset.publish(118)
  expect(animate.mock.calls[0]?.[0][0]?.translate).toBe('0 22px')
})

it('keeps a plain reader and its checkpoint through hidden reflow and a changed resume width', () => {
  const run = fixture({})
  run.read(113)
  let visibility: DocumentVisibilityState = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
  const registry = createScrollSurfaceRegistry({ development: false })
  cleanup.push(
    registry.register({
      id: 'reader',
      axis: 'vertical',
      primary: true,
      element: run.surface,
      captureReadingPosition: () => run.controller.captureReadingPosition(),
      canRestoreReadingPosition: () => run.controller.canRestoreReadingPosition(),
      restoreReadingAnchor: anchor => run.controller.restoreReadingAnchor(anchor),
    }),
  )
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  run.surface.scrollTop = 0
  run.reflow(80)
  run.surface.dispatchEvent(new Event('scroll'))
  const saved = registry.capture().get('reader')!
  expect(saved.anchor).toEqual({ id: '2', top: -13 })
  run.reflow(40)
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  expect(run.surface.scrollTop).toBe(233)
  run.surface.scrollTop = 0
  run.controller.adoptRestoredOffset()
  run.surface.scrollTo = options => {
    run.surface.scrollTop = (options as ScrollToOptions).top ?? 0
  }
  registry.restore(new Map([['reader', saved]]))
  expect(run.surface.scrollTop).toBe(233)
  run.read(150)
  run.controller.scrollTo('4', 'top')
  run.surface.dispatchEvent(new Event('scrollend'))
  expect(run.controller.readingAnchor()?.id).toBe('4')
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  run.prepend(50)
  run.add('earlier', -100)
  run.remove('0', 50)
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  expect(run.controller.readingAnchor()).toEqual({ id: '4', top: 0 })
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  run.controller.scrollTo('3', 'top')
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  run.surface.dispatchEvent(new Event('scrollend'))
  expect(run.controller.readingAnchor()).toEqual({ id: '3', top: 0 })
})
it('keeps a plain reader through visible width reflow without following appended rows', () => {
  const run = fixture({})
  run.read(113)
  run.reflow(80)
  expect(run.surface.scrollTop).toBe(193)
  run.prepend(50)
  expect(run.surface.scrollTop).toBe(193)
  run.grow(100)
  expect(run.surface.scrollTop).toBe(193)
})

it('reference adopts an append baseline while a finger holds a pinned chat', () => {
  const run = fixture()
  const animate = animatePresentedContent(run.surface)
  run.surface.dispatchEvent(new Event('pointerdown'))
  run.add('held-message', 300)
  run.grow(50)
  expect(run.surface.scrollTop).toBe(200)
  expect(animate).not.toHaveBeenCalled()
  window.dispatchEvent(new Event('pointerup'))
  run.surface.dispatchEvent(new Event('scrollend'))
  expect(run.surface.scrollTop).toBe(250)
  expect(run.controller.followsEnd()).toBe(true)
  expect(animate).not.toHaveBeenCalled()
})
