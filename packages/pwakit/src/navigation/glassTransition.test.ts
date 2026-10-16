import { afterEach, expect, it, vi } from 'vitest'
import {
  navigationGlassRoutes,
  observeNavigationGlass,
  publishNavigationGlass,
  sampleNavigationGlass,
  type NavigationGlassState,
} from './glassTransition.ts'
afterEach(() => vi.unstubAllGlobals())

it('publishes a committed route pair synchronously and releases listeners', () => {
  const host = {} as HTMLElement,
    observer = vi.fn()
  const state: NavigationGlassState = { active: true, top: 'front', width: 440, routes: [] }
  publishNavigationGlass(host, state)
  const release = observeNavigationGlass(host, observer)
  expect(observer).toHaveBeenCalledExactlyOnceWith(state)
  publishNavigationGlass(host, { ...state, active: false })
  expect(observer).toHaveBeenCalledTimes(2)
  release()
  publishNavigationGlass(host, state)
  expect(observer).toHaveBeenCalledTimes(2)
})

it('samples both page transform owners without a second motion clock', () => {
  const styles = new Map<object, { transform?: string; opacity?: string }>()
  const screen = {},
    motion = {},
    dim = {}
  styles.set(screen, { transform: '-66' })
  styles.set(motion, { transform: '220' })
  styles.set(dim, { opacity: '.05' })
  vi.stubGlobal('getComputedStyle', (node: object) => styles.get(node))
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m41: number
      constructor(value: string) {
        this.m41 = Number(value)
      }
    },
  )
  const state = {
    width: 440,
    active: true,
    top: 'page',
    routes: [{ key: 'page', screen, motion, dim }],
  } as unknown as NavigationGlassState
  expect(sampleNavigationGlass(state)).toEqual([{ key: 'page', x: 154, dim: 0.05 }])
  styles.set(motion, { transform: '260' })
  expect(sampleNavigationGlass(state)).toEqual([{ key: 'page', x: 194, dim: 0.05 }])
})

it('uses the bound root for popToRoot and all participating layers for successive pops', () => {
  const keys = ['root', 'middle', 'front']
  const elements = new Map(
    keys.map(key => [key, { screen: { querySelector: () => null }, motion: {}, dim: {} } as any]),
  )
  const binding = (front: string, rear: string) => ({
    controller: {} as any,
    binding: {
      direction: 'pop' as const,
      width: 440,
      primary: elements.get(front)!.motion,
      secondary: elements.get(rear)!.screen,
    },
  })
  expect(
    navigationGlassRoutes(keys, elements, [binding('front', 'root')]).map(route => route.key),
  ).toEqual(['root', 'front'])
  expect(
    navigationGlassRoutes(keys, elements, [
      binding('front', 'middle'),
      binding('middle', 'root'),
    ]).map(route => route.key),
  ).toEqual(keys)
  expect(navigationGlassRoutes(keys, elements, []).map(route => route.key)).toEqual([
    'middle',
    'front',
  ])
})
