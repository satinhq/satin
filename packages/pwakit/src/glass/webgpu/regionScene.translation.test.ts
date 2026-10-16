import { expect, it, vi } from 'vitest'
import { GLASS_RENDERER_PROTOCOL, type GlassPresenter } from '../rendererContract.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { RegionScene } from './regionScene.ts'
import type { LayerDevice } from './layers.ts'

it.each([
  { name: 'common scroll', origin: { x: 10, y: -200 }, anchor: { x: 30, y: -180 }, dx: 0, dy: 0 },
  { name: 'envelope growth', origin: { x: -22, y: 0 }, anchor: { x: 30, y: 20 }, dx: 32, dy: 0 },
  {
    name: 'growth during scroll',
    origin: { x: -22, y: -200 },
    anchor: { x: 30, y: -180 },
    dx: 32,
    dy: 0,
  },
])('rebases only envelope changes during $name', async ({ origin, anchor, dx, dy }) => {
  const scene = new RegionScene({} as LayerDevice)
  await scene.request({
    type: 'initialize',
    protocol: GLASS_RENDERER_PROTOCOL,
    appearance: 'light',
    reducedMotion: false,
  })
  const descriptor: GlassPresenter & { fieldOrigin: { x: number; y: number } } = {
    id: 'field',
    layerId: 'chrome',
    regionIds: ['a', 'b'],
    origin: { x: 10, y: 0 },
    fieldOrigin: { x: 30, y: 20 },
    width: 400,
    height: 800,
    resolution: 2,
  }
  const members = [100, 400].map(centerY => ({
    centerX: 100,
    centerY,
    halfWidth: 80,
    halfHeight: 60,
    radius: 20,
  }))
  const spec = { shape: { first: members[0], members } } as unknown as SurfaceRenderSpec
  const raster = {
    spec,
    updateSpec: vi.fn((next: SurfaceRenderSpec) => {
      raster.spec = next
    }),
  }
  const running = { from: spec, to: spec, start: 123, velocity: [{ centerY: 7 }] }
  const internals = scene as unknown as {
    presenters: Map<string, unknown>
    fields: Map<string, unknown>
  }
  internals.presenters.set('field', { descriptor, raster })
  internals.fields.set('field', running)
  const next = { ...descriptor, origin, fieldOrigin: anchor }
  await scene.request({ type: 'update-presenter', presenter: next })
  const shifted = members.map(member => ({
    ...member,
    centerX: member.centerX + dx,
    centerY: member.centerY + dy,
  }))
  expect(raster.spec.shape.members).toEqual(shifted)
  expect(running.from.shape.members).toEqual(shifted)
  expect(running.to.shape.members).toEqual(shifted)
  expect(running.start).toBe(123)
  expect(running.velocity).toEqual([{ centerY: 7 }])
  if (!dx && !dy) expect(raster.updateSpec).not.toHaveBeenCalled()
})
