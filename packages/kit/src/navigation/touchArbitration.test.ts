// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createScreenRegistry, defineScreen } from './registry.ts'
import { createNavigator, navigatorTransitionRuntime } from './store.ts'
import { bindTouchArbitration, type TouchArbitrationContext } from './touchArbitration.ts'
import type { InteractiveTransitionController } from './interactivePopTypes.ts'
import type { TransitionController, TransitionControllerFactory } from './types.ts'

const preparation = vi.hoisted(() => vi.fn())
vi.mock('../motionProbe.ts', () => ({
  recordMotionPreparation: (make: () => unknown) =>
    preparation(typeof make === 'function' ? make() : make),
}))

// Owner traces (Oct 4): 4 of 20 back swipes begun 383-500 ms after opening a note were refused
// while the top route's glass source prepared (source-pending / contact-before-source-ready),
// one was accepted during the push and then ignored at recognition, and one (g34) was recognized
// but its page never moved. Acceptance no longer depends on glass source preparation.

function EmptyScreen() {
  return null
}

const registry = createScreenRegistry(
  defineScreen('root', { component: EmptyScreen }),
  defineScreen('detail', { component: EmptyScreen }),
)

type Controlled = TransitionController & { interactive: boolean; resolved?: unknown[] }

function setup({ settlePush }: { settlePush: boolean }) {
  const controllers: Controlled[] = []
  const factory: TransitionControllerFactory = (completion, context) => {
    let completed = false
    let progress = 0
    const controller: Controlled = {
      interactive: context.interactive,
      get progress() {
        return progress
      },
      start() {},
      setProgress(next) {
        progress = next
      },
      resolveInteractive(...args) {
        controller.resolved = args
      },
      completeInteractive() {
        controller.finish()
      },
      cancelInteractive() {
        controller.cancel()
      },
      finishForPush() {
        controller.finish()
      },
      // An automatic push in flight presents its page at 60% of the width.
      presentedPose: context.interactive ? undefined : () => 0.6,
      finish() {
        if (completed) return
        completed = true
        progress = 1
        completion.finish()
      },
      cancel() {
        if (completed) return
        completed = true
        progress = 0
        completion.cancel()
      },
    }
    controllers.push(controller)
    return controller
  }
  const navigator = createNavigator({
    registry,
    initial: { id: 'root' },
    transitionControllerFactory: factory,
  })
  navigator.push('detail')
  if (settlePush) controllers[0]!.finish()
  const host = document.createElement('div')
  document.body.append(host)
  const context: TouchArbitrationContext = {
    navigator,
    nativeNavigation: true,
    automaticPushActive: !settlePush,
    split: false,
    horizontal: 'compact',
    appliedHorizontal: 'compact',
    onInteractivePopDiagnostic: undefined,
    startScrubFrameLoop: vi.fn(() => ({
      dispose: vi.fn(),
      resolve: vi.fn(),
      update: vi.fn(),
    })) as unknown as TouchArbitrationContext['startScrubFrameLoop'],
    hostGeometryRef: { current: { left: 0, top: 0, width: 400 } },
    earlyTouchArbitrationRef: { current: undefined },
    earlyTouchControllerRef: { current: undefined },
    scrubFrameLoopRef: { current: undefined },
    scrubDiagnosticStateRef: { current: undefined },
    gestureRef: { current: undefined },
    interactiveControllerRef: { current: undefined },
    nativeSourceRef: { current: null },
  }
  const binding = bindTouchArbitration(host, context)
  const unbind = () => binding.dispose()
  return { navigator, controllers, host, context, unbind }
}

function touch(host: HTMLElement, type: string, x: number, timeStamp: number) {
  const point = { identifier: 1, clientX: x, clientY: 300 }
  const list = Object.assign([point], { item: (index: number) => [point][index] ?? null })
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    timeStamp: { value: timeStamp },
    touches: { value: type === 'touchend' ? Object.assign([], { item: () => null }) : list },
    changedTouches: { value: list },
  })
  host.dispatchEvent(event)
}

function swipe(host: HTMLElement, from: number, to: number, startAt: number) {
  touch(host, 'touchstart', from, startAt)
  for (let step = 1; step <= 6; step++)
    touch(host, 'touchmove', from + ((to - from) * step) / 6, startAt + step * 8)
  touch(host, 'touchend', to, startAt + 56)
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

it('accepts a back swipe the moment the push settles, with no glass-source gate', () => {
  const { navigator, controllers, host, unbind } = setup({ settlePush: true })
  swipe(host, 5, 200, 1000)
  const pop = controllers.find(controller => controller.interactive)
  expect(pop).toBeDefined()
  expect(navigator.getState().entries.at(-1)?.transition.phase).toBe('exiting')
  // Released with the lift's own event time.
  expect(pop!.resolved?.[4]).toBe(1056)
  unbind()
})

it('never accepts a contact begun during a push and then ignores it at recognition', () => {
  const { navigator, controllers, host, context, unbind } = setup({ settlePush: false })
  touch(host, 'touchstart', 5, 1000)
  // The push settles before the finger crosses the intent distance (owner g41, g34).
  controllers[0]!.finish()
  for (let step = 1; step <= 6; step++) touch(host, 'touchmove', 5 + step * 30, 1000 + step * 8)
  const pop = controllers.find(controller => controller.interactive)
  expect(pop).toBeDefined()
  expect(context.earlyTouchControllerRef.current).toBe(pop as InteractiveTransitionController)
  // The page follows the finger from the recognition frame (no frozen page).
  expect(pop!.progress).toBeGreaterThan(0)
  touch(host, 'touchend', 185, 1056)
  expect(pop!.resolved?.[4]).toBe(1056)
  expect(navigator.getState().entries).toHaveLength(2)
  unbind()
})

it('a swipe during a playing push turns the page around at its presented pose (native)', () => {
  const { navigator, controllers, host, unbind } = setup({ settlePush: false })
  expect(navigator[navigatorTransitionRuntime].descriptors()).toHaveLength(1)
  touch(host, 'touchstart', 5, 1000)
  for (let step = 1; step <= 3; step++) touch(host, 'touchmove', 5 + step * 12, 1000 + step * 8)
  const pop = controllers.find(controller => controller.interactive)
  expect(pop).toBeDefined()
  // Neither the push's end (0) nor the finger's own progress (~0.02): the in-flight pose.
  expect(pop!.progress).toBeCloseTo(0.6, 6)
  expect(navigator.getState().entries.at(-1)?.transition.phase).toBe('exiting')
  touch(host, 'touchend', 41, 1032)
  unbind()
})

it('a second swipe during the last pop completion has no pop target (owner 101), not a busy transition', () => {
  const { controllers, host, unbind } = setup({ settlePush: true })
  // First swipe pops to the root; its release is still completing when the second contact lands.
  touch(host, 'touchstart', 5, 1000)
  for (let step = 1; step <= 6; step++) touch(host, 'touchmove', 5 + step * 30, 1000 + step * 8)
  touch(host, 'touchend', 185, 1056)
  const first = controllers.find(controller => controller.interactive)!
  Object.defineProperty(first, 'interactionPhase', { value: 'completing' })
  touch(host, 'touchstart', 21, 1100)
  for (let step = 1; step <= 6; step++) touch(host, 'touchmove', 21 + step * 30, 1100 + step * 8)
  expect(controllers.filter(controller => controller.interactive)).toHaveLength(1)
  expect(preparation).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: 'navigation-gesture-gate',
      accepted: false,
      reason: 'no-pop-target',
    }),
  )
  unbind()
})
