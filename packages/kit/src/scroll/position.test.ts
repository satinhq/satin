// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { insertionMotion } from './insertionMotion.ts'
import { createBottomInsetGeometry } from '../safe-area/bottomInsetGeometry.ts'
import { createScrollPositionController, type ScrollPositionOptions } from './position.ts'

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
  document.body.append(surface)
  let viewport = 100
  let extent = 300
  let shift = 0
  let offset = 0
  const targets = new Map<string, HTMLElement>()
  const scrollHeight = () =>
    extent + (Number.parseFloat(surface.style.getPropertyValue('--satin-scroll-inset-bottom')) || 0)
  Object.defineProperties(surface, {
    scrollTop: {
      get: () => Math.max(0, Math.min(scrollHeight() - viewport, offset)),
      set: value => {
        offset = value
      },
    },
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
    grow(amount: number, notify = true) {
      extent += amount
      if (notify) controller.reconcile()
    },
    prepend(amount: number) {
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
  expect(run.surface.scrollTop).toBeCloseTo(200, 0)
  const reading = run.surface.scrollTop
  run.add('next-message', 350)
  run.controller.targetsChanged()
  run.grow(50)
  expect(run.surface.scrollTop).toBe(reading)
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
