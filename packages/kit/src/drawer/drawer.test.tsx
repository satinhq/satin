// @vitest-environment happy-dom
// Experimental drawer: ownership, release transactions, focus and RTL. WebKit's
// native scroller is simulated by moving the published source's offset with the finger; the
// ScrollTimeline and WAAPI objects are recorded fakes. Software evidence only.
import { act, useContext, useLayoutEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaneGestureScopeContext } from '../gestures/scopeContext.ts'
import { ExperimentalDrawer } from './ExperimentalDrawer.tsx'
import { useExperimentalDrawer } from './drawerHandle.ts'
import { drawerTrackValues, inLeadingEdge } from './drawerMotion.ts'
import { chooseThreePaneLayout } from './threePaneLayout.ts'

type FakeAnimation = {
  element: Element
  options: KeyframeAnimationOptions
  keyframes: Keyframe[]
  onfinish: (() => void) | null
  cancelled: boolean
  currentTime: number
  cancel(): void
}

const animations: FakeAnimation[] = []
const resizeCallbacks: (() => void)[] = []
let paneWidth = 400
let root: Root | undefined
let host: HTMLElement

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  paneWidth = 400
  vi.stubGlobal(
    'ScrollTimeline',
    class {
      source: Element
      constructor(options: { source: Element }) {
        this.source = options.source
      }
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.animate = function (keyframes, options) {
    const animation: FakeAnimation = {
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      onfinish: null,
      cancelled: false,
      currentTime: 0,
      cancel() {
        animation.cancelled = true
      },
    }
    animations.push(animation)
    return animation as unknown as Animation
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        left: 0,
        top: 0,
        width: paneWidth,
        height: 800,
        right: paneWidth,
        bottom: 800,
      }) as DOMRect,
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => paneWidth)
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => paneWidth * 5)
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  animations.length = 0
  resizeCallbacks.length = 0
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Publishes a fake navigator's private scroller, like NavigatorHost does. */
function FakeStack({ atRoot }: { atRoot: boolean }) {
  const pane = useContext(PaneGestureScopeContext)
  const sourceRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const source = sourceRef.current
    if (!source) return
    source.scrollLeft = source.clientWidth * 2
    pane?.publishContent({
      source,
      movable: source.firstElementChild as HTMLElement,
      atRoot: () => atRoot,
    })
    return () => pane?.publishContent(null)
  }, [pane, atRoot])
  const drawer = useExperimentalDrawer()
  return (
    <div ref={sourceRef} data-testid="stack-source">
      <div>
        <button data-testid="toggle" onClick={() => drawer?.toggle()}>
          {drawer?.label}
        </button>
      </div>
    </div>
  )
}

function Fixture(props: { atRoot?: boolean; rtl?: boolean; onCommit?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <ExperimentalDrawer
      open={open}
      onOpenChange={next => {
        props.onCommit?.(next)
        setOpen(next)
      }}
      sidebarLabel="Mailboxes"
      layoutDirection={props.rtl ? 'rtl' : 'ltr'}
      sidebar={<button data-testid="first-mailbox">Inbox</button>}
    >
      <FakeStack atRoot={props.atRoot ?? true} />
    </ExperimentalDrawer>
  )
}

function render(element: React.ReactElement) {
  root = createRoot(host)
  act(() => root!.render(element))
}

const query = (selector: string) => host.querySelector<HTMLElement>(selector)!

function touch(type: string, x: number, y = 300, touches = 1) {
  const target =
    type === 'touchstart' ? query('[data-testid="toggle"]') : (document.activeElement ?? host)
  const point = { identifier: 1, clientX: x, clientY: y }
  const list = (points: (typeof point)[]) =>
    Object.assign(points, { item: (index: number) => points[index] ?? null })
  const lifting = type === 'touchend' || type === 'touchcancel'
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    timeStamp: { value: performance.now() + 100 },
    touches: { value: list(lifting ? [] : Array.from({ length: touches }, () => point)) },
    changedTouches: { value: list([point]) },
  })
  ;(type === 'touchstart' ? target : query('[data-testid="toggle"]')).dispatchEvent(event)
}

/** A finger drag on the content, with WebKit's native scroll of the private source. */
function dragOnContent(
  fromX: number,
  toX: number,
  end: 'touchcancel' | 'touchend' | 'none' = 'touchend',
) {
  const source = query('[data-testid="stack-source"]')
  const origin = source.clientWidth * 2
  act(() => touch('touchstart', fromX))
  for (let step = 1; step <= 10; step++) {
    const x = fromX + ((toX - fromX) * step) / 10
    source.scrollLeft = origin - (x - fromX)
    act(() => touch('touchmove', x, 301))
  }
  if (end !== 'none') act(() => touch(end, toX, 301))
}

function finishSettle() {
  const running = animations.filter(animation => !animation.cancelled && animation.onfinish)
  act(() => {
    for (const animation of running) animation.onfinish?.()
  })
}

describe('edge open on the shared native source', () => {
  it('drives ScrollTimeline tracks while tracking and commits once after the settle', () => {
    const commits: boolean[] = []
    render(<Fixture onCommit={open => commits.push(open)} />)
    dragOnContent(4, 260, 'none')
    const scrubbed = animations.filter(animation => animation.options.timeline)
    expect(
      scrubbed.map(
        animation => animation.element.getAttribute('data-satin-drawer-panel') ?? 'scrim',
      ),
    ).toEqual(['true', 'scrim'])
    expect(commits).toEqual([])
    act(() => touch('touchend', 260, 301))
    expect(scrubbed.every(animation => animation.cancelled)).toBe(true)
    expect(animations.some(animation => !animation.cancelled && animation.options.duration)).toBe(
      true,
    )
    finishSettle()
    finishSettle()
    expect(commits).toEqual([true])
    expect(query('[data-satin-drawer-panel]').style.transform).toBe('translate3d(0px, 0, 0)')
  })

  it('never commits after a cancelled contact', () => {
    const commits: boolean[] = []
    render(<Fixture onCommit={open => commits.push(open)} />)
    dragOnContent(4, 300, 'touchcancel')
    finishSettle()
    expect(commits).toEqual([])
    expect(query('[data-satin-drawer-panel]').style.transform).toBe('translate3d(-320px, 0, 0)')
  })

  it('a pane resize mid-drag cancels the contact without a commit, even after the lift', () => {
    const commits: boolean[] = []
    render(<Fixture onCommit={open => commits.push(open)} />)
    dragOnContent(4, 260, 'none')
    paneWidth = 600
    act(() => {
      for (const callback of resizeCallbacks) callback()
    })
    act(() => touch('touchend', 260, 301))
    finishSettle()
    expect(commits).toEqual([])
    expect(query('[data-satin-drawer-panel]').style.transform).toBe('translate3d(-320px, 0, 0)')
  })

  it('leaves the leading edge to Back when the content is not at its root', () => {
    render(<Fixture atRoot={false} />)
    dragOnContent(4, 260)
    expect(animations).toEqual([])
  })
})

describe('focus and inert on the overlay', () => {
  it('moves focus into the sidebar, makes the content inert and returns focus on Escape', () => {
    render(<Fixture />)
    const toggle = query('[data-testid="toggle"]')
    act(() => toggle.focus())
    act(() => toggle.click())
    finishSettle()
    expect(document.activeElement).toBe(query('[data-testid="first-mailbox"]'))
    expect(query('[data-satin-drawer-content]').hasAttribute('inert')).toBe(true)
    expect(query('[data-satin-drawer-panel]').getAttribute('aria-modal')).toBe('true')
    act(() => {
      query('[data-satin-drawer-panel]').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
    finishSettle()
    expect(query('[data-satin-drawer-content]').hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(toggle)
  })
})

describe('right-to-left mapping', () => {
  it('mirrors the open region, the drag direction and the hidden pose', () => {
    expect(drawerTrackValues('overlay', 'rtl', 320, 0).panel).toBe('translate3d(320px, 0, 0)')
    expect(drawerTrackValues('push', 'rtl', 320, 100).content).toBe('translate3d(-100px, 0, 0)')
    expect(inLeadingEdge(396, { left: 0, width: 400 }, 'rtl')).toBe(true)
    expect(inLeadingEdge(4, { left: 0, width: 400 }, 'rtl')).toBe(false)
    const commits: boolean[] = []
    render(<Fixture rtl onCommit={open => commits.push(open)} />)
    expect(query('[data-satin-drawer="root"]').getAttribute('data-satin-drawer-side')).toBe('right')
    dragOnContent(4, 200)
    expect(animations).toEqual([])
    dragOnContent(396, 120)
    finishSettle()
    finishSettle()
    expect(commits).toEqual([true])
  })
})

describe('three-pane arrangement', () => {
  it('adapts to available width, not orientation', () => {
    expect(chooseThreePaneLayout(1366, false).arrangement).toBe('three-columns')
    expect(chooseThreePaneLayout(1024, false)).toEqual({
      arrangement: 'two-columns',
      sidebarTemporary: true,
    })
    // A narrow landscape window is compact.
    expect(chooseThreePaneLayout(507, false).arrangement).toBe('compact')
    expect(chooseThreePaneLayout(1366, true)).toEqual({
      arrangement: 'three-columns',
      sidebarTemporary: true,
    })
  })
})
