import {
  archiveMagic,
  ArchiveReader,
  blobStream,
  chunkSize,
  encodeLine,
  maximumEntries,
  validateManifest,
  validateMetadata,
} from './file-archive.ts'
import { fileCache, hookURLs } from './file-cache.ts'
import {
  commit,
  openIndex,
  request,
  rows,
  type FileContext,
  type StoredFile,
} from './file-index.ts'
import {
  collectUnleased,
  coordinated,
  metadataLock,
  payloadLease,
  type PayloadLease,
} from './file-locks.ts'
import { writeFilePayload } from './file-writer.ts'
export { useFiles, useFileInfo, useFileURL } from './file-cache.ts'
/** Descriptive file values. Compatible unknown fields survive backup and restore. */
export interface FileMetadata {
  readonly formatVersion: 1
  readonly id: string
  readonly revision: string
  readonly name: string
  readonly type: string
  readonly size: number
  readonly lastModified: number
  readonly [key: string]: unknown
}
/** File, Blob and byte-stream write options. */
export interface FileWriteOptions {
  name?: string
  type?: string
  lastModified?: number
  signal?: AbortSignal
}
/** Matches database write failures; cleanup errors use this channel too. */
export interface FileWriteFailure {
  readonly database: string
  readonly error: Error
}
/** Revoke is idempotent and deferred so a same-turn load can start. */
export interface FileURL {
  readonly url: string
  revoke(): void
}
/** Define once at module scope. Writes publish metadata after payload verification. */
export interface FileStore {
  readonly name: string
  readonly coordination: 'cross-window' | 'single-window'
  put(
    id: string,
    input: Blob | ReadableStream<Uint8Array>,
    options?: FileWriteOptions,
  ): Promise<FileMetadata>
  get(id: string): Promise<File | undefined>
  stat(id: string): Promise<FileMetadata | undefined>
  list(): Promise<FileMetadata[]>
  delete(id: string): Promise<void>
  stream(id: string): Promise<ReadableStream<Uint8Array> | undefined>
  objectURL(id: string): Promise<FileURL | undefined>
  exportFiles(): Promise<ReadableStream<Uint8Array>>
  importFiles(input: Blob | ReadableStream<Uint8Array>, mode: 'replace' | 'merge'): Promise<void>
  subscribe(listener: () => void): () => void
  onError(listener: (failure: FileWriteFailure) => void): () => void
  close(): void
}
function validKey(key: string) {
  if (typeof key !== 'string' || !key.length || key.length > 512)
    throw new TypeError('File names and IDs require 1 to 512 characters')
}
function failureError(cause: unknown): Error {
  if (cause instanceof Error) return cause
  const error = new Error(
    typeof (cause as Error)?.message === 'string'
      ? (cause as Error).message
      : 'File storage failed',
    { cause },
  )
  if (typeof (cause as Error)?.name === 'string') error.name = (cause as Error).name
  return error
}
const stores = new Map<string, FileStore>()
const warnedDefinitions = new Set<string>()
/** Opens a file store with immutable payloads and store-owned reader leases. */
export function defineFileStore(config: { name: string }): FileStore {
  validKey(config.name)
  const name = config.name
  const existing = stores.get(name)
  if (existing) {
    if (import.meta.env.DEV && !warnedDefinitions.has(name)) {
      warnedDefinitions.add(name)
      console.warn(
        `File store ${name} was defined again. Define it once at module scope, not during render.`,
      )
    }
    return existing
  }
  const metadataName = `satin-files:${name}:metadata`
  const leaseName = (payload: string) => `satin-files:${name}:payload:${payload}`
  const cache = fileCache(name)
  const errors = new Set<(failure: FileWriteFailure) => void>()
  const readers = new Set<() => void | Promise<void>>()
  const pins = new Set<string>()
  const heldLeases = new Set<{ payload: string; lease: PayloadLease; active: boolean }>()
  const lostPayloads = new Map<string, Error>()
  const retired = new Map<string, number>()
  let restoring: Promise<void> = Promise.resolve()
  const restored = async () => {
    let pending: Promise<void>
    do {
      pending = restoring
      await pending
    } while (pending !== restoring)
  }
  let collectionTimer: ReturnType<typeof setInterval> | undefined
  const urls = new Set<() => void>()
  const subscriptions = new Set<() => void>()
  const lifetime = new AbortController()
  let closed = false
  let initialized: Promise<void> | undefined
  let sweeping: Promise<void> | undefined
  let rerunSweep = false
  let collectionRetries = 0
  let sweepTimer: ReturnType<typeof setTimeout> | undefined
  let scheduledRetiredOnly = false
  let location: Promise<{ directory: FileSystemDirectoryHandle; path: string[] }> | undefined
  if (!coordinated())
    console.warn(
      `File store ${name} is in single-window mode because Web Locks are unavailable. Do not open it in another window.`,
    )
  const report = (cause: unknown) => {
    const error = failureError(cause)
    console.error(`File store ${name}:`, error)
    for (const listener of errors) {
      try {
        listener({ database: name, error })
      } catch {
        /* Preserve the storage failure. */
      }
    }
    return error
  }
  const check = (signal?: AbortSignal) => {
    if (closed) throw new DOMException('File store is closed', 'InvalidStateError')
    signal?.throwIfAborted()
  }
  const context = async (): Promise<FileContext> => {
    if (!globalThis.navigator?.storage?.getDirectory)
      throw new DOMException('Private files require OPFS', 'NotSupportedError')
    location ??= (async () => {
      const root = await navigator.storage.getDirectory()
      const namespace = await root.getDirectoryHandle('satin-files', { create: true })
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name))
      const path = Array.from(new Uint8Array(digest), byte =>
        byte.toString(16).padStart(2, '0'),
      ).join('')
      return {
        directory: await namespace.getDirectoryHandle(path, { create: true }),
        path: ['satin-files', path],
      }
    })()
    return { ...(await location), database: await openIndex(name) }
  }
  const withContext = async <T>(action: (value: FileContext) => Promise<T>) => {
    const value = await context()
    try {
      return await action(value)
    } finally {
      value.database.close()
    }
  }
  const remove = async (value: FileContext, payload: string) => {
    let failure: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await value.directory.removeEntry(payload)
        return
      } catch (error) {
        if ((error as Error).name === 'NotFoundError') return
        failure = error
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 20))
      }
    }
    report(failure)
  }
  const sweep = (propagate = false, retiredOnly = false): Promise<void> => {
    if (closed) return Promise.resolve()
    if (sweeping) {
      rerunSweep = true
      return sweeping
    }
    rerunSweep = false
    let blocked = false
    sweeping = restored()
      .then(() => {
        if (closed) return
        return withContext(async value => {
          if (closed) return
          const directory = value.directory as FileSystemDirectoryHandle & {
            keys(): AsyncIterableIterator<string>
          }
          const published = new Set((await rows(value)).map(row => row.payload))
          if (closed) return
          const candidates = retiredOnly ? [...retired.keys()].slice(0, 64) : directory.keys()
          for await (const payload of candidates) {
            if (closed) return
            if (published.has(payload)) {
              retired.delete(payload)
              continue
            }
            await metadataLock(metadataName, 'shared', async () => {
              if (closed) return
              if ((await rows(value)).some(row => row.payload === payload)) {
                retired.delete(payload)
                return
              }
              if (closed) return
              const collected = await collectUnleased(leaseName(payload), async () => {
                if (!closed) await remove(value, payload)
              })
              if (closed) return
              if (collected) {
                // Failed cleanup is reported by remove; retain it for the visible retry.
                try {
                  const file = await (await directory.getFileHandle(payload)).getFile()
                  retired.delete(payload)
                  retired.set(payload, file.size)
                } catch (error) {
                  if ((error as Error).name !== 'NotFoundError') throw error
                  retired.delete(payload)
                }
              } else {
                blocked = true
                const file = await (await directory.getFileHandle(payload)).getFile()
                retired.delete(payload)
                retired.set(payload, file.size)
              }
            })
            if (closed) return
          }
        })
      })
      .catch(error => {
        if (propagate) throw error
        report(error)
      })
      .then(() => {})
      .finally(() => {
        sweeping = undefined
        if (rerunSweep) scheduleSweep()
        else if (blocked && collectionRetries < 3) {
          collectionRetries++
          scheduleSweep(20, false, retiredOnly)
        } else collectionRetries = 0
      })
    return sweeping
  }
  const scheduleSweep = (delay = 0, resetRetries = true, retiredOnly = false) => {
    if (closed) return
    if (resetRetries) collectionRetries = 0
    if (sweeping) {
      rerunSweep = true
      return
    }
    if (sweepTimer) {
      scheduledRetiredOnly &&= retiredOnly
      return
    }
    scheduledRetiredOnly = retiredOnly
    sweepTimer = setTimeout(() => {
      sweepTimer = undefined
      void sweep(false, scheduledRetiredOnly)
    }, delay)
  }
  const ready = async (signal?: AbortSignal) => {
    check(signal)
    initialized ??= sweep(true).catch(error => {
      initialized = undefined
      throw error
    })
    await initialized
    await restored()
    check(signal)
  }
  const readRows = async (signal?: AbortSignal) => {
    await ready(signal)
    return withContext(value =>
      metadataLock(
        metadataName,
        'shared',
        async () => {
          check(signal)
          return (await rows(value, signal))
            .map(row => validateMetadata({ ...row.metadata, revision: row.payload }))
            .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
        },
        signal,
      ),
    )
  }
  const removeHandle = cache.add({ load: readRows })
  const notify = async (value: FileContext) => {
    try {
      cache.publish(
        (await rows(value))
          .map(row => validateMetadata({ ...row.metadata, revision: row.payload }))
          .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
      )
      cache.broadcast()
    } catch (error) {
      report(error)
      cache.refresh()
    }
  }
  const mutation = async <T>(action: (value: FileContext) => Promise<T>) => {
    try {
      await ready()
      return await withContext(action)
    } catch (error) {
      throw report(error)
    } finally {
      scheduleSweep()
    }
  }
  const readLease = async (payload: string): Promise<PayloadLease> => {
    let epoch = restoring
    const holder = { payload, lease: await payloadLease(leaseName(payload)), active: true }
    heldLeases.add(holder)
    try {
      while (epoch !== restoring) {
        await restored()
        epoch = restoring
        const replacement = await payloadLease(leaseName(payload))
        const previous = holder.lease
        holder.lease = replacement
        previous.release()
        await previous.released
      }
    } catch (error) {
      holder.active = false
      heldLeases.delete(holder)
      holder.lease.release()
      throw error
    }
    return {
      get released() {
        return holder.lease.released
      },
      release() {
        if (!holder.active) return
        holder.active = false
        heldLeases.delete(holder)
        holder.lease.release()
      },
    }
  }
  const own = (lease: PayloadLease, tracked = true) => {
    let active = true
    const release = () => {
      if (active) {
        active = false
        readers.delete(release)
        lease.release()
        scheduleSweep()
      }
      return lease.released
    }
    if (tracked) readers.add(release)
    if (closed) void release()
    return release
  }
  const pin = async (item: { row: StoredFile; lease: PayloadLease }) => {
    await restored()
    if (lostPayloads.has(item.row.payload)) throw lostPayloads.get(item.row.payload)
    if (pins.has(item.row.payload)) {
      item.lease.release()
      await item.lease.released
    } else {
      pins.add(item.row.payload)
      own(item.lease)
    }
  }
  const repin = async () => {
    if (closed) return
    await withContext(async value => {
      for (const holder of [...heldLeases]) {
        if (!holder.active) continue
        let replacement: PayloadLease | undefined
        try {
          replacement = await payloadLease(leaseName(holder.payload))
          await (await value.directory.getFileHandle(holder.payload)).getFile()
          if (!holder.active || closed) {
            replacement.release()
            continue
          }
          const previous = holder.lease
          holder.lease = replacement
          lostPayloads.delete(holder.payload)
          previous.release()
          await previous.released
        } catch (error) {
          replacement?.release()
          lostPayloads.set(holder.payload, report(error))
        }
      }
    }).catch(error => {
      const failure = report(error)
      for (const holder of heldLeases) lostPayloads.set(holder.payload, failure)
    })
  }
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
  const armCollection = () => {
    if (collectionTimer) clearInterval(collectionTimer)
    collectionTimer = undefined
    if (closed || !visible()) return
    collectionTimer = setInterval(() => {
      if (visible() && retired.size)
        void restoring.then(() => {
          if (!closed) return sweep(false, true)
        })
    }, 120_000)
  }
  const becameVisible = () => {
    // Hidden transitions only stop the timer; they perform no storage work.
    armCollection()
    if (visible())
      void restoring.then(() => {
        if (!closed) scheduleSweep()
      })
  }
  let collectionChannel: BroadcastChannel | undefined
  const pageshow = (event: PageTransitionEvent) => {
    if (event.persisted) restoring = restoring.then(repin)
    becameVisible()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pageshow', pageshow)
    document.addEventListener('visibilitychange', becameVisible)
    armCollection()
    if (typeof BroadcastChannel !== 'undefined') {
      collectionChannel = new BroadcastChannel(`satin-files:${name}`)
      collectionChannel.onmessage = () => {
        if (visible()) scheduleSweep()
      }
    }
  }
  const read = async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action()
    } catch (error) {
      throw report(error)
    }
  }
  const stage = async (
    value: FileContext,
    id: string,
    input: Blob | ReadableStream<Uint8Array>,
    options: FileWriteOptions = {},
  ) => {
    validKey(id)
    const source = typeof File !== 'undefined' && input instanceof File ? input : undefined
    const payload = crypto.randomUUID()
    const metadata = validateMetadata({
      formatVersion: 1,
      revision: payload,
      id,
      name: options.name ?? source?.name ?? id.replace(/[\0/\\]/g, '_'),
      type:
        options.type ?? ((input instanceof Blob ? input.type : '') || 'application/octet-stream'),
      lastModified: options.lastModified ?? source?.lastModified ?? Date.now(),
      size: 0,
    })
    const lease = await payloadLease(leaseName(payload))
    const signal = options.signal
      ? AbortSignal.any([lifetime.signal, options.signal])
      : lifetime.signal
    try {
      signal.throwIfAborted()
      const handle = await value.directory.getFileHandle(payload, { create: true })
      const size = await writeFilePayload(
        handle,
        input instanceof Blob ? blobStream(input) : input,
        signal,
        [...value.path, payload],
      )
      if ((await handle.getFile()).size !== size)
        throw new DOMException('Flushed file size does not match input', 'NotReadableError')
      return { row: { id, payload, metadata: { ...metadata, size } } satisfies StoredFile, lease }
    } catch (error) {
      lease.release()
      await lease.released
      await metadataLock(metadataName, 'shared', () =>
        collectUnleased(leaseName(payload), () => remove(value, payload)),
      ).catch(report)
      throw error
    }
  }
  const snapshot = async (id?: string) => {
    await ready()
    const selection = await withContext(value =>
      metadataLock(
        metadataName,
        'shared',
        async () => {
          const records = (await rows(value)).filter(row => id === undefined || row.id === id)
          const held: { row: StoredFile; lease: PayloadLease }[] = []
          try {
            for (const row of records) {
              check()
              held.push({
                row: {
                  ...row,
                  metadata: validateMetadata({ ...row.metadata, revision: row.payload }),
                },
                lease: await readLease(row.payload),
              })
            }
            const attributes = await request<Record<string, unknown> | undefined>(
              value.database.transaction('settings').objectStore('settings').get('archive'),
            )
            return { held, attributes: attributes ?? {}, directory: value.directory }
          } catch (error) {
            for (const item of held) item.lease.release()
            throw error
          }
        },
        lifetime.signal,
      ),
    )
    try {
      const held: { row: StoredFile; lease: PayloadLease; file: File }[] = []
      // Payload leases now protect the snapshot; filesystem I/O needs no metadata lock.
      for (const item of selection.held) {
        check()
        const file = await (await selection.directory.getFileHandle(item.row.payload)).getFile()
        if (file.size !== item.row.metadata.size)
          throw new DOMException('Stored file size does not match index', 'NotReadableError')
        held.push({ ...item, file })
      }
      await restored()
      check()
      for (const item of held) {
        const lost = lostPayloads.get(item.row.payload)
        if (lost) throw lost
      }
      return { held, attributes: selection.attributes }
    } catch (error) {
      for (const item of selection.held) item.lease.release()
      throw error
    }
  }
  const streamFiles = (files: { file: File; row: StoredFile }[], release: () => Promise<void>) => {
    let index = 0
    let offset = 0
    let stopped = false
    let pending: Promise<ArrayBuffer> | undefined
    let controller: ReadableStreamDefaultController<Uint8Array>
    const finish = async () => {
      // Cancel and close must leave the payload leased until native slice I/O settles.
      await pending?.catch(() => {})
      readers.delete(closeRead)
      await release()
    }
    const closeRead = () => {
      if (!stopped) {
        stopped = true
        controller.close()
      }
      return finish()
    }
    const stream = new ReadableStream<Uint8Array>(
      {
        start(value) {
          controller = value
        },
        async pull(controller) {
          if (stopped) return
          try {
            await restored()
            if (stopped) return
            while (index < files.length && offset === files[index].file.size) {
              index++
              offset = 0
            }
            if (index === files.length) {
              stopped = true
              controller.close()
              return
            }
            const lost = lostPayloads.get(files[index].row.payload)
            if (lost) throw lost
            pending = files[index].file.slice(offset, offset + chunkSize).arrayBuffer()
            const bytes = new Uint8Array(await pending)
            if (stopped) return
            offset += bytes.length
            controller.enqueue(bytes)
          } catch (error) {
            if (!stopped) {
              stopped = true
              controller.error(report(error))
            }
          } finally {
            pending = undefined
            if (stopped) await finish()
          }
        },
        cancel() {
          stopped = true
          return finish()
        },
      },
      { highWaterMark: 0 },
    )
    readers.add(closeRead)
    return stream
  }
  const createURL = (id: string, scoped = false) =>
    read(async () => {
      validKey(id)
      const item = (await snapshot(id)).held[0]
      if (!item) return undefined
      let releasePin: (() => Promise<void>) | undefined
      let revokeOnFailure: (() => void) | undefined
      try {
        const blob = item.file.slice(0, item.file.size, item.row.metadata.type)
        const url = URL.createObjectURL(blob)
        let revoked = false
        let revokeTimer: ReturnType<typeof setTimeout> | undefined
        const revokeNow = () => {
          if (revokeTimer !== undefined) clearTimeout(revokeTimer)
          revokeTimer = undefined
          if (revoked) return
          revoked = true
          urls.delete(revokeNow)
          URL.revokeObjectURL(url)
          void releasePin?.()
        }
        urls.add(revokeNow)
        revokeOnFailure = revokeNow
        if (scoped) releasePin = own(item.lease)
        else await pin(item)
        await restored()
        check()
        const lost = lostPayloads.get(item.row.payload)
        if (lost) throw lost
        return {
          url,
          revoke() {
            if (revokeTimer !== undefined || revoked) return
            revokeTimer = setTimeout(revokeNow, 0)
          },
        }
      } catch (error) {
        revokeOnFailure?.()
        item.lease.release()
        throw error
      }
    })
  const api: FileStore = {
    name,
    coordination: coordinated() ? 'cross-window' : 'single-window',
    put: (id, input, options) =>
      mutation(async value => {
        const staged = await stage(value, id, input, options)
        try {
          await metadataLock(
            metadataName,
            'exclusive',
            async () => {
              check(options?.signal)
              const existing = await rows(value)
              if (existing.length >= maximumEntries && !existing.some(row => row.id === id))
                throw new RangeError('Too many file entries')
              const previous = existing.find(row => row.id === id)
              staged.row.metadata = { ...previous?.metadata, ...staged.row.metadata }
              await commit(value, files => {
                files.put(staged.row)
              })
              await notify(value)
            },
            options?.signal,
          )
          return staged.row.metadata
        } finally {
          staged.lease.release()
        }
      }),
    get: id =>
      read(async () => {
        validKey(id)
        const item = (await snapshot(id)).held[0]
        if (!item) return undefined
        try {
          const copied = item.file.size <= 8 * 1024 * 1024
          const bytes = copied ? await item.file.arrayBuffer() : item.file
          const file = new File([bytes], item.row.metadata.name, {
            type: item.row.metadata.type,
            lastModified: item.row.metadata.lastModified,
          })
          if (copied) {
            item.lease.release()
            await item.lease.released
            scheduleSweep()
          } else await pin(item)
          check()
          return file
        } catch (error) {
          item.lease.release()
          throw error
        }
      }),
    stat: id =>
      read(async () => {
        validKey(id)
        return (await readRows()).find(info => info.id === id)
      }),
    list: () => read(() => readRows()),
    delete: id =>
      mutation(value =>
        metadataLock(metadataName, 'exclusive', async () => {
          validKey(id)
          await commit(value, files => {
            files.delete(id)
          })
          await notify(value)
        }),
      ),
    stream: id =>
      read(async () => {
        validKey(id)
        const item = (await snapshot(id)).held[0]
        if (!item) return undefined
        return streamFiles([item], own(item.lease, false))
      }),
    objectURL: id => createURL(id),
    exportFiles: async () => {
      const data = await snapshot()
      const releases = data.held.map(item => own(item.lease, false))
      const release = async () => {
        await Promise.all(releases.map(done => done()))
      }
      try {
        const manifest = {
          ...data.attributes,
          formatVersion: 2,
          files: data.held.map(item => item.row.metadata),
        }
        const line = encodeLine(manifest)
        if (line.length > 4 * chunkSize) throw new RangeError('File manifest is too large')
        const magic = new TextEncoder().encode(`${archiveMagic}\n`)
        const header = new Uint8Array(magic.length + line.length)
        header.set(magic)
        header.set(line, magic.length)
        // Keep archive chunks within the importer's accepted input bound.
        let headerOffset = 0
        const payloads = streamFiles(data.held, release).getReader()
        let cancelled = false
        const stream = new ReadableStream(
          {
            async pull(controller) {
              if (cancelled) return
              try {
                if (headerOffset < header.length) {
                  controller.enqueue(header.slice(headerOffset, headerOffset + chunkSize))
                  headerOffset += chunkSize
                  return
                }
                const next = await payloads.read()
                if (cancelled) return
                if (next.done) controller.close()
                else controller.enqueue(next.value)
              } catch (error) {
                if (!cancelled) controller.error(error)
              }
            },
            async cancel(reason) {
              cancelled = true
              try {
                await payloads.cancel(reason)
              } finally {
                await release()
              }
            },
          },
          { highWaterMark: 0 },
        )
        return stream
      } catch (error) {
        await release()
        throw error
      }
    },
    importFiles: (input, mode) =>
      mutation(async value => {
        if (mode !== 'replace' && mode !== 'merge')
          throw new TypeError('Import mode must be replace or merge')
        const archive = new ArchiveReader(input)
        const staged: { row: StoredFile; lease: PayloadLease }[] = []
        let published = false
        try {
          if ((await archive.line(64)) !== archiveMagic)
            throw new TypeError('Incompatible file archive')
          const manifest = validateManifest(JSON.parse(await archive.line()))
          for (const metadata of manifest.files) {
            const item = await stage(value, metadata.id, archive.payload(metadata.size), metadata)
            item.row.metadata = { ...metadata, revision: item.row.payload }
            staged.push(item)
          }
          await archive.end()
          await metadataLock(metadataName, 'exclusive', async () => {
            const existing = mode === 'merge' ? await rows(value) : []
            if (
              new Set([...existing.map(row => row.id), ...staged.map(item => item.row.id)]).size >
              maximumEntries
            )
              throw new RangeError('Too many file entries')
            const previousAttributes =
              mode === 'merge'
                ? await request<Record<string, unknown> | undefined>(
                    value.database.transaction('settings').objectStore('settings').get('archive'),
                  )
                : undefined
            await commit(value, (files, settings) => {
              if (mode === 'replace') files.clear()
              for (const item of staged) files.put(item.row)
              const { files: _files, ...attributes } = manifest
              settings.put({ ...previousAttributes, ...attributes }, 'archive')
            })
            published = true
            await notify(value)
          })
        } finally {
          await archive.close()
          for (const item of staged) item.lease.release()
          await Promise.all(staged.map(item => item.lease.released))
          if (!published)
            for (const item of staged)
              await metadataLock(metadataName, 'shared', () =>
                collectUnleased(leaseName(item.row.payload), () => remove(value, item.row.payload)),
              ).catch(report)
        }
      }),
    subscribe: listener => {
      check()
      const detach = cache.subscribe(listener)
      const unsubscribe = () => {
        subscriptions.delete(unsubscribe)
        detach()
      }
      subscriptions.add(unsubscribe)
      return unsubscribe
    },
    onError: listener => {
      errors.add(listener)
      return () => {
        errors.delete(listener)
      }
    },
    close: () => {
      if (closed) return
      closed = true
      stores.delete(name)
      lifetime.abort()
      if (sweepTimer) clearTimeout(sweepTimer)
      if (collectionTimer) clearInterval(collectionTimer)
      if (typeof window !== 'undefined') {
        window.removeEventListener('pageshow', pageshow)
        document.removeEventListener('visibilitychange', becameVisible)
      }
      collectionChannel?.close()
      hookURLs.delete(api)
      for (const detach of subscriptions) detach()
      const releases = [...readers]
      for (const revoke of urls) revoke()
      pins.clear()
      const pending = releases.map(release => release())
      removeHandle()
      void Promise.all(pending).finally(() => errors.clear())
    },
  }
  hookURLs.set(api, id => createURL(id, true))
  // Internal diagnostics, deliberately absent from the public FileStore interface.
  Object.defineProperty(api, Symbol.for('satin.file-store.diagnostics'), {
    get: () => ({
      retiredCount: retired.size,
      retiredBytes: [...retired.values()].reduce((total, bytes) => total + bytes, 0),
    }),
  })
  stores.set(name, api)
  return api
}
