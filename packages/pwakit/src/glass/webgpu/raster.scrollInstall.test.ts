import { expect, it, vi } from 'vitest'
import { WebGPURaster } from './raster.ts'
import type { RasterSetup } from '../worker/protocol.ts'

it.each(['transfer', 'retained'] as const)(
  'presents the restored scroll rows on every %s install, before a later scroll message',
  path => {
    const raster = new WebGPURaster()
    const image = { width: 440, height: 2400 } as ImageBitmap
    const lease = { key: 'library', value: image, release() {} }
    const presented: number[] = []
    Object.assign(raster, {
      graph: { image: () => lease },
      allocate: vi.fn(),
      upload: vi.fn(),
      draw: () => presented.push(Reflect.get(raster, 'scrollY')),
    })
    for (let cycle = 0; cycle < 30; cycle++) {
      // Library is scrolled; the album starts at zero. Both automatic and
      // interactive returns install their settled source before source-scroll.
      for (const scrollY of [0, 1240]) {
        raster.setScroll(scrollY === 0 ? 1240 : 0)
        const setup = {
          sourceKey: scrollY ? 'library' : 'album',
          sourceScrollY: scrollY,
          width: 440,
          height: 956,
          resolution: 1,
          spec: { sampleWidth: 440, sampleHeight: 100 },
        } as RasterSetup
        if (path === 'transfer') raster.install(setup, image, image, image)
        else raster.installRetained(setup, lease, lease)
        expect(presented.at(-1), `cycle ${cycle}, source row ${scrollY}`).toBe(scrollY)
        // A later continuous-scroll update must still move the sampled rows.
        raster.setScroll(scrollY + 12)
        raster.draw(0)
        expect(presented.at(-1)).toBe(scrollY + 12)
      }
    }
    expect(presented).toHaveLength(120)
  },
)
