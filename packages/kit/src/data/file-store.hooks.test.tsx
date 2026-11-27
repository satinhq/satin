// @vitest-environment jsdom
import { act, useState, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { URL as NodeURL } from 'node:url'
import * as fileAPI from './file-store.ts'
import { fileCache } from './file-cache.ts'
import { useFiles, useFileInfo, type FileStore, type FileMetadata } from './file-store.ts'
let root: Root
let element: HTMLDivElement
let remove: () => void
const info: FileMetadata = {
  formatVersion: 1,
  revision: 'initial',
  id: 'file',
  name: 'file.txt',
  type: 'text/plain',
  size: 4,
  lastModified: 1,
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  element = document.createElement('div')
  root = createRoot(element)
})
afterEach(async () => {
  await act(async () => root.unmount())
  remove?.()
  vi.unstubAllGlobals()
})
it('warm mounts reuse metadata and refresh errors retain it for both hooks', async () => {
  const cache = fileCache('hooks-warm')
  let failing = false
  remove = cache.add({
    load: async () => {
      if (failing) throw new Error('Refresh failed')
      return [info]
    },
  })
  const store = {
    name: 'hooks-warm',
    subscribe: cache.subscribe,
    list: async () => {
      if (failing) throw new Error('Refresh failed')
      return cache.snapshot.data
    },
    stat: async (id: string) => {
      if (failing) throw new Error('Refresh failed')
      return cache.snapshot.data.find(info => info.id === id)
    },
  } as unknown as FileStore
  cache.publish([info])
  const commits: string[] = []
  function View() {
    const list = useFiles(store)
    const file = useFileInfo(store, 'file')
    useLayoutEffect(() => {
      commits.push(element.textContent ?? '')
    })
    return (
      <p>
        {list.loading ? 'loading' : list.data[0]?.name}:{file.data?.name}:{file.error?.message}
      </p>
    )
  }
  await act(async () => root.render(<View />))
  expect(element.textContent).toBe('file.txt:file.txt:')
  expect(commits[0]).toBe('file.txt:file.txt:')
  failing = true
  await act(async () => {
    cache.refresh()
    await Promise.resolve()
  })
  expect(element.textContent).toBe('file.txt:file.txt:Refresh failed')
})
it('ID changes read the shared cache and unmount cancels the outstanding hydration', async () => {
  const cache = fileCache('hooks-cancel')
  let signal: AbortSignal | undefined
  remove = cache.add({
    load: current => {
      signal = current
      return new Promise(() => {})
    },
  })
  const store = {
    name: 'hooks-cancel',
    subscribe: cache.subscribe,
    list: async () => cache.snapshot.data,
    stat: async (id: string) => cache.snapshot.data.find(info => info.id === id),
  } as unknown as FileStore
  let select!: (id: string) => void
  function View() {
    const [id, setId] = useState('file')
    select = setId
    const file = useFileInfo(store, id)
    return <p>{file.data?.id ?? 'missing'}</p>
  }
  cache.publish([info])
  await act(async () => root.render(<View />))
  expect(element.textContent).toBe('file')
  await act(async () => select('other'))
  expect(element.textContent).toBe('missing')
  await act(async () => root.unmount())
  expect(signal?.aborted).toBe(true)
})

it('reference selection stays cached after navigating past ten thousand distinct ids', () => {
  const cache = fileCache('r3-many-ids')
  for (let count = 0; count < 10000; count++) cache.select(String(count))
  const selected = cache.select('draft')
  expect(cache.select('draft')).toBe(selected)
})

it('reference URL hook owns replacement, ID change and unmount lifetimes', async () => {
  expect(fileAPI.useFileURL).toBeTypeOf('function')
  const cache = fileCache('r3-url-hook')
  const other = { ...info, id: 'other' }
  let rows = [info, other]
  remove = cache.add({ load: async () => rows })
  cache.publish(rows)
  const handles: { url: string; revoke: ReturnType<typeof vi.fn> }[] = []
  const store = {
    name: 'r3-url-hook',
    subscribe: cache.subscribe,
    objectURL: vi.fn(async (id: string) => {
      const handle = { url: `blob:${id}:${handles.length}`, revoke: vi.fn() }
      handles.push(handle)
      return handle
    }),
  } as unknown as FileStore
  let change!: (id: string) => void
  function View() {
    const [id, setId] = useState('file')
    change = setId
    const url = fileAPI.useFileURL(store, id)
    return <p>{url.data}</p>
  }
  await act(async () => root.render(<View />))
  expect(element.textContent).toBe('blob:file:0')
  await act(async () => change('other'))
  expect(handles[0].revoke).toHaveBeenCalledTimes(1)
  expect(element.textContent).toBe('blob:other:1')
  rows = [info, { ...other, revision: 'replacement', lastModified: 2 }]
  await act(async () => cache.publish(rows))
  expect(handles[1].revoke).toHaveBeenCalledTimes(1)
  expect(element.textContent).toBe('blob:other:2')
  await act(async () => root.unmount())
  expect(handles[2].revoke).toHaveBeenCalledTimes(1)
})
it('reference URL hook revokes a late async result after unmount', async () => {
  expect(fileAPI.useFileURL).toBeTypeOf('function')
  const cache = fileCache('r3-url-late')
  remove = cache.add({ load: async () => [info] })
  cache.publish([info])
  let finish!: (value: { url: string; revoke: () => void }) => void
  const store = {
    name: 'r3-url-late',
    subscribe: cache.subscribe,
    objectURL: () =>
      new Promise(resolve => {
        finish = resolve
      }),
  } as unknown as FileStore
  function View() {
    const url = fileAPI.useFileURL(store, 'file')
    return <p>{url.data}</p>
  }
  await act(async () => root.render(<View />))
  await act(async () => root.unmount())
  const revoke = vi.fn()
  await act(async () => finish({ url: 'blob:late', revoke }))
  expect(revoke).toHaveBeenCalledTimes(1)
})

it('reference same-metadata replacement changes the URL by payload revision', async () => {
  const cache = fileCache('r4-url-revision')
  let rows = [{ ...info, revision: 'old-payload' }]
  remove = cache.add({ load: async () => rows })
  cache.publish(rows)
  const revoke = vi.fn()
  const store = {
    name: 'r4-url-revision',
    subscribe: cache.subscribe,
    objectURL: vi.fn(async () => ({ url: `blob:${cache.snapshot.data[0].revision}`, revoke })),
  } as unknown as FileStore
  function View() {
    return <p>{fileAPI.useFileURL(store, 'file').data}</p>
  }
  await act(async () => root.render(<View />))
  expect(element.textContent).toBe('blob:old-payload')
  rows = [{ ...info, revision: 'new-payload' }]
  await act(async () => cache.publish(rows))
  expect(element.textContent).toBe('blob:new-payload')
  expect(revoke).toHaveBeenCalledTimes(1)
})

it('reference useFileURL replaces equal-metadata previews and unmount releases its pin', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('File', NodeFile)
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('URL', NodeURL)
  const blobs = new Map<string, Blob>()
  const directory = {
    getDirectoryHandle: async () => directory,
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!blobs.has(name)) {
        if (!options?.create) throw new DOMException('Missing', 'NotFoundError')
        blobs.set(name, new Blob())
      }
      return {
        getFile: async () => new File([blobs.get(name)!], name),
        createWritable: async () => {
          const chunks: Uint8Array<ArrayBuffer>[] = []
          return {
            write: async (bytes: Uint8Array) => {
              chunks.push(bytes.slice())
            },
            close: async () => {
              blobs.set(name, new Blob(chunks))
            },
            abort: async () => {},
          }
        },
      }
    },
    removeEntry: async (name: string) => {
      blobs.delete(name)
    },
    async *keys() {
      yield* blobs.keys()
    },
  }
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => directory } })
  const files = fileAPI.defineFileStore({ name: 'r4-real-hook' })
  remove = () => files.close()
  await files.put('file', new File(['old'], 'file.txt', { type: 'text/plain', lastModified: 1 }))
  function View() {
    return <p>{fileAPI.useFileURL(files, 'file').data}</p>
  }
  await act(async () => root.render(<View />))
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
  })
  const first = element.textContent
  expect(first).toContain('blob:')
  expect(await (await fetch(first!)).text()).toBe('old')
  await act(async () => {
    await files.put('file', new File(['new'], 'file.txt', { type: 'text/plain', lastModified: 1 }))
  })
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
  })
  expect(element.textContent).not.toBe(first)
  expect(await (await fetch(element.textContent!)).text()).toBe('new')
  await act(async () => root.render(<p />))
  await files.delete('file')
  await vi.waitFor(() => expect(blobs.size).toBe(0))
  files.close()
  await new Promise(resolve => setTimeout(resolve, 50))
})
