import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NavigationChrome } from './NavigationChrome.tsx'
import { createAnimatedTransitionController } from './motion.ts'
import { createNavigator } from './store.ts'
import { createScreenRegistry, defineScreen } from './registry.ts'
import { collectTransitionBindings } from './transitionBindings.ts'
import type { ScreenEntry, TransitionController } from './types.ts'

// iOS 27 (native-nav-chrome notes, held title curves and the light-inline push frames): every bar
// title travels with its page, and the rear page's title is covered by the front page. In a held
// back swipe the incoming title is hidden under the outgoing page until that page's left edge has
// passed it (reliable from finger p = .40-.50); in a push the outgoing title disappears under the
// entering page's edge. The titles live in the shared header above both pages, so Satin clips the
// rear title at the front page's left edge (a translate pair: a clipping box and its
// counter-moved content, both compositor transforms).
const WIDTH = 440

class FakeStyle {
  opacity = ''
  transform = ''
  clipPath = ''
  boxShadow = ''
  setProperty() {}
  removeProperty(property: string) {
    ;(this as unknown as Record<string, string>)[property] = ''
  }
}
const fakeElement = () => ({ style: new FakeStyle() }) as unknown as HTMLElement

afterEach(() => vi.unstubAllGlobals())

/** translate3d(N%, 0, 0) -> N */
function percent(transform: string) {
  const match = transform.match(/^translate3d\((-?[\d.e-]+)%, 0, 0\)$/)
  if (!match) throw Error('not a percentage translation: ' + transform)
  return Number(match[1])
}

function heldPop(progress: number) {
  vi.stubGlobal('document', {})
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
  const elements = {
    primary: fakeElement(),
    primaryTitle: fakeElement(),
    secondary: fakeElement(),
    secondaryTitle: fakeElement(),
    secondaryTitleClip: fakeElement(),
    secondaryTitleContent: fakeElement(),
  }
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  const unbind = controller.bind!({ direction: 'pop', width: WIDTH, ...elements })
  controller.setProgress?.(progress)
  return { elements, unbind }
}

it.each([0.1, 0.35, 0.5, 0.75])(
  'covers the incoming title with the outgoing page in a held pop at q=%s',
  progress => {
    const { elements } = heldPop(progress)
    const frontEdge = (percent(elements.primary.style.transform) / 100) * WIDTH
    const layer = (percent(elements.secondaryTitle.style.transform) / 100) * WIDTH
    const clip = (percent(elements.secondaryTitleClip.style.transform) / 100) * WIDTH
    const content = (percent(elements.secondaryTitleContent.style.transform) / 100) * WIDTH
    // The title text still sits where its page is (rear parallax), ...
    expect(layer + clip + content).toBeCloseTo(-0.3 * (1 - progress) * WIDTH, 6)
    // ... and its visible box ends at the outgoing page's left edge.
    expect(layer + clip + WIDTH).toBeCloseTo(frontEdge, 6)
  },
)

it('leaves the outgoing (front) title unclipped and clears the clip when unbound', () => {
  const { elements, unbind } = heldPop(0.4)
  expect(percent(elements.primaryTitle.style.transform)).toBeCloseTo(40, 6)
  unbind()
  expect(elements.secondaryTitleClip.style.transform).toBe('')
  expect(elements.secondaryTitleContent.style.transform).toBe('')
})

it('covers the outgoing title with the entering page during a push', () => {
  vi.stubGlobal('document', {})
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: vi.fn(),
    cancelAnimationFrame: vi.fn(),
  })
  const elements = {
    primary: fakeElement(),
    secondary: fakeElement(),
    secondaryTitle: fakeElement(),
    secondaryTitleClip: fakeElement(),
    secondaryTitleContent: fakeElement(),
  }
  const animated = new Map<HTMLElement, Keyframe[]>()
  for (const element of Object.values(elements))
    element.animate = vi.fn((frames: Keyframe[]) => {
      animated.set(element, frames)
      return { cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), ready: Promise.resolve() } as never
    })
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: false, operation: 'push' },
  )
  controller.bind!({ direction: 'push', width: WIDTH, ...elements })
  controller.start?.()
  const clipFrames = animated.get(elements.secondaryTitleClip)
  const contentFrames = animated.get(elements.secondaryTitleContent)
  expect(clipFrames).toBeDefined()
  expect(contentFrames).toBeDefined()
  // Endpoints: unclipped before the push; at arrival the box ends at x = 0 (fully covered).
  expect(percent(String(clipFrames!.at(0)!.transform))).toBeCloseTo(0, 6)
  expect(percent(String(clipFrames!.at(-1)!.transform))).toBeCloseTo(-70, 6)
  expect(percent(String(contentFrames!.at(-1)!.transform))).toBeCloseTo(70, 6)
  const layerEnd = percent(String(animated.get(elements.secondaryTitle)!.at(-1)!.transform))
  expect(layerEnd + percent(String(clipFrames!.at(-1)!.transform)) + 100).toBeCloseTo(0, 6)
})

it('scrubs the title clip with the native scroll timeline in a held pop', () => {
  const timeline = { currentTime: 0 }
  vi.stubGlobal('document', { timeline })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), ScrollTimeline: class {} })
  const elements = {
    primary: fakeElement(),
    secondary: fakeElement(),
    secondaryTitle: fakeElement(),
    secondaryTitleClip: fakeElement(),
    secondaryTitleContent: fakeElement(),
  }
  for (const element of Object.values(elements))
    element.animate = vi.fn(() => ({ cancel: vi.fn() }) as never)
  const controller = createAnimatedTransitionController(
    { cancel: vi.fn(), finish: vi.fn() },
    { interactive: true, operation: 'pop' },
  )
  controller.bind!({ direction: 'pop', width: WIDTH, ...elements })
  const source = {
    style: { overflowX: 'scroll' },
    scrollWidth: WIDTH * 3,
    clientWidth: WIDTH,
    scrollLeft: WIDTH,
  } as HTMLElement
  controller.scrubFromScroll!(source, WIDTH, 0)
  expect(elements.secondaryTitleClip.animate).toHaveBeenCalledTimes(1)
  expect(elements.secondaryTitleContent.animate).toHaveBeenCalledTimes(1)
})

it('binds the clipping box and the content of the rear title layer', () => {
  const clip = { id: 'clip' } as unknown as HTMLElement
  const content = { id: 'content' } as unknown as HTMLElement
  const layer = {
    querySelector: (selector: string) =>
      selector.includes('title-clip') ? clip : selector.includes('title-content') ? content : null,
  } as unknown as HTMLElement
  const controller = { progress: 0, bind: () => () => {}, finish() {}, cancel() {} }
  const entries = [
    { key: 'a', transition: { phase: 'settled' } },
    { key: 'b', transition: { phase: 'entering', controller } },
  ] as unknown as ScreenEntry[]
  const screen = () => ({ dim: fakeElement(), motion: fakeElement(), screen: fakeElement() })
  const binding = collectTransitionBindings(
    entries,
    new Map([
      ['a', screen()],
      ['b', screen()],
    ]),
    WIDTH,
    { backVisibleByEntry: new Map(), titles: new Map([['a', layer]]) },
  )[0]?.binding
  expect(binding).toMatchObject({
    secondaryTitle: layer,
    secondaryTitleClip: clip,
    secondaryTitleContent: content,
  })
})

it('renders each bar title inside a clipping box and a content layer', () => {
  const registry = createScreenRegistry(
    defineScreen('a', { component: () => null, navigation: { title: 'A' } }),
    defineScreen('b', { component: () => null, navigation: { title: 'B' } }),
  )
  const controllers: TransitionController[] = []
  const navigator = createNavigator({
    registry,
    initial: { id: 'a' },
    transitionControllerFactory: completion => {
      const controller = { progress: 0, finish: completion.finish, cancel: completion.cancel }
      controllers.push(controller)
      return controller
    },
  })
  navigator.push('b')
  const html = renderToStaticMarkup(
    <NavigationChrome
      navigator={navigator as never}
      entries={navigator.getState().entries as never}
      pane="stack"
      titleElements={new Map()}
    />,
  )
  const layerPattern = new RegExp(
    [
      '<div[^>]*data-satin-navigation-title-layer="true"[^>]*>',
      '<span data-satin-navigation-title-clip="true">',
      '<span data-satin-navigation-title-content="true">',
      '<strong[^>]*>([^<]*)</strong><div data-satin-navigation-title-slot="subtitle"></div></span></span></div>',
    ].join(''),
    'g',
  )
  const layers = [...html.matchAll(layerPattern)].map(match => match[1])
  expect(layers).toEqual(['A', 'B'])
})
