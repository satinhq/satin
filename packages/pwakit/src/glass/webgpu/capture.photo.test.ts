import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGlassErrors } from '../errors.ts'
import type { MirrorNode } from '../lens/Scene.tsx'

vi.mock('./decodedImage.ts', () => ({
  decodedGlassImage: async () => ({ naturalWidth: 100, naturalHeight: 100 }),
}))
const { captureIncomplete, captureReaders, photoMissing, photoProbes, rasterProductionSource } =
  await import('./capture.ts')
const { SupersededImage, imageCapture, paintedImage, registerImageCapture } =
  await import('../../image/resource.ts')

const fill = [242, 242, 247, 255]
const photo: MirrorNode = {
  kind: 'image',
  id: 'photo',
  imageSource: 'photo.png',
  imageFit: 'cover',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  color: 'transparent',
}
const card: MirrorNode = {
  kind: 'rect',
  id: 'card',
  color: '#fff',
  x: 40,
  y: 40,
  width: 20,
  height: 20,
}
const measured = (nodes: MirrorNode[]) =>
  ({ top: 0, left: 0, layout: { width: 100, height: 100, contentHeight: 100, nodes } }) as never

describe('photo verification (review P1): judged from the image, not the fill', () => {
  it('a photo whose own pixels match the page (white on white, transparent) counts as drawn', () => {
    expect(
      photoMissing(
        [
          { canvas: fill, image: fill },
          { canvas: fill, image: fill },
        ],
        fill,
      ),
    ).toBe(false)
    expect(photoMissing([{ canvas: fill, image: [0, 0, 0, 0] }], fill)).toBe(false)
  })
  it('a photo that should show its own colour but shows the fill is missing', () => {
    expect(
      photoMissing(
        [
          { canvas: fill, image: [30, 90, 40, 255] },
          { canvas: fill, image: [200, 180, 150, 255] },
        ],
        fill,
      ),
    ).toBe(true)
    expect(photoMissing([{ canvas: [30, 90, 40, 255], image: [30, 90, 40, 255] }], fill)).toBe(
      false,
    )
  })
  it('probe points a later node paints over give no verdict', () => {
    const probes = photoProbes(
      measured([photo, { ...card, x: 0, y: 0, width: 100, height: 100 }]),
      () => [100, 100],
      1,
      100,
      100,
    )
    expect(probes).toEqual([])
    expect(
      photoProbes(measured([photo, card]), () => [100, 100], 1, 100, 100).map(p => [p.px, p.py]),
    ).toEqual([
      [30, 30],
      [70, 70],
    ])
  })
})

describe('photo redraw (review P2): the whole composition, in paint order', () => {
  const original = { ...captureReaders }
  afterEach(() => Object.assign(captureReaders, original))
  it('keeps the placeholder and other content when page artwork cannot decode', async () => {
    const calls: string[] = []
    const context = {
      setTransform() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      beginPath() {},
      rect() {},
      roundRect() {},
      clip() {},
      fill() {
        calls.push('placeholder')
      },
      fillRect() {
        calls.push('page')
      },
      drawImage() {
        calls.push('image')
      },
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement
    const before = getGlassErrors().length
    const unavailable = Promise.reject(new DOMException('Loading error', 'EncodingError'))
    void unavailable.catch(() => {})
    await expect(
      rasterProductionSource(
        canvas,
        measured([
          { ...card, x: 0, y: 0, width: 100, height: 100 },
          { ...photo, imageReady: unavailable },
          { ...photo, id: 'empty', imageSource: undefined },
        ]),
        100,
        100,
        1,
        false,
      ),
    ).resolves.toBe(canvas)
    expect(calls).toEqual(['page', 'placeholder'])
    expect(captureIncomplete(canvas)).toBe(false)
    expect(getGlassErrors().length).toBe(before)
  })
  it('a missing photo redraws fill, photo and the card above it again, in that order', async () => {
    const calls: string[] = []
    const drawn: HTMLImageElement[] = []
    const small = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement
    const large = { naturalWidth: 600, naturalHeight: 600 } as HTMLImageElement
    let composed = 0
    const ctx = {
      setTransform() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      beginPath() {},
      rect() {},
      roundRect() {},
      clip() {},
      fill() {
        calls.push('rect')
      },
      fillRect() {
        composed++
        calls.push('fill')
      },
      drawImage(image: HTMLImageElement) {
        drawn.push(image)
        calls.push('photo')
      },
      set fillStyle(_v: string) {},
      set globalAlpha(_v: number) {},
      set globalCompositeOperation(_v: string) {},
    }
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
    Object.assign(captureReaders, {
      fill: () => fill,
      image: () => [30, 90, 40, 255],
      // The first composition drops the photo; the redraw shows it.
      canvas: () => (composed > 1 ? [30, 90, 40, 255] : fill),
      frame: async () => {},
    })
    await rasterProductionSource(
      canvas,
      measured([
        { ...photo, imageReady: Promise.resolve(small) },
        { ...photo, id: 'hero', imageReady: Promise.resolve(large) },
        card,
      ]),
      100,
      100,
      1,
      false,
    )
    expect(calls).toEqual(['fill', 'photo', 'photo', 'rect', 'fill', 'photo', 'photo', 'rect'])
    expect(drawn).toEqual([small, large, small, large])
    expect(captureIncomplete(canvas)).toBe(false)
  })
})

describe('photo verification per painted instance (review construction update, item 5)', () => {
  const original = { ...captureReaders }
  afterEach(() => Object.assign(captureReaders, original))
  it('a drawn card does not vouch for a second card with the same photo that was dropped', async () => {
    let composed = 0
    const ctx = {
      setTransform() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      beginPath() {},
      rect() {},
      roundRect() {},
      clip() {},
      fill() {},
      fillRect() {
        composed++
      },
      drawImage() {},
      set fillStyle(_v: string) {},
      set globalAlpha(_v: number) {},
      set globalCompositeOperation(_v: string) {},
    }
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
    const second: MirrorNode = { ...photo, id: 'photo-2', y: 200 }
    // The first card always draws; the second is dropped on every composition.
    Object.assign(captureReaders, {
      fill: () => fill,
      image: () => [30, 90, 40, 255],
      canvas: (_c: unknown, _x: number, y: number) => (y < 150 ? [30, 90, 40, 255] : fill),
      frame: async () => {},
    })
    await rasterProductionSource(
      canvas,
      {
        top: 0,
        left: 0,
        layout: { width: 100, height: 300, contentHeight: 300, nodes: [photo, second] },
      } as never,
      100,
      300,
      1,
      false,
    )
    expect(composed).toBe(4)
    expect(captureIncomplete(canvas)).toBe(true)
    expect(getGlassErrors().at(-1)).toMatchObject({
      code: 'presentation',
      stage: 'backdrop capture',
      reason: 'image-raster-missing',
      message: expect.stringContaining('photo-2'),
    })
  })
})

describe('reference: a capture never waits on a superseded image', () => {
  it('observes superseded artwork even when its measured node is omitted from rasterization', async () => {
    const element = {} as HTMLImageElement
    const unregister = registerImageCapture(element, {
      source: 'album.jpg',
      ready: new Promise(() => {}),
    })
    const unhandled: unknown[] = []
    const onUnhandled = (error: unknown) => unhandled.push(error)
    process.on('unhandledRejection', onUnhandled)
    const imageReady = paintedImage(element)
    const errors = getGlassErrors().length
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ setTransform() {}, fillRect() {}, translate() {} }),
    } as unknown as HTMLCanvasElement
    try {
      // Region-owned artwork is measured eagerly but painted by its foreground,
      // so the backdrop never awaits this node's stored image promise.
      await rasterProductionSource(
        canvas,
        measured([{ ...photo, regionId: 'accessory', imageReady }]),
        100,
        100,
        1,
        false,
      )
      unregister()
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(unhandled).toEqual([])
      expect(getGlassErrors()).toHaveLength(errors)
    } finally {
      process.off('unhandledRejection', onUnhandled)
      unregister()
      // Observation must retain cancellation for any later capture consumer.
      await expect(imageReady).rejects.toBeInstanceOf(SupersededImage)
    }
  })

  it('replacing a still-decoding image releases the capture at once, without a glass error', async () => {
    const element = {} as HTMLImageElement
    const unregister = registerImageCapture(element, {
      source: 'album.jpg',
      ready: new Promise(() => {}),
    })
    const errors = getGlassErrors().length
    const capture = rasterProductionSource(
      {} as HTMLCanvasElement,
      measured([{ ...photo, imageReady: imageCapture(element)!.ready }]),
      100,
      100,
      1,
      false,
    )
    unregister()
    await expect(capture).rejects.toBeInstanceOf(SupersededImage)
    expect(getGlassErrors()).toHaveLength(errors)
  })
})
