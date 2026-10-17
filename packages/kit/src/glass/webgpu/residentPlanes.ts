import type { CaptureWindow } from '../captureWindow.ts'
import type { CaptureBand } from './captureDemand.ts'

/** Backdrop captures kept resident in the glass worker after their plane left the set (a route
 * covered by a push), so a pop back composes from them without a raster or upload, and the
 * material contexts cached for plane sets. Bookkeeping only: the runtime posts the returned
 * keys (`retain`/`unretain`) to the worker.
 *
 * Budget: every resident byte counts. A retained plane holds its ImageBitmap and its uploaded
 * texture in the worker (2 x the image); its main-thread capture canvas is released when it is
 * retained (a later context readback re-rasters it). Cached material contexts hold one ImageData
 * each. Planes are validated against the page state they were captured in (host connected,
 * appearance, text size, no damage since) before any reuse. */
export type ResidentPlane = {
  window?: CaptureWindow
  /** The only rows a banded capture holds (captureDemand.ts). */
  bands?: readonly CaptureBand[]
  signature: string
  key: string
  revision: number
  origin: { x: number; y: number }
  width: number
  height: number
  resolution: number
  host: Element
  appearance: string
  text: string
  /** Image bytes of the capture (the worker holds this twice: image and texture). */
  imageBytes: number
}

export class ResidentPlanes<Context> {
  private retained = new Map<string, ResidentPlane & { stale?: boolean }>()
  private contexts = new Map<string, { context: Context; bytes: number }>()
  readonly budget: number
  constructor(budget: number) {
    this.budget = budget
  }

  get size() {
    return this.retained.size
  }
  get(id: string) {
    return this.retained.get(id)
  }
  /** Resident bytes: retained images and textures plus cached context readbacks. */
  get bytes() {
    return (
      [...this.retained.values()].reduce((n, e) => n + 2 * e.imageBytes, 0) +
      [...this.contexts.values()].reduce((n, c) => n + c.bytes, 0)
    )
  }

  /** A retained plane usable as it is: same host still in the document, same appearance and text
   * size, no damage inside it since it was captured. */
  usable(id: string, appearance: string, text: string) {
    const entry = this.retained.get(id)
    return entry &&
      !entry.stale &&
      entry.host.isConnected &&
      entry.appearance === appearance &&
      entry.text === text
      ? entry
      : undefined
  }

  /** The plane was captured anew: its old retained image (if any) is released in the worker. */
  recaptured(id: string) {
    const entry = this.retained.get(id)
    if (!entry) return undefined
    this.retained.delete(id)
    return entry.key
  }

  /** The plane returns to the set with its resident capture (the worker restores it). */
  take(id: string) {
    const entry = this.retained.get(id)
    this.retained.delete(id)
    return entry
  }

  /** A plane left the set. Kept only when its host is still in the document (a popped route never
   * returns) and it fits the budget on its own. Returns whether the worker should retain it. */
  retain(id: string, entry: ResidentPlane) {
    if (!entry.host.isConnected || 2 * entry.imageBytes > this.budget) return false
    this.retained.delete(id)
    this.retained.set(id, entry)
    return true
  }

  /** DOM damage at `target`: retained planes containing it no longer match their capture. */
  damage(target: Node) {
    for (const entry of this.retained.values()) if (entry.host.contains(target)) entry.stale = true
  }

  context(key: string) {
    const cached = this.contexts.get(key)
    if (!cached) return undefined
    this.contexts.delete(key)
    this.contexts.set(key, cached)
    return cached.context
  }
  storeContext(key: string, context: Context, bytes: number) {
    this.contexts.delete(key)
    this.contexts.set(key, { context, bytes })
  }

  /** Drops stale and orphaned planes, then fits the budget: least recently used contexts first
   * (the current one, `keep`, stays), then the oldest retained planes. Returns the worker keys to
   * release. */
  settle(keep?: string) {
    const released: string[] = []
    for (const [id, entry] of this.retained)
      if (entry.stale || !entry.host.isConnected) {
        this.retained.delete(id)
        released.push(entry.key)
      }
    for (const key of [...this.contexts.keys()]) {
      if (this.bytes <= this.budget) break
      if (key !== keep) this.contexts.delete(key)
    }
    for (const [id, entry] of this.retained) {
      if (this.bytes <= this.budget) break
      this.retained.delete(id)
      released.push(entry.key)
    }
    return released
  }

  /** Forget everything (appearance, text size or fonts changed; hidden; failure). Returns the
   * worker keys to release. */
  clear() {
    const keys = [...this.retained.values()].map(e => e.key)
    this.retained.clear()
    this.contexts.clear()
    return keys
  }
}
