// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import type { MirrorNode } from '../lens/Scene.tsx'
import { measureProductionSource } from './capture.ts'
import { ProductionGlassRuntime } from './production.ts'
import { measurePlane } from './productionPlanes.ts'

vi.mock('./capture.ts', () => ({ measureProductionSource: vi.fn() }))
vi.mock('./backdropLayers.ts', () => ({
  backdropClip: () => [0, 0, 440, 956],
  effectiveBackground: () => [0, 0, 0, 1],
  cssColor: vi.fn(),
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.body.replaceChildren()
})

function fixture(contentTop = 50, pinned = false) {
  const host = document.createElement('div')
  const row = document.createElement('div')
  host.style.display = 'block'
  row.style.display = 'block'
  host.append(row)
  document.body.append(host)
  host.scrollTop = 600
  Object.defineProperties(host, {
    clientHeight: { value: 956 },
    scrollHeight: { value: 5000 },
  })
  const rect = (top: number, height: number) =>
    ({ left: 0, top, right: 440, bottom: top + height, width: 440, height }) as DOMRect
  host.getBoundingClientRect = vi.fn(() => rect(0, 956))
  let rowHeight = 20
  row.getBoundingClientRect = vi.fn(() =>
    row.hidden ? rect(0, 0) : rect(contentTop - host.scrollTop, rowHeight),
  )
  let visibleY = 700
  let frame: FrameRequestCallback | undefined
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(callback => {
      frame = callback
      return 1
    }),
  )
  const fire = vi.fn()
  const runtime = Object.create(ProductionGlassRuntime.prototype) as ProductionGlassRuntime
  Object.assign(runtime, {
    resident: { damage: vi.fn() },
    pendingDamage: new Map(),
    planes: new Map([
      [
        'list',
        {
          host,
          window: { top: 500, bottom: 2000, viewport: 956 },
          width: 440,
        },
      ],
    ]),
    preparingPlaneHosts: new Map(),
    pinnedTops: new Map(
      pinned
        ? [
            [
              'list',
              {
                window: { top: 0, bottom: 400, viewport: 956 },
                stale: false,
              },
            ],
          ]
        : [],
    ),
    damaged: new Set(),
    damageGenerations: new Map(),
    fire,
    nextTransport: () => 1,
    schedulePrepare: vi.fn(),
  })
  const queue = runtime as unknown as {
    queueSourceDamage: (target: Node, removed?: boolean) => void
    queueMutationDamage: (record: MutationRecord) => void
  }
  const capture = async () => {
    const node: MirrorNode = {
      id: 'visible',
      kind: 'text',
      text: 'Visible row',
      color: '#fff',
      x: 0,
      y: visibleY,
      width: 100,
      height: 20,
    }
    vi.mocked(measureProductionSource).mockResolvedValue({
      top: 0,
      left: 0,
      layout: { nodes: [node], contentHeight: 5000, width: 440, measuredAt: 0, screen: 'root' },
    })
    return measurePlane(
      host,
      { page: [0, 0, 0], resolution: 1, appearance: 'light' },
      () => 'list',
      false,
      undefined,
      runtime.planes.get('list')!.window,
    )
  }
  return {
    host,
    row,
    runtime,
    queue,
    fire,
    capture,
    flush: () => frame!(0),
    grow: () => {
      rowHeight = 120
      visibleY += 100
    },
    remove: () => {
      row.remove()
      visibleY -= rowHeight
    },
    hide: () => {
      row.hidden = true
      visibleY -= rowHeight
    },
  }
}

it('recaptures shifted visible content after a row above the window grows', async () => {
  const list = fixture()
  const before = await list.capture()
  list.grow()
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
  const after = await list.capture()
  expect(after!.measured.layout.nodes[0].y).toBe(800)
  expect(after!.signature).not.toBe(before!.signature)
})

it('recaptures visible content after removing an above-window row', async () => {
  const list = fixture()
  const before = await list.capture()
  list.remove()
  list.queue.queueMutationDamage({
    target: list.host,
    removedNodes: [list.row],
    addedNodes: [],
  } as unknown as MutationRecord)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
  const after = await list.capture()
  expect(after!.measured.layout.nodes[0].y).toBe(680)
  expect(after!.signature).not.toBe(before!.signature)
})

it('recaptures after a hidden toggle leaves an empty current box', async () => {
  const list = fixture(700)
  const before = await list.capture()
  list.hide()
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
  const after = await list.capture()
  expect(after!.measured.layout.nodes[0].y).toBe(680)
  expect(after!.signature).not.toBe(before!.signature)
})

it('skips updates below both the capture and the pin in a top-down block host', () => {
  const list = fixture(2200, true)
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.runtime.schedulePrepare).not.toHaveBeenCalled()
  expect(list.fire).not.toHaveBeenCalled()
})

it.each(['column-reverse', 'row-reverse'])(
  'recaptures downstream updates in a %s host',
  direction => {
    const list = fixture(2200)
    list.host.style.display = 'flex'
    list.host.style.flexDirection = direction
    list.queue.queueSourceDamage(list.row)
    list.flush()
    expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
  },
)

it.each(['flex-end', 'center'])('recaptures in a column host with %s alignment', alignment => {
  const list = fixture(2200)
  list.host.style.display = 'flex'
  list.host.style.flexDirection = 'column'
  list.host.style.justifyContent = alignment
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
})

it('detaches a sticky pin even when its current box lies below the pin window', () => {
  const list = fixture(700, true)
  list.row.style.position = 'sticky'
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.fire.mock.calls[0][0].removePinned).toEqual(['list'])
})

it('damages an in-window descendant painted by an otherwise downstream parent', () => {
  const list = fixture(2200)
  const child = document.createElement('div')
  child.getBoundingClientRect = () => ({ top: 100, left: 0, width: 100, height: 20 }) as DOMRect
  list.row.append(child)
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
})

it('damages unmeasurable targets and a detached plane host', () => {
  const list = fixture(2200)
  list.row.getBoundingClientRect = () => {
    throw new Error('unmeasurable')
  }
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
  vi.mocked(list.runtime.schedulePrepare).mockClear()
  list.host.remove()
  list.queue.queueMutationDamage({
    target: document.body,
    removedNodes: [list.host],
    addedNodes: [],
  } as unknown as MutationRecord)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
})

it('posts one pin detach and one preparation for N distinct row updates in a frame', () => {
  const list = fixture(50, true)
  for (let index = 0; index < 50; index++) {
    const row = list.row.cloneNode() as HTMLElement
    row.getBoundingClientRect = () =>
      ({ top: -550 + index, left: 0, width: 100, height: 20 }) as DOMRect
    list.host.append(row)
    list.queue.queueSourceDamage(row)
  }
  list.flush()
  expect(list.fire).toHaveBeenCalledOnce()
  expect(list.fire.mock.calls[0][0].removePinned).toEqual(['list'])
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
})

it('keeps a newer mutation damaged while a capture is in flight', () => {
  const list = fixture(2200)
  list.runtime.preparingPlaneHosts.set('list', list.host)
  list.runtime.preparingPlaneWindows = new Map([
    [
      'list',
      {
        host: list.host,
        width: 440,
        window: { top: 2000, bottom: 3500, viewport: 956 },
      },
    ],
  ])
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
  expect(list.runtime.damageGenerations.get('list')).toBe(1)
})

it('skips downstream updates in a non-shrinking top-down flex column', () => {
  const list = fixture(2200)
  list.host.style.display = 'flex'
  list.host.style.flexDirection = 'column'
  list.host.style.position = 'relative'
  list.row.style.flexShrink = '0'
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.runtime.schedulePrepare).not.toHaveBeenCalled()
})

it('recaptures a downstream row in a bottom-anchored host', () => {
  const list = fixture(2200)
  list.host.style.position = 'relative'
  list.host.style.bottom = '0px'
  list.queue.queueSourceDamage(list.row)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
})

it('damages a style change even if removing a transform leaves the new box below the window', () => {
  const list = fixture(2200)
  list.queue.queueMutationDamage({
    type: 'attributes',
    attributeName: 'style',
    target: list.row,
    removedNodes: [],
    addedNodes: [],
  } as unknown as MutationRecord)
  list.flush()
  expect(list.runtime.schedulePrepare).toHaveBeenCalledOnce()
})
