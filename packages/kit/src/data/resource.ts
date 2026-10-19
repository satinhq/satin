import { shareRequest } from '../async/sharedRequest.ts'

/** The current value and request state of one in-memory remote resource. */
export interface ResourceSnapshot<Value> {
  readonly data: Value | undefined
  readonly hasData: boolean
  /** True only when no content is available and the initial request has not failed. */
  readonly loading: boolean
  /** A request is running. Existing data remains available while it refreshes. */
  readonly refreshing: boolean
  readonly error: unknown
}

/** Freshness and inactive-entry retention for a resource. Neither option writes to disk. */
export interface ResourceOptions {
  /** Successful results are fresh for this many milliseconds. Default: 30 seconds. */
  readonly staleTime?: number
  /** Retain this many unused entries, most recently used first. Default: 100. */
  readonly maxEntries?: number
}

/** A shared remote-data cache. Define it outside React and include account identity in keys. */
export interface Resource<Key extends string | number, Value> {
  readonly getSnapshot: (key: Key) => ResourceSnapshot<Value>
  readonly subscribe: (key: Key, listener: () => void) => () => void
  /** Reuse a fresh result or join the request already running for this key. */
  readonly load: (key: Key) => Promise<Value>
  /** Warm a key on press-down. An optional signal releases speculative interest;
   * another reader keeps the shared request alive. Failures stay in the snapshot. */
  readonly prefetch: (key: Key, signal?: AbortSignal) => Promise<void>
  /** Refresh even a fresh value, keeping its content visible; joins an existing request. */
  readonly refresh: (key: Key) => Promise<Value>
  /** Fill an empty entry from known data. A seed is stale and never replaces loaded content. */
  readonly seed: (key: Key, value: Value) => void
  /** Mark stale and cancel obsolete work. Subscribed entries reload immediately. */
  readonly invalidate: (key: Key) => void
  /** Abort requests and erase all values, including subscribed values, e.g. on sign-out. */
  readonly clear: () => void
}

type Entry<Value> = {
  snapshot: ResourceSnapshot<Value>
  updatedAt: number
  listeners: Set<() => void>
  request?: { controller: AbortController; join: (signal?: AbortSignal) => Promise<Value> }
}

function emptySnapshot<Value>(): ResourceSnapshot<Value> {
  return { data: undefined, hasData: false, loading: true, refreshing: false, error: undefined }
}

/**
 * Define one keyed memory resource shared by screens. Loads survive screen cover/unmount;
 * useResource reads retained content on its first render and revalidates stale content.
 * The loader owns transport, validation and HTTP cache policy. Satin never persists values.
 */
export function defineResource<Key extends string | number, Value>(
  loader: (key: Key, signal: AbortSignal) => Promise<Value>,
  { staleTime = 30_000, maxEntries = 100 }: ResourceOptions = {},
): Resource<Key, Value> {
  if (!Number.isFinite(staleTime) || staleTime < 0) {
    throw new RangeError('staleTime must be a finite, non-negative number')
  }
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError('maxEntries must be a positive integer')
  }
  const entries = new Map<Key, Entry<Value>>()
  function trim() {
    let unused = 0
    for (const entry of entries.values()) {
      if (!entry.listeners.size && !entry.request) unused++
    }
    for (const [key, entry] of entries) {
      if (unused <= maxEntries) break
      if (entry.listeners.size || entry.request) continue
      entries.delete(key)
      unused--
    }
  }
  function entryFor(key: Key) {
    let entry = entries.get(key)
    if (!entry) {
      entry = { snapshot: emptySnapshot(), updatedAt: -Infinity, listeners: new Set() }
    }
    entries.delete(key)
    entries.set(key, entry)
    trim()
    return entry
  }
  function publish(entry: Entry<Value>, snapshot: ResourceSnapshot<Value>) {
    entry.snapshot = snapshot
    for (const listener of entry.listeners) listener()
  }
  function cancel(entry: Entry<Value>) {
    const request = entry.request
    entry.request = undefined
    request?.controller.abort()
  }
  function load(key: Key, force = false, signal?: AbortSignal): Promise<Value> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    const entry = entryFor(key)
    if (entry.request) return entry.request.join(signal)
    if (!force && entry.snapshot.hasData && Date.now() - entry.updatedAt < staleTime) {
      return Promise.resolve(entry.snapshot.data as Value)
    }
    const controller = new AbortController()
    // Defer invocation so synchronous throws follow the same error path and the request
    // identity is installed before user code can read or invalidate the resource.
    const promise = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted()
        return loader(key, controller.signal)
      })
      .then(
        value => {
          controller.signal.throwIfAborted()
          entry.updatedAt = Date.now()
          publish(entry, {
            data: value,
            hasData: true,
            loading: false,
            refreshing: false,
            error: undefined,
          })
          return value
        },
        error => {
          if (!controller.signal.aborted) {
            publish(entry, { ...entry.snapshot, loading: false, refreshing: false, error })
          }
          throw error
        },
      )
      .finally(() => {
        if (entry.request?.controller === controller) entry.request = undefined
        trim()
      })
    const join = shareRequest(promise, () => {
      if (entry.request?.controller !== controller || entry.listeners.size) return
      cancel(entry)
      publish(entry, { ...entry.snapshot, refreshing: false })
      trim()
    })
    entry.request = { controller, join }
    publish(entry, {
      ...entry.snapshot,
      loading: !entry.snapshot.hasData,
      refreshing: true,
      error: undefined,
    })
    return join(signal)
  }
  const resource: Resource<Key, Value> = {
    getSnapshot: key => entryFor(key).snapshot,
    subscribe(key, listener) {
      const entry = entryFor(key)
      entry.listeners.add(listener)
      return () => {
        entry.listeners.delete(listener)
        trim()
      }
    },
    load: key => load(key),
    async prefetch(key, signal) {
      try {
        await load(key, false, signal)
      } catch {
        // Speculation has no caller to show an error. The destination reads the snapshot.
      }
    },
    refresh: key => load(key, true),
    seed(key, value) {
      const entry = entryFor(key)
      if (entry.snapshot.hasData) return
      publish(entry, {
        ...entry.snapshot,
        data: value,
        hasData: true,
        loading: false,
        error: undefined,
      })
    },
    invalidate(key) {
      const entry = entryFor(key)
      cancel(entry)
      entry.updatedAt = -Infinity
      publish(entry, {
        ...entry.snapshot,
        loading: !entry.snapshot.hasData,
        refreshing: false,
        error: undefined,
      })
      if (entry.listeners.size) void resource.prefetch(key)
    },
    clear() {
      // Subscribers may read during notification, which updates LRU order.
      for (const [key, entry] of [...entries]) {
        cancel(entry)
        entry.updatedAt = -Infinity
        if (!entry.listeners.size) entries.delete(key)
        publish(entry, emptySnapshot())
      }
    },
  }
  return resource
}
