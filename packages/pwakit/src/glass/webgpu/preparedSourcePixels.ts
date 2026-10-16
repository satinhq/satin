// One-use staging bytes. The graph still owns the original bitmap for restoration.
export const prepared = new WeakMap<ImageBitmap, Uint8Array<ArrayBuffer>>()

/** Bytes that ARE their image: a capture read back on the page (SourcePixels.prepare with its
 * capture canvas). There is no bitmap behind it, so every upload, a device restore included,
 * writes these bytes; they are dropped when the image is closed. */
const resident = new WeakMap<ImageBitmap, Uint8Array | Uint8ClampedArray>()

/** An image that exists only as pixel bytes, in place of an ImageBitmap snapshot of a capture
 * canvas. `createImageBitmap` of an accelerated canvas made WebKit keep a GPU-process image for
 * that canvas, and releasing or redrawing the canvas later blocked the main thread for about 5 ms
 * per megabyte (213 to 243 ms for the 42 MB capture of a 40-row list, in the middle of the tab
 * bar's selection animation). The frame graph treats it as any other image: sized, leased,
 * closed. Its bytes are staged with `keepSourcePixels`. */
export function pixelImage(width: number, height: number): ImageBitmap {
  const image = {
    width,
    height,
    close() {
      resident.delete(image)
      banded.delete(image)
    },
  } as ImageBitmap
  return image
}

/** Stage bytes that stay with `image` until it is closed (premultiplied RGBA, rows top first). */
export function keepSourcePixels(image: ImageBitmap, bytes: Uint8Array | Uint8ClampedArray) {
  resident.set(image, bytes)
}

/** Rows of an image read back band by band (a banded plane capture, captureDemand.ts): each
 * band's bytes and its first row (device px). The image's other rows were never drawn. */
export type SourceBand = { row: number; rows: number; bytes: Uint8Array | Uint8ClampedArray }
const banded = new WeakMap<ImageBitmap, readonly SourceBand[]>()

/** Stage the bands of `image` for every upload of it, until it is closed. */
export function keepSourceBands(image: ImageBitmap, bands: readonly SourceBand[]) {
  banded.set(image, bands)
}

export function takeSourceBands(image: ImageBitmap) {
  return banded.get(image)
}

export function takeSourcePixels(image: ImageBitmap) {
  const kept = resident.get(image)
  if (kept) return kept
  const bytes = prepared.get(image)
  prepared.delete(image)
  return bytes
}
