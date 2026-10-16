import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NavigatorHost, renderedScreenIndices } from './NavigatorHost.tsx'
import { compositedScreenIndices } from './ScreenContainer.tsx'
import { hiddenByMultiPop } from './stack.ts'
import { createNavigator } from './store.ts'
import { createScreenRegistry, defineScreen } from './registry.ts'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import type { TransitionController } from './types.ts'

vi.mock('../root/runtimeContext.ts', () => ({
  useSatinLayoutRuntime: () => ({
    layoutClass: { horizontal: 'compact' },
    metrics: { layoutViewport: { width: 402 }, screen: { width: 402, height: 874 } },
  }),
}))
vi.mock('./NavigationChrome.tsx', () => ({ NavigationChrome: () => null }))
vi.mock('../reachability/react.tsx', () => ({
  ReachabilityRoute: ({ children }: { children: React.ReactNode }) => children,
}))

function setup() {
  const controllers: TransitionController[] = []
  const registry = createScreenRegistry(
    defineScreen('home', {
      component: () => <span>Home</span>,
      navigation: { title: 'Home', display: 'inline' },
    }),
    defineScreen('detail', {
      component: () => <span>Detail</span>,
      navigation: { title: 'Detail', display: 'inline' },
    }),
  )
  const navigator = createNavigator({
    registry,
    initial: { id: 'home' },
    transitionControllerFactory: completion => {
      const controller = { progress: 0, finish: completion.finish, cancel: completion.cancel }
      controllers.push(controller)
      return controller
    },
  })
  return { navigator, controllers }
}
function container(html: string, screen: string) {
  return html.match(new RegExp(`<div[^>]*data-satin-screen="${screen}"[^>]*>`))![0]
}

describe('destination interaction ownership', () => {
  it('leaves the revealed destination interactive while the outgoing screen exits', () => {
    const { navigator, controllers } = setup()
    navigator.push('detail')
    controllers.at(-1)!.finish()
    navigator.pop()
    const html = renderToStaticMarkup(<NavigatorHost navigator={navigator} />)
    expect(container(html, 'home')).not.toContain('inert=')
    expect(container(html, 'detail')).toContain('inert=')
  })

  it('does not make a settled screen inert while its next scrub source prepares', () => {
    const { navigator } = setup()
    const html = renderToStaticMarkup(
      <MaterialEffectContext
        value={{ preparingSources: true, preparedScreenKey: undefined } as never}
      >
        <NavigatorHost navigator={navigator} />
      </MaterialEffectContext>,
    )
    expect(html).toContain('data-satin-source-ready="false"')
    expect(container(html, 'home')).not.toContain('inert=')
  })
})

describe('deep covered screens stop painting', () => {
  const settled = { transition: { phase: 'settled' } }
  const exiting = { transition: { phase: 'exiting' } }
  const entering = { transition: { phase: 'entering' } }

  it('keeps root, top and immediate rear painted at rest', () => {
    expect([...renderedScreenIndices([])]).toEqual([])
    expect([...renderedScreenIndices([settled])]).toEqual([0])
    expect([...renderedScreenIndices([settled, settled])].sort()).toEqual([0, 1])
    expect([...renderedScreenIndices([settled, settled, settled, settled])].sort()).toEqual([
      0, 2, 3,
    ])
  })

  it('does not eagerly repaint the rear below the current pop destination', () => {
    expect([...renderedScreenIndices([settled, settled, settled, exiting])].sort()).toEqual([
      0, 2, 3,
    ])
  })

  it('paints each real endpoint for overlapping pops, but only two for popToRoot', () => {
    const first = { transition: { phase: 'exiting', controller: {} } }
    const second = { transition: { phase: 'exiting', controller: {} } }
    expect([...renderedScreenIndices([settled, settled, settled, second, first])].sort()).toEqual([
      0, 2, 3, 4,
    ])
    expect([...renderedScreenIndices([settled, exiting, exiting, exiting])].sort()).toEqual([0, 3])
  })

  it('keeps the outgoing rear painted during push and replace', () => {
    expect([...renderedScreenIndices([settled, settled, settled, entering])].sort()).toEqual([
      0, 2, 3,
    ])
    expect([...renderedScreenIndices([settled, settled, exiting, entering])].sort()).toEqual([
      0, 2, 3,
    ])
  })

  it('marks only screens below the floor in the rendered stack', () => {
    const registry = createScreenRegistry(
      defineScreen('a', { component: () => <span>A</span> }),
      defineScreen('b', { component: () => <span>B</span> }),
      defineScreen('c', { component: () => <span>C</span> }),
      defineScreen('d', { component: () => <span>D</span> }),
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
    for (const id of ['b', 'c', 'd'] as const) {
      navigator.push(id)
      controllers.at(-1)!.finish()
    }
    const html = renderToStaticMarkup(<NavigatorHost navigator={navigator} />)
    navigator.popToRoot()
    const popping = renderToStaticMarkup(<NavigatorHost navigator={navigator} />)
    expect(container(popping, 'a')).not.toContain('data-satin-render-suspended')
    expect(container(popping, 'b')).toContain('data-satin-render-suspended="true"')
    expect(container(popping, 'c')).toContain('data-satin-render-suspended="true"')
    expect(container(popping, 'd')).not.toContain('data-satin-render-suspended')
    // popToRoot reveals the root directly, so it is never suspended.
    expect(container(html, 'a')).not.toContain('data-satin-render-suspended')
    expect(container(html, 'b')).toContain('data-satin-render-suspended="true"')
    expect(container(html, 'c')).not.toContain('data-satin-render-suspended')
    expect(container(html, 'd')).not.toContain('data-satin-render-suspended')
  })
})

describe('multi-pop title helper', () => {
  it('flags outgoing entries beneath the animated top on the same controller only', () => {
    const shared = {}
    const entries = [
      { transition: { phase: 'settled', controller: {} } },
      { transition: { phase: 'exiting', controller: shared } },
      { transition: { phase: 'exiting', controller: shared } },
      { transition: { phase: 'exiting', controller: shared } },
    ]
    expect([0, 1, 2, 3].map(index => hiddenByMultiPop(entries, index))).toEqual([
      false,
      true,
      true,
      false,
    ])
    const rapid = [entries[0]!, entries[1]!, { transition: { phase: 'exiting', controller: {} } }]
    expect(hiddenByMultiPop(rapid, 1)).toBe(false)
  })
})

it('keeps only the top pair and active transition participants composited', () => {
  const settled = { transition: { phase: 'settled' } }
  expect([...compositedScreenIndices(Array(6).fill(settled))].sort()).toEqual([4, 5])
  expect([...compositedScreenIndices([settled])]).toEqual([0])
  expect([...compositedScreenIndices([])]).toEqual([])
  const exiting = { transition: { phase: 'exiting', controller: {} } }
  expect([...compositedScreenIndices([settled, exiting, exiting, exiting])].sort()).toEqual([
    0, 2, 3,
  ])
})

// The shared chrome is mocked above: these materials must travel inside each page.
it('retains both pages scroll-edge materials through push, pop and cancellation', () => {
  const { navigator, controllers } = setup()
  const edges = () =>
    (
      renderToStaticMarkup(<NavigatorHost navigator={navigator} />).match(
        /data-satin-scroll-edge="true"/g,
      ) ?? []
    ).length
  expect(edges()).toBe(0)
  navigator.push('detail')
  expect(edges()).toBe(2)
  controllers.at(-1)!.finish()
  expect(edges()).toBe(0)
  navigator.pop()
  expect(edges()).toBe(2)
  controllers.at(-1)!.cancel()
  expect(edges()).toBe(0)
})
