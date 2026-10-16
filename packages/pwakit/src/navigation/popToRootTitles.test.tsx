import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NavigationChrome } from './NavigationChrome.tsx'
import { createNavigator } from './store.ts'
import { createScreenRegistry, defineScreen } from './registry.ts'
import type { TransitionController } from './types.ts'

function titles(html: string) {
  return [
    ...html.matchAll(
      // Each title sits in its clipping box and content layer (barTitleOcclusion.test.tsx).
      /<div[^>]*data-satin-navigation-title-covered="(true|false)"[^>]*>(?:\s*<span[^>]*>)*\s*<strong[^>]*>([^<]*)<\/strong>/g,
    ),
  ].map(match => [match[2], match[1]])
}

describe('popToRoot titles', () => {
  it('hides intermediate outgoing titles so the top title reveals the root title', () => {
    const registry = createScreenRegistry(
      defineScreen('a', { component: () => null, navigation: { title: 'A' } }),
      defineScreen('b', { component: () => null, navigation: { title: 'B' } }),
      defineScreen('c', { component: () => null, navigation: { title: 'C' } }),
      defineScreen('d', { component: () => null, navigation: { title: 'D' } }),
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
    navigator.popToRoot()
    const html = renderToStaticMarkup(
      <NavigationChrome
        navigator={navigator as never}
        entries={navigator.getState().entries as never}
        pane="stack"
        titleElements={new Map()}
      />,
    )
    // The blur's entire subtree precedes the chrome stacking context.
    expect(html.slice(0, html.indexOf('<header'))).toContain('data-satin-scroll-edge')
    expect(html.slice(html.indexOf('<header'))).not.toContain('data-satin-scroll-edge')
    expect(titles(html)).toEqual([
      ['A', 'false'],
      ['B', 'true'],
      ['C', 'true'],
      ['D', 'false'],
    ])
  })
})

describe('back button glass lifetime', () => {
  it('registers no glass at the root and retains outgoing back glass until pop completes', () => {
    const registry = createScreenRegistry(
      defineScreen('root', { component: () => null, navigation: { title: 'Root' } }),
      defineScreen('detail', { component: () => null, navigation: { title: 'Detail' } }),
    )
    const controllers: TransitionController[] = []
    const navigator = createNavigator({
      registry,
      initial: { id: 'root' },
      transitionControllerFactory: completion => {
        const controller = { progress: 0, finish: completion.finish, cancel: completion.cancel }
        controllers.push(controller)
        return controller
      },
    })
    const markup = () =>
      renderToStaticMarkup(
        <NavigationChrome navigator={navigator as never} titleElements={new Map()} />,
      )
    expect(markup()).not.toContain('data-satin-glass-region-canvas')
    navigator.push('detail')
    controllers.at(-1)!.finish()
    expect(markup()).toContain('data-satin-glass-region-canvas')
    navigator.pop()
    expect(markup()).toContain('data-satin-glass-region-canvas')
    controllers.at(-1)!.finish()
    expect(markup()).not.toContain('data-satin-glass-region-canvas')
  })
})
