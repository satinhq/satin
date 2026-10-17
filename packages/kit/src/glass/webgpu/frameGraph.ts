import { takeSourceBands, takeSourcePixels } from './preparedSourcePixels.ts'
import { glassTimed } from './profile.ts'
import type { LayerDevice } from './layers.ts'
import type { Target } from './passes.ts'

type Lease<T> = { value: T; key: string; release(): void }
export type VirtualReplay = {
  render(device: GPUDevice, target: Target): void
  release(): void
}
type VirtualImage = {
  key: string
  width: number
  height: number
  target: Lease<Target>
  replay?: VirtualReplay
}
type Entry<T> = { value: T; references: number; bytes: number; generation: number }
const graphs = new WeakMap<LayerDevice, FrameGraph>()
const textureBytes = (width: number, height: number, levels: number) =>
  Array.from(
    { length: levels },
    (_, i) => Math.max(1, width >> i) * Math.max(1, height >> i) * 4,
  ).reduce((a, b) => a + b, 0)

/** One device graph, independent of presentation canvases. Immutable source keys
 * share uploads; ordered submissions reuse scratch targets and completed passes.
 * A source key identifies content, never a canvas or a mutable DOM element. */
export class FrameGraph {
  static for(owner: LayerDevice) {
    let graph = graphs.get(owner)
    if (!graph) {
      graph = new FrameGraph(owner)
      graphs.set(owner, graph)
    }
    return graph
  }
  private device?: GPUDevice
  private generation = 0
  private serial = 0
  private textures = new Map<string, Entry<Target>>()
  private images = new Map<string, Entry<ImageBitmap>>()
  private virtualImages = new Map<string, VirtualImage>()
  private uploaded = new WeakSet<GPUTexture>()
  private results = new WeakMap<GPUTexture, string>()
  /** Where a failed upload is reported (the renderer's glass error channel). */
  private owner: Partial<Pick<LayerDevice, 'reportError'>>
  private constructor(owner: LayerDevice) {
    this.owner = owner
    this.device = owner.liveDevice
    owner.subscribe(device => {
      this.device = device
      if (!device) {
        this.generation++
        this.textures.clear()
        this.uploaded = new WeakSet()
        this.results = new WeakMap()
        this.published.clear()
        this.publishedKey = new WeakMap()
      } else {
        // Rebuild before raster subscribers resume. Atlas sources retain immutable
        // CPU images, so no old-generation GPU texture participates in replay.
        // A recipe can only retain an existing image. Nested atlas dependencies
        // therefore precede their consumers in this insertion-ordered map.
        for (const image of this.virtualImages.values()) {
          if (!image.replay) throw Error('Retained navigation atlas has no reconstruction recipe')
          image.target.release()
          image.target = this.target('front', image.width, image.height, false, image.key)
          image.replay.render(device, image.target.value)
          this.markUploaded(image.target.value)
        }
      }
    })
  }
  image(key: string | undefined, image: ImageBitmap): Lease<ImageBitmap> {
    key = key ?? `private-image-${++this.serial}`
    let entry = this.images.get(key)
    if (entry) {
      if (entry.value.width !== image.width || entry.value.height !== image.height) {
        image.close()
        throw Error('Immutable glass source key changed dimensions: ' + key)
      }
      if (image !== entry.value) image.close()
    } else {
      entry = { value: image, references: 0, bytes: image.width * image.height * 4, generation: 0 }
      this.images.set(key, entry)
    }
    entry.references++
    const held = entry,
      identity = key
    let released = false
    return {
      value: entry.value,
      key,
      release: () => {
        if (released) return
        released = true
        if (--held.references === 0) {
          held.value.close()
          this.images.delete(identity)
        }
      },
    }
  }
  /** An image lease for GPU-composed content (the navigation atlas): its texture is written by
   * copies on the queue, never uploaded from a bitmap. `markUploaded` on its target first. */
  virtual(key: string, width: number, height: number, replay?: VirtualReplay): Lease<ImageBitmap> {
    const existing = this.images.get(key)
    if (existing) {
      replay?.release()
      return this.image(key, existing.value)
    }
    // A virtual image has no CPU pixels to upload again. Its retained image
    // leases must therefore keep the composed texture alive through suspension,
    // even after the navigation slot advances to a different atlas.
    let target: Lease<Target>
    try {
      target = this.target('front', width, height, false, key)
    } catch (error) {
      replay?.release()
      throw error
    }
    const virtual = { key, width, height, target, replay }
    this.virtualImages.set(key, virtual)
    const graph = this
    const stub = {
      width,
      height,
      close() {
        virtual.target.release()
        virtual.replay?.release()
        graph.virtualImages.delete(key)
      },
    } as unknown as ImageBitmap
    return this.image(key, stub)
  }
  reconstructVirtual(key: string) {
    const image = this.virtualImages.get(key)
    if (!image?.replay || !this.device)
      throw Error('Navigation atlas reconstruction is unavailable')
    image.replay.render(this.device, image.target.value)
    this.markUploaded(image.target.value)
  }
  markUploaded(target: Target) {
    this.uploaded.add(target.texture)
  }
  /** Whether a bitmap is retained by a live image lease (shared sources are never closed by a borrower). */
  owns(image: ImageBitmap) {
    for (const entry of this.images.values()) if (entry.value === image) return true
    return false
  }
  retain(key: string): Lease<ImageBitmap> {
    const entry = this.images.get(key)
    if (!entry) throw Error('Missing retained glass image: ' + key)
    return this.image(key, entry.value)
  }
  target(
    role: string,
    width: number,
    height: number,
    mip = false,
    sourceKey?: string,
  ): Lease<Target> {
    width = Math.max(1, Math.round(width))
    height = Math.max(1, Math.round(height))
    const levels = mip ? 1 + Math.floor(Math.log2(Math.max(width, height))) : 1
    const key = JSON.stringify([role, width, height, levels, sourceKey ?? 'scratch'])
    let entry = this.textures.get(key)
    if (!entry) {
      if (!this.device) throw Error('Frame graph has no live device')
      const texture = this.device.createTexture({
        label: role,
        size: [width, height],
        format: 'rgba8unorm',
        mipLevelCount: levels,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST |
          (levels > 1 ? GPUTextureUsage.STORAGE_BINDING : 0),
      })
      entry = {
        value: { texture, width, height, levels },
        references: 0,
        bytes: textureBytes(width, height, levels),
        generation: this.generation,
      }
      this.textures.set(key, entry)
    }
    entry.references++
    const held = entry
    let released = false
    return {
      key,
      value: held.value,
      release: () => {
        if (released) return
        released = true
        if (held.generation !== this.generation) return
        if (--held.references === 0) {
          held.value.texture.destroy()
          this.textures.delete(key)
        }
      },
    }
  }
  /** Textures whose upload the device rejected: written once more when next needed, then left. */
  private rejected = new WeakSet<GPUTexture>()
  upload(image: ImageBitmap, target: Target) {
    if (this.uploaded.has(target.texture)) return
    if (!this.device) throw Error('Frame graph upload has no device')
    const device = this.device
    const texture = target.texture
    glassTimed(
      'gpu-upload',
      () => {
        // Banded captures retain sparse readback; the upload initializes their transparent gaps.
        const bands = takeSourceBands(image)
        const bytes = bands ? undefined : takeSourcePixels(image)
        if (!bands && !bytes) {
          device.queue.copyExternalImageToTexture(
            { source: image },
            { texture, premultipliedAlpha: true, colorSpace: 'srgb' },
            [image.width, image.height],
          )
          return
        }
        // Tightly packed rows. `writeTexture` takes any stride of at least a row's bytes (WebGPU,
        // "validating linear texture data"); the multiple of 256 that sourcePixels.worker.ts and
        // raster.ts pad to is a requirement of buffer copies only. The bytes must be exactly the
        // image: any other length would be read at a stride that is not its rows'.
        const writes = bands ?? [{ row: 0, rows: image.height, bytes: bytes! }]
        for (const { row, rows, bytes: written } of writes)
          if (written.byteLength !== image.width * rows * 4 || row < 0 || row + rows > image.height)
            throw Error(
              bands
                ? `Glass source bytes (${written.byteLength}) are not rows ${row}..${row + rows} ` +
                    `of a ${image.width}x${image.height} image`
                : `Glass source bytes (${written.byteLength}) are not a ${image.width}x${image.height} image`,
            )
        // A write the device rejects is reported when its error scope resolves, after this call:
        // the texture is then not uploaded, and the next draw writes it again (once).
        device.pushErrorScope?.('validation')
        try {
          // A partial first write makes WebKit clear the fresh texture before uploading.
          // Initialize it in one write instead, retaining band-only raster and readback work.
          // Gaps remain transparent and are still rejected by the coverage contract.
          const upload = bands ? new Uint8Array(image.width * image.height * 4) : bytes!
          if (bands) {
            for (const { row, bytes: written } of bands) upload.set(written, row * image.width * 4)
          }
          device.queue.writeTexture({ texture }, upload, { bytesPerRow: image.width * 4 }, [
            image.width,
            image.height,
          ])
        } finally {
          void device.popErrorScope?.().then(
            error => {
              if (!error) return
              this.owner.reportError?.(
                'source upload',
                `${error.constructor.name}: ${error.message}`,
              )
              if (this.rejected.has(texture)) return
              this.rejected.add(texture)
              this.uploaded.delete(texture)
            },
            () => {},
          )
        }
      },
      () =>
        JSON.stringify({
          width: image.width,
          height: image.height,
          bytes: image.width * image.height * 4,
        }),
    )
    this.uploaded.add(texture)
  }
  matches(target: Target, key: string) {
    return this.results.get(target.texture) === key
  }
  // Published results: a surface's finished result, readable by another surface that
  // needs the identical intermediate (a lift overlay above the same bar) this frame.
  private published = new Map<string, Target>()
  private publishedKey = new WeakMap<GPUTexture, string>()
  publish(key: string, target: Target) {
    this.unpublish(target)
    this.published.set(key, target)
    this.publishedKey.set(target.texture, key)
  }
  unpublish(target: Target) {
    const key = this.publishedKey.get(target.texture)
    if (key !== undefined && this.published.get(key) === target) this.published.delete(key)
    this.publishedKey.delete(target.texture)
  }
  publishedResult(key: string) {
    return this.published.get(key)
  }
  mark(target: Target, key: string) {
    this.results.set(target.texture, key)
  }
  report() {
    return {
      gpuBytes: [...this.textures.values()].reduce((n, e) => n + e.bytes, 0),
      retainedBitmapBytes: [...this.images.values()].reduce((n, e) => n + e.bytes, 0),
      textures: this.textures.size,
      images: this.images.size,
      generation: this.generation,
    }
  }
}
export type GraphLease<T> = Lease<T>
