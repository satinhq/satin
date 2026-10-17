// @vitest-environment happy-dom
import { act, createRef, useContext, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const gpu = vi.hoisted(() => ({ create: vi.fn(), dispose: vi.fn() }))
vi.mock('./webgpu/production.ts', () => ({
  ProductionGlassRuntime: { create: gpu.create },
}))

let cleanup: (() => void) | undefined
beforeEach(() => {
  vi.resetModules()
  // Imports use real I/O. Frames belong to the test so readiness never depends
  // on a loaded worker reaching happy-dom's next rendering tick in time.
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  vi.stubEnv('DEV', false)
  vi.stubEnv('MODE', 'production')
  vi.stubEnv('SATIN_STRICT_GLASS', '')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  gpu.create.mockReset().mockResolvedValue({
    commitAppearance() {},
    updateGeometry() {},
    setTabSelection() {},
    setContentHost() {},
    retargetContent() {},
    dispose: gpu.dispose,
  })
  gpu.dispose.mockReset()
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  document.querySelector(':root > pre[data-satin-glass-error]')?.remove()
  window.history.replaceState(null, '', '/')
  delete document.documentElement.dataset.satinGlass
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.doUnmock('./fallback/runtime.ts')
  vi.restoreAllMocks()
})

async function mount() {
  const { MaterialEffectRoot } = await import('./MaterialEffectRoot.tsx')
  const { MaterialEffectContext } = await import('./liquidContext.ts')
  const { installGlassErrorAlert } = await import('./errorAlert.ts')
  const errors = await import('./errors.ts')
  const diagnostic = vi.fn()
  const unsubscribe = errors.subscribeGlassErrors(diagnostic)
  installGlassErrorAlert()
  function Registration() {
    const context = useContext(MaterialEffectContext)!
    useLayoutEffect(
      () =>
        context.registerTabs('tabs', {
          items: [
            { id: 'a', label: 'A', icon: null },
            { id: 'b', label: 'B', icon: null },
          ],
          selected: 'b',
          onSelect() {},
        }),
      [context.registerTabs],
    )
    return <output data-backend={context.backend} data-ready={context.ready} />
  }
  const host = document.createElement('div')
  const chrome = document.createElement('div')
  const scene = createRef<HTMLDivElement>()
  const root = createRoot(host)
  document.body.append(host, chrome)
  await act(async () =>
    root.render(
      <div ref={scene}>
        <MaterialEffectRoot scene={scene} chrome={chrome} enabled capabilitySettled>
          <Registration />
          <input defaultValue="retained draft" />
          <div data-satin-scroll="test" data-satin-primary="true" />
        </MaterialEffectRoot>
      </div>,
    ),
  )
  cleanup = () => {
    act(() => root.unmount())
    unsubscribe()
    host.remove()
    chrome.remove()
  }
  return { host, chrome, diagnostic, ...errors }
}

it.each([
  'gpu-unavailable',
  'adapter-unavailable',
  'device-request',
  'device-lost',
  'presentation',
] as const)(
  'release %s switches to real fallback material and preserves diagnostics and app content',
  async code => {
    const view = await mount()
    const input = view.host.querySelector('input')!
    const tab = view.chrome.querySelector('[data-tab-index]')!
    await act(async () => {
      view.reportGlassError(code, Error('forced terminal failure'), 'release test')
    })
    expect(view.host.querySelector('output')?.dataset.backend).toBe('fallback')
    await waitForFallback(view)
    expect(document.querySelector('[data-satin-glass-error]')).toBeNull()
    expect(view.host.querySelector('input')).toBe(input)
    expect(input.value).toBe('retained draft')
    expect(view.chrome.querySelector('[data-tab-index]')).toBe(tab)
    expect(view.diagnostic).toHaveBeenCalledWith(expect.objectContaining({ code }))
    expect(console.error).toHaveBeenCalled()
    expect(gpu.dispose).toHaveBeenCalledOnce()
  },
)

it.each([
  'development',
  'test',
  'forced-webgpu',
  'strict-query',
  'strict-attribute',
  'strict-build',
])('%s keeps errors loud and never demotes', async mode => {
  if (mode === 'development') vi.stubEnv('DEV', true)
  if (mode === 'test') vi.stubEnv('MODE', 'test')
  if (mode === 'forced-webgpu') window.history.replaceState(null, '', '/?glass=webgpu')
  if (mode === 'strict-query') window.history.replaceState(null, '', '/?glass=strict')
  if (mode === 'strict-attribute') document.documentElement.dataset.satinGlass = 'strict'
  if (mode === 'strict-build') {
    vi.stubEnv('SATIN_STRICT_GLASS', '1')
    window.history.replaceState(null, '', '/?glass=fallback')
  }
  const view = await mount()
  act(() => view.reportGlassError('presentation', 'capture coverage failed', 'capture'))
  expect(view.host.querySelector('output')?.dataset.backend).toBe('webgpu')
  expect(view.chrome.querySelector('[data-satin-fallback-material]')).toBeNull()
  expect(document.querySelector('[data-satin-glass-error]')?.textContent).toContain(
    'capture coverage failed',
  )
})

it('a rejected release startup selects fallback and releases readiness', async () => {
  gpu.create.mockRejectedValue(Error('navigator.gpu is unavailable in the glass renderer'))
  const view = await mount()
  await waitForFallback(view)
  expect(view.host.querySelector('output')?.dataset.ready).toBe('true')
  expect(document.querySelector('[data-satin-glass-error]')).toBeNull()
})

async function waitForFallback(view: Awaited<ReturnType<typeof mount>>) {
  await act(async () => {
    // GlassPresentation lazy-loads the real fallback runtime. React's act does
    // not await that import, and vi.waitFor's 1 s deadline measured transform
    // and module I/O under full-suite load rather than a product deadline.
    await import('./fallback/runtime.ts')
    await vi.dynamicImportSettled()
    vi.advanceTimersToNextFrame()
  })
  expect(view.chrome.querySelector('[data-satin-fallback-material]')).not.toBeNull()
  expect(view.host.querySelector('output')?.dataset.ready).toBe('true')
}

it('preserves the bounded source rebuild before demoting on its terminal failure', async () => {
  const view = await mount()
  act(() =>
    view.reportGlassError('presentation', 'rebuilding', 'source', undefined, { recovering: true }),
  )
  expect(view.host.querySelector('output')?.dataset.backend).toBe('webgpu')
  expect(view.diagnostic).toHaveBeenCalledOnce()
  act(() => view.reportGlassError('presentation', 'rebuild exhausted', 'source'))
  await waitForFallback(view)
})

it('release null-adapter exhaustion reaches fallback and the diagnostic hook', async () => {
  const view = await mount()
  act(() =>
    view.reportGlassError(
      'adapter-unavailable',
      'navigator.gpu.requestAdapter returned null after five attempts',
      'device acquisition',
    ),
  )
  await waitForFallback(view)
  expect(view.diagnostic).toHaveBeenCalledWith(expect.objectContaining({ transient: true }))
})

it('release adapter fallback survives a lazy import beyond the former polling deadline', async () => {
  // Deliberately cross the old helper's 1 s limit. Keep the real runtime and
  // assertions: slow test-module I/O must not be mistaken for missing glass.
  vi.doMock('./fallback/runtime.ts', async importOriginal => {
    await new Promise(resolve => setTimeout(resolve, 1100))
    return importOriginal()
  })
  const view = await mount()
  act(() =>
    view.reportGlassError(
      'adapter-unavailable',
      'navigator.gpu.requestAdapter returned null after five attempts',
      'device acquisition',
    ),
  )
  await waitForFallback(view)
  expect(view.diagnostic).toHaveBeenCalledWith(expect.objectContaining({ transient: true }))
})

it('release adapter fallback publishes readiness only after fonts and a rendering opportunity', async () => {
  let finishFonts!: () => void
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: new Promise<void>(resolve => {
        finishFonts = resolve
      }),
    },
  })
  const view = await mount()
  act(() =>
    view.reportGlassError(
      'adapter-unavailable',
      'navigator.gpu.requestAdapter returned null after five attempts',
      'device acquisition',
    ),
  )
  await act(async () => {
    await vi.dynamicImportSettled()
  })
  expect(view.host.querySelector('output')?.dataset.backend).toBe('fallback')
  expect(view.chrome.querySelector('[data-satin-fallback-material]')).not.toBeNull()
  expect(view.host.querySelector('output')?.dataset.ready).toBe('false')
  // A frame while fonts are pending must not release readiness.
  await act(async () => {
    vi.advanceTimersToNextFrame()
  })
  expect(view.host.querySelector('output')?.dataset.ready).toBe('false')
  await act(async () => {
    finishFonts()
  })
  expect(view.host.querySelector('output')?.dataset.ready).toBe('false')
  await waitForFallback(view)
  expect(view.diagnostic).toHaveBeenCalledWith(expect.objectContaining({ transient: true }))
  expect(gpu.dispose).toHaveBeenCalledOnce()
})

it('explicit strict glass reports exhausted adapters loudly', async () => {
  window.history.replaceState(null, '', '/?glass=strict')
  const view = await mount()
  act(() =>
    view.reportGlassError(
      'adapter-unavailable',
      'navigator.gpu.requestAdapter returned null after five attempts',
      'device acquisition',
    ),
  )
  expect(view.host.querySelector('output')?.dataset.backend).toBe('webgpu')
  expect(document.querySelector('[data-satin-glass-error]')?.textContent).toContain(
    'after five attempts',
  )
})

it('returns release glass to WebGPU after adapter reconstruction without losing app state', async () => {
  const view = await mount()
  const input = view.host.querySelector('input')!
  act(() => {
    view.setGlassAdapterRecovery(true)
    view.reportGlassError(
      'readiness-timeout',
      'Adapter still unavailable at readiness deadline',
      'region-presentation',
    )
  })
  await waitForFallback(view)
  act(() => view.setGlassAdapterRecovery(false))
  await act(async () => {
    await vi.dynamicImportSettled()
  })
  expect(view.host.querySelector('output')?.dataset.backend).toBe('webgpu')
  expect(view.host.querySelector('input')).toBe(input)
  expect(input.value).toBe('retained draft')
  expect(view.getGlassErrors()).toHaveLength(1)
  act(() => {
    view.setGlassAdapterRecovery(true)
    view.reportGlassError('validation', 'Unrelated invalid GPU operation', 'draw')
  })
  await waitForFallback(view)
  act(() => view.setGlassAdapterRecovery(false))
  expect(view.host.querySelector('output')?.dataset.backend).toBe('fallback')
})

it.each(['device-request', 'context-configure', 'presentation', 'out-of-memory'] as const)(
  'clears a %s outage only after pending device reconstruction succeeds',
  async code => {
    const view = await mount()
    act(() => {
      view.setGlassAdapterRecovery(true)
      view.reportGlassError(code, 'Transient loss during resume', 'device recreation')
    })
    await waitForFallback(view)
    expect(view.host.querySelector('output')?.dataset.backend).toBe('fallback')
    act(() => view.setGlassAdapterRecovery(false))
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    expect(view.host.querySelector('output')?.dataset.backend).toBe('webgpu')
    expect(view.getGlassErrors()).toHaveLength(1)
  },
)

it('retries a terminal worker transport failure after the visible cooldown', async () => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  const view = await mount()
  const input = view.host.querySelector('input')!
  act(() => view.reportGlassError('worker-startup', 'Worker startup failed', 'startup'))
  await waitForFallback(view)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
    await vi.dynamicImportSettled()
  })
  expect(view.host.querySelector('output')?.dataset.backend).toBe('webgpu')
  expect(view.host.querySelector('input')).toBe(input)
  expect(view.getGlassErrors()).toHaveLength(1)
})
