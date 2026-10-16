import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NavigatorHost } from './NavigatorHost.tsx'
import { createNavigator } from './store.ts'
import { createScreenRegistry, defineScreen } from './registry.ts'
import { NavigationLayoutContext } from '../layout/navigationLayoutContext.ts'
vi.mock('../root/runtimeContext.ts', () => ({
  useSatinLayoutRuntime: () => ({
    layoutClass: { horizontal: 'regular' },
    metrics: { layoutViewport: { width: 1366 }, screen: { width: 1366, height: 1024 } },
  }),
}))
vi.mock('./NavigationChrome.tsx', () => ({ NavigationChrome: () => null }))
vi.mock('../reachability/react.tsx', () => ({
  ReachabilityRoute: ({ children }: { children: unknown }) => children,
}))
it('keeps regular root navigation while a narrow presentation uses a single stack', () => {
  const registry = createScreenRegistry(defineScreen('root', { component: () => <p>Content</p> }))
  const outer = createNavigator({ registry, initial: { id: 'root' } })
  const inner = createNavigator({ registry, initial: { id: 'root' } })
  const html = renderToStaticMarkup(
    <>
      <NavigatorHost adaptive navigator={outer} />
      <NavigationLayoutContext value="compact">
        <NavigatorHost adaptive navigator={inner} />
      </NavigationLayoutContext>
    </>,
  )
  expect(
    [...html.matchAll(/data-satin-navigation-layout="([^"]+)"/g)].map(match => match[1]),
  ).toEqual(['split', 'stack'])
})
