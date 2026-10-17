import { readFileSync } from 'node:fs'
import { Row, Toggle } from '../list-form/ListForm.tsx'
// @vitest-environment happy-dom
import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NavigatorHost } from './NavigatorHost.tsx'
import {
  NATIVE_SCRUB_REARM_COMMIT_MS,
  rearmNativeScrubSource,
  retireNativeScrubSource,
} from './motion.ts'
import { createNavigator } from './store.ts'
import { createScreenRegistry, defineScreen } from './registry.ts'
import type { TransitionController, TransitionControllerContext } from './types.ts'

vi.mock('../root/runtimeContext.ts', () => ({
  useSatinLayoutRuntime: () => ({
    layoutClass: { horizontal: 'compact' },
    metrics: { layoutViewport: { width: 400 }, screen: { width: 400, height: 874 } },
  }),
}))
vi.mock('./NavigationChrome.tsx', () => ({ NavigationChrome: () => null }))
vi.mock('../reachability/react.tsx', () => ({
  ReachabilityRoute: ({ children }: { children: React.ReactNode }) => children,
}))

type FakePop = TransitionController & { log: string[]; context: TransitionControllerContext }
let stylesheet: HTMLStyleElement
let root: Root, element: HTMLDivElement, frames: FrameRequestCallback[], now: number

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  stylesheet = document.createElement('style')
  stylesheet.textContent = readFileSync('src/styles.css', 'utf8')
  document.head.append(stylesheet)
  frames = []
  now = 1_000
  vi.spyOn(CSS, 'supports').mockReturnValue(true)
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('ScrollTimeline', class {})
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames[id - 1] = () => {}
  })
  window.requestAnimationFrame = globalThis.requestAnimationFrame
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 874,
    right: 400,
    bottom: 874,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(() => {
  act(() => root.unmount())
  element.remove()
  stylesheet.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const flushFrames = () =>
  act(() => {
    const queued = frames.splice(0)
    queued.forEach(callback => callback(now))
  })

function touch(
  type: string,
  x: number,
  timeStamp: number,
  active = type !== 'touchend',
  target?: Element,
  y = 300,
  cancelable = true,
) {
  const point = { identifier: 7, clientX: x, clientY: y }
  const event = new Event(type, { bubbles: true, cancelable })
  Object.defineProperties(event, {
    changedTouches: { value: Object.assign([point], { item: () => point }) },
    touches: { value: active ? [point] : [] },
    timeStamp: { value: timeStamp },
  })
  act(() => {
    ;(target ?? host()).dispatchEvent(event)
  })
  return event
}
const host = () => element.querySelector<HTMLElement>('[data-satin-navigator-host]')!
const source = () => element.querySelector<HTMLElement>('[data-satin-native-scrub]')!

function setup(actionRow: boolean | 'leading' = false, detail?: () => ReactNode) {
  const pops: FakePop[] = []
  const registry = createScreenRegistry(
    defineScreen('home', { component: () => <span>Home</span> }),
    defineScreen('detail', {
      component:
        detail ??
        (() =>
          actionRow ? (
            <Row
              label="Detail"
              swipeActions={
                actionRow === 'leading'
                  ? { edge: 'leading', actions: [{ id: 'pin', label: 'Pin', onPress() {} }] }
                  : { edge: 'trailing', actions: [{ id: 'delete', label: 'Delete', onPress() {} }] }
              }
            />
          ) : (
            <span>Detail</span>
          )),
    }),
  )
  const navigator = createNavigator({
    registry,
    initial: { id: 'home' },
    transitionControllerFactory: (completion, context) => {
      if (!context.interactive) {
        return {
          progress: 1,
          start: () => completion.finish(),
          finish: completion.finish,
          cancel: completion.cancel,
        }
      }
      const log: string[] = []
      const pop: FakePop = {
        log,
        context,
        progress: 0,
        interactionPhase: 'held',
        bind: () => () => {},
        setProgress: progress => {
          log.push(`set ${progress.toFixed(3)}`)
        },
        scrubFromScroll: () => {
          log.push('scroll-timeline')
        },
        resolveInteractive: () => {
          log.push('release')
          // Releasing: its document-timeline animation is now in flight.
          ;(pop as { interactionPhase: string }).interactionPhase = 'completing'
        },
        completeInteractive: () => {},
        cancelInteractive: () => {},
        finish: completion.finish,
        cancel: completion.cancel,
      }
      pops.push(pop)
      return pop
    },
  })
  return { navigator, pops }
}

it('drives a contact that touched down on a retired source from touch input, and a later one from the source', () => {
  const { navigator, pops } = setup()
  act(() => {
    navigator.push('detail')
    navigator.push('detail')
  })
  act(() => root.render(<NavigatorHost navigator={navigator} />))
  expect(source().style.overflowX).toBe('scroll')

  // The previous pop's release retired the shared source; the next contact
  // lands before that retirement is re-armed (owner phone: 104-130 ms gaps).
  retireNativeScrubSource(source(), source().clientWidth * 2)
  touch('touchstart', 4, now - 1)
  touch('touchmove', 45, now + 8)
  touch('touchmove', 120, now + 16)
  flushFrames()
  const contact = pops[0]!
  expect(contact.log).not.toContain('scroll-timeline')
  // One write per frame of the newest sample, 1:1 with the finger past the
  // recognition boundary (the touch-down is the last sample inside it).
  expect(contact.log.filter(entry => entry.startsWith('set'))).toEqual([
    `set ${((120 - 4) / 400).toFixed(3)}`,
  ])
  touch('touchmove', 200, now + 24)
  touch('touchend', 250, now + 32)
  expect(contact.log.at(-1)).toBe('release')
  // No queued frame may repaint the page after its release began.
  flushFrames()
  expect(contact.log.at(-1)).toBe('release')

  // Once re-armed and committed, the next contact owns the native source.
  act(() => {
    contact.cancel()
  })
  expect(rearmNativeScrubSource(source())).toBe(false)
  now += NATIVE_SCRUB_REARM_COMMIT_MS + 1
  touch('touchstart', 4, now)
  touch('touchmove', 45, now + 8)
  flushFrames()
  expect(pops[1]!.log).toEqual(['scroll-timeline'])
})

it('never starts a ScrollTimeline scrub while another pop is still releasing', () => {
  // Owner phone 2026-09-24 and Simulator (6/10 baseline runs): a scroll-driven
  // scrub beside a document-timeline release left a stale compositor pose that
  // reappeared when the release ended. The live source is not used then.
  const { navigator, pops } = setup()
  act(() => {
    navigator.push('detail')
    navigator.push('detail')
  })
  act(() => root.render(<NavigatorHost navigator={navigator} />))
  touch('touchstart', 4, now)
  touch('touchmove', 45, now + 8)
  flushFrames()
  expect(pops[0]!.log).toEqual(['scroll-timeline'])
  touch('touchend', 250, now + 110)
  expect(pops[0]!.interactionPhase).toBe('completing')

  now += 100 // Next flick while the first release is still animating.
  touch('touchstart', 4, now)
  touch('touchmove', 45, now + 8)
  touch('touchmove', 150, now + 16)
  flushFrames()
  expect(pops).toHaveLength(2)
  expect(pops[1]!.log).not.toContain('scroll-timeline')
  expect(pops[1]!.log).toEqual([`set ${((150 - 4) / 400).toFixed(3)}`])
})

it('commits vertical native panning before a pushed row contact and keeps interior swipes on the row', () => {
  const { navigator, pops } = setup(true)
  act(() => root.render(<NavigatorHost navigator={navigator} />))
  expect(host().style.getPropertyValue('--satin-row-swipe-touch-action')).toBe('pan-y')
  act(() => {
    navigator.push('detail')
  })
  expect(host().style.getPropertyValue('--satin-row-swipe-touch-action')).toBe(
    'pan-y pan-right pinch-zoom',
  )
  const row = element.querySelector<HTMLElement>('[data-satin-row-swipe]')!
  expect(getComputedStyle(row).touchAction).toBe('pan-y')
  touch('touchstart', 180, now, true, row)
  touch('touchmove', 130, now + 40, true, row)
  expect(row.dataset.satinSwipeActive).toBe('true')
  expect(pops).toHaveLength(0)
  touch('touchcancel', 130, now + 50, false, row)
  touch('touchstart', 180, now + 100, true, row)
  touch('touchmove', 240, now + 140, true, row)
  flushFrames()
  expect(pops).toHaveLength(0)
  expect(row.dataset.satinSwipeActive).not.toBe('true')
})

it('opens leading actions in the interior but yields an edge-start contact to Back', () => {
  const { navigator, pops } = setup('leading')
  act(() => {
    navigator.push('detail')
    root.render(<NavigatorHost navigator={navigator} />)
  })
  const row = element.querySelector<HTMLElement>('[data-satin-row-swipe]')!
  touch('touchstart', 180, now, true, row)
  touch('touchmove', 240, now + 40, true, row)
  flushFrames()
  expect(row.dataset.satinSwipeActive).toBe('true')
  expect(pops).toHaveLength(0)
  touch('touchcancel', 240, now + 50, false, row)
  touch('touchstart', 4, now + 100, true, row)
  touch('touchmove', 90, now + 140, true, row)
  flushFrames()
  expect(row.dataset.satinSwipeActive).not.toBe('true')
  expect(pops).toHaveLength(1)
  expect(pops[0]!.log).not.toContain('scroll-timeline')
})

it.each([
  ['leading', 1],
  ['trailing', -1],
] as const)(
  'settles the pushed row %s tray from finger travel when the native source only moves 28 points',
  (_side, sign) => {
    const { navigator, pops } = setup(false, () => (
      <Row
        label="Song"
        swipeActions={[
          { edge: 'leading', allowsFullSwipe: false, actions: [{ id: 'next', label: 'Next' }] },
          { edge: 'trailing', allowsFullSwipe: false, actions: [{ id: 'queue', label: 'Queue' }] },
        ]}
      />
    ))
    act(() => {
      navigator.push('detail')
      root.render(<NavigatorHost navigator={navigator} />)
    })
    const row = element.querySelector<HTMLElement>('[data-satin-row-swipe]')!
    const native = row.querySelector<HTMLElement>('[data-satin-row-scrub]')!
    const content = row.querySelector<HTMLElement>('[data-satin-row-action-content]')!
    Object.defineProperties(native, {
      clientWidth: { value: 400 },
      scrollWidth: { value: 2000 },
    })
    native.scrollLeft = 800
    const previous = HTMLElement.prototype.getAnimations
    HTMLElement.prototype.getAnimations = () => []
    try {
      expect(getComputedStyle(row).touchAction).toBe('pan-y')
      touch('touchstart', 200, now, true, row)
      native.scrollLeft = 800 - sign * 28
      expect(touch('touchmove', 200 + sign * 100, now + 400, true, row).defaultPrevented).toBe(true)
      const translation = Number(content.style.transform.match(/translate3d\(([-\d.]+)px/)?.[1])
      expect(translation * sign).toBeGreaterThan(40)
      touch('touchend', 200 + sign * 150, now + 800, false, row)
      expect(row.dataset.satinSwipeActive).toBe('true')
      expect(row.dataset.satinSwipeSide).toBe(sign > 0 ? 'leading' : 'trailing')
      expect(pops).toHaveLength(0)
    } finally {
      HTMLElement.prototype.getAnimations = previous
    }
  },
)

it('keeps an edge-start leftward contact on the row', () => {
  const { navigator, pops } = setup(true)
  act(() => {
    navigator.push('detail')
    root.render(<NavigatorHost navigator={navigator} />)
  })
  const row = element.querySelector<HTMLElement>('[data-satin-row-swipe]')!
  touch('touchstart', 19, now, true, row)
  expect(touch('touchmove', 4, now + 40, true, row).defaultPrevented).toBe(true)
  expect(row.dataset.satinSwipeActive).toBe('true')
  expect(pops).toHaveLength(0)
  touch('touchcancel', 4, now + 50, false, row)
})

it.each([4, 180])('leaves vertical-dominant pushed-row contacts at x=%s to native scrolling', x => {
  const { navigator, pops } = setup('leading')
  act(() => {
    navigator.push('detail')
    root.render(<NavigatorHost navigator={navigator} />)
  })
  const row = element.querySelector<HTMLElement>('[data-satin-row-swipe]')!
  touch('touchstart', x, now, true, row)
  expect(touch('touchmove', x + 5, now + 40, true, row, 360).defaultPrevented).toBe(false)
  expect(row.dataset.satinSwipeActive).not.toBe('true')
  expect(pops).toHaveLength(0)
  touch('touchcancel', x + 5, now + 50, false, row, 360)
})

it('lets a Toggle thumb drag change the switch on a pushed screen', () => {
  function Detail() {
    const [checked, setChecked] = useState(false)
    return <Toggle label="Switch" checked={checked} onChange={setChecked} />
  }
  const { navigator, pops } = setup(false, Detail)
  act(() => {
    navigator.push('detail')
    root.render(<NavigatorHost navigator={navigator} />)
  })
  const toggle = element.querySelector<HTMLElement>('[role="switch"]')!
  act(() =>
    toggle.dispatchEvent(
      new PointerEvent('pointerdown', { isPrimary: true, bubbles: true, clientX: 180 }),
    ),
  )
  touch('touchstart', 180, now, true, toggle)
  touch('touchmove', 240, now + 40, true, toggle)
  flushFrames()
  act(() =>
    toggle.dispatchEvent(
      new PointerEvent('pointerup', { isPrimary: true, bubbles: true, clientX: 240 }),
    ),
  )
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  expect(pops).toHaveLength(0)
})

it('uses finger-driven frames when an action row cannot permit native directional panning', () => {
  vi.stubGlobal('CSS', { supports: () => false, escape: CSS.escape })
  const { navigator, pops } = setup(true)
  act(() => {
    navigator.push('detail')
    root.render(<NavigatorHost navigator={navigator} />)
  })
  const row = element.querySelector<HTMLElement>('[data-satin-row-swipe]')!
  expect(getComputedStyle(row).touchAction).toBe('pan-y')
  touch('touchstart', 4, now, true, row)
  touch('touchmove', 44, now + 40, true, row)
  touch('touchmove', 104, now + 80, true, row)
  flushFrames()
  expect(pops[0]!.log).toEqual(['set 0.250'])
  expect(row.dataset.satinSwipeActive).not.toBe('true')
})

it('cancels only claimed fallback moves, and yields when browser cancellation precedes recognition', () => {
  vi.stubGlobal('CSS', { supports: () => false, escape: CSS.escape })
  const registrations = vi.spyOn(HTMLElement.prototype, 'addEventListener')
  const { navigator, pops } = setup(true)
  act(() => {
    navigator.push('detail')
    root.render(<NavigatorHost navigator={navigator} />)
  })
  const row = element.querySelector<HTMLElement>('[data-satin-row-swipe]')!
  expect(getComputedStyle(row).touchAction).toBe('pan-y')
  const navMoves = () =>
    registrations.mock.calls.filter(
      (call, i) => registrations.mock.contexts[i] === host() && call[0] === 'touchmove',
    )
  expect(navMoves().map(c => (c[2] as AddEventListenerOptions).passive)).toEqual([true])
  const pointer = (type: string) =>
    act(() =>
      row.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), {
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          clientX: 4,
          clientY: 300,
        }),
      ),
    )
  pointer('pointerdown')
  expect(touch('touchstart', 4, now, true, row).defaultPrevented).toBe(false)
  expect(navMoves().at(-1)![2]).toEqual({ passive: false })
  expect(touch('touchmove', 6, now + 10, true, row, 301).defaultPrevented).toBe(false)
  expect(pops).toHaveLength(0)
  // WebKit commits native scrolling before a delayed horizontal recognition.
  pointer('pointercancel')
  expect(touch('touchmove', 64, now + 20, true, row, 310, false).defaultPrevented).toBe(false)
  touch('touchcancel', 64, now + 25, false, row, 310)
  expect(pops).toHaveLength(0)
  // A fresh contact remains usable. Its first claimed move is effectively canceled.
  pointer('pointerdown')
  touch('touchstart', 4, now + 100, true, row)
  expect(touch('touchmove', 7, now + 110, true, row, 302).defaultPrevented).toBe(false)
  expect(touch('touchmove', 54, now + 160, true, row, 305).defaultPrevented).toBe(true)
  expect(touch('touchmove', 104, now + 180, true, row, 325).defaultPrevented).toBe(true)
  flushFrames()
  expect(pops[0]!.log).toEqual([`set ${((104 - 7) / 400).toFixed(3)}`])
  touch('touchcancel', 104, now + 190, false, row, 325)
  expect(touch('touchmove', 114, now + 200, true, row, 330).defaultPrevented).toBe(false)
})

it('keeps the fallback cancellation for the owning finger when another finger lifts', () => {
  vi.stubGlobal('CSS', { supports: () => false, escape: CSS.escape })
  const { navigator } = setup(true)
  act(() => {
    navigator.push('detail')
    root.render(<NavigatorHost navigator={navigator} />)
  })
  const row = element.querySelector<HTMLElement>('[data-satin-row-swipe]')!
  const pointer = (type: string) =>
    act(() =>
      row.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), {
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          clientX: 4,
          clientY: 300,
        }),
      ),
    )
  pointer('pointerdown')
  touch('touchstart', 4, now, true, row)
  touch('touchmove', 7, now + 10, true, row, 302)
  expect(touch('touchmove', 54, now + 60, true, row, 305).defaultPrevented).toBe(true)
  // A second finger (identifier 9) lifts while finger 7 keeps tracking.
  const owner = { identifier: 7, clientX: 54, clientY: 305 },
    other = { identifier: 9, clientX: 60, clientY: 500 }
  const lift = new Event('touchend', { bubbles: true, cancelable: true })
  Object.defineProperties(lift, {
    changedTouches: { value: Object.assign([other], { item: () => other }) },
    touches: { value: [owner] },
    timeStamp: { value: now + 70 },
  })
  act(() => {
    row.dispatchEvent(lift)
  })
  expect(touch('touchmove', 84, now + 90, true, row, 308).defaultPrevented).toBe(true)
  // An end naming neither finger still finishes the contact and must release the listener.
  const removals = vi.spyOn(HTMLElement.prototype, 'removeEventListener')
  const orphan = new Event('touchcancel', { bubbles: true, cancelable: false })
  Object.defineProperties(orphan, {
    changedTouches: { value: Object.assign([], { item: () => null }) },
    touches: { value: [] },
    timeStamp: { value: now + 100 },
  })
  act(() => {
    row.dispatchEvent(orphan)
  })
  expect(
    removals.mock.calls.some(
      (call, i) => removals.mock.contexts[i] === host() && call[0] === 'touchmove',
    ),
  ).toBe(true)
  removals.mockRestore()
})

it('leaves a contact that starts in a presentation of its own screen to that presentation', () => {
  const { navigator, pops } = setup()
  act(() => {
    navigator.push('detail')
    root.render(<NavigatorHost navigator={navigator} />)
  })
  // A sheet or alert is a dialog inside the screen that presents it (not a portal), so its
  // touches bubble to this host. Recorded on the iPad: a 260 pt rightward swipe in 200 ms that
  // started on an open sheet popped the screen behind it.
  const content = [...element.querySelectorAll<HTMLElement>('span')].find(
    node => node.textContent === 'Detail',
  )!
  const dialog = document.createElement('dialog')
  const sheetContent = document.createElement('div')
  dialog.append(sheetContent)
  content.after(dialog)
  touch('touchstart', 180, now, true, sheetContent)
  touch('touchmove', 206, now + 30, true, sheetContent)
  touch('touchmove', 330, now + 115, true, sheetContent)
  flushFrames()
  touch('touchend', 440, now + 200, false, sheetContent)
  flushFrames()
  expect(pops).toHaveLength(0)
  // The same swipe on the screen itself is the back swipe.
  now += 1_000
  touch('touchstart', 180, now, true, content)
  touch('touchmove', 206, now + 30, true, content)
  touch('touchmove', 330, now + 115, true, content)
  flushFrames()
  expect(pops).toHaveLength(1)
})

it('preserves horizontal and selectable content policies through source retirement', () => {
  const { navigator } = setup()
  act(() => root.render(<NavigatorHost navigator={navigator} />))
  const scrub = source()
  const content = document.createElement('div')
  content.style.touchAction = 'pan-x'
  content.style.userSelect = 'text'
  scrub.append(content)
  const retirement = retireNativeScrubSource(scrub, scrub.clientWidth * 2)
  expect(getComputedStyle(content).touchAction).toBe('pan-x')
  expect(getComputedStyle(content).userSelect).toBe('text')
  rearmNativeScrubSource(scrub, retirement)
})

it('keeps idle content centred at root and with a back target', () => {
  const { navigator } = setup()
  act(() => root.render(<NavigatorHost navigator={navigator} />))
  const scrub = source()
  Object.defineProperty(scrub, 'clientWidth', { value: 400 })
  for (const lateOffset of [790, 780, 900]) {
    if (lateOffset === 780) act(() => navigator.push('detail'))
    scrub.scrollLeft = lateOffset
    act(() => scrub.dispatchEvent(new Event('scroll')))
    expect(scrub.scrollLeft).toBe(800)
    expect(scrub.style.touchAction).toBe('')
  }
})

it('lets the next eligible contact move a retired source before recognition attaches its tracks', () => {
  const { navigator } = setup()
  act(() => navigator.push('detail'))
  act(() => root.render(<NavigatorHost navigator={navigator} />))
  const scrub = source()
  Object.defineProperty(scrub, 'clientWidth', { value: 400 })
  retireNativeScrubSource(scrub, 800)
  flushFrames()
  flushFrames()
  now += NATIVE_SCRUB_REARM_COMMIT_MS + 1
  touch('touchstart', 4, now)
  // WebKit may scroll before JS receives enough movement to recognize the pan.
  scrub.scrollLeft = 790
  act(() => scrub.dispatchEvent(new Event('scroll')))
  expect(scrub.scrollLeft).toBe(790)
  touch('touchend', 14, now + 8)
  scrub.scrollLeft = 780
  act(() => scrub.dispatchEvent(new Event('scroll')))
  expect(scrub.scrollLeft).toBe(800)
})

vi.mock('../glass/pressHighlight.ts', () => ({
  glassPressHighlight: vi.fn(),
  glassPressScale: () => 1,
}))
const { GlassButton } = await import('../glass/GlassEffect.tsx')
const { glassPressHighlight } = await import('../glass/pressHighlight.ts')
it('native back swipe keeps the glass pressed after the browser cancels its pointer stream', () => {
  for (const ending of ['touchend', 'touchcancel', 'retire'] as const) {
    vi.mocked(glassPressHighlight).mockClear()
    const changed = vi.fn()
    const { navigator, pops } = setup(false, () => (
      <GlassButton onPress={changed}>Actions</GlassButton>
    ))
    act(() => {
      navigator.push('detail')
      root.render(<NavigatorHost navigator={navigator} />)
    })
    const button = element.querySelector('button')!
    const pointer = (type: string) =>
      act(() =>
        button.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            isPrimary: true,
            pointerType: 'touch',
            pointerId: 7,
            button: 0,
            clientX: 180,
            clientY: 300,
          }),
        ),
      )
    pointer('pointerdown')
    touch('touchstart', 180, now, true, button)
    touch('touchmove', 225, now + 40, true, button)
    flushFrames()
    expect(pops).toHaveLength(1)
    expect(pops[0]!.log).toContain('scroll-timeline')
    pointer('pointercancel')
    touch('touchmove', 280, now + 80, true, button)
    expect(pops[0]!.interactionPhase).toBe('held')
    const phases = vi.mocked(glassPressHighlight).mock.calls.map(call => call[1])
    expect(phases.at(-1)).toBe('pressed')
    if (ending === 'retire') act(() => root.render(null))
    else touch(ending, 280, now + 100, false, button)
    expect(vi.mocked(glassPressHighlight).mock.calls.at(-1)?.[1]).toBe('releasing')
    expect(changed).not.toHaveBeenCalled()
    act(() => root.render(null))
  }
})
