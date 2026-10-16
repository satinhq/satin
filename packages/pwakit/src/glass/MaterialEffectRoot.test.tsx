// @vitest-environment happy-dom
import { act, createRef, useContext, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { MaterialEffectRoot } from './MaterialEffectRoot.tsx'
import { MaterialEffectContext } from './liquidContext.ts'
const state = vi.hoisted(() => ({
  consumer: undefined as
    | undefined
    | {
        onReady: (ready: boolean) => void
        onError: (error: unknown, rebuilding?: boolean) => void
        onSourceReady: (source: HTMLDivElement) => void
      },
  unmounts: 0,
}))
beforeEach(() => {
  state.consumer = undefined
  state.unmounts = 0
})
it('keeps navigation readiness stable across recaptures of the same source', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const mount = document.createElement('div')
  const chrome = document.createElement('div')
  const scene = createRef<HTMLDivElement>()
  const root = createRoot(mount)
  const received: unknown[] = []
  function Readiness() {
    const context = useContext(MaterialEffectContext)!
    received.push(context)
    return <Registration />
  }
  document.body.append(mount, chrome)
  try {
    act(() =>
      root.render(
        <div ref={scene}>
          <MaterialEffectRoot scene={scene} chrome={chrome} enabled capabilitySettled>
            <Readiness />
            <div data-satin-screen-key="first">
              <div data-satin-scroll="a" data-satin-primary="true" />
            </div>
          </MaterialEffectRoot>
        </div>,
      ),
    )
    const source = mount.querySelector<HTMLDivElement>('[data-satin-scroll]')!
    act(() => state.consumer!.onSourceReady(source))
    const count = received.length
    const ready = received.at(-1)
    act(() => state.consumer!.onSourceReady(source))
    act(() => state.consumer!.onSourceReady(source))
    expect(received).toHaveLength(count)
    expect(received.at(-1)).toBe(ready)
    source.parentElement!.dataset.satinScreenKey = 'second'
    act(() => state.consumer!.onSourceReady(source))
    expect(received.at(-1)).toMatchObject({ preparedScreenKey: 'second' })
    expect(received.at(-1)).not.toBe(ready)
    const second = received.at(-1)
    const replacement = document.createElement('div')
    source.parentElement!.append(replacement)
    act(() => state.consumer!.onSourceReady(replacement))
    expect(received.at(-1)).not.toBe(second)
  } finally {
    act(() => root.unmount())
    mount.remove()
    chrome.remove()
  }
})
vi.mock('./GlassPresentation.tsx', () => ({
  GlassPresentation: ({ consumer }: { consumer: NonNullable<typeof state.consumer> }) => {
    state.consumer = consumer
    useLayoutEffect(
      () => () => {
        state.unmounts++
      },
      [],
    )
    return <span data-presenter="webgpu" />
  },
}))
function Registration({ count = 2 }: { count?: number }) {
  const context = useContext(MaterialEffectContext)!
  useLayoutEffect(() => {
    context.registerTabs('tabs', {
      items: Array.from({ length: count }, (_, index) => ({
        id: String.fromCharCode(97 + index),
        label: String.fromCharCode(65 + index),
        icon: null,
      })),
      selected: 'a',
      onSelect() {},
    })
    return () => context.registerTabs('tabs', undefined)
  }, [context.registerTabs, count])
  return <output data-ready={context.ready} data-preparing={context.preparingSources} />
}
it('keeps the WebGPU owner mounted after an error and accepts readiness only after its rebuild', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const mount = document.createElement('div'),
    chrome = document.createElement('div'),
    scene = createRef<HTMLDivElement>(),
    root = createRoot(mount),
    launch = vi.fn()
  document.body.append(mount, chrome)
  try {
    act(() =>
      root.render(
        <div ref={scene}>
          <MaterialEffectRoot
            scene={scene}
            chrome={chrome}
            enabled
            capabilitySettled
            onLaunchReady={launch}
          >
            <Registration />
            <div data-satin-scroll="a" data-satin-primary="true" />
          </MaterialEffectRoot>
        </div>,
      ),
    )
    act(() => state.consumer!.onReady(true))
    expect(mount.querySelector('output')?.getAttribute('data-ready')).toBe('true')
    act(() => state.consumer!.onError(Error('source failure'), true))
    expect(mount.querySelector('output')?.getAttribute('data-preparing')).toBe('true')
    expect(state.unmounts).toBe(0)
    expect(chrome.querySelector('[data-presenter]')).not.toBeNull()
    expect(mount.querySelector('output')?.getAttribute('data-ready')).toBe('false')
    expect(launch).toHaveBeenLastCalledWith(false)
    act(() => state.consumer!.onReady(true))
    expect(state.unmounts).toBe(0)
    expect(mount.querySelector('output')?.getAttribute('data-ready')).toBe('true')
    expect(launch).toHaveBeenLastCalledWith(true)
  } finally {
    act(() => root.unmount())
    mount.remove()
    chrome.remove()
  }
})

it('renders the five-tab shape accepted by the public model and waits for paint readiness', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const mount = document.createElement('div'),
    chrome = document.createElement('div'),
    scene = createRef<HTMLDivElement>(),
    root = createRoot(mount),
    launch = vi.fn()
  document.body.append(mount, chrome)
  try {
    act(() =>
      root.render(
        <div ref={scene}>
          <MaterialEffectRoot
            scene={scene}
            chrome={chrome}
            enabled
            capabilitySettled
            onLaunchReady={launch}
          >
            <Registration count={5} />
            <div data-satin-scroll="a" data-satin-primary="true" />
          </MaterialEffectRoot>
        </div>,
      ),
    )
    expect(chrome.querySelector('[data-presenter]')).not.toBeNull()
    expect(launch).toHaveBeenLastCalledWith(false)
    act(() => state.consumer!.onReady(true))
    expect(launch).toHaveBeenLastCalledWith(true)
    expect(mount.querySelector('output')?.getAttribute('data-ready')).toBe('true')
  } finally {
    act(() => root.unmount())
    mount.remove()
    chrome.remove()
  }
})
