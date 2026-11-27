import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { valueEqual } from './value-equal.ts'
import type { FileMetadata, FileStore } from './file-store.ts'
export interface FileSnapshot<T> {
  data: T
  loading: boolean
  error?: Error
}
interface Handle {
  load(signal: AbortSignal): Promise<FileMetadata[]>
}
export const hookURLs = new WeakMap<FileStore, FileStore['objectURL']>()
const caches = new Map<string, FileCache>()
export function fileCache(name: string): FileCache {
  let cache = caches.get(name)
  if (!cache) {
    cache = new FileCache(name)
    caches.set(name, cache)
  }
  return cache
}
export class FileCache {
  snapshot: FileSnapshot<FileMetadata[]> = { data: [], loading: true }
  readonly server: FileSnapshot<FileMetadata[]> = { data: [], loading: true }
  readonly missingServer: FileSnapshot<FileMetadata | undefined> = {
    data: undefined,
    loading: true,
  }
  private selected = new Map<
    string,
    { source: object; value: FileSnapshot<FileMetadata | undefined> }
  >()
  private listeners = new Set<() => void>()
  private handles = new Set<Handle>()
  private pending?: AbortController
  private channel?: BroadcastChannel
  private name: string
  private version = 0
  constructor(name: string) {
    this.name = name
  }
  add(handle: Handle) {
    if (import.meta.env.DEV && this.handles.size)
      console.warn(
        `File store ${this.name} was defined again. Define it once at module scope, not during render.`,
      )
    this.handles.add(handle)
    return () => {
      this.handles.delete(handle)
      if (!this.handles.size) {
        this.pending?.abort()
        this.detach()
        caches.delete(this.name)
      }
    }
  }
  private notify() {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        console.error(error)
      }
    }
  }
  publish(data: FileMetadata[]) {
    this.version++
    const previous = new Map(this.snapshot.data.map(info => [info.id, info]))
    const shared = data.map(info =>
      valueEqual(previous.get(info.id), info) ? previous.get(info.id)! : info,
    )
    const stable =
      shared.length === this.snapshot.data.length &&
      shared.every((info, index) => info === this.snapshot.data[index])
        ? this.snapshot.data
        : shared
    this.snapshot = { data: stable, loading: false }
    this.notify()
  }
  refresh = () => {
    this.pending?.abort()
    const handle = this.handles.values().next().value
    if (!handle) return
    const controller = new AbortController()
    this.pending = controller
    const version = ++this.version
    void handle.load(controller.signal).then(
      data => {
        if (!controller.signal.aborted && version === this.version) this.publish(data)
      },
      error => {
        if (controller.signal.aborted || version !== this.version) return
        this.snapshot = { ...this.snapshot, loading: false, error }
        this.notify()
      },
    )
  }
  private visible = () => {
    if (document.visibilityState === 'visible') this.refresh()
  }
  private detach() {
    this.channel?.close()
    this.channel = undefined
    if (typeof window !== 'undefined') {
      window.removeEventListener('pageshow', this.refresh)
      document.removeEventListener('visibilitychange', this.visible)
    }
  }
  subscribe = (listener: () => void) => {
    const first = !this.listeners.size
    this.listeners.add(listener)
    if (first) {
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel(`satin-files:${this.name}`)
        this.channel.onmessage = this.refresh
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('pageshow', this.refresh)
        document.addEventListener('visibilitychange', this.visible)
      }
      this.refresh()
    }
    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size) {
        this.pending?.abort()
        this.detach()
      }
    }
  }
  broadcast() {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = this.channel ?? new BroadcastChannel(`satin-files:${this.name}`)
    try {
      channel.postMessage(null)
    } finally {
      if (channel !== this.channel) channel.close()
    }
  }
  select(id: string): FileSnapshot<FileMetadata | undefined> {
    let selection = this.selected.get(id)
    if (selection?.source !== this.snapshot) {
      selection = {
        source: this.snapshot,
        value: { ...this.snapshot, data: this.snapshot.data.find(info => info.id === id) },
      }
      this.selected.set(id, selection)
    }
    return selection!.value
  }
}
/** Observe committed file metadata. Define the store once at module scope. */
export function useFiles(store: FileStore): FileSnapshot<FileMetadata[]> {
  const cache = fileCache(store.name)
  return useSyncExternalStore(
    store.subscribe,
    () => cache.snapshot,
    () => cache.server,
  )
}
/** Observe one file's metadata without loading its bytes. */
export function useFileInfo(store: FileStore, id: string): FileSnapshot<FileMetadata | undefined> {
  const cache = fileCache(store.name)
  const get = useCallback(() => cache.select(id), [cache, id])
  const server = useCallback(() => cache.missingServer, [cache])
  return useSyncExternalStore(store.subscribe, get, server)
}

/** Own a preview URL across committed revisions, ID changes and unmount. */
export function useFileURL(store: FileStore, id: string): FileSnapshot<string | undefined> {
  const info = useFileInfo(store, id)
  const [current, setCurrent] = useState<{
    store: FileStore
    id: string
    revision: string | undefined
    snapshot: FileSnapshot<string | undefined>
  }>()
  const revision = info.data?.revision
  useEffect(() => {
    let active = true
    let owned: Awaited<ReturnType<FileStore['objectURL']>>
    const publish = (snapshot: FileSnapshot<string | undefined>) => {
      if (active) setCurrent({ store, id, revision, snapshot })
    }
    if (info.data) {
      publish({ data: undefined, loading: true })
      void (hookURLs.get(store) ?? store.objectURL)(id).then(
        value => {
          if (!active) {
            value?.revoke()
            return
          }
          owned = value
          publish({ data: value?.url, loading: false })
        },
        error => publish({ data: undefined, loading: false, error }),
      )
    } else publish({ data: undefined, loading: info.loading })
    return () => {
      active = false
      owned?.revoke()
    }
  }, [store, id, revision, info.loading])
  const snapshot: FileSnapshot<string | undefined> =
    current?.store === store && current.id === id && current.revision === revision
      ? current.snapshot
      : { data: undefined, loading: info.loading || !!info.data }
  return { ...snapshot, error: snapshot.error ?? info.error }
}
