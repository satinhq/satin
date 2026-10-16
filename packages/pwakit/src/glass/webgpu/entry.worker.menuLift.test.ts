import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Drives the real worker module (entry.worker.ts) through its message handler, with only the
// GPU-facing pieces replaced: the menu lift path (dispatch, hold before install, replay on the
// menu-lift source install, and cleanup on release, visibility and detach) is the worker's own.
vi.mock('./layers.ts', () => ({
  LayerDevice: class {
    liveDevice = undefined
    subscribe() {}
    report() {
      return {}
    }
    detach() {}
    async ready() {}
  },
}))
vi.mock('./backdrop.ts', () => ({
  Backdrop: {
    for: () => ({
      suspend() {},
      report() {
        return []
      },
      setEdges() {},
      setLayers() {},
      setScroll() {},
    }),
  },
}))
vi.mock('./raster.ts', () => ({
  drawableCosts: () => ({ pixels: 0, waitMs: 0, count: 0 }),
  WebGPURaster: class {
    setup: { spec: unknown; lift?: unknown } | undefined
    lifts: unknown[] = []
    stats = { presentPixels: 0, presentAttachmentPixels: 0, draws: 0 }
    get spec() {
      return this.setup?.spec
    }
    async init() {}
    install(setup: { spec: unknown }) {
      this.setup = setup
    }
    async settled() {}
    setSubmissionGate() {}
    setCovered() {}
    setVisible() {}
    setAppearance() {}
    setLift(lift: unknown) {
      this.lifts.push(lift)
    }
    dispose() {}
    clear() {}
    draw() {}
    forkRegion() {
      return new (this.constructor as new () => unknown)()
    }
    report() {
      return {}
    }
    presentation() {
      return undefined
    }
  },
}))

type Posted = {
  id?: number
  value?: unknown
  error?: string
  glassError?: { stage: string; message: string }
}
let posted: Posted[] = [],
  nextId = 1

async function loadWorker() {
  vi.resetModules()
  posted = []
  vi.stubGlobal('postMessage', (message: Posted) => {
    posted.push(message)
  })
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('addEventListener', () => {})
  await import('./entry.worker.ts')
}
async function send(request: Record<string, unknown>) {
  const id = nextId++
  ;(globalThis as unknown as { onmessage: (event: { data: unknown }) => void }).onmessage({
    data: { id, request },
  })
  for (let i = 0; i < 200 && !posted.some(message => message.id === id); i++)
    await Promise.resolve()
  const reply = posted.find(message => message.id === id)
  if (!reply) throw Error('no worker reply for ' + String(request.type))
  return reply
}
const input = (phase: string, at: number) =>
  send({ type: 'surface-input', id: 'menu-lift', phase, at })
const menuState = async () => {
  const reply = await send({ type: 'report' })
  if (reply.error) throw Error('report failed: ' + reply.error)
  return (reply.value as { interactive: { menu: { active: boolean } } }).interactive.menu
}
const spec = {
  id: 'region:bar-trigger',
  shape: { first: { centerX: 22, centerY: 22, halfWidth: 22, halfHeight: 22, radius: 22 } },
}
const installMenuLift = async () => {
  await send({
    type: 'attach-layer',
    layer: { id: 'menu-lift', depth: 50, attachment: { kind: 'fixed' } },
    canvas: {},
  })
  return send({
    type: 'layer-source',
    layerId: 'menu-lift',
    setup: { spec, liftOverlay: true },
    front: {},
    rear: {},
    glyphs: {},
  })
}
const glassErrors = () =>
  posted.filter(message => message.glassError).map(message => message.glassError!.stage)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await loadWorker()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('a press before the menu lift source is installed is held and replayed on its install (no glass error)', async () => {
  expect((await input('rest', 1)).error).toBeUndefined()
  expect((await input('pressed', 2)).error).toBeUndefined()
  expect((await menuState()).active).toBe(false)
  await installMenuLift()
  expect((await menuState()).active).toBe(true)
  expect(glassErrors()).toEqual([])
})

it('release: a contact that ends before the source arrives never reports an error', async () => {
  await input('pressed', 1)
  await input('releasing', 2)
  vi.advanceTimersByTime(10_000)
  await Promise.resolve()
  expect(glassErrors()).toEqual([])
  await installMenuLift()
  expect((await menuState()).active).toBe(false)
})

it('visibility: hiding the worker clears a held press (no error later, no replay)', async () => {
  await input('pressed', 1)
  await send({ type: 'visible', visible: false })
  vi.advanceTimersByTime(10_000)
  await Promise.resolve()
  expect(glassErrors()).toEqual([])
})

it('a duplicate foreground signal keeps a new press until its glass source arrives', async () => {
  expect(
    (await send({ type: 'visible', visible: true, appearance: 'light' })).error,
  ).toBeUndefined()
  await input('pressed', 1)
  expect(
    (await send({ type: 'visible', visible: true, appearance: 'light' })).error,
  ).toBeUndefined()
  await installMenuLift()
  expect((await menuState()).active).toBe(true)
  expect(glassErrors()).toEqual([])
})

it('detach: detaching the menu lift layer clears a held press (no error later)', async () => {
  await input('pressed', 1)
  await send({
    type: 'attach-layer',
    layer: { id: 'menu-lift', depth: 50, attachment: { kind: 'fixed' } },
    canvas: {},
  })
  await send({ type: 'detach-layer', layerId: 'menu-lift' })
  vi.advanceTimersByTime(10_000)
  await Promise.resolve()
  expect(glassErrors()).toEqual([])
})

it('a held press whose source never arrives is a loud glass error; an unknown surface is rejected', async () => {
  await input('pressed', 1)
  vi.advanceTimersByTime(3000)
  await Promise.resolve()
  expect(glassErrors()).toEqual(['menu lift'])
  expect(
    (await send({ type: 'surface-input', id: 'other', phase: 'pressed', at: 5 })).error,
  ).toMatch(/Unknown interactive glass surface/)
})
