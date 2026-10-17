// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest'
import { NavigatorHost } from './NavigatorHost.tsx'
import { createNavigator } from './store.ts'
import { createScreenRegistry, defineScreen } from './registry.ts'
import type { TransitionBinding, TransitionController } from './types.ts'
import type { InteractivePopDiagnostic } from './interactivePopTypes.ts'

const geometry = vi.hoisted(() => ({ width: 1366, horizontal: 'regular' }))
vi.mock('../root/runtimeContext.ts', () => ({
  useSatinLayoutRuntime: () => ({
    layoutClass: { horizontal: geometry.horizontal },
    metrics: { layoutViewport: { width: geometry.width }, screen: { width: 1366, height: 1024 } },
  }),
}))
vi.mock('./NavigationChrome.tsx', () => ({
  NavigationChrome: ({ onToggleSidebar }: { onToggleSidebar?: () => void }) =>
    onToggleSidebar ? <button onClick={onToggleSidebar}>Toggle sidebar</button> : null,
}))
vi.mock('../reachability/react.tsx', () => ({
  ReachabilityRoute: ({ children }: { children: React.ReactNode }) => children,
}))

type TestPop = TransitionController & {
  bindings: number[]
  cancelInteractive: Mock<NonNullable<TransitionController['cancelInteractive']>>
  setProgress: Mock<NonNullable<TransitionController['setProgress']>>
  scrubFromScroll: Mock<NonNullable<TransitionController['scrubFromScroll']>>
  releases: Mock<() => void>
}
let element: HTMLDivElement
let root: Root
let viewportWidth: number
let hostLeft: number
let frames: FrameRequestCallback[]
let diagnostics: InteractivePopDiagnostic[]
let now: number

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  geometry.width = viewportWidth = 1366
  geometry.horizontal = 'regular'
  hostLeft = 0
  now = 1000
  frames = []
  diagnostics = []
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames[id - 1] = () => {}
  })
  window.requestAnimationFrame = globalThis.requestAnimationFrame
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame
  // happy-dom has no layout engine. This is an explicit model of the stylesheet's
  // split pane boxes, not rendered CSS or installed-PWA fidelity evidence.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const host = this.closest('[data-satin-navigator-host]')
    const hidden = host?.getAttribute('data-satin-sidebar-hidden') === 'true'
    const split = host?.getAttribute('data-satin-navigation-layout') === 'split'
    const sidebar = viewportWidth <= 744 ? 296 : 320
    const offset = this.hasAttribute('data-satin-detail-scrub') && split && !hidden ? sidebar : 0
    const left = hostLeft + offset
    const width = viewportWidth - offset
    return {
      width,
      height: 1024,
      left,
      top: 0,
      right: left + width,
      bottom: 1024,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getBoundingClientRect().width
  })
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(() => {
  act(() => root.unmount())
  element.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup(native = true) {
  if (native) vi.stubGlobal('ScrollTimeline', class {})
  const pops: TestPop[] = []
  const automatic: { bindings: number[]; finish: () => void }[] = []
  const registry = createScreenRegistry(
    ...['home', 'detail', 'next'].map(id => defineScreen(id, { component: () => <div>{id}</div> })),
  )
  const navigator = createNavigator({
    registry,
    initial: { id: 'home' },
    transitionControllerFactory: (completion, context) => {
      const bindings: number[] = []
      if (!context.interactive) {
        automatic.push({ bindings, finish: completion.finish })
        return {
          progress: 0,
          bind: (binding: TransitionBinding) => {
            bindings.push(binding.width)
            return () => {}
          },
          finish: completion.finish,
          cancel: completion.cancel,
        }
      }
      const pop: TestPop = {
        progress: 0,
        interactionPhase: 'held',
        bindings,
        releases: vi.fn<() => void>(),
        bind: binding => {
          bindings.push(binding.width)
          return pop.releases
        },
        setProgress: vi.fn<NonNullable<TransitionController['setProgress']>>(progress => {
          ;(pop as { progress: number }).progress = progress
        }),
        scrubFromScroll: vi.fn<NonNullable<TransitionController['scrubFromScroll']>>(),
        completeInteractive: vi.fn(),
        cancelInteractive: vi.fn<NonNullable<TransitionController['cancelInteractive']>>(() => {
          ;(pop as { interactionPhase: string }).interactionPhase = 'cancelling'
        }),
        finish: completion.finish,
        cancel: completion.cancel,
      }
      pops.push(pop)
      return pop
    },
  })
  navigator.push('detail', {})
  automatic.at(-1)!.finish()
  navigator.push('next', {})
  automatic.at(-1)!.finish()
  const render = () =>
    act(() =>
      root.render(
        <NavigatorHost
          adaptive
          navigator={navigator}
          onInteractivePopDiagnostic={diagnostic => diagnostics.push(diagnostic)}
        />,
      ),
    )
  render()
  return { navigator, pops, automatic, render }
}
const host = () => element.querySelector<HTMLElement>('[data-satin-navigator-host]')!
function touch(type: string, x: number) {
  now += 20
  const point = { identifier: 7, clientX: x, clientY: 300 }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    changedTouches: { value: Object.assign([point], { item: () => point }) },
    touches: { value: type === 'touchend' ? [] : [point] },
    timeStamp: { value: now },
  })
  act(() => host().dispatchEvent(event))
  return event
}
function flushFrames() {
  act(() => frames.splice(0).forEach(callback => callback(now)))
}
function beginSwipe(left: number) {
  touch('touchstart', left + 4)
  touch('touchmove', left + 44)
  flushFrames()
  touch('touchmove', left + 164)
  flushFrames()
}
function toggleSidebar() {
  act(() => element.querySelector('button')!.click())
}

it.each([
  { width: 1366, native: true, hidden: false, pane: 1046 },
  { width: 1366, native: true, hidden: true, pane: 1366 },
  { width: 1366, native: false, hidden: false, pane: 1046 },
  { width: 1366, native: false, hidden: true, pane: 1366 },
  { width: 744, native: true, hidden: false, pane: 448 },
  { width: 956, native: false, hidden: false, pane: 636 },
  { width: 440, native: false, hidden: false, pane: 440 },
])('tracks subsequent finger travel 1:1 in the pane model: %j', input => {
  geometry.width = viewportWidth = input.width
  geometry.horizontal = input.width < 668 ? 'compact' : 'regular'
  const { pops } = setup(input.native)
  if (input.hidden) toggleSidebar()
  expect(host().getAttribute('data-satin-navigation-layout')).toBe(
    input.width < 668 ? 'stack' : 'split',
  )
  const left = input.width - input.pane
  beginSwipe(left)
  expect(pops[0]!.bindings).toEqual([input.pane])
  touch('touchend', left + 164)
  const before = diagnostics.filter(sample => sample.event === 'touchend').at(-1)!.progress
  act(() => pops[0]!.cancel())
  beginSwipe(left)
  touch('touchmove', left + 284)
  touch('touchend', left + 284)
  const after = diagnostics.filter(sample => sample.event === 'touchend').at(-1)!.progress
  expect((after - before) * input.pane).toBeCloseTo(120, 6)
})

it.each(
  (['sidebar', 'rotation', 'origin', 'compact-resize', 'class-change'] as const).flatMap(change =>
    [true, false].map(native => ({ change, native })),
  ),
)(
  'cancels a held swipe without rebinding its pose, then uses new geometry: %j',
  ({ change, native }) => {
    if (change === 'compact-resize') geometry.horizontal = 'compact'
    const { pops, navigator, render } = setup(native)
    const oldLeft = change === 'compact-resize' ? 0 : 320
    beginSwipe(oldLeft)
    const held = pops[0]!
    const oldWidth = held.bindings[0]!
    if (change === 'sidebar') toggleSidebar()
    else if (change === 'origin') {
      hostLeft = 50
      act(() => window.dispatchEvent(new Event('resize')))
    } else {
      geometry.width = viewportWidth = change === 'class-change' ? 440 : 1024
      if (change === 'class-change') geometry.horizontal = 'compact'
      render()
      act(() => window.dispatchEvent(new Event('resize')))
    }
    expect(held.cancelInteractive).toHaveBeenCalledExactlyOnceWith(0)
    expect(held.bindings).toEqual([oldWidth])
    expect(held.releases).not.toHaveBeenCalled()
    expect(held.scrubFromScroll).toHaveBeenCalledTimes(native ? 1 : 0)
    const scrubCalls = held.scrubFromScroll.mock.calls.length
    const moveCalls = held.setProgress.mock.calls.length
    expect(touch('touchmove', oldLeft + 500).defaultPrevented).toBe(false)
    touch('touchend', oldLeft + 500)
    flushFrames()
    expect(held.cancelInteractive).toHaveBeenCalledTimes(1)
    expect(held.scrubFromScroll).toHaveBeenCalledTimes(scrubCalls)
    expect(held.setProgress).toHaveBeenCalledTimes(moveCalls)
    act(() => held.cancel())
    expect(navigator.getState().entries.at(-1)!.screenId).toBe('next')
    const newLeft =
      change === 'sidebar' || change === 'compact-resize' || change === 'class-change'
        ? 0
        : hostLeft + 320
    const newWidth =
      change === 'compact-resize' || change === 'sidebar' || change === 'class-change'
        ? viewportWidth
        : viewportWidth - 320
    beginSwipe(newLeft)
    expect(pops[1]!.bindings).toEqual([newWidth])
    touch('touchend', newLeft + 164)
    const before = diagnostics.filter(sample => sample.event === 'touchend').at(-1)!.progress
    act(() => pops[1]!.cancel())
    beginSwipe(newLeft)
    touch('touchmove', newLeft + 284)
    touch('touchend', newLeft + 284)
    const after = diagnostics.filter(sample => sample.event === 'touchend').at(-1)!.progress
    expect((after - before) * newWidth).toBeCloseTo(120, 6)
  },
)

it('releases a tracking touch claim before it can recognize against a moved pane', () => {
  const { pops } = setup(false)
  touch('touchstart', 324)
  touch('touchmove', 336)
  toggleSidebar()
  expect(touch('touchmove', 484).defaultPrevented).toBe(false)
  expect(pops).toHaveLength(0)
  touch('touchend', 484)
  beginSwipe(0)
  expect(pops).toHaveLength(1)
  expect(pops[0]!.bindings).toEqual([1366])
})

it('preserves height-only bindings and lets a noninteractive push finish after resize', () => {
  const { navigator, automatic } = setup()
  act(() => navigator.push('detail', {}))
  const push = automatic.at(-1)!
  expect(push.bindings).toEqual([1046])
  act(() => window.dispatchEvent(new Event('resize')))
  expect(push.bindings).toEqual([1046])
  viewportWidth = 1024
  act(() => window.dispatchEvent(new Event('resize')))
  expect(push.bindings).toEqual([1046, 704])
  act(() => push.finish())
  expect(navigator.getState().entries.at(-1)!.screenId).toBe('detail')
})

it('releases pointer capture and discards held pointer input when the pane moves', () => {
  const { pops } = setup(false)
  const captured = new Set<number>()
  Object.assign(host(), {
    hasPointerCapture: (identifier: number) => captured.has(identifier),
    setPointerCapture: (identifier: number) => captured.add(identifier),
    releasePointerCapture: vi.fn((identifier: number) => captured.delete(identifier)),
  })
  const pointer = (type: string, x: number) => {
    now += 20
    act(() =>
      host().dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 8,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: 300,
        }),
      ),
    )
  }
  pointer('pointerdown', 324)
  pointer('pointermove', 484)
  flushFrames()
  const held = pops[0]!
  expect(captured.has(8)).toBe(true)
  const progressWrites = held.setProgress.mock.calls.length
  hostLeft = 50
  act(() => window.dispatchEvent(new Event('resize')))
  expect(held.cancelInteractive).toHaveBeenCalledExactlyOnceWith(0)
  expect(host().releasePointerCapture).toHaveBeenCalledExactlyOnceWith(8)
  expect(captured.size).toBe(0)
  expect(held.bindings).toEqual([1046])
  expect(held.releases).not.toHaveBeenCalled()
  pointer('pointermove', 700)
  pointer('pointerup', 700)
  flushFrames()
  expect(held.setProgress).toHaveBeenCalledTimes(progressWrites)
  expect(held.cancelInteractive).toHaveBeenCalledTimes(1)
})
