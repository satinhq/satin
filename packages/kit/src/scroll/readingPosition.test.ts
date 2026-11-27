// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createScrollPositionController, type ScrollPositionOptions } from './position.ts'
import { createScrollSurfaceRegistry } from './registry.ts'

const cleanup: (() => void)[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup.splice(0).forEach(stop => stop())
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function fixture(options: ScrollPositionOptions = {}) {
  const surface = document.createElement('div')
  surface.dataset.satinScroll = 'reader'
  const content = document.createElement('div')
  surface.append(content)
  document.body.append(surface)
  let y = 500,
    width = 300,
    height = 200,
    extent = 2000,
    shift = 0,
    translated = 0
  const writes: number[] = []
  let synchronous = false
  const observers = new Set<() => void>()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observers.add(() =>
          callback(
            [{ target: surface }] as unknown as ResizeObserverEntry[],
            this as unknown as ResizeObserver,
          ),
        )
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperties(surface, {
    scrollTop: {
      get: () => y,
      set: value => {
        writes.push(value)
        y = Math.max(0, Math.min(extent - height, value))
        if (synchronous) surface.dispatchEvent(new Event('scroll'))
      },
    },
    clientWidth: { get: () => width },
    clientHeight: { get: () => height },
    scrollHeight: { get: () => extent },
  })
  surface.getBoundingClientRect = () => ({ top: 200, height }) as DOMRect
  surface.scrollTo = options => {
    surface.scrollTop = (options as ScrollToOptions).top ?? 0
  }
  const targets = new Map<string, HTMLElement>()
  const add = (id: string, position: number) => {
    const row = document.createElement('div')
    row.getBoundingClientRect = () =>
      ({ top: 200 + position + shift - y + translated, height: 50 }) as DOMRect
    content.append(row)
    targets.set(id, row)
    return row
  }
  for (let index = 0; index < 40; index++) add(String(index), index * 50)
  const registry = createScrollSurfaceRegistry({ development: false })
  let controller: ReturnType<typeof createScrollPositionController>
  cleanup.push(
    registry.register({
      id: 'reader',
      axis: 'vertical',
      primary: true,
      element: surface,
      captureReadingPosition: () => controller?.captureReadingPosition(),
      canRestoreReadingPosition: () => controller?.canRestoreReadingPosition() ?? false,
      restoreReadingAnchor: anchor => controller.restoreReadingAnchor(anchor),
      ownsScroll: () => controller?.ownsScroll() ?? false,
      // reference compatibility lets the red run exercise behavior rather than a renamed callback.
      readingAnchor: () => controller?.readingAnchor(),
      onRestore: () => controller.adoptRestoredOffset(),
    } as Parameters<typeof registry.register>[0]),
  )
  const mountingMeasurement = vi.spyOn(targets.get('10')!, 'getBoundingClientRect')
  controller = createScrollPositionController(
    surface,
    content,
    targets,
    () => options,
    () => registry.cancelRestoration('reader'),
  )
  const mountingReads = mountingMeasurement.mock.calls.length
  cleanup.push(controller.dispose)
  const idle = () => {
    surface.dispatchEvent(new Event('scrollend'))
    vi.advanceTimersByTime(151)
  }
  idle()
  const notify = () => {
    for (const callback of [...observers]) callback()
  }
  return {
    surface,
    content,
    targets,
    controller,
    mountingReads,
    writes,
    registry,
    add,
    idle,
    notify,
    capture: () => registry.capture().get('reader')!,
    scroll(value: number, emit = true) {
      y = value
      if (emit) surface.dispatchEvent(new Event('scroll'))
    },
    edit(amount: number) {
      shift += amount
      extent += amount
      controller.reconcile()
      notify()
    },
    grow(amount: number) {
      extent += amount
      controller.reconcile()
      notify()
    },
    resize() {
      width += 100
      notify()
    },
    translation(value: number) {
      translated = value
      content.style.transform = `matrix(1, 0, 0, 1, 0, ${value})`
    },
    synchronous() {
      synchronous = true
    },
  }
}
it('G1 leaves a drag and its post-release momentum alone when an image changes height', () => {
  const run = fixture()
  run.surface.dispatchEvent(new Event('touchstart'))
  run.surface.dispatchEvent(new Event('pointerdown'))
  window.dispatchEvent(new Event('pointercancel'))
  vi.advanceTimersByTime(200)
  run.edit(80)
  run.resize()
  expect(run.surface.scrollTop).toBe(500)
  run.surface.dispatchEvent(new Event('touchend'))
  window.dispatchEvent(new Event('pointerup'))
  run.scroll(570)
  run.edit(60)
  expect(run.surface.scrollTop).toBe(570)
  run.idle()
  expect(run.surface.scrollTop).toBe(570)
})
it('G2 drops a deferred viewport restore when the reader scrolls and rejects rubber-band captures', () => {
  const run = fixture()
  const saved = run.capture()
  run.surface.dispatchEvent(new Event('pointerdown'))
  run.scroll(570, false)
  run.resize()
  expect(run.surface.scrollTop).toBe(570)
  run.scroll(590)
  window.dispatchEvent(new Event('pointerup'))
  run.idle()
  expect(run.surface.scrollTop).toBe(590)
  const beforeBounce = run.capture()
  run.scroll(-30)
  expect(run.capture()).toEqual(beforeBounce)
  expect(run.capture().anchor?.top).not.toBe(30)
  expect(saved.anchor?.id).toBe('10')
})
it.each([
  ['search', -150],
  ['section collapse', -100],
  ['visible prepend', 100],
])('G3 does not restore a plain reading anchor for %s', (_name, amount) => {
  const run = fixture()
  run.edit(amount as number)
  expect(run.surface.scrollTop).toBe(500)
})
it('G4 falls back to saved pixels immediately for a deleted target and stops retrying it', () => {
  const run = fixture()
  run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: 'deleted', top: 0 } }]]))
  expect(run.surface.scrollTop).toBe(800)
  run.scroll(700, false)
  run.add('deleted', 1200)
  run.notify()
  expect(run.surface.scrollTop).toBe(700)
})
it.each([
  ['satinCovered', 'true'],
  ['satinRenderSuspended', 'true'],
  ['satinTransition', 'entering'],
  ['satinTransitionActive', 'true'],
])('G5 keeps the last checkpoint while %s blocks the screen', (key, value) => {
  const run = fixture()
  const saved = run.capture()
  const screen = document.createElement('div')
  screen.dataset.satinScreenContainer = 'true'
  screen.dataset[key] = value
  run.surface.replaceWith(screen)
  screen.append(run.surface)
  run.scroll(600, false)
  run.resize()
  expect(run.surface.scrollTop).toBe(600)
  expect(run.capture()).toEqual(saved)
})
it('G6 measures the same primary top inset as scrollTo', () => {
  const run = fixture()
  run.surface.dataset.satinPrimary = 'true'
  run.surface.style.paddingTop = '20px'
  run.scroll(535)
  expect(run.capture().anchor).toEqual({ id: '11', top: -5 })
  run.idle()
  run.controller.scrollTo('11', 'top')
  expect(run.surface.scrollTop).toBe(530)
})
it('G7 removes the pull-to-refresh release transform from checkpoint geometry without a correction', () => {
  const run = fixture()
  run.translation(80)
  run.controller.reconcile()
  expect(run.surface.scrollTop).toBe(500)
  expect(run.capture().anchor).toEqual({ id: '10', top: 0 })
})
it('G8 skips sticky headers and targets positioned by an inner scroller', () => {
  const run = fixture()
  run.targets.get('10')!.style.position = 'sticky'
  run.targets.get('10')!.getBoundingClientRect = () => ({ top: 200, height: 50 }) as DOMRect
  const inner = document.createElement('div')
  inner.dataset.satinScroll = 'inner'
  run.content.append(inner)
  inner.append(run.targets.get('11')!)
  expect(run.capture().anchor?.id).toBe('12')
})
it('G9 does not re-enter restoration when WebKit dispatches a synchronous scroll from the write', () => {
  const run = fixture()
  run.synchronous()
  run.resize()
  expect(run.surface.scrollTop).toBe(500)
})
it('G10 does not read target rectangles during scroll events', () => {
  const run = fixture()
  let reads = 0
  for (const row of run.targets.values()) {
    const measure = row.getBoundingClientRect
    row.getBoundingClientRect = () => {
      reads++
      return measure()
    }
  }
  for (let y = 510; y <= 570; y += 10) run.scroll(y)
  expect(reads).toBe(0)
  run.idle()
  expect(run.capture().anchor).toEqual({ id: '11', top: -20 })
})
it('G11 captures the anchor and pixels together even in the earlier registry scroll listener', () => {
  const run = fixture()
  let checkpoint = run.capture()
  cleanup.push(
    run.registry.subscribe(() => {
      checkpoint = run.capture()
    }),
  )
  run.scroll(570)
  expect(checkpoint).toMatchObject({ y: 570, anchor: { id: '11', top: -20 } })
  const bottom = fixture({ defaultScrollAnchor: 'bottom' })
  bottom.controller.scrollTo('39', 'bottom')
  bottom.idle()
  let visibility: DocumentVisibilityState = 'hidden'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
  document.dispatchEvent(new Event('visibilitychange'))
  bottom.edit(-100)
  bottom.scroll(1700, false)
  expect(bottom.capture()).toMatchObject({ y: 1800, atEnd: true })
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  expect(bottom.surface.scrollTop).toBe(1700)
})
it('G12 bounds late mounting and releases its observers after the pixel fallback', () => {
  const run = fixture()
  run.targets.clear()
  run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: 'late', top: 0 } }]]))
  vi.advanceTimersByTime(301)
  expect(run.surface.scrollTop).toBe(800)
  run.add('late', 1200)
  run.notify()
  expect(run.surface.scrollTop).toBe(800)
})

it('captures only at idle, hide and checkpoint, never on jump or restored-offset adoption', () => {
  const run = fixture()
  expect(run.mountingReads).toBe(0)
  const candidate = run.targets.get('1')!
  const measure = vi.spyOn(candidate, 'getBoundingClientRect')
  run.controller.scrollTo('12', 'top')
  expect(measure).not.toHaveBeenCalled()
  run.controller.adoptRestoredOffset()
  expect(measure).not.toHaveBeenCalled()
  run.registry.restore(new Map([['reader', { x: 0, y: 600, anchor: { id: '12', top: 0 } }]]))
  expect(measure).not.toHaveBeenCalled()
  run.scroll(650, false)
  run.controller.reconcile()
  expect(measure).not.toHaveBeenCalled()
  run.idle()
  expect(measure).toHaveBeenCalled()
  measure.mockClear()
  run.capture()
  expect(measure).toHaveBeenCalled()
})

it('gives following the end priority over a cached reading anchor on viewport change', () => {
  const run = fixture({ defaultScrollAnchor: 'bottom' })
  run.controller.scrollTo('39', 'bottom')
  run.idle()
  run.surface.dispatchEvent(new Event('wheel'))
  run.synchronous()
  run.edit(50)
  run.idle()
  expect(run.surface.scrollTop).toBe(1850)
  expect(run.controller.followsEnd()).toBe(true)
  run.writes.length = 0
  run.resize()
  expect(run.surface.scrollTop).toBe(1850)
  expect(run.writes).toEqual([])
})

it.each(['scrollTop', 'scrollTo', 'scrollIntoView', 'focus', 'VoiceOver'])(
  'reference cancels a pending cold restore after an external %s scroll',
  trigger => {
    const run = fixture()
    run.targets.clear()
    run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: 'late', top: 7 } }]]))
    if (trigger === 'scrollTo') run.surface.scrollTo({ top: 100 })
    else if (trigger === 'scrollTop') run.surface.scrollTop = 100
    else run.scroll(100, false) // These platform APIs emit only scroll on the owning surface.
    run.surface.dispatchEvent(new Event('scroll'))
    run.idle()
    run.add('late', 1000)
    run.notify()
    vi.advanceTimersByTime(301)
    expect(run.surface.scrollTop).toBe(100)
  },
)
it.each(['busy', 'missing'])(
  'reference queued kit scrollTo cancels a cold restore immediately: %s',
  reason => {
    const run = fixture()
    run.targets.clear()
    if (reason === 'busy') run.surface.dispatchEvent(new Event('keydown'))
    run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: 'late', top: 7 } }]]))
    run.controller.scrollTo('app', 'top')
    expect(run.registry.capture({ preservePending: true }).get('reader')?.anchor?.id).not.toBe(
      'late',
    )
    run.add('app', 200)
    run.idle()
    run.add('late', 1000)
    run.notify()
    vi.advanceTimersByTime(301)
    expect(run.surface.scrollTop).toBe(200)
  },
)
it('reference typing without scrolling keeps the pending cold restore', () => {
  const run = fixture()
  run.targets.clear()
  run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: 'late', top: 7 } }]]))
  const input = document.createElement('input')
  run.content.append(input)
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
  run.idle()
  run.add('late', 1000)
  run.notify()
  expect(run.surface.scrollTop).toBe(993)
})
it('reference a layout scroll accompanying a size change keeps the cold anchor pending', () => {
  const run = fixture()
  run.targets.clear()
  run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: 'late', top: 7 } }]]))
  run.resize()
  run.scroll(100)
  run.idle()
  run.add('late', 1000)
  run.notify()
  expect(run.surface.scrollTop).toBe(993)
})
it('reference waits for a nonempty target box before any cold-restore write', () => {
  const run = fixture()
  const row = run.targets.get('12')!
  const measure = row.getBoundingClientRect
  row.getBoundingClientRect = () => ({ top: 0, height: 0 }) as DOMRect
  run.writes.length = 0
  run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: '12', top: 5 } }]]))
  expect(run.writes).toEqual([])
  expect(run.surface.scrollTop).toBe(500)
  row.getBoundingClientRect = measure
  run.notify()
  expect(run.surface.scrollTop).toBe(595)
  expect(run.writes).toEqual([595])
})
it('reference restores an insertion above the hidden anchor without a size or offset change', () => {
  const run = fixture()
  let visibility: DocumentVisibilityState = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  run.edit(80)
  expect(run.surface.scrollTop).toBe(500)
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  expect(run.surface.scrollTop).toBe(580)
})

it('reference defers an expired pixel fallback through a layout-scroll burst instead of dropping it', () => {
  const run = fixture()
  run.targets.clear()
  run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: 'late', top: 0 } }]]))
  vi.advanceTimersByTime(200)
  run.resize()
  run.scroll(100)
  vi.advanceTimersByTime(101)
  expect(run.registry.capture({ preservePending: true }).get('reader')?.y).toBe(800)
  run.add('late', 1000)
  run.notify()
  vi.advanceTimersByTime(151)
  expect(run.surface.scrollTop).toBe(800)
})

it.each(['scrollTo', 'binding'])(
  'reference hidden kit %s replaces the anchor and stale bottom pin',
  kind => {
    const options: ScrollPositionOptions = {
      defaultScrollAnchor: 'bottom',
      scrollPosition: { id: null, onChange() {} },
    }
    const run = fixture(options)
    run.controller.scrollTo('39', 'bottom')
    run.idle()
    let visibility: DocumentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })
    cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    if (kind === 'scrollTo') run.controller.scrollTo('12', 'top')
    else {
      ;(options as { scrollPosition: ScrollPositionOptions['scrollPosition'] }).scrollPosition = {
        id: '12',
        anchor: 'top',
        onChange() {},
      }
      run.controller.reconcile()
    }
    expect(run.capture()).toMatchObject({ y: 600, anchor: { id: '12', top: 0 } })
    expect(run.capture().atEnd).toBeUndefined()
    expect(run.controller.followsEnd()).toBe(false)
    run.edit(80)
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    run.idle()
    expect(run.surface.scrollTop).toBe(680)
    expect(run.controller.followsEnd()).toBe(false)
  },
)

it('reference a later app jump cancels after the size-change turn ends', () => {
  const run = fixture()
  run.targets.clear()
  run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: 'late', top: 7 } }]]))
  run.resize()
  vi.advanceTimersByTime(1)
  run.scroll(100)
  run.idle()
  run.add('late', 1000)
  run.notify()
  expect(run.surface.scrollTop).toBe(100)
})
it('reference a controller bottom pin does not cancel the pending cold restore', () => {
  const run = fixture({ defaultScrollAnchor: 'bottom' })
  run.controller.scrollTo('39', 'bottom')
  run.idle()
  run.targets.clear()
  run.registry.restore(new Map([['reader', { x: 0, y: 800, anchor: { id: 'late', top: 7 } }]]))
  run.synchronous()
  run.edit(80)
  run.surface.dispatchEvent(new Event('scroll')) // WebKit can deliver our write asynchronously too.
  expect(run.registry.capture({ preservePending: true }).get('reader')?.anchor?.id).toBe('late')
  run.add('late', 1000)
  run.idle()
  run.notify()
  expect(run.surface.scrollTop).toBe(1073)
})

it.each(['direct', 'back to reported', 'same requested id'])(
  'reference hidden binding to the last reported id updates anchor and pin: %s',
  path => {
    let reported: string | null = null
    const options: ScrollPositionOptions = {
      defaultScrollAnchor: 'bottom',
      scrollPosition: {
        id: null,
        onChange(id) {
          reported = id
        },
      },
    }
    const run = fixture(options)
    const lastReported = reported!
    expect(lastReported).toBe('10')
    if (path === 'same requested id') {
      ;(options as { scrollPosition: ScrollPositionOptions['scrollPosition'] }).scrollPosition = {
        id: lastReported,
        anchor: 'top',
        onChange() {},
      }
      run.controller.reconcile()
    }
    let visibility: DocumentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })
    cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    if (path === 'back to reported') {
      run.controller.scrollTo('39', 'bottom')
      expect(run.controller.followsEnd()).toBe(true)
    }
    ;(options as { scrollPosition: ScrollPositionOptions['scrollPosition'] }).scrollPosition = {
      id: lastReported,
      anchor: 'bottom',
      onChange() {},
    }
    run.controller.reconcile()
    expect(run.capture()).toMatchObject({ y: 350, anchor: { id: lastReported, top: 150 } })
    expect(run.capture().atEnd).toBeUndefined()
    expect(run.controller.followsEnd()).toBe(false)
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    run.idle()
    expect(run.surface.scrollTop).toBe(350)
  },
)
it('reference hide capture retains a kit request from an earlier visibility listener', () => {
  let run: ReturnType<typeof fixture>
  const jump = () => {
    if (document.visibilityState === 'hidden') run.controller.scrollTo('12', 'top')
  }
  document.addEventListener('visibilitychange', jump)
  cleanup.push(() => document.removeEventListener('visibilitychange', jump))
  run = fixture({ defaultScrollAnchor: 'bottom' })
  let visibility: DocumentVisibilityState = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  expect(run.capture()).toMatchObject({ y: 600, anchor: { id: '12', top: 0 } })
  run.edit(80)
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  run.idle()
  expect(run.surface.scrollTop).toBe(680)
  expect(run.controller.followsEnd()).toBe(false)
})

it('reference aligns a hidden binding when its controller and requested row mount while hidden', () => {
  let visibility: DocumentVisibilityState = 'hidden'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
  const options: ScrollPositionOptions = { scrollPosition: { id: null, onChange() {} } }
  const run = fixture(options)
  ;(options as { scrollPosition: ScrollPositionOptions['scrollPosition'] }).scrollPosition = {
    id: 'late',
    anchor: 'bottom',
    onChange() {},
  }
  run.controller.reconcile()
  run.add('late', 1000)
  run.synchronous()
  run.writes.length = 0
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  expect(run.surface.scrollTop).toBe(850)
  expect(run.writes).toEqual([850])
  run.idle()
  expect(run.surface.scrollTop).toBe(850)
})

it('preserves accepted end-follow semantics after a hidden terminal jump and append', () => {
  const run = fixture({ defaultScrollAnchor: 'bottom' })
  run.controller.scrollTo('39', 'bottom')
  run.idle()
  let visibility: DocumentVisibilityState = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  cleanup.push(() => delete (document as { visibilityState?: unknown }).visibilityState)
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  run.controller.scrollTo('39', 'top')
  expect(run.capture().atEnd).toBe(true)
  run.grow(500)
  run.synchronous()
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  run.idle()
  expect(run.surface.scrollTop).toBe(2300)
  expect(run.controller.followsEnd()).toBe(true)
})
