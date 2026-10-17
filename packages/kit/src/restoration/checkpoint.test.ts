// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { cloneSceneValue, createSceneRestoration, isSerializableState } from './scene.ts'
import {
  createNavigator,
  navigatorScrollRuntime,
  navigatorTransitionRuntime,
} from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const registry = createScreenRegistry(
  defineScreen('root', {
    component: () => null,
    restoration: { version: 1, validate: (v): v is undefined => v === undefined },
  }),
  defineScreen('detail', {
    component: () => null,
    restoration: { version: 1, validate: (v): v is undefined => v === undefined },
  }),
)
function setup() {
  vi.useFakeTimers()
  // Deterministic idle task, distinct from the caller's event/animation stack.
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 1))
  vi.stubGlobal('cancelIdleCallback', clearTimeout)
  const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }
  const scene = createSceneRestoration({ id: 'checkpoint', storage })
  const nav = createNavigator({
    registry,
    initial: { id: 'root' },
    restoration: { scene, key: 'home' },
    transitionControllerFactory: completion => ({
      progress: 0,
      finish: completion.finish,
      cancel: completion.cancel,
    }),
  })
  const scroll = createScrollSurfaceRegistry({ development: false })
  const element = document.createElement('div')
  element.scrollTo = (options?: ScrollToOptions | number, y?: number) => {
    element.scrollTop = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0)
  }
  scroll.register({ id: 'list', axis: 'vertical', primary: true, element })
  nav[navigatorScrollRuntime].bind(nav.getState().entries[0]!.key, scroll)
  return { scene, nav, scroll, element, storage }
}
it('coalesces a scroll burst and reads the latest position only in the quiet idle task', () => {
  const { scene, element, storage } = setup()
  for (let i = 1; i <= 10; i++) {
    element.scrollTop = i * 20
    element.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(16)
    expect(storage.setItem).not.toHaveBeenCalled()
  }
  vi.advanceTimersByTime(101)
  expect(storage.setItem).toHaveBeenCalledTimes(1)
  expect((scene.read('navigation:home') as any)[0].scroll).toEqual([['list', { x: 0, y: 200 }]])
})
it('does not write during transitions, including a scene value update', () => {
  const { scene, nav, storage } = setup()
  nav.push('detail')
  scene.write('draft', 'typing')
  vi.advanceTimersByTime(500)
  expect(storage.setItem).not.toHaveBeenCalled()
  nav.getState().entries.at(-1)!.transition.controller.finish()
  expect(storage.setItem).not.toHaveBeenCalled()
  vi.advanceTimersByTime(101)
  expect(storage.setItem).toHaveBeenCalledTimes(1)
})
it.each(['pagehide', 'visibilitychange'])(
  'flushes the latest scroll and draft on %s even during a transition',
  event => {
    const { scene, nav, element, storage } = setup(),
      disconnect = scene.connect()
    element.scrollTop = 700
    element.dispatchEvent(new Event('scroll'))
    nav.push('detail')
    scene.write('draft', 'last keystroke')
    if (event === 'visibilitychange') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      document.dispatchEvent(new Event(event))
    } else window.dispatchEvent(new Event(event))
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(storage.setItem.mock.calls[0]![1])
    expect(saved.values.draft).toBe('last keystroke')
    expect(saved.values['navigation:home'][0].scroll[0][1].y).toBe(700)
    vi.advanceTimersByTime(101)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    disconnect()
    vi.restoreAllMocks()
  },
)
it.each(['quiet', 'pagehide'])(
  'checkpoints cancellation at live zero at the %s boundary without a scroll event',
  boundary => {
    const { scene, nav, scroll, element, storage } = setup(),
      disconnect = scene.connect()
    scroll.restore(new Map([['list', { x: 0, y: 600 }]]))
    expect(element.scrollTop).toBe(0)
    scene.flush()
    storage.setItem.mockClear()
    nav[navigatorScrollRuntime].scrollPrimaryToTop(nav.getState().entries[0]!.key)
    // Memory intent is cancelled immediately; lifecycle flush persists it even
    // if WebKit never sends scroll for scrollTo(0) on an already empty list.
    expect(scroll.capture({ preservePending: true }).get('list')!.y).toBe(0)
    if (boundary === 'pagehide') window.dispatchEvent(new Event('pagehide'))
    else vi.advanceTimersByTime(101)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(
      JSON.parse(storage.setItem.mock.calls[0]![1]).values['navigation:home'][0].scroll[0][1].y,
    ).toBe(0)
    disconnect()
  },
)
it('rejects sparse arrays, symbol properties and accessors without changing live state', () => {
  const { scene } = setup()
  scene.write('draft', 'original')
  for (const value of [
    new Array(3),
    { [Symbol('hidden')]: 'lost' },
    {
      get text() {
        return 'lossy'
      },
    },
  ]) {
    expect(isSerializableState(value)).toBe(false)
    expect(scene.write('draft', value)).toBe(false)
    expect(scene.read('draft')).toBe('original')
  }
})
it('validates the cloned value against the schema, not the input identity', () => {
  const original = { text: 'same' }
  expect(() =>
    cloneSceneValue(original, {
      version: 1,
      initial: original,
      validate: (v): v is typeof original => v === original,
    }),
  ).toThrow('Invalid scene state')
  expect(
    cloneSceneValue(original, {
      version: 1,
      initial: original,
      validate: (v): v is typeof original =>
        !!v && typeof v === 'object' && 'text' in v && v.text === 'same',
    }),
  ).toEqual(original)
})

it('uses a quiet timer task when requestIdleCallback is unavailable', () => {
  const { scene, storage } = setup()
  vi.stubGlobal('requestIdleCallback', undefined)
  scene.write('draft', 'fallback')
  expect(storage.setItem).not.toHaveBeenCalled()
  vi.advanceTimersByTime(99)
  expect(storage.setItem).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(storage.setItem).toHaveBeenCalledTimes(1)
})

it.each(['complete', 'cancel'] as const)(
  'does not capture or persist a near-limit scene while a back swipe is held or resolving: %s',
  outcome => {
    const { scene, storage } = setup()
    const capture = vi.fn()
    let resolve!: () => void
    const nav = createNavigator({
      registry,
      initial: { id: 'root' },
      restoration: { scene, key: 'gesture' },
      transitionControllerFactory: (completion, context) => {
        let phase: 'held' | 'completing' | 'cancelling' = context.interactive
          ? 'held'
          : 'completing'
        resolve = outcome === 'complete' ? completion.finish : completion.cancel
        return {
          progress: 0,
          get interactionPhase() {
            return phase
          },
          start() {
            if (!context.interactive) completion.finish()
          },
          setProgress() {},
          finish: completion.finish,
          cancel: completion.cancel,
          completeInteractive() {
            phase = 'completing'
            completion.changed?.()
          },
          cancelInteractive() {
            phase = 'cancelling'
            completion.changed?.()
          },
        }
      },
    })
    nav.push('detail')
    scene.write('large', 'x'.repeat(129000))
    scene.checkpoint('probe', capture, () => false)
    const controller = nav[navigatorTransitionRuntime].beginInteractivePop()!
    for (let i = 0; i < 40; i++) {
      controller.setProgress(i / 100)
      vi.advanceTimersByTime(20)
    }
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    if (outcome === 'complete') controller.completeInteractive(500)
    else controller.cancelInteractive(0)
    vi.advanceTimersByTime(500)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    resolve()
    vi.advanceTimersByTime(101)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(nav.getState().entries).toHaveLength(outcome === 'complete' ? 1 : 2)
  },
)

it('bounds continuous activity at two seconds and writes at a frame boundary', () => {
  const { scene, storage, element } = setup()
  scene.write('large', 'x'.repeat(129000))
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  for (let i = 0; i < 40; i++) {
    element.scrollTop = i * 20
    element.dispatchEvent(new Event('scroll'))
    scene.write('draft', i)
    vi.advanceTimersByTime(50)
    expect(storage.setItem).not.toHaveBeenCalled()
  }
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(frames).toHaveLength(1)
  frames.shift()!(2000)
  expect(storage.setItem).toHaveBeenCalledTimes(1)
  expect(JSON.parse(storage.setItem.mock.calls[0]![1]).values.draft).toBe(39)
})

it('defers an expired deadline through held and resolving interactive ownership', () => {
  const { scene, storage } = setup()
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  let finish!: () => void
  const nav = createNavigator({
    registry,
    initial: { id: 'root' },
    restoration: { scene, key: 'held-deadline' },
    transitionControllerFactory: (completion, context) => {
      let phase: 'held' | 'completing' = 'held'
      finish = completion.finish
      return {
        progress: 0,
        get interactionPhase() {
          return context.interactive ? phase : undefined
        },
        start() {
          if (!context.interactive) completion.finish()
        },
        finish: completion.finish,
        cancel: completion.cancel,
        setProgress() {},
        completeInteractive() {
          phase = 'completing'
          completion.changed?.()
        },
        cancelInteractive: completion.cancel,
      }
    },
  })
  nav.push('detail')
  const pop = nav[navigatorTransitionRuntime].beginInteractivePop()!
  for (let i = 0; i < 50; i++) {
    scene.write('draft', i)
    vi.advanceTimersByTime(50)
  }
  expect(frames).toHaveLength(0)
  expect(storage.setItem).not.toHaveBeenCalled()
  pop.completeInteractive(100)
  vi.advanceTimersByTime(2500)
  expect(frames).toHaveLength(0)
  expect(storage.setItem).not.toHaveBeenCalled()
  finish()
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(frames).toHaveLength(1)
  frames.shift()!(5000)
  expect(storage.setItem).toHaveBeenCalledTimes(1)
})

it('rechecks interactive ownership acquired after the deadline frame was scheduled', () => {
  const { scene, storage } = setup()
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  let held = false
  scene.checkpoint(
    'ownership',
    () => {},
    () => held,
    () => held,
  )
  for (let i = 0; i < 40; i++) {
    scene.write('draft', i)
    vi.advanceTimersByTime(50)
  }
  held = true
  frames.shift()!(2000)
  expect(storage.setItem).not.toHaveBeenCalled()
  held = false
  scene.write('draft', 'released')
  frames.shift()!(2001)
  expect(storage.setItem).toHaveBeenCalledTimes(1)
})

it('checkpoints the accepted destination at the deadline during continuous automatic transitions', () => {
  const { scene, nav, storage } = setup()
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  nav.push('detail')
  for (let i = 0; i < 40; i++) {
    scene.write('draft', i)
    vi.advanceTimersByTime(50)
  }
  expect(nav.getState().entries.at(-1)?.transition.phase).toBe('entering')
  expect(storage.setItem).not.toHaveBeenCalled()
  frames.shift()!(2000)
  expect((scene.readPersisted('navigation:home') as any[]).at(-1).screen).toBe('detail')
  expect(storage.setItem).toHaveBeenCalledTimes(1)
})
