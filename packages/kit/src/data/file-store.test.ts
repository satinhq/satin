import { IDBFactory, IDBDatabase } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineFileStore, type FileStore } from './file-store.ts'
import { collection, defineDatabase } from './database.ts'
import { rewriteFileWorker } from '../../scripts/file-worker-url.mjs'
import { commit } from './file-index.ts'
import { ArchiveReader } from './file-archive.ts'

let shortClose = false
let removeFailure = false
let pauseKeys: (() => Promise<void>) | undefined
let directoryRoot: Directory
class Directory {
  directories = new Map<string, Directory>()
  files = new Map<string, Blob>()
  async getDirectoryHandle(name: string) {
    if (!this.directories.has(name)) this.directories.set(name, new Directory())
    return this.directories.get(name)!
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!options?.create) throw new DOMException('Missing file', 'NotFoundError')
      this.files.set(name, new Blob())
    }
    return {
      getFile: async () => new File([this.files.get(name)!], name),
      createWritable: async () => {
        const parts: Uint8Array<ArrayBuffer>[] = []
        return {
          write: async (bytes: Uint8Array) => {
            if (quotaFailure) throw new DOMException('Storage is full', 'QuotaExceededError')
            parts.push(bytes.slice())
          },
          close: async () => {
            this.files.set(name, shortClose ? new Blob() : new Blob(parts))
          },
          abort: async () => {},
        }
      },
    }
  }
  async removeEntry(name: string) {
    if (removeFailure) throw new DOMException('Cannot remove payload', 'UnknownError')
    this.files.delete(name)
  }
  async *keys() {
    for (const key of this.files.keys()) {
      yield key
      await pauseKeys?.()
    }
  }
}
let quotaFailure = false
let stores: FileStore[] = []
const store = (name = 'test') => {
  const value = defineFileStore({ name })
  stores.push(value)
  return value
}
beforeEach(() => {
  pauseKeys = undefined
  quotaFailure = false
  shortClose = false
  removeFailure = false
  const root = (directoryRoot = new Directory())
  const pending = new Map<string, { mode: string; run: () => void }[]>()
  const active = new Map<string, string[]>()
  const drain = (name: string) => {
    const queue = pending.get(name) ?? []
    const held = active.get(name) ?? []
    while (
      queue.length &&
      !held.includes('exclusive') &&
      (!held.length || queue[0].mode === 'shared')
    ) {
      queue.shift()!.run()
      if (held.includes('exclusive')) break
    }
  }
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('navigator', {
    storage: { getDirectory: async () => root },
    locks: {
      request: <T>(name: string, options: unknown, callback?: (lock: unknown) => Promise<T>) => {
        const action = typeof options === 'function' ? (options as typeof callback) : callback
        const settings =
          typeof options === 'object' ? (options as { mode?: string; ifAvailable?: boolean }) : {}
        const mode = settings.mode ?? 'exclusive'
        return new Promise<T>((resolve, reject) => {
          const held = active.get(name) ?? []
          active.set(name, held)
          if (
            settings.ifAvailable &&
            (held.includes('exclusive') || (mode === 'exclusive' && held.length))
          ) {
            Promise.resolve(action!(null)).then(resolve, reject)
            return
          }
          const queue = pending.get(name) ?? []
          pending.set(name, queue)
          queue.push({
            mode,
            run: () => {
              held.push(mode)
              Promise.resolve(action!({ name, mode }))
                .then(resolve, reject)
                .finally(() => {
                  held.splice(held.indexOf(mode), 1)
                  drain(name)
                })
            },
          })
          drain(name)
        })
      },
    },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  for (const value of stores) value.close()
  stores = []
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('round-trips File metadata, safe logical IDs, missing values and deletion', async () => {
  const files = store()
  const metadata = await files.put(
    '../photo',
    new File(['image'], 'photo.png', {
      type: 'image/png',
      lastModified: 123,
    }),
  )
  expect(metadata).toEqual({
    formatVersion: 1,
    revision: expect.any(String),
    id: '../photo',
    name: 'photo.png',
    type: 'image/png',
    size: 5,
    lastModified: 123,
  })
  expect(await readText(files, '../photo')).toBe('image')
  expect(await files.stat('../photo')).toEqual(metadata)
  expect(await files.list()).toEqual([metadata])
  await files.delete('../photo')
  await files.delete('../photo')
  expect(await files.get('../photo')).toBeUndefined()
})

it('cancels a stalled stream and preserves the previous durable revision', async () => {
  const files = store()
  await files.put('file', new Blob(['previous']))
  const controller = new AbortController()
  let started!: () => void
  const reading = new Promise<void>(resolve => {
    started = resolve
  })
  const input = new ReadableStream<Uint8Array>({
    pull() {
      started()
    },
  })
  const writing = files.put('file', input, { signal: controller.signal })
  await reading
  controller.abort()
  await expect(writing).rejects.toMatchObject({ name: 'AbortError' })
  expect(await readText(files, 'file')).toBe('previous')
})

it('reports quota failure without publishing or losing old bytes and permits a retry', async () => {
  const files = store()
  await files.put('file', new Blob(['previous']))
  const failures: string[] = []
  files.onError(({ error }) => {
    failures.push(error.name)
    throw new Error('Observer failed')
  })
  quotaFailure = true
  await expect(files.put('file', new Blob(['new']))).rejects.toMatchObject({
    name: 'QuotaExceededError',
  })
  expect(await readText(files, 'file')).toBe('previous')
  expect(failures).toEqual(['QuotaExceededError'])
  quotaFailure = false
  await files.put('file', new Blob(['retry']))
  expect(await readText(files, 'file')).toBe('retry')
})

it('serializes shared callers and reopens the same durable index', async () => {
  const first = store()
  const second = store()
  await Promise.all([
    first.put('file', new Blob(['first'])),
    second.put('file', new Blob(['second'])),
  ])
  expect(second).toBe(first)
  const published = await readText(first, 'file')
  expect(['first', 'second']).toContain(published)
  first.close()
  expect(await readText(store(), 'file')).toBe(published)
})

it('lets deletion complete while a read stream pins the old bytes', async () => {
  const files = store()
  await files.put('file', new Blob(['bytes']))
  const stream = (await files.stream('file'))!
  await within(files.delete('file'))
  expect(await new Response(stream).text()).toBe('bytes')
  expect(await files.stat('file')).toBeUndefined()
})

it('exports raw bytes and restores preserved IDs alongside database references', async () => {
  const files = store('source')
  await files.put('attachment', new File(['document'], 'report.txt', { lastModified: 456 }))
  const metadata = await files.list()
  const backup = await new Response(await files.exportFiles()).blob()
  const restored = store('restored')
  await restored.put('obsolete', new Blob(['old']))
  await restored.importFiles(backup, 'replace')
  expect(await restored.list()).toEqual(
    metadata.map(info => ({ ...info, revision: expect.any(String) })),
  )
  expect((await restored.list())[0].revision).not.toBe(metadata[0].revision)
  expect(await readText(restored, 'attachment')).toBe('document')
  await restored.put('keep', new Blob(['keep']))
  await restored.importFiles(backup, 'merge')
  expect((await restored.list()).map(file => file.id)).toEqual(['attachment', 'keep'])
})

it('rejects trailing bytes without changing published files', async () => {
  const files = store()
  await files.put('old', new Blob(['safe']))
  const metadata = { formatVersion: 1, id: 'new', name: 'new', type: '', size: 5, lastModified: 1 }
  const header = { formatVersion: 2, files: [metadata] }
  await expect(
    files.importFiles(
      new Blob([`satin-files/2\n${JSON.stringify(header)}\n12345trailing`]),
      'replace',
    ),
  ).rejects.toThrow('Trailing')
  expect(await readText(files, 'old')).toBe('safe')
})

it('works in explicitly degraded single-window mode without Web Locks', async () => {
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => directoryRoot } })
  const files = store('single')
  await files.put('file', new Blob(['single']))
  expect(files.coordination).toBe('single-window')
  expect(await readText(files, 'file')).toBe('single')
})

async function readText(files: FileStore, id: string) {
  const read = (await files.get(id))!
  return read.text()
}

async function payloadNames() {
  const names: string[] = []
  for (const namespace of directoryRoot.directories.values())
    for (const directory of namespace.directories.values()) names.push(...directory.files.keys())
  return names
}
const within = <T>(promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation blocked by reader')), 200),
    ),
  ])

it('keeps an open file and stream readable while replacement and deletion complete', async () => {
  const files = store('leases')
  await files.put('file', new Blob(['previous']))
  const read = await files.get('file')
  const stream = (await files.stream('file'))!
  await within(files.put('file', new Blob(['next'])))
  await within(files.delete('file'))
  expect(await read!.text()).toBe('previous')
  expect(await new Response(stream).text()).toBe('previous')
})

it('owns object URL leases and revokes exactly once on revoke or close', async () => {
  const files = store('urls')
  await files.put('file', new Blob(['previous']))
  const first = (await files.objectURL('file'))!
  await files.put('file', new Blob(['next']))
  expect(await (await fetch(first.url)).text()).toBe('previous')
  first.revoke()
  first.revoke()
  await new Promise(resolve => setTimeout(resolve, 20))
  await expect(fetch(first.url)).rejects.toThrow()
  const second = (await files.objectURL('file'))!
  files.close()
  await expect(fetch(second.url)).rejects.toThrow()
})

it('pipes a snapshot export back into the same store without a lock deadlock', async () => {
  const files = store('compose')
  await files.put('file', new Blob(['bytes']))
  await within(files.importFiles(await files.exportFiles(), 'replace'))
  const read = await files.get('file')
  expect(await read!.text()).toBe('bytes')
})

it('rejects a short flushed payload before publishing metadata', async () => {
  const files = store('short')
  await files.put('file', new Blob(['previous']))
  shortClose = true
  await expect(files.put('file', new Blob(['replacement']))).rejects.toMatchObject({
    name: 'NotReadableError',
  })
  shortClose = false
  expect((await files.stat('file'))!.size).toBe(8)
})

it('uses the main-thread writer after a worker-side SecurityError on open', async () => {
  class WorkerFailure {
    onmessage?: (event: { data: unknown }) => void
    postMessage() {
      queueMicrotask(() =>
        this.onmessage?.({
          data: { error: { name: 'SecurityError', message: 'Worker storage unavailable' } },
        }),
      )
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', WorkerFailure)
  await expect(store('worker-open').put('file', new Blob(['fallback']))).resolves.toMatchObject({
    size: 8,
  })
})

it('falls back from strict durability and reports cleanup errors in database-shaped failures', async () => {
  const original = IDBDatabase.prototype.transaction
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
    this: globalThis.IDBDatabase,
    ...args
  ) {
    if (args[2]) throw new TypeError('Strict durability unsupported')
    return original.apply(this, args)
  })
  const files = store('strict')
  const failures: { database: string; error: Error }[] = []
  files.onError(failure => failures.push(failure))
  await files.put('file', new Blob(['first']))
  removeFailure = true
  await files.put('file', new Blob(['second']))
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(
    failures.some(
      failure => failure.database === 'strict' && failure.error.name === 'UnknownError',
    ),
  ).toBe(true)
})

it('reserves the internal IndexedDB namespace', () => {
  expect(() =>
    defineDatabase({
      name: '__satin_internal__:files:drive',
      version: 1,
      collections: { records: collection<{ id: string }>({ key: 'id' }) },
    }),
  ).toThrow(/reserved/i)
})

it('round-trips unknown manifest and metadata fields, validates before staging and cleans a failed import', async () => {
  const files = store('manifest')
  const metadata = {
    formatVersion: 1,
    id: 'file',
    name: 'file.txt',
    type: 'text/plain',
    size: 4,
    lastModified: 1,
    future: { value: 7 },
  }
  const header = { formatVersion: 2, futureArchive: true, files: [metadata] }
  await files.importFiles(new Blob([`satin-files/2\n${JSON.stringify(header)}\ndata`]), 'replace')
  expect((await files.stat('file'))!.future).toEqual({ value: 7 })
  const archive = await new Response(await files.exportFiles()).text()
  expect(JSON.parse(archive.split('\n')[1]).futureArchive).toBe(true)
  await files.put('file', new Blob(['edit']))
  expect((await files.stat('file'))!.future).toEqual({ value: 7 })
  const before = new Set(await payloadNames())
  const duplicate = { ...header, files: [metadata, metadata] }
  await expect(
    files.importFiles(new Blob([`satin-files/2\n${JSON.stringify(duplicate)}\n`]), 'replace'),
  ).rejects.toThrow('Duplicate')
  const unsafeName = { ...header, files: [{ ...metadata, name: '../secret' }] }
  await expect(
    files.importFiles(new Blob([`satin-files/2\n${JSON.stringify(unsafeName)}\n`]), 'replace'),
  ).rejects.toThrow('Invalid file metadata')
  const oversized = { ...header, files: Array(10001).fill(metadata) }
  await expect(
    files.importFiles(new Blob([`satin-files/2\n${JSON.stringify(oversized)}\n`]), 'replace'),
  ).rejects.toThrow(/entries|count|many/i)
  expect((await payloadNames()).filter(name => !before.has(name))).toEqual([])
  await expect(
    files.importFiles(new Blob([`satin-files/2\n${JSON.stringify(header)}\nx`]), 'replace'),
  ).rejects.toThrow(/Truncated/)
  expect((await payloadNames()).filter(name => !before.has(name))).toEqual([])
})

it('fails a missing worker rewrite and bounds import backing buffers', async () => {
  expect(() => rewriteFileWorker('new Worker(otherURL)')).toThrow('rewrite literal')
  expect(rewriteFileWorker("new URL('./file-writer.worker.ts', import.meta.url)")).toContain(
    'file-writer.worker.js',
  )
  const huge = new Uint8Array(2 * 1024 * 1024)
  const archive = new ArchiveReader(
    new ReadableStream({
      start(controller) {
        controller.enqueue(huge)
        controller.close()
      },
    }),
  )
  await expect(archive.line()).rejects.toThrow('1 MiB')
  await archive.close()
})

it('upgrades an existing file index and closes connections for later upgrades', async () => {
  const name = '__satin_internal__:files:upgrade'
  const seed = indexedDB.open(name, 1)
  seed.onupgradeneeded = () => seed.result.createObjectStore('files', { keyPath: 'id' })
  await new Promise<void>((resolve, reject) => {
    seed.onsuccess = () => resolve()
    seed.onerror = () => reject(seed.error)
  })
  seed.result.close()
  const files = store('upgrade')
  await files.put('file', new Blob(['bytes']))
  const stream = (await files.stream('file'))!
  const upgrade = indexedDB.open(name, 3)
  await within(
    new Promise<void>((resolve, reject) => {
      upgrade.onsuccess = () => resolve()
      upgrade.onerror = () => reject(upgrade.error)
    }),
  )
  upgrade.result.close()
  await stream.cancel()
})

it('rejects blocked upgrades promptly and can reopen after the blocker closes', async () => {
  const open = indexedDB.open('__satin_internal__:files:blocked', 1)
  open.onupgradeneeded = () => open.result.createObjectStore('files', { keyPath: 'id' })
  await new Promise<void>(resolve => {
    open.onsuccess = () => resolve()
  })
  open.result.onversionchange = () => {}
  const files = store('blocked')
  await expect(within(files.list())).rejects.toMatchObject({ name: 'InvalidStateError' })
  await expect(within(files.list())).rejects.toMatchObject({ name: 'InvalidStateError' })
  open.result.close()
  await new Promise(resolve => setTimeout(resolve, 20))
  await expect(files.list()).resolves.toEqual([])
})

it('preserves request quota errors when an index abort has no transaction error', async () => {
  const transaction = {
    error: null,
    oncomplete: undefined as (() => void) | undefined,
    onerror: undefined as ((event: { target: { error: Error } }) => void) | undefined,
    onabort: undefined as (() => void) | undefined,
    objectStore: () => ({
      put() {
        queueMicrotask(() => {
          transaction.onerror?.({
            target: { error: new DOMException('Full', 'QuotaExceededError') },
          })
          transaction.onabort?.()
        })
      },
    }),
  }
  const context = { database: { transaction: () => transaction } } as unknown as Parameters<
    typeof commit
  >[0]
  await expect(
    commit(context, files => {
      files.put({})
    }),
  ).rejects.toMatchObject({ name: 'QuotaExceededError' })
})

it('reference returns a descriptive File without an unsafe early-release method', async () => {
  const files = store('r3-file')
  await files.put('file', new Blob(['bytes']), { name: 'note.txt', type: 'text/plain' })
  const file = await files.get('file')
  expect(file).toBeInstanceOf(File)
  expect(file).toMatchObject({ name: 'note.txt', type: 'text/plain' })
  expect(file).not.toHaveProperty('release')
})
it('reference preserves URL MIME and defers idempotent revocation', async () => {
  const files = store('r3-mime')
  await files.put('svg', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>']), {
    type: 'image/svg+xml',
  })
  const handle = (await files.objectURL('svg'))!
  expect((await fetch(handle.url)).headers.get('content-type')).toBe('image/svg+xml')
  const revoke = vi.spyOn(URL, 'revokeObjectURL')
  handle.revoke()
  handle.revoke()
  expect(revoke).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(revoke).toHaveBeenCalledTimes(1))
})
it('reference reports all failed read operations through the database-shaped observer', async () => {
  const files = store('r3-errors')
  const listener = vi.fn()
  files.onError(listener)
  for (const read of [files.get, files.stat, files.stream, files.objectURL]) {
    await expect(read('')).rejects.toBeInstanceOf(TypeError)
  }
  expect(listener).toHaveBeenCalledTimes(4)
  expect(listener.mock.calls[0][0]).toMatchObject({
    database: files.name,
    error: expect.any(TypeError),
  })
})
it('reference repeated definitions share one cache handle and close permits reopening', () => {
  const first = store('r3-identity')
  for (let count = 0; count < 25; count++) expect(store('r3-identity')).toBe(first)
  first.close()
  expect(store('r3-identity')).not.toBe(first)
})
it('reference has no GC-driven lease release', async () => {
  const registry = vi.fn(() => {
    throw new Error('GC cannot own payload lifetimes')
  })
  vi.stubGlobal('FinalizationRegistry', registry)
  const files = store('r4-no-registry')
  await files.put('file', new Blob(['previous']))
  await files.get('file')
  const url = await files.objectURL('file')
  url!.revoke()
  expect(registry).not.toHaveBeenCalled()
})
it('reference reruns a sweep requested while its previous pass is running', async () => {
  const files = store('r3-sweep')
  await files.put('file', new Blob(['previous']))
  let entered!: () => void
  let resume!: () => void
  const started = new Promise<void>(resolve => {
    entered = resolve
  })
  const paused = new Promise<void>(resolve => {
    resume = resolve
  })
  pauseKeys = async () => {
    entered()
    await paused
  }
  await started
  await files.put('file', new Blob(['next']))
  await new Promise(resolve => setTimeout(resolve, 30))
  pauseKeys = undefined
  resume()
  await vi.waitFor(async () => expect(await payloadNames()).toHaveLength(1))
})
it('reference retries a temporarily unavailable collection lease without another mutation', async () => {
  const files = store('r3-retry')
  await files.put('file', new Blob(['previous']))
  await new Promise(resolve => setTimeout(resolve, 30))
  const request = navigator.locks.request.bind(navigator.locks)
  let denied = false
  vi.spyOn(navigator.locks, 'request').mockImplementation(((
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<unknown>,
  ) => {
    if (options.ifAvailable && !denied) {
      denied = true
      return Promise.resolve(callback(null))
    }
    return request(name, options, callback)
  }) as typeof navigator.locks.request)
  await files.delete('file')
  await vi.waitFor(async () => expect(await payloadNames()).toEqual([]))
  expect(denied).toBe(true)
})

it('reference revocation waits for the same-turn consumer and remains idempotent', async () => {
  const files = store('r3-deferred')
  await files.put('file', new Blob(['bytes']))
  const handle = (await files.objectURL('file'))!
  const revoke = vi.spyOn(URL, 'revokeObjectURL')
  handle.revoke()
  handle.revoke()
  expect(revoke).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(revoke).toHaveBeenCalledTimes(1))
})

it.each(['text', 'arrayBuffer', 'slice', 'Response'] as const)(
  'reference copied get-derived %s reads survive replacement and collection',
  async kind => {
    const finalizers: (() => void)[] = []
    vi.stubGlobal(
      'FinalizationRegistry',
      class {
        register(_target: object, release: () => void) {
          finalizers.push(release)
        }
        unregister() {
          return true
        }
      },
    )
    const files = store(`r4-derived-${kind}`)
    await files.put('file', new Blob(['previous']))
    const source = (await files.get('file'))!
    const pending =
      kind === 'text'
        ? source.text()
        : kind === 'arrayBuffer'
          ? source.arrayBuffer()
          : kind === 'slice'
            ? source.slice().text()
            : new Response(source).text()
    for (const finalize of finalizers) finalize()
    await files.put('file', new Blob(['next']))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(await payloadNames()).toHaveLength(1)
    const value = await pending
    expect(typeof value === 'string' ? value : new TextDecoder().decode(value)).toBe('previous')
    files.close()
    await vi.waitFor(async () => expect(await payloadNames()).toHaveLength(1))
  },
)
it('reference URL revoke leaves the handed-out payload session-pinned until close', async () => {
  const files = store('r4-url-pin')
  await files.put('file', new Blob(['previous']))
  const handle = (await files.objectURL('file'))!
  handle.revoke()
  await files.put('file', new Blob(['next']))
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(await payloadNames()).toHaveLength(2)
  files.close()
  await store('r4-url-pin').list()
  await vi.waitFor(async () => expect(await payloadNames()).toHaveLength(1))
})
it.each(['stream', 'exportFiles'] as const)(
  'reference %s cancel waits for an in-flight slice and suppresses post-cancel errors',
  async method => {
    const files = store(`r4-cancel-${method}`)
    await files.put('file', new Blob(['previous']))
    let started!: () => void
    let rejectRead!: (reason: Error) => void
    const reading = new Promise<void>(resolve => {
      started = resolve
    })
    const pending = new Promise<ArrayBuffer>((_resolve, reject) => {
      rejectRead = reject
    })
    const slice = File.prototype.slice
    vi.spyOn(File.prototype, 'slice').mockImplementation(function (this: File, ...args) {
      const blob = slice.apply(this, args)
      vi.spyOn(blob, 'arrayBuffer').mockImplementation(() => {
        started()
        return pending
      })
      return blob
    })
    const controllerError = vi.spyOn(ReadableStreamDefaultController.prototype, 'error')
    const stream = method === 'stream' ? await files.stream('file') : await files.exportFiles()
    const reader = stream!.getReader()
    if (method === 'exportFiles') await reader.read()
    const read = reader.read()
    await reading
    let cancelled = false
    const cancel = reader.cancel().then(() => {
      cancelled = true
    })
    await files.delete('file')
    await new Promise(resolve => setTimeout(resolve, 100))
    const cancelledEarly = cancelled
    const pinnedDuringRead = (await payloadNames()).length
    rejectRead(new Error('Pending native slice failed'))
    await cancel
    await read
    expect(cancelledEarly).toBe(false)
    expect(pinnedDuringRead).toBe(1)
    expect(controllerError).not.toHaveBeenCalled()
    await vi.waitFor(async () => expect(await payloadNames()).toHaveLength(0))
  },
)
it('reference every put changes the revision even with identical descriptive metadata', async () => {
  const files = store('r4-revision')
  const first = await files.put(
    'file',
    new File(['old'], 'file.txt', { type: 'text/plain', lastModified: 1 }),
  )
  const second = await files.put(
    'file',
    new File(['new'], 'file.txt', { type: 'text/plain', lastModified: 1 }),
  )
  expect(typeof first.revision).toBe('string')
  expect(second.revision).not.toBe(first.revision)
})

it('reference get copies up to 8 MiB but keeps larger files pinned', async () => {
  const files = store('r5-copy-boundary')
  const bytes = new Uint8Array(8 * 1024 * 1024 + 1).fill(65)
  await files.put('small', new Blob([bytes.subarray(0, -1)]))
  const small = (await files.get('small'))!
  await files.delete('small')
  await vi.waitFor(async () => expect(await payloadNames()).toHaveLength(0))
  expect((await small.arrayBuffer()).byteLength).toBe(8 * 1024 * 1024)
  await files.put('large', new Blob([bytes]))
  const large = (await files.get('large'))!
  await files.delete('large')
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(await payloadNames()).toHaveLength(1)
  expect((await large.arrayBuffer()).byteLength).toBe(bytes.length)
  expect(Reflect.get(files, Symbol.for('satin.file-store.diagnostics'))).toEqual({
    retiredCount: 1,
    retiredBytes: bytes.length,
  })
})

it('reference persisted pageshow re-pins before reads can reuse a session pin and reports lost bytes', async () => {
  const events = new EventTarget()
  vi.stubGlobal('window', events)
  const documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('document', documentEvents)
  const files = store('r5-restore')
  await files.put('file', new Blob(['bytes']))
  await files.objectURL('file')
  const request = navigator.locks.request.bind(navigator.locks)
  let acquiring!: () => void
  let resume!: () => void
  const started = new Promise<void>(resolve => {
    acquiring = resolve
  })
  const gate = new Promise<void>(resolve => {
    resume = resolve
  })
  let intercepted = false
  vi.spyOn(navigator.locks, 'request').mockImplementation(((
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<unknown>,
  ) => {
    if (name.includes(':payload:') && options.mode === 'shared' && !intercepted) {
      intercepted = true
      acquiring()
      return gate.then(() => request(name, options, callback))
    }
    return request(name, options, callback)
  }) as typeof navigator.locks.request)
  events.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  // A restore must request a replacement holder even if the old JS record still exists.
  await Promise.race([started, new Promise(resolve => setTimeout(resolve, 30))])
  let finished = false
  const reading = files.objectURL('file').then(value => {
    finished = true
    return value
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  const wasBlocked = !finished
  resume()
  await reading
  expect(intercepted).toBe(true)
  expect(wasBlocked).toBe(true)
  const failures: string[] = []
  files.onError(({ error }) => failures.push(error.name))
  const directory = directoryRoot.directories.get('satin-files')!.directories.values().next().value!
  directory.files.clear()
  events.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  await vi.waitFor(() => expect(failures).toContain('NotFoundError'))
  await expect(files.objectURL('file')).rejects.toMatchObject({ name: 'NotFoundError' })
  files.close()
})

it('reference a visible survivor collects a retired payload after its peer holder dies, without a write', async () => {
  const events = new EventTarget()
  vi.stubGlobal('window', events)
  const documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('document', documentEvents)
  const request = navigator.locks.request.bind(navigator.locks)
  let drop!: () => void
  let simulateDeath = false
  vi.spyOn(navigator.locks, 'request').mockImplementation(((
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<unknown>,
  ) => {
    if (simulateDeath && name.includes(':payload:') && options.mode === 'shared') {
      simulateDeath = false
      const dead = new Promise<void>(resolve => {
        drop = resolve
      })
      return request(name, options, lock => Promise.race([Promise.resolve(callback(lock)), dead]))
    }
    return request(name, options, callback)
  }) as typeof navigator.locks.request)
  const files = store('r5-survivor')
  await files.put('file', new Blob(['old']))
  simulateDeath = true
  await files.objectURL('file')
  await files.put('file', new Blob(['new']))
  await new Promise(resolve => setTimeout(resolve, 150))
  expect(await payloadNames()).toHaveLength(2)
  drop()
  await new Promise(resolve => setTimeout(resolve, 20))
  documentEvents.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(async () => expect(await payloadNames()).toHaveLength(1))
  files.close()
})

it('reference a peer retirement upgrades an armed retired-only backoff to a full scan', async () => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  const peers = new Set<{ onmessage?: () => void }>()
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage?: () => void
      constructor() {
        peers.add(this)
      }
      postMessage() {
        for (const peer of peers) if (peer !== this) peer.onmessage?.()
      }
      close() {
        peers.delete(this)
      }
    },
  )
  let periodic!: () => void
  const interval = globalThis.setInterval
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
    if (delay === 120_000) periodic = callback
    return interval(callback, delay)
  }) as typeof setInterval)
  const files = store('r6-discovery')
  const first = await files.put('first', new Blob(['first']))
  const second = await files.put('second', new Blob(['second']))
  const { payloadLease } = await import('./file-locks.ts')
  const holds = await Promise.all(
    [first, second].map(info => payloadLease(`satin-files:${files.name}:payload:${info.revision}`)),
  )
  await files.delete('first')
  await new Promise(resolve => setTimeout(resolve, 150))
  let resume!: () => void
  let armed!: () => void
  const backoff = new Promise<void>(resolve => {
    armed = resolve
  })
  const timeout = globalThis.setTimeout
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
    if (delay === 20 && !resume) {
      const handle = timeout(() => {}, 60_000)
      resume = () => {
        clearTimeout(handle)
        callback()
      }
      armed()
      return handle
    }
    return timeout(callback, delay)
  }) as typeof setTimeout)
  periodic()
  await backoff
  // An independent window unpublishes a second payload and broadcasts its commit.
  const { openIndex } = await import('./file-index.ts')
  const database = await openIndex(files.name)
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('files', 'readwrite')
    transaction.objectStore('files').delete('second')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
  const peer = new BroadcastChannel(`satin-files:${files.name}`)
  peer.postMessage(null)
  peer.close()
  for (const lease of holds) lease.release()
  await Promise.all(holds.map(lease => lease.released))
  resume()
  await vi.waitFor(async () => expect(await payloadNames()).toHaveLength(0))
})

it('reference close cancels queued collection and deferred URL callbacks without reopening storage', async () => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  let periodic!: () => void
  const interval = globalThis.setInterval
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
    if (delay === 120_000) periodic = callback
    return interval(callback, delay)
  }) as typeof setInterval)
  const files = store('r6-close')
  await files.put('file', new Blob(['retired']))
  const url = (await files.objectURL('file'))!
  await files.delete('file')
  await new Promise(resolve => setTimeout(resolve, 150))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    periodic() // Its restore continuation is queued, but has not run.
    url.revoke()
    files.close()
    const pendingCallbacks = vi.getTimerCount()
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('A closed file store reopened storage')
    })
    await vi.runAllTimersAsync()
    await new Promise(resolve => setImmediate(resolve))
    expect(pendingCallbacks).toBe(0)
    expect(open).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})
