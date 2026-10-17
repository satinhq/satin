import { expect, it } from 'vitest'
import { GLASS_RENDERER_PROTOCOL } from '../rendererContract.ts'
import { Backdrop } from './backdrop.ts'
import { RegionScene } from './regionScene.ts'
import type { LayerDevice } from './layers.ts'

// A presenter is marked "moved" when a backdrop plane scrolls. Scroll-attached glass is marked
// too: the scroll offset reaches the renderer before the scene that moves the glass with its
// plane. By the time the frame samples, that scene has restored the backdrop the glass last drew,
// and drawing it again changes nothing on screen: it only costs a re-encode and a canvas present
// per glass per frame. Only presenters whose composed backdrop still differs are drawn.

async function setup(backdropInstalled: boolean) {
  const owner = { liveDevice: undefined, subscribe: () => () => {} } as unknown as LayerDevice
  const scene = new RegionScene(
    owner,
    () => {},
    () => true,
  )
  await scene.request({
    type: 'initialize',
    protocol: GLASS_RENDERER_PROTOCOL,
    appearance: 'light',
    reducedMotion: false,
  })
  if (backdropInstalled) Backdrop.for(owner).setLayers([])
  const draws: string[] = []
  const presenter = (id: string) => {
    const state = { stale: false }
    const raster = {
      spec: { sampleWidth: 140, sampleHeight: 100 },
      draw: () => draws.push(id),
      // A real raster never reports a stale backdrop before a screen backdrop is installed.
      backdropStale: () => backdropInstalled && state.stale,
    }
    ;(scene as unknown as { presenters: Map<string, unknown> }).presenters.set(id, {
      descriptor: { id, role: 'material', regionIds: [id], layerId: 'fixed' },
      raster,
    })
    return state
  }
  /** What `backdropMoved` does for a presenter before a screen backdrop exists (a scene install). */
  const markMoved = (id: string) => {
    const internals = scene as unknown as {
      presenters: Map<string, object>
      moved: Set<object>
    }
    internals.moved.add(internals.presenters.get(id)!)
  }
  return { scene, draws, presenter, markMoved }
}

it('does not redraw glass whose backdrop caught up before the frame', async () => {
  const { scene, draws, presenter } = await setup(true)
  const attached = presenter('scroll-attached')
  const fixed = presenter('fixed')
  // The plane scrolled: both differ from what they last drew.
  attached.stale = true
  fixed.stale = true
  scene.backdropMoved()
  expect(scene.active).toBe(true)
  // The scene of the same frame moved the scroll-attached glass with its plane.
  attached.stale = false
  scene.sample(0)
  expect(draws).toEqual(['fixed'])
  // Nothing is left over for the next frame.
  expect(scene.active).toBe(false)
  scene.sample(0)
  expect(draws).toEqual(['fixed'])
})

it('still redraws glass whose backdrop differs when the frame samples', async () => {
  const { scene, draws, presenter } = await setup(true)
  const attached = presenter('scroll-attached')
  attached.stale = true
  scene.backdropMoved()
  scene.sample(0)
  expect(draws).toEqual(['scroll-attached'])
})

it('draws every marked presenter while no screen backdrop is installed', async () => {
  const { scene, draws, presenter, markMoved } = await setup(false)
  presenter('own-capture')
  markMoved('own-capture')
  scene.sample(0)
  expect(draws).toEqual(['own-capture'])
})
