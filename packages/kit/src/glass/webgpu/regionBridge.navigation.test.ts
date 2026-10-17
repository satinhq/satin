// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { GlassRegionRegistry } from '../regionRegistry.ts'
import { Glass } from '../regions.ts'
import type { GlassRendererRequest } from '../rendererContract.ts'
import type { WebGPUClient } from './client.ts'
import { captureRegionForeground } from './foreground.ts'
import { RegionBridge } from './regionBridge.ts'

vi.mock('./foreground.ts', () => ({
  captureRegionForeground: vi.fn(async () => document.createElement('canvas')),
}))
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function fixture(overlay = false) {
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  vi.stubGlobal('createImageBitmap', async () => ({ width: 140, height: 84, close() {} }))
  const source = document.createElement('div')
  const element = document.createElement('div')
  const canvas = document.createElement('canvas')
  const ink = document.createElement('canvas')
  element.append(canvas, ...(overlay ? [ink] : []))
  source.append(element)
  document.body.append(source)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 40, 100, 44))
  for (const target of [canvas, ink])
    Object.defineProperty(target, 'transferControlToOffscreen', { value: () => ({}) })
  const registry = new GlassRegionRegistry()
  registry.register({
    id: 'incoming',
    element,
    canvas,
    ...(overlay ? { overlay: ink } : {}),
    descriptor: { id: 'incoming', material: Glass.regular.material, shape: 'capsule' },
  })
  const messages: GlassRendererRequest[] = []
  const client = {
    request: async ({ request }: { request: GlassRendererRequest }) => {
      messages.push(request)
      return request.type === 'scene'
        ? { navigation: 'push-1', presented: request.snapshot.regions.map(region => region.id) }
        : undefined
    },
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  return { bridge, messages, canvas }
}
it('retires an ordinary scene whose foreground capture crosses navigation ownership', async () => {
  let finish!: (canvas: HTMLCanvasElement) => void
  vi.mocked(captureRegionForeground).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  const { bridge, messages } = fixture(true)
  let release: (() => void) | undefined
  try {
    const ordinary = bridge.refresh()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    release = bridge.holdNavigation()
    finish(document.createElement('canvas'))
    await ordinary
    expect(messages.filter(message => message.type === 'scene')).toEqual([])
  } finally {
    release?.()
    bridge.unbind()
  }
  // A source update stages its scene before publishing one worker transaction.
  // Cross ownership at that admission boundary, after the scene itself was valid.
  const staged = fixture()
  type RefreshBoundary = { refreshNow(epoch: number, waitForCoverage: boolean): Promise<void> }
  const boundary = staged.bridge as unknown as RefreshBoundary
  const refresh = boundary.refreshNow.bind(boundary)
  let releaseBatch: (() => void) | undefined
  vi.spyOn(boundary, 'refreshNow').mockImplementation(async (epoch, waitForCoverage) => {
    await refresh(epoch, waitForCoverage)
    releaseBatch = staged.bridge.holdNavigation()
  })
  try {
    await staged.bridge.sourceChanged('light')
    expect(staged.messages.filter(message => message.type === 'transaction')).toEqual([])
  } finally {
    releaseBatch?.()
    staged.bridge.unbind()
  }
})
it('admits and acknowledges a scene owned by the current navigation hold', async () => {
  const { bridge, messages, canvas } = fixture()
  const release = bridge.holdNavigation()
  try {
    await bridge.admitNavigation('push-1')
    expect(messages.filter(message => message.type === 'scene')).toHaveLength(1)
    expect(canvas.dataset.satinGlassPresented).toBe('true')
  } finally {
    release()
    bridge.unbind()
  }
})

it.each(['ordinary', 'searchField'])(
  'admits visible regions with a retained hidden %s region',
  async recipe => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const registry = new GlassRegionRegistry()
    const source = document.createElement('div')
    document.body.append(source)
    const submitted: string[][] = []
    const client = {
      request: async ({ request }: { request: GlassRendererRequest }) => {
        if (request.type !== 'scene') return
        const ids = request.snapshot.regions.map(region => region.id)
        submitted.push(ids)
        // Valid worker receipt: matching navigation, every submitted region presented.
        return { navigation: 'review-nav', presented: ids }
      },
      onEvent: () => () => {},
    } as unknown as WebGPUClient
    for (const [id, shown] of [
      ['active', true],
      ['retained', false],
    ] as const) {
      const toolbar = document.createElement('div')
      toolbar.dataset.satinEntryToolbar = id
      toolbar.style.display = shown ? 'contents' : 'none'
      toolbar.hidden = !shown
      const element = document.createElement('div')
      const canvas = document.createElement('canvas')
      element.append(canvas)
      toolbar.append(element)
      source.append(toolbar)
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, shown ? 240 : 0, shown ? 44 : 0),
      )
      Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
      registry.register({
        id,
        element,
        canvas,
        descriptor: {
          id,
          shape: 'capsule',
          material: {
            ...Glass.regular.material,
            ...(recipe === 'searchField' ? { recipe: 'searchField' as const } : {}),
          },
        },
      })
    }
    const bridge = new RegionBridge(client, 'light')
    bridge.bind(registry, source)
    const release = bridge.holdNavigation()
    try {
      const admission = bridge.admitNavigation('review-nav')
      await expect(admission).resolves.toBeUndefined()
    } finally {
      release()
      bridge.unbind()
    }
  },
)

it('gives a visible field member a presenter when the first sorted member has no layout', async () => {
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  const registry = new GlassRegionRegistry()
  const source = document.createElement('div')
  const containerCanvas = document.createElement('canvas')
  source.append(containerCanvas)
  document.body.append(source)
  vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 60))
  for (const [id, shown] of [
    ['a-hidden', false],
    ['z-visible', true],
  ] as const) {
    const element = document.createElement('div')
    const canvas = document.createElement('canvas')
    element.append(canvas)
    source.append(element)
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, shown ? 44 : 0, shown ? 44 : 0),
    )
    Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
    registry.register({
      id,
      element,
      canvas,
      descriptor: {
        id,
        shape: 'capsule',
        material: Glass.regular.material,
        container: { id: 'shared', spacing: 12 },
      },
    })
  }
  Object.defineProperty(containerCanvas, 'transferControlToOffscreen', { value: () => ({}) })
  const unregister = registry.registerContainer('shared', source, containerCanvas)
  const presenters = new Map<string, readonly string[]>()
  const scenes: string[][] = []
  const client = {
    request: async ({ request }: { request: GlassRendererRequest }) => {
      if (request.type === 'attach-presenter' || request.type === 'update-presenter')
        presenters.set(request.presenter.id, request.presenter.regionIds)
      if (request.type !== 'scene') return
      const ids = request.snapshot.regions.map(region => region.id)
      scenes.push(ids)
      return {
        navigation: 'review-nav',
        presented: [...presenters.values()].flatMap(members =>
          ids.includes(members[0]!) ? members.filter(id => ids.includes(id)) : [],
        ),
      }
    },
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const bridge = new RegionBridge(client, 'light')
  bridge.bind(registry, source)
  const release = bridge.holdNavigation()
  try {
    await expect(bridge.admitNavigation('review-nav')).resolves.toBeUndefined()
  } finally {
    release()
    bridge.unbind()
    unregister()
  }
})
