// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createScreenRegistry, defineScreen } from './registry.ts'
import { interactiveControllerFactory } from '../../test/navigationControllers.ts'
import { createNavigator, navigatorScrollRuntime, navigatorTransitionRuntime } from './store.ts'
import * as keyboardAdapter from '../keyboard/adapter.ts'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
const registry = createScreenRegistry(
  defineScreen('one', { component: () => null }),
  defineScreen('three', { component: () => null }),
)
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})
it.each(['push', 'pop', 'swipe'] as const)(
  'DOM geometry model: releases keyboard avoidance before %s snapshots and publication',
  async operation => {
    const interactive = interactiveControllerFactory()
    const navigator = createNavigator({
      registry,
      initial: { id: 'one' },
      transitionControllerFactory: interactive.factory,
    })
    if (operation !== 'push') navigator.push('three')
    const current = navigator.getState().entries.at(-1)!
    const surfaces = createScrollSurfaceRegistry({ development: true })
    // DOM geometry is a model; the adapter and its navigation cleanup are real.
    const root = document.createElement('div')
    const element = document.createElement('div')
    element.setAttribute('data-satin-navigation-motion-layer', 'true')
    const editor = document.createElement('input')
    element.append(editor)
    root.append(element)
    document.body.append(root)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
    const viewport = Object.assign(new EventTarget(), { height: 500, offsetTop: 0, scale: 1 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue({
      top: 900,
      bottom: 930,
      left: 0,
      right: 100,
      width: 100,
      height: 30,
      x: 0,
      y: 900,
      toJSON() {},
    })
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 1000,
      left: 0,
      right: 100,
      width: 100,
      height: 1000,
      x: 0,
      y: 0,
      toJSON() {},
    })
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: 1000 })
    const disposeKeyboard = keyboardAdapter.installKeyboardAdapter(root)
    editor.focus()
    viewport.dispatchEvent(new Event('resize'))
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(element.scrollTop).toBeGreaterThan(0)
    surfaces.register({ axis: 'vertical', element, id: 'feed', primary: true })
    navigator[navigatorScrollRuntime].bind(current.key, surfaces)
    const cleanup = vi.spyOn(keyboardAdapter, 'prepareKeyboardForNavigation')
    const publishedOffsets: number[] = []
    navigator.subscribe(() => publishedOffsets.push(element.scrollTop))

    if (operation === 'push') navigator.push('three')
    else if (operation === 'pop') navigator.pop()
    else navigator[navigatorTransitionRuntime].beginInteractivePop()

    expect(cleanup).toHaveBeenCalledOnce()
    expect(document.activeElement).not.toBe(editor)
    expect(publishedOffsets.length).toBeGreaterThan(0)
    expect(publishedOffsets.every(offset => offset === 0)).toBe(true)
    const retained = navigator.getState().entries.find(item => item.key === current.key)
    if (retained) expect(retained.scrollSnapshot?.get('feed')).toEqual({ x: 0, y: 0 })
    disposeKeyboard()
    root.remove()
  },
)
