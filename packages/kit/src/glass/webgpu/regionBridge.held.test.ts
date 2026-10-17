// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { GlassRegionRegistry } from '../regionRegistry.ts'
import { Glass } from '../regions.ts'
import type { WebGPUClient } from './client.ts'
import { RegionBridge } from './regionBridge.ts'

// Regions of an unselected tab are held, and stay held after their tab is selected again until
// that tab's own source preparation commits: the worker never draws another tab's backdrop into
// them. Their ink is captured when they resume, and capture canvases are released only after the
// request that carries their bitmap has resolved, on every exit.

const captures = vi.hoisted(() => ({
  captured: [] as HTMLCanvasElement[],
  released: [] as HTMLCanvasElement[],
  /** When set, the next capture waits for this to be called (a refresh can be cancelled meanwhile). */
  hold: undefined as undefined | (() => void),
  holding: false,
}))
vi.mock('./foreground.ts', () => ({
  captureRegionForeground: vi.fn(async () => {
    const canvas = document.createElement('canvas')
    captures.captured.push(canvas)
    if (captures.holding) await new Promise<void>(resolve => (captures.hold = resolve))
    return canvas
  }),
}))
vi.mock('./captureRelease.ts', () => ({
  CAPTURE_RELEASE_FALLBACK_MS: 5000,
  releaseCaptureCanvases: vi.fn((canvases: HTMLCanvasElement[]) => {
    captures.released.push(...canvases.splice(0))
  }),
}))
vi.stubGlobal(
  'createImageBitmap',
  vi.fn(async () => ({ width: 300, height: 150, close() {} })),
)

afterEach(() => {
  document.body.replaceChildren()
  captures.captured.length = 0
  captures.released.length = 0
  captures.hold = undefined
  captures.holding = false
})

type Message = {
  request: {
    type: string
    snapshot?: { regions: { id: string; suspended?: boolean }[] }
    requests?: Message['request'][]
  }
}

function setup({ overlay = false, emerge = false } = {}) {
  const messages: Message[] = []
  /** Replies the test resolves by hand (by request type), to order sends against releases. */
  const pending: { type: string; resolve: () => void }[] = []
  let deferSources = false
  const client = {
    request: vi.fn((message: Message) => {
      messages.push(message)
      const types = [message.request.type, ...(message.request.requests ?? []).map(r => r.type)]
      if (deferSources && types.includes('source'))
        return new Promise<void>(resolve => pending.push({ type: message.request.type, resolve }))
      return Promise.resolve()
    }),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  const panel = document.createElement('div')
  panel.dataset.satinTabPanel = 'merge'
  panel.dataset.satinTabActive = 'true'
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  const lift = document.createElement('canvas')
  element.append(canvas, lift)
  panel.append(element)
  source.append(panel)
  document.body.append(source)
  // An inactive tab keeps its layout (visibility: hidden): the region still measures.
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 64,
    y: 284,
    width: 136,
    height: 92,
    top: 284,
    left: 64,
    right: 200,
    bottom: 376,
    toJSON: () => ({}),
  })
  for (const presenter of [canvas, lift])
    Object.defineProperty(presenter, 'transferControlToOffscreen', { value: () => ({}) })
  if (emerge) {
    // A glass menu's rows: the ink its region captures while it is on screen.
    const rows = document.createElement('div')
    rows.dataset.satinMenuInk = ''
    rows.textContent = 'Rename'
    element.append(rows)
    vi.spyOn(rows, 'getBoundingClientRect').mockReturnValue({
      x: 70,
      y: 290,
      width: 120,
      height: 44,
      top: 290,
      left: 70,
      right: 190,
      bottom: 334,
      toJSON: () => ({}),
    })
  }
  registry.register({
    id: 'button',
    element,
    canvas,
    ...(overlay ? { overlay: lift } : {}),
    descriptor: {
      id: 'button',
      material: overlay ? Glass.regular.interactive().material : Glass.regular.material,
      shape: 'capsule',
      ...(emerge ? { emerge: { from: { x: 150, y: 60, width: 44, height: 44, radius: 22 } } } : {}),
    },
  })
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  const scenes = () =>
    messages.flatMap(message =>
      [message.request, ...(message.request.requests ?? [])].filter(r => r.type === 'scene'),
    )
  const lastRegion = () => scenes().at(-1)!.snapshot!.regions[0]
  return {
    bridge,
    panel,
    canvas,
    messages,
    pending,
    lastRegion,
    deferSources: (value: boolean) => (deferSources = value),
  }
}

it('holds a region while its tab is unselected, and after that until its own source commits', async () => {
  const { bridge, panel, canvas, lastRegion } = setup()
  await bridge.refresh()
  expect(lastRegion().suspended).toBeUndefined()
  expect(bridge.inactiveRegionIds()).toEqual([])

  panel.dataset.satinTabActive = 'false'
  await bridge.refresh()
  expect(lastRegion()).toMatchObject({ id: 'button', suspended: true })
  // The other tab's preparation commits: the worker is told to hold this region.
  expect(bridge.inactiveRegionIds()).toEqual(['button'])
  await bridge.sourceInstalled(Promise.resolve(), 'light')
  expect(lastRegion().suspended).toBe(true)
  // The presenter stays attached and visible: it keeps the pixels it had when the tab was left.
  expect(canvas.hidden).toBe(false)

  // Selected again: an ordinary refresh (a scroll, a resize) must not resume it, because the
  // worker's backdrop is still the other tab's.
  panel.dataset.satinTabActive = 'true'
  await bridge.refresh()
  expect(lastRegion().suspended).toBe(true)
  await bridge.refresh()
  expect(lastRegion().suspended).toBe(true)

  // Its own tab's source preparation commits. Reading the unselected regions for the batch
  // releases nothing: the worker has not installed anything yet.
  expect(bridge.inactiveRegionIds()).toEqual([])
  await bridge.refresh()
  expect(lastRegion().suspended).toBe(true)
  // The worker acknowledged the batch: released, and its scene follows.
  await bridge.sourceInstalled(Promise.resolve(), 'light')
  expect(lastRegion().suspended).toBeUndefined()
  await bridge.refresh()
  expect(lastRegion().suspended).toBeUndefined()
  bridge.unbind()
})

it('a batch the worker rejects releases nothing: the region stays held and no scene is sent', async () => {
  const { bridge, panel, messages, lastRegion } = setup()
  await bridge.refresh()
  panel.dataset.satinTabActive = 'false'
  await bridge.refresh()
  panel.dataset.satinTabActive = 'true'
  await bridge.refresh()
  const sent = messages.length
  // The worker threw before it installed the planes (and so before it resumed anything).
  await expect(
    bridge.sourceInstalled(Promise.reject(Error('Retained glass plane is not resident')), 'light'),
  ).rejects.toThrow('not resident')
  expect(messages.length).toBe(sent)
  await bridge.refresh()
  expect(lastRegion().suspended).toBe(true)
  // The rebuilt preparation is acknowledged: now it resumes.
  await bridge.sourceInstalled(Promise.resolve(), 'light')
  expect(lastRegion().suspended).toBeUndefined()
  bridge.unbind()
})

it('a held element moved into the selected panel is no longer held', async () => {
  const { bridge, panel, lastRegion } = setup()
  await bridge.refresh()
  panel.dataset.satinTabActive = 'false'
  await bridge.refresh()
  expect(lastRegion().suspended).toBe(true)
  const selected = document.createElement('div')
  selected.dataset.satinTabPanel = 'scroll'
  selected.dataset.satinTabActive = 'true'
  panel.parentElement!.append(selected)
  selected.append(panel.firstElementChild!)
  await bridge.refresh()
  expect(lastRegion().suspended).toBeUndefined()
  // Moved out of every panel while held: also not held.
  selected.dataset.satinTabActive = 'false'
  await bridge.refresh()
  expect(lastRegion().suspended).toBe(true)
  selected.parentElement!.append(selected.firstElementChild!)
  await bridge.refresh()
  expect(lastRegion().suspended).toBeUndefined()
  bridge.unbind()
})

it('a region that was never in an unselected tab is never held (first visit behaves as before)', async () => {
  const { bridge, lastRegion } = setup()
  await bridge.refresh()
  await bridge.refresh()
  expect(lastRegion().suspended).toBeUndefined()
  bridge.unbind()
})

it("does not capture a held region's ink; captures it when the region resumes", async () => {
  const { bridge, panel, messages } = setup({ overlay: true })
  await bridge.refresh()
  expect(captures.captured).toHaveLength(1)
  panel.dataset.satinTabActive = 'false'
  // A rebind (every tab switch) forgets captured ink: a held region must not be recaptured for it.
  bridge.invalidateSources()
  await bridge.refresh()
  await bridge.refresh()
  expect(captures.captured).toHaveLength(1)
  panel.dataset.satinTabActive = 'true'
  await bridge.refresh()
  expect(captures.captured).toHaveLength(1)
  await bridge.sourceInstalled(Promise.resolve(), 'light')
  expect(captures.captured).toHaveLength(2)
  // The ink and the resumed scene travel in one transaction.
  const transaction = messages.at(-1)!.request
  expect(transaction.type).toBe('transaction')
  expect(transaction.requests!.map(request => request.type)).toEqual(['source', 'scene'])
  bridge.unbind()
})

it('does not capture the menu ink of a held emerging region', async () => {
  const { bridge, panel, lastRegion } = setup({ emerge: true })
  panel.dataset.satinTabActive = 'false'
  const before = captures.captured.length
  await bridge.refresh()
  await bridge.refresh()
  expect(lastRegion()).toMatchObject({ id: 'button', suspended: true })
  expect(captures.captured).toHaveLength(before)
  bridge.unbind()
})

it('releases a capture canvas only after the request carrying its bitmap has resolved', async () => {
  const { bridge, pending, deferSources } = setup({ overlay: true })
  deferSources(true)
  const refresh = bridge.refresh()
  await vi.waitFor(() => expect(pending).toHaveLength(1))
  // The bitmap is on its way to the worker: its canvas is still intact.
  expect(captures.captured).toHaveLength(1)
  expect(captures.released).toHaveLength(0)
  pending[0].resolve()
  await refresh
  expect(captures.released).toEqual(captures.captured)
  bridge.unbind()
})

it('inside a preparation, releases capture canvases after the transaction has been sent', async () => {
  const { bridge, pending, deferSources } = setup({ overlay: true })
  deferSources(true)
  const changed = bridge.sourceChanged('light')
  await vi.waitFor(() => expect(pending).toHaveLength(1))
  expect(pending[0].type).toBe('transaction')
  expect(captures.released).toHaveLength(0)
  pending[0].resolve()
  await changed
  expect(captures.released).toEqual(captures.captured)
  bridge.unbind()
})

it('releases the capture canvas when the refresh is cancelled during the capture', async () => {
  const { bridge } = setup({ overlay: true })
  captures.holding = true
  const refresh = bridge.refresh()
  await vi.waitFor(() => expect(captures.hold).toBeDefined())
  // The content is retargeted while the capture runs: this refresh is superseded.
  bridge.invalidateSources()
  captures.hold!()
  await refresh
  expect(captures.captured).toHaveLength(1)
  expect(captures.released).toEqual(captures.captured)
  bridge.unbind()
})

it('a carrying request the worker never answers does not keep the capture canvas forever', async () => {
  vi.useFakeTimers()
  try {
    const { bridge, pending, deferSources } = setup({ overlay: true })
    deferSources(true)
    void bridge.refresh()
    await vi.advanceTimersByTimeAsync(20)
    expect(pending).toHaveLength(1)
    expect(captures.released).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(4900)
    expect(captures.released).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(captures.released).toEqual(captures.captured)
    bridge.unbind()
  } finally {
    vi.useRealTimers()
  }
})
