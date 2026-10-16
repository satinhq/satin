// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MenuStack } from './MenuStack.tsx'
import { MaterialEffectContext } from './liquidContext.ts'
import { GlassRegionRegistry } from './regionRegistry.ts'
const gates = vi.hoisted(
  () => [] as { ready: () => void; fail: () => void; release: ReturnType<typeof vi.fn> }[],
)
vi.mock('../presentation/glassReady.ts', () => ({
  holdPresentationForGlass: (
    _panel: unknown,
    _dim: unknown,
    _animations: unknown,
    _invalidate: unknown,
    ready: () => void,
    _canReveal: () => boolean,
    options: { onFailure?: () => void },
  ) => {
    const release = vi.fn()
    gates.push({ ready, fail: () => options?.onFailure?.(), release })
    return release
  },
}))
let cleanup = () => {}
afterEach(() => {
  cleanup()
  gates.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('retires submenu admission on retap, replacement, dismissal and failure', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 20,
    y: 200,
    left: 20,
    top: 200,
    right: 120,
    bottom: 240,
    width: 100,
    height: 40,
    toJSON() {},
  } as DOMRect)
  Object.assign(HTMLElement.prototype, {
    animate: () => ({ finished: new Promise(() => {}), cancel() {} }),
    getAnimations: () => [],
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  }
  const render = (closing = false, idiom: 'pad' | 'phone' = 'pad') =>
    act(() =>
      root.render(
        <MaterialEffectContext
          value={{
            backend: 'webgpu',
            regions: new GlassRegionRegistry(),
            ready: true,
            registerTabs() {},
          }}
        >
          <MenuStack
            actions={['more', 'other'].map(id => ({
              id,
              label: id,
              submenu: [{ id: 'leaf', label: 'Leaf' }],
            }))}
            select={() => {}}
            idiom={idiom}
            closing={closing}
            cornerRadius={24}
            readBounds={() => ({ x: 0, y: 0, width: 1024, height: 1000 })}
            backRef={{ current: undefined }}
          >
            {rows => <div data-satin-glass-effect="true">{rows}</div>}
          </MenuStack>
        </MaterialEffectContext>,
      ),
    )
  render()
  const more = host.querySelector<HTMLButtonElement>('[data-satin-action-id="more"]')!
  act(() => more.click())
  expect(gates).toHaveLength(1)
  act(() => more.click())
  const leaving = host.querySelector<HTMLElement>('[data-satin-submenu-leaving]')!
  expect(leaving).not.toBeNull()
  expect(leaving.style.visibility).toBe('hidden')
  act(() => gates[0].ready())
  expect(leaving.style.visibility).toBe('hidden')
  act(() => more.click())
  const replaced = host.querySelector<HTMLElement>(
    '[data-satin-submenu-frame]:not([data-satin-submenu-leaving])',
  )!
  act(() => host.querySelector<HTMLButtonElement>('[data-satin-action-id="other"]')!.click())
  act(() => gates[1]!.ready())
  expect(replaced.style.visibility).toBe('hidden')
  const dismissed = host.querySelector<HTMLElement>(
    '[data-satin-submenu-frame]:not([data-satin-submenu-leaving])',
  )!
  render(true)
  act(() => gates[2]!.ready())
  expect(dismissed.style.visibility).toBe('hidden')
  render(false, 'phone')
  act(() => more.click())
  expect(host.querySelector('[data-satin-menu-level="0"]')!.hasAttribute('inert')).toBe(true)
  act(() => gates[3]!.fail())
  expect(
    host.querySelector('[data-satin-submenu-frame]:not([data-satin-submenu-leaving])'),
  ).toBeNull()
  expect(host.querySelector('[data-satin-menu-level="0"]')!.hasAttribute('inert')).toBe(false)
  act(() => more.click())
  act(() => gates[4]!.ready())
  const entering = host.querySelector<HTMLElement>(
    '[data-satin-submenu-frame]:not([data-satin-submenu-leaving])',
  )!
  const width = entering.style.width
  render(true, 'phone')
  act(() => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id)
      callback(performance.now() + 100)
    }
  })
  expect(entering.style.width).toBe(width)
})
