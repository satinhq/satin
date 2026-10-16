import { expect, it, vi } from 'vitest'
import { GLASS_RENDERER_PROTOCOL } from '../rendererContract.ts'
import { FrameGraph } from './frameGraph.ts'
import { RegionScene } from './regionScene.ts'
import { WebGPURaster } from './raster.ts'
import { Glass, type GlassRegion } from '../regions.ts'
import type { LayerDevice } from './layers.ts'

// A held region (GlassRegion.suspended) keeps the pixels of its own tab. Before another tab's
// planes replace the backdrop it is drawn one last time over its own, then parked: nothing can
// draw the other tab's backdrop into it, by any path, and it pins no capture. Its own inputs
// changing while hidden repaint it as an unheld region would be. It is installed again in the
// transaction of its own tab's commit.

const region: GlassRegion = {
  id: 'card',
  layer: { id: 'fixed', depth: 0, attachment: { kind: 'fixed' } },
  frame: { x: 30, y: 250, width: 100, height: 60 },
  shape: { kind: 'roundedRectangle', cornerRadius: 12 },
  material: Glass.regular.interactive().material,
}

async function setup() {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  /** The renderer's submission gate: closed while an appearance change waits to be presented. */
  let submissionAllowed = true
  const scene = new RegionScene(
    owner,
    () => {},
    () => submissionAllowed,
  )
  await scene.request({
    type: 'initialize',
    protocol: GLASS_RENDERER_PROTOCOL,
    appearance: 'light',
    reducedMotion: false,
  })
  const calls: string[] = []
  let stale = false
  let failFence = false
  let spec: object | undefined = { sampleWidth: 140, sampleHeight: 100 }
  const raster = {
    get spec() {
      return spec
    },
    setCovered: () => {},
    setVisible: () => {},
    clear: () => calls.push('clear'),
    // A real raster drops a draw while the submission gate is closed.
    draw: () => {
      if (submissionAllowed) calls.push('draw')
    },
    updateSpec: () => calls.push('spec'),
    installRetained: () => {
      spec = { sampleWidth: 140, sampleHeight: 100 }
      calls.push('install')
    },
    park: () => {
      spec = undefined
      calls.push('park')
    },
    settled: async () => {
      if (!failFence) return
      failFence = false
      throw Error('GPU fence failed')
    },
    setSourceOrigin: () => calls.push('origin'),
    setViewportOrigin: () => {},
    backdropStale: () => stale,
  }
  ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set('slot', {
    descriptor: {
      id: 'slot',
      role: 'material',
      regionIds: ['card'],
      layerId: 'fixed',
      origin: { x: 10, y: 230 },
      width: 140,
      height: 100,
      resolution: 3,
    },
    raster,
  })
  const bitmap = { width: 440, height: 956, close: vi.fn() } as unknown as ImageBitmap
  ;(scene as unknown as { emptyForeground: unknown }).emptyForeground = {
    key: 'region:empty',
    value: bitmap,
    release() {},
  }
  let revision = 0
  /** A committed source preparation shares its root capture with the regions. */
  const shareRoot = async () => {
    revision++
    FrameGraph.for(owner).image(`production:${revision}:front`, bitmap)
    await scene.shareSource(
      {
        id: 'root-backdrop',
        revision,
        layerId: 'chrome',
        role: 'transmitted-backdrop',
        origin: { x: 0, y: 0 },
        width: 440,
        height: 956,
        resolution: 1,
      },
      bitmap,
      `production:${revision}:front`,
    )
  }
  let sceneRevision = 0
  const post = (suspended: boolean, offsetY = 0, frame = region.frame) =>
    scene.request({
      type: 'scene',
      snapshot: {
        revision: ++sceneRevision,
        layers: [region.layer],
        regions: [{ ...region, frame, ...(suspended ? { suspended: true } : {}) }],
        scrolls: [
          {
            id: 'webgpu-source-root',
            offsetX: 0,
            offsetY,
            viewportX: 0,
            viewportY: 0,
            width: 440,
            height: 956,
          },
        ],
      },
    })
  await shareRoot()
  await post(false)
  calls.length = 0
  return {
    scene,
    calls,
    post,
    shareRoot,
    setStale: (value: boolean) => (stale = value),
    setSubmissionAllowed: (value: boolean) => (submissionAllowed = value),
    failNextFence: () => (failFence = true),
    presenter: () =>
      (
        scene as unknown as {
          presenters: Map<string, { parked?: boolean; repaint?: boolean; materialKey?: string }>
        }
      ).presenters.get('slot')!,
  }
}

it('takes a last frame over its own backdrop, parks, and is never drawn from another tab', async () => {
  const { scene, calls, post, shareRoot, setStale, presenter } = await setup()
  // The tab is left. Its region is held; the other tab's preparation then commits.
  await post(true)
  setStale(true)
  scene.holdForBackdropChange(['card'])
  // Drawn once while its own planes are still installed, then parked.
  expect(calls).toEqual(['draw', 'park'])
  expect(presenter().parked).toBe(true)
  calls.length = 0

  // The other tab's planes, root capture and scrolling: nothing reaches the parked region.
  scene.backdropMoved()
  await shareRoot()
  await post(true, 40)
  scene.backdropMoved()
  await post(true, 80)
  expect(scene.active).toBe(false)
  scene.sample(0)
  scene.present()
  expect(calls).toEqual([])

  // Its tab is selected again: still held until its own source commits (the bridge keeps
  // `suspended` set), so the other tab's backdrop is still not drawn into it.
  await post(true, 0)
  scene.backdropMoved()
  scene.sample(0)
  expect(calls).toEqual([])

  // Its own tab's preparation commits: resumed inside that batch, as soon as its planes are in
  // (no later scene is needed), and installed from its own backdrop.
  scene.holdForBackdropChange([])
  scene.resumeForBackdropChange([])
  await scene.installPending()
  expect(calls).toEqual(['install'])
  expect(presenter().parked).toBe(false)
  calls.length = 0
  // A scene measured before the commit can still arrive after it, saying "held": the region
  // keeps its (correct) pixels, and the next scene resumes it without drawing a foreign backdrop.
  await post(true, 0)
  await post(false, 0)
  expect(calls).toEqual([])
})

it('another tab committing while the region stays hidden does not resume it', async () => {
  const { scene, calls, post, shareRoot, presenter } = await setup()
  await post(true)
  scene.holdForBackdropChange(['card'])
  calls.length = 0
  // A third tab commits: the region is still named as held.
  scene.holdForBackdropChange(['card'])
  scene.resumeForBackdropChange(['card'])
  await shareRoot()
  await scene.installPending()
  expect(calls).toEqual([])
  expect(presenter().parked).toBe(true)
})

it('a hold that arrives before the bridge reported the tab switch still wins over a stale scene', async () => {
  const { scene, calls, shareRoot, presenter } = await setup()
  // The commit of the other tab names the region; the last scene still says it is live.
  scene.holdForBackdropChange(['card'])
  expect(calls).toEqual(['park'])
  calls.length = 0
  // Sharing the other tab's root capture reinstalls every live presenter: not this one.
  await shareRoot()
  expect(calls).toEqual([])
  expect(presenter().parked).toBe(true)
})

it('its own inputs changing while held repaint it as an unheld region, then park it again', async () => {
  const { scene, calls, post, presenter } = await setup()
  await post(true)
  scene.holdForBackdropChange(['card'])
  calls.length = 0
  // Appearance changes while the tab is hidden: never left showing the old appearance.
  await scene.request({ type: 'appearance', value: 'dark', reducedMotion: false })
  expect(calls).toEqual(['install', 'park'])
  expect(presenter().parked).toBe(true)
  calls.length = 0
  // Rotation or resize while hidden: its frame changed.
  await post(true, 0, { ...region.frame, width: 180 })
  expect(calls).toEqual(['install', 'park'])
  calls.length = 0
  // Nothing of its own changed: backdrop-only scenes cost nothing.
  await post(true, 120, { ...region.frame, width: 180 })
  expect(calls).toEqual([])
})

it('a merge still running when its tab is left ends at its target before parking; no later frame moves it', async () => {
  const { scene, calls, post, setStale } = await setup()
  const fields = (
    scene as unknown as {
      fields: Map<string, { start: number; from: object; to: object; velocity: [] }>
    }
  ).fields
  const target = { sampleWidth: 140, sampleHeight: 100, shape: { members: [] } }
  fields.set('slot', {
    start: performance.timeOrigin + performance.now(),
    from: target,
    to: target,
    velocity: [],
  })
  await post(true)
  setStale(false)
  scene.holdForBackdropChange(['card'])
  // Set to the merge's target and drawn once over its own backdrop, then parked.
  expect(calls).toEqual(['spec', 'draw', 'park'])
  expect(fields.size).toBe(0)
  calls.length = 0
  // A field that is still registered for a parked presenter is dropped, not sampled.
  fields.set('slot', {
    start: performance.timeOrigin + performance.now(),
    from: target,
    to: target,
    velocity: [],
  })
  scene.sample(performance.timeOrigin + performance.now() + 16)
  expect(calls).toEqual([])
  expect(fields.size).toBe(0)
})

it('an appearance change that is presented later repaints a held region when it is presented, then parks it', async () => {
  const { scene, calls, post, presenter, setSubmissionAllowed } = await setup()
  await post(true)
  scene.holdForBackdropChange(['card'])
  calls.length = 0
  // The appearance changes: nothing is submitted until the new appearance is presented in one step.
  setSubmissionAllowed(false)
  await scene.request({ type: 'appearance', value: 'dark', reducedMotion: false })
  // Installed with the new appearance, but its draw was dropped: parking it now would leave the
  // old appearance on its canvas.
  expect(calls).toEqual(['install'])
  expect(presenter().parked).toBe(false)
  // Its frame changes too before the presentation (a rotation): still waiting, not forgotten.
  await post(true, 0, { ...region.frame, width: 180 })
  expect(calls).toEqual(['install', 'install'])
  expect(presenter().parked).toBe(false)
  // The visible tab's planes in the new appearance are installed before the presentation: the
  // commit names the region again, and must not park it on its old pixels.
  scene.holdForBackdropChange(['card'])
  scene.resumeForBackdropChange(['card'])
  await scene.installPending()
  expect(calls).toEqual(['install', 'install'])
  expect(presenter().parked).toBe(false)
  // The new appearance is presented: the held region is drawn with it, then holds pixels again.
  setSubmissionAllowed(true)
  scene.present()
  expect(calls).toEqual(['install', 'install', 'draw', 'park'])
  expect(presenter().parked).toBe(true)
  calls.length = 0
  scene.present()
  scene.sample(0)
  expect(calls).toEqual([])
})

it('a held region that was not parked yet is also repainted when a later appearance change is presented', async () => {
  const { scene, calls, post, presenter, setSubmissionAllowed } = await setup()
  // The tab was left, and no other tab's preparation has committed since: held, not parked.
  await post(true)
  calls.length = 0
  setSubmissionAllowed(false)
  await scene.request({ type: 'appearance', value: 'dark', reducedMotion: false })
  scene.holdForBackdropChange(['card'])
  expect(calls).toEqual(['install'])
  expect(presenter().parked).toBeFalsy()
  setSubmissionAllowed(true)
  scene.present()
  expect(calls).toEqual(['install', 'draw', 'park'])
  expect(presenter().parked).toBe(true)
})

it('a navigation running in the visible tab is not composed into a held repaint', async () => {
  const { scene, calls, post, presenter } = await setup()
  await post(true)
  scene.holdForBackdropChange(['card'])
  const held = presenter() as unknown as {
    raster: { installRetained: (...values: unknown[]) => void }
  }
  const installs: { navigationAtlas: number; present: unknown }[] = []
  const install = held.raster.installRetained
  held.raster.installRetained = (...values: unknown[]) => {
    const installed = values[0] as { navigationAtlas: number }
    installs.push({ navigationAtlas: installed.navigationAtlas, present: values[3] })
    install(...values)
  }
  // The visible tab pushes a route: its atlas replaces the content plane under live presenters.
  const atlas = { width: 880, height: 956, close: vi.fn() } as unknown as ImageBitmap
  await scene.navigationSource({
    key: 'navigation:1',
    lease: { key: 'navigation:1', value: atlas, release() {} },
    routes: 2,
    contentLayer: 'content',
    width: 880,
    height: 956,
    pose: { progress: 0.5 } as never,
  })
  calls.length = 0
  // The held region's own input changes during the push: repainted as a base, presented, parked.
  await scene.request({ type: 'appearance', value: 'dark', reducedMotion: false })
  expect(installs).toEqual([{ navigationAtlas: 1, present: true }])
  expect(calls).toEqual(['install', 'park'])
})

it('a press still animating when its tab is left ends at rest before parking, then stays still', async () => {
  const { scene, calls, post } = await setup()
  const now = performance.timeOrigin + performance.now()
  await scene.request({
    type: 'interaction',
    interaction: { regionId: 'card', phase: 'pressed', epoch: now, contact: { x: 50, y: 30 } },
  })
  await scene.request({
    type: 'interaction',
    interaction: { regionId: 'card', phase: 'releasing', epoch: now + 30 },
  })
  expect(scene.pressing).toBe(true)
  calls.length = 0
  // Its action switched tabs: the region is held while the release is still running.
  await post(true)
  scene.holdForBackdropChange(['card'])
  // Presented once at rest (spec + draw), over its own backdrop, then parked.
  expect(calls).toEqual(['spec', 'draw', 'park'])
  expect(scene.pressing).toBe(false)
  calls.length = 0
  scene.sample(now + 60)
  scene.sample(now + 200)
  expect(calls).toEqual([])
})

it('device restore and app resume leave a hidden, parked region alone; its own commit draws it', async () => {
  const { scene, calls, post, presenter } = await setup()
  await post(true)
  scene.holdForBackdropChange(['card'])
  calls.length = 0
  // The only planes installed are another tab's: nothing may be sampled into the hidden region.
  await scene.prepareResume()
  scene.present()
  await post(true, 40)
  expect(calls).toEqual([])
  expect(presenter().parked).toBe(true)
  // Its own tab's commit is its next draw (after a device loss, the first pixels on its canvas).
  scene.holdForBackdropChange([])
  scene.resumeForBackdropChange([])
  await scene.installPending()
  expect(calls).toEqual(['install'])
  expect(presenter().parked).toBe(false)
})

it('a region that mounts while its tab is hidden is never drawn from the visible tab', async () => {
  const { scene, calls, post, shareRoot } = await setup()
  // A presenter attached while its region is already held: it has no raster state of its own.
  let spec: object | undefined
  const raster = {
    get spec() {
      return spec
    },
    setCovered: () => {},
    setVisible: () => {},
    clear: () => {},
    draw: () => calls.push('draw'),
    updateSpec: () => {},
    installRetained: () => {
      spec = { sampleWidth: 140, sampleHeight: 100 }
      calls.push('install')
    },
    park: () => {
      spec = undefined
    },
    settled: async () => {},
    setSourceOrigin: () => {},
    setViewportOrigin: () => {},
    backdropStale: () => true,
  }
  const presenters = (
    scene as unknown as { presenters: Map<string, { descriptor: object; raster: unknown }> }
  ).presenters
  const { descriptor } = presenters.get('slot')!
  presenters.clear()
  presenters.set('fresh', { descriptor: { ...descriptor, id: 'fresh' }, raster })
  await post(true)
  // Scenes, the visible tab's captures and commits, a device restore: no sample, no draw.
  await shareRoot()
  scene.holdForBackdropChange(['card'])
  scene.resumeForBackdropChange(['card'])
  await scene.installPending()
  await scene.prepareResume()
  await post(true, 60)
  scene.sample(0)
  expect(calls).toEqual([])
  // Its own tab commits: that is its first sample.
  scene.holdForBackdropChange([])
  scene.resumeForBackdropChange([])
  await scene.installPending()
  expect(calls).toEqual(['install'])
})

it('a failed fenced install is loud and never counts as drawn', async () => {
  const { scene, calls, post, failNextFence, presenter } = await setup()
  // A live region: the fence of an appearance reinstall fails.
  failNextFence()
  await expect(
    scene.request({ type: 'appearance', value: 'dark', reducedMotion: false }),
  ).rejects.toThrow('GPU fence failed')
  expect(presenter()).toMatchObject({ materialKey: undefined, repaint: true })
  calls.length = 0
  await post(false)
  expect(calls).toEqual(['install'])
  expect(presenter().repaint).toBe(false)
  // A held, parked region whose repaint fails: installed again by its own tab's commit.
  await post(true)
  scene.holdForBackdropChange(['card'])
  failNextFence()
  await expect(
    scene.request({ type: 'appearance', value: 'light', reducedMotion: false }),
  ).rejects.toThrow('GPU fence failed')
  calls.length = 0
  await post(true, 20)
  expect(calls).toEqual([])
  scene.resumeForBackdropChange([])
  await scene.installPending()
  expect(calls).toEqual(['install'])
})

it('a parked raster holds no setup and no image or texture lease, and encodes nothing', () => {
  const raster = new WebGPURaster()
  const released: string[] = []
  const lease = (name: string) => ({ key: name, value: {}, release: () => released.push(name) })
  Object.assign(raster, {
    owner: { liveDevice: undefined, subscribe: () => () => {} },
    setup: { spec: { sampleWidth: 140, sampleHeight: 100 } },
    imageLeases: [lease('capture'), lease('capture'), lease('ink')],
    textureLeases: [lease('front texture'), lease('scratch')],
    targets: { front: {}, result: {} },
    bitmaps: {},
  })
  raster.park()
  expect(released.sort()).toEqual(['capture', 'capture', 'front texture', 'ink', 'scratch'])
  expect(raster.spec).toBeUndefined()
  expect(raster.backdropStale()).toBe(false)
  expect(raster.encodeResult({} as GPUCommandEncoder, 0)).toBe(false)
})

it('waits for current layout geometry before drawing a replacement root capture', async () => {
  const { scene, calls, shareRoot } = await setup()
  // On the old renderer there is no source/scene admission boundary: shareRoot redraws
  // the retained scene immediately. The replacement capture only covers the new layout.
  const begin = (scene as unknown as { beginSourceChange?: (revision: number) => void })
    .beginSourceChange
  begin?.call(scene, 2)
  await shareRoot()
  scene.sample(0)
  scene.present()
  expect(calls).toEqual([])

  const stale = await scene.request({
    type: 'scene',
    snapshot: {
      revision: 100,
      ...{ sourceRevision: 1 },
      layers: [region.layer],
      regions: [region],
      scrolls: [],
    },
  })
  expect(stale).toMatchObject({ superseded: true, presented: [] })
  expect(calls).toEqual([])

  const current = await scene.request({
    type: 'scene',
    snapshot: {
      revision: 101,
      ...{ sourceRevision: 2 },
      layers: [region.layer],
      regions: [{ ...region, frame: { ...region.frame, y: region.frame.y - 10.5 } }],
      scrolls: [],
    },
  })
  expect(calls).toContain('install')
  expect(current).toMatchObject({ presented: ['card'] })
})
