// @vitest-environment happy-dom
import { act, createRef, useContext, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MaterialEffectRoot } from './MaterialEffectRoot.tsx'
import { MaterialEffectContext } from './liquidContext.ts'
import { getGlassErrors } from './errors.ts'

// Real MaterialEffectRoot + GlassPresentation over a scripted WebGPU runtime. NavigatorHost holds
// back-swipes while `preparingSources` is true (source-pending), so a source that can no longer
// arrive must clear it: the glass error stays reported, navigation proceeds without glass sources.
type Options = {
  onPresented?: (ready: boolean) => void
  onPresentationError?: (error: unknown, rebuilding?: boolean) => void
}
const state = vi.hoisted(() => ({
  create: undefined as undefined | ((options: Options) => Promise<unknown>),
  options: undefined as undefined | Options,
}))
vi.mock('./webgpu/production.ts', () => ({
  ProductionGlassRuntime: {
    create(options: Options) {
      state.options = options
      return state.create!(options)
    },
  },
}))

function Registration() {
  const context = useContext(MaterialEffectContext)!,
    { registerTabs } = context
  useLayoutEffect(() => {
    registerTabs('tabs', {
      items: [
        { id: 'a', label: 'A', icon: null },
        { id: 'b', label: 'B', icon: null },
      ],
      selected: 'a',
      onSelect() {},
    })
    return () => registerTabs('tabs', undefined)
  }, [registerTabs])
  return <output data-ready={context.ready} data-preparing={context.preparingSources} />
}

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  state.create = undefined
  state.options = undefined
})

function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'),
    chrome = document.createElement('div'),
    scene = createRef<HTMLDivElement>(),
    root = createRoot(host)
  document.body.append(host, chrome)
  act(() =>
    root.render(
      <div ref={scene}>
        <MaterialEffectRoot scene={scene} chrome={chrome} enabled capabilitySettled>
          <Registration />
          <div data-satin-scroll="a" data-satin-primary="true" />
        </MaterialEffectRoot>
      </div>,
    ),
  )
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
    chrome.remove()
  }
  const output = () => host.querySelector('output')!
  return {
    preparing: () => output().getAttribute('data-preparing'),
    ready: () => output().getAttribute('data-ready'),
  }
}
const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve()
  })

it('a failed glass startup is reported and does not leave navigation waiting for sources', async () => {
  state.create = async () => {
    throw Error('WebGPU startup exceeded 2.5 seconds')
  }
  const before = getGlassErrors().length
  const view = mount()
  expect(view.preparing()).toBe('true')
  await flush()
  expect(getGlassErrors().length).toBeGreaterThan(before)
  expect(view.ready()).toBe('false')
  expect(view.preparing()).toBe('false')
})

it('keeps navigation waiting only while the one bounded source rebuild is in flight', async () => {
  state.create = () => new Promise(() => {})
  const view = mount()
  await flush()
  act(() => state.options!.onPresented?.(true))
  expect(view.ready()).toBe('true')
  // First failure: the renderer rebuilds every source once.
  act(() => state.options!.onPresentationError?.(Error('source failure'), true))
  expect(view.ready()).toBe('false')
  expect(view.preparing()).toBe('true')
  // The rebuild failed too: nothing is in flight any more.
  act(() => state.options!.onPresentationError?.(Error('source failure')))
  expect(view.preparing()).toBe('false')
  // A later successful prepare restores readiness and source gating.
  act(() => state.options!.onPresented?.(true))
  expect(view.ready()).toBe('true')
  expect(view.preparing()).toBe('true')
})
