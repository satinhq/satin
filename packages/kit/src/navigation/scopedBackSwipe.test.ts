// @vitest-environment happy-dom
// Reuse gate: the back swipe expressed on the private gesture scope must make
// exactly the decisions the shipping driver makes. Both drivers replay the same delivered touch
// traces; every controller call, motion record and diagnostic must match. The traces are the
// native finger paths retained in nativeRelease.fixture.json plus arbitration cases.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import nativeRelease from './nativeRelease.fixture.json'
import { createScreenRegistry, defineScreen } from './registry.ts'
import { createNavigator } from './store.ts'
import { bindTouchArbitration, type TouchArbitrationContext } from './touchArbitration.ts'
import { bindScopedBackSwipe } from './scopedBackSwipe.ts'
import type { TransitionController, TransitionControllerFactory } from './types.ts'

const records = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('../motionProbe.ts', () => ({
  recordMotionPreparation: (make: unknown) =>
    records.list.push(typeof make === 'function' ? (make as () => unknown)() : make),
}))

function EmptyScreen() {
  return null
}

const registry = createScreenRegistry(
  defineScreen('root', { component: EmptyScreen }),
  defineScreen('detail', { component: EmptyScreen }),
)

type Step = Readonly<{
  type: 'touchcancel' | 'touchend' | 'touchmove' | 'touchstart'
  time: number
  x: number
  y: number
  identifier?: number
  /** Touches still down after this event (multi-touch cases). */
  down?: readonly Readonly<{ identifier: number; x: number; y: number }>[]
}>

type Trace = Readonly<{ name: string; steps: readonly Step[] }>

/** Timestamps, wall-clock fields and generated screen keys differ between runs; decisions
 * must not. */
function stripClock(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripClock)
  if (typeof value === 'string') return value.replace(/^satin-screen-detail-.*$/, 'detail-key')
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'at' && key !== 'observedAt')
      .map(([key, field]) => [key, stripClock(field)]),
  )
}

function setup(driver: 'scope' | 'shipping', options: { native: boolean; settlePush: boolean }) {
  const calls: unknown[] = []
  const factory: TransitionControllerFactory = (completion, transitionContext) => {
    let completed = false
    let progress = 0
    const index = calls.length
    const log = (name: string, ...args: unknown[]) => calls.push([index, name, ...args])
    const controller: TransitionController = {
      get progress() {
        return progress
      },
      start() {
        log('start', transitionContext.interactive)
      },
      setProgress(next) {
        log('setProgress', next)
        progress = next
      },
      scrubFromScroll(source, origin, adjustment) {
        log('scrubFromScroll', source.id, origin, adjustment)
      },
      resolveInteractive(...args) {
        log('resolveInteractive', ...args)
        controller.cancel()
      },
      completeInteractive(...args) {
        log('completeInteractive', ...args)
        controller.finish()
      },
      cancelInteractive(...args) {
        log('cancelInteractive', ...args)
        controller.cancel()
      },
      prepareForNextGesture() {
        log('prepareForNextGesture')
      },
      presentedPose: transitionContext.interactive ? undefined : () => 0.6,
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
    return controller
  }
  const navigator = createNavigator({
    registry,
    initial: { id: 'root' },
    transitionControllerFactory: factory,
  })
  navigator.push('detail')
  const pushController = navigator.getState().entries.at(-1)?.transition
  if (options.settlePush && pushController && 'controller' in pushController) {
    ;(pushController.controller as TransitionController).finish()
  }
  const host = document.createElement('div')
  const source = document.createElement('div')
  source.id = 'stack-source'
  document.body.append(source, host)
  const diagnostics: unknown[] = []
  const frameLoop: unknown[] = []
  const context: TouchArbitrationContext = {
    navigator,
    nativeNavigation: options.native,
    automaticPushActive: !options.settlePush,
    split: false,
    horizontal: 'compact',
    appliedHorizontal: 'compact',
    onInteractivePopDiagnostic: diagnostic => diagnostics.push(diagnostic),
    startScrubFrameLoop: () => {
      const loop = {
        dispose: () => frameLoop.push(['dispose']),
        record: (progress: number, time: number) => frameLoop.push(['record', progress, time]),
        resolve: (...args: unknown[]) => frameLoop.push(['resolve', ...args]),
      }
      frameLoop.push(['start'])
      context.scrubFrameLoopRef.current = loop as never
      return loop as never
    },
    hostGeometryRef: { current: { left: 0, top: 0, width: 400 } },
    earlyTouchArbitrationRef: { current: undefined },
    earlyTouchControllerRef: { current: undefined },
    scrubFrameLoopRef: { current: undefined },
    scrubDiagnosticStateRef: { current: undefined },
    gestureRef: { current: undefined },
    interactiveControllerRef: { current: undefined },
    nativeSourceRef: { current: source },
  }
  const binding =
    driver === 'scope' ? bindScopedBackSwipe(host, context) : bindTouchArbitration(host, context)
  return { host, calls, diagnostics, frameLoop, navigator, binding }
}

function touchList(points: readonly Readonly<{ identifier: number; x: number; y: number }>[]) {
  const touches = points.map(point => ({
    identifier: point.identifier,
    clientX: point.x,
    clientY: point.y,
  }))
  return Object.assign(touches, { item: (index: number) => touches[index] ?? null })
}

const frames: FrameRequestCallback[] = []

function dispatch(host: HTMLElement, step: Step) {
  const identifier = step.identifier ?? 1
  const changed = touchList([{ identifier, x: step.x, y: step.y }])
  const lifting = step.type === 'touchend' || step.type === 'touchcancel'
  const down = step.down ?? (lifting ? [] : [{ identifier, x: step.x, y: step.y }])
  const event = new Event(step.type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    timeStamp: { value: step.time },
    touches: { value: touchList(down) },
    changedTouches: { value: changed },
  })
  host.dispatchEvent(event)
  // Flush the scrub attachment frame after every delivered sample, identically for both drivers.
  for (const callback of frames.splice(0)) callback(step.time)
}

function run(
  trace: Trace,
  driver: 'scope' | 'shipping',
  options: { native: boolean; settlePush: boolean },
) {
  records.list = []
  const harness = setup(driver, options)
  for (const step of trace.steps) dispatch(harness.host, step)
  const result = {
    calls: harness.calls,
    records: stripClock(records.list),
    diagnostics: harness.diagnostics,
    frameLoop: harness.frameLoop,
    entries: harness.navigator.getState().entries.map(entry => entry.screenId),
  }
  harness.binding.dispose()
  document.body.innerHTML = ''
  return result
}

type NativeCase = Readonly<{
  name: string
  events: readonly Readonly<{ state: number; time: number; panX: number; samples: number[][] }>[]
}>

/** A native finger path: the began event's retained history, then each change's translation. */
function nativeTrace(nativeCase: NativeCase): Trace {
  const began = nativeCase.events[0]!
  const history = began.samples
  const steps: Step[] = []
  const [, startX] = history[0]!
  steps.push({ type: 'touchstart', time: 1000, x: startX!, y: 300 })
  for (const [time, x] of history.slice(1))
    steps.push({ type: 'touchmove', time: 1000 + time!, x: x!, y: 300 })
  const beganX = history.at(-1)![1]!
  for (const event of nativeCase.events.slice(1)) {
    const x = beganX + event.panX - began.panX
    const type = event.state === 3 ? 'touchend' : event.state === 4 ? 'touchcancel' : 'touchmove'
    steps.push({ type, time: 1000 + event.time, x, y: 300 })
  }
  return { name: nativeCase.name, steps }
}

/** A straight path at `angle` degrees below horizontal (positive x = rightward). */
function line(
  name: string,
  dx: number,
  dy: number,
  end: 'touchcancel' | 'touchend' = 'touchend',
): Trace {
  const steps: Step[] = [{ type: 'touchstart', time: 0, x: 40, y: 300 }]
  for (let index = 1; index <= 12; index++) {
    steps.push({
      type: 'touchmove',
      time: index * 8,
      x: 40 + (dx * index) / 12,
      y: 300 + (dy * index) / 12,
    })
  }
  steps.push({ type: end, time: 104, x: 40 + dx, y: 300 + dy })
  return { name, steps }
}

const arbitrationTraces: Trace[] = [
  line('vertical', 4, 160),
  line('leftward', -160, 4),
  line('diagonal-30', 160, 92),
  line('diagonal-40', 160, 134),
  line('diagonal-50', 140, 167),
  line('cancelled-mid-swipe', 220, 6, 'touchcancel'),
  {
    name: 'tap',
    steps: [
      { type: 'touchstart', time: 0, x: 60, y: 300 },
      { type: 'touchend', time: 90, x: 60, y: 300 },
    ],
  },
  {
    name: 'second-finger-during-swipe',
    steps: [
      { type: 'touchstart', time: 0, x: 20, y: 300 },
      { type: 'touchmove', time: 16, x: 60, y: 302 },
      { type: 'touchmove', time: 32, x: 110, y: 304 },
      {
        type: 'touchstart',
        time: 40,
        x: 300,
        y: 500,
        identifier: 2,
        down: [
          { identifier: 1, x: 110, y: 304 },
          { identifier: 2, x: 300, y: 500 },
        ],
      },
      {
        type: 'touchmove',
        time: 48,
        x: 150,
        y: 304,
        down: [
          { identifier: 1, x: 150, y: 304 },
          { identifier: 2, x: 300, y: 500 },
        ],
      },
      {
        type: 'touchend',
        time: 56,
        x: 300,
        y: 500,
        identifier: 2,
        down: [{ identifier: 1, x: 150, y: 304 }],
      },
      { type: 'touchmove', time: 64, x: 190, y: 304 },
      { type: 'touchend', time: 72, x: 190, y: 304 },
    ],
  },
  {
    name: 'two-swipes-back-to-back',
    steps: [
      ...line('first', 260, 4).steps,
      ...line('second', 200, 2).steps.map(step => ({ ...step, time: step.time + 140 })),
    ],
  },
]

const nativeTraces = (nativeRelease as unknown as NativeCase[]).map(nativeTrace)

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
})

afterEach(() => {
  frames.length = 0
  vi.unstubAllGlobals()
})

it.each([...nativeTraces, ...arbitrationTraces].map(trace => [trace.name, trace] as const))(
  'native scrub: %s makes identical decisions through the gesture scope',
  (_name, trace) => {
    const options = { native: true, settlePush: true }
    const shipping = run(trace, 'shipping', options)
    const scoped = run(trace, 'scope', options)
    expect(scoped).toEqual(shipping)
  },
)

it.each(arbitrationTraces.map(trace => [trace.name, trace] as const))(
  'frame-loop driver: %s makes identical decisions through the gesture scope',
  (_name, trace) => {
    const options = { native: false, settlePush: true }
    expect(run(trace, 'scope', options)).toEqual(run(trace, 'shipping', options))
  },
)

it('a contact during an automatic push takes it over identically through the scope', () => {
  const trace = line('push-takeover', 240, 6)
  const options = { native: true, settlePush: false }
  const shipping = run(trace, 'shipping', options)
  expect(shipping.calls.some(call => (call as unknown[])[1] === 'setProgress')).toBe(true)
  expect(run(trace, 'scope', options)).toEqual(shipping)
})

it('the native traces exercise recognition, scrub attachment and release', () => {
  const options = { native: true, settlePush: true }
  const names = new Set<string>()
  for (const trace of nativeTraces) {
    for (const call of run(trace, 'shipping', options).calls)
      names.add(String((call as unknown[])[1]))
  }
  expect([...names]).toEqual(expect.arrayContaining(['scrubFromScroll', 'resolveInteractive']))
})
