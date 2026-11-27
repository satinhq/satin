import type { FileMetadata } from './file-store.ts'
export const archiveMagic = 'satin-files/2'
export const maximumEntries = 10000
export const chunkSize = 1024 * 1024
export const encodeLine = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value)}\n`)
export interface FileManifest {
  formatVersion: 2
  files: FileMetadata[]
  [key: string]: unknown
}
export function validateMetadata(value: unknown): FileMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid file metadata')
  const info = value as FileMetadata
  if (
    info.formatVersion !== 1 ||
    (info.revision !== undefined &&
      (typeof info.revision !== 'string' || !info.revision.length || info.revision.length > 512)) ||
    typeof info.id !== 'string' ||
    !info.id.length ||
    info.id.length > 512 ||
    typeof info.name !== 'string' ||
    !info.name.length ||
    info.name.length > 4096 ||
    /[\0/\\]/.test(info.name) ||
    typeof info.type !== 'string' ||
    info.type.length > 1024 ||
    !Number.isSafeInteger(info.size) ||
    info.size < 0 ||
    !Number.isSafeInteger(info.lastModified) ||
    info.lastModified < 0
  )
    throw new TypeError('Invalid file metadata')
  // Old archives omit revisions; live rows project the current payload ID.
  return { ...info, revision: info.revision ?? '' }
}
export function validateManifest(value: unknown): FileManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid file manifest')
  const manifest = value as FileManifest
  if (manifest.formatVersion !== 2 || !Array.isArray(manifest.files))
    throw new TypeError('Incompatible file manifest')
  if (manifest.files.length > maximumEntries) throw new RangeError('Too many file entries')
  const files = manifest.files.map(validateMetadata)
  if (new Set(files.map(info => info.id)).size !== files.length)
    throw new TypeError('Duplicate file ID in archive')
  if (!Number.isSafeInteger(files.reduce((size, info) => size + info.size, 0)))
    throw new RangeError('Archive is too large')
  return { ...manifest, files }
}
/** Blob inputs never depend on an engine's Blob.stream chunk size. */
export function blobStream(blob: Blob): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream(
    {
      async pull(controller) {
        if (offset === blob.size) {
          controller.close()
          return
        }
        const bytes = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer())
        offset += bytes.length
        controller.enqueue(bytes)
      },
    },
    { highWaterMark: 0 },
  )
}
export class ArchiveReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private bytes: Uint8Array = new Uint8Array()
  private ended = false
  constructor(input: Blob | ReadableStream<Uint8Array>) {
    this.reader = (input instanceof Blob ? blobStream(input) : input).getReader()
  }
  private async fill() {
    if (this.bytes.length || this.ended) return
    while (true) {
      const next = await this.reader.read()
      if (next.done) {
        this.ended = true
        return
      }
      if (!(next.value instanceof Uint8Array)) throw new TypeError('Expected archive bytes')
      if (next.value.byteLength > chunkSize)
        throw new RangeError('Archive stream chunks must be at most 1 MiB')
      // A small input view can otherwise retain an arbitrarily large caller-owned buffer.
      this.bytes = next.value.slice()
      if (this.bytes.length) return
    }
  }
  async line(limit = 4 * chunkSize): Promise<string> {
    const pieces: Uint8Array[] = []
    let length = 0
    while (true) {
      await this.fill()
      if (this.ended) throw new TypeError('Truncated file archive')
      const newline = this.bytes.indexOf(10)
      const count = newline < 0 ? this.bytes.length : newline
      length += count
      if (length > limit) throw new RangeError('File manifest is too large')
      pieces.push(this.bytes.slice(0, count))
      this.bytes = this.bytes.slice(count + (newline < 0 ? 0 : 1))
      if (newline >= 0) {
        const bytes = new Uint8Array(length)
        let offset = 0
        for (const piece of pieces) {
          bytes.set(piece, offset)
          offset += piece.length
        }
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      }
    }
  }
  payload(size: number): ReadableStream<Uint8Array> {
    let remaining = size
    return new ReadableStream(
      {
        pull: async controller => {
          if (!remaining) {
            controller.close()
            return
          }
          await this.fill()
          if (this.ended) throw new TypeError('Truncated file payload')
          const count = Math.min(remaining, this.bytes.length)
          controller.enqueue(this.bytes.slice(0, count))
          this.bytes = this.bytes.slice(count)
          remaining -= count
        },
      },
      { highWaterMark: 0 },
    )
  }
  async end() {
    await this.fill()
    if (!this.ended) throw new TypeError('Trailing file archive bytes')
  }
  async close() {
    await this.reader.cancel().catch(() => {})
    this.bytes = new Uint8Array()
    this.reader.releaseLock()
  }
}
