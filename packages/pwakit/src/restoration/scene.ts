/** Small UI checkpoints, read before mount and written in quiet tasks. */
export interface StateSchema<T> {
  readonly version: number
  readonly initial: T
  readonly validate: (value: unknown) => value is T
}
export interface SceneRestoration {
  /** Flush on suspension; ordinary writes coalesce outside scroll/transition frames. */
  connect(): () => void
  /** Internal: capture the latest navigator only when a checkpoint is due. */
  checkpoint(
    key: string,
    prepare: () => void,
    blocked: () => boolean,
    forceBlocked?: () => boolean,
  ): void
  /** Lifecycle/testing boundary. Returns whether the checkpoint reached storage. */
  flush(): boolean
  /** Internal: last successfully stored checkpoint, excluding pending edits. */
  readPersisted(key: string): unknown
  read(key: string): unknown
  /** True means accepted in memory; flush/diagnostics report durable storage. */
  write(key: string, value: unknown): boolean
  remove(key: string): void
  /** Internal entry garbage collection, committed by the next checkpoint write. */
  retainEntries(navigator: string, keys: readonly string[]): void
  subscribe(listener: () => void): () => void
  reset(): void
  readonly diagnostics: {
    readonly restored: boolean
    readonly readMs: number
    readonly writeMs: number
    readonly bytes: number
    readonly error: string | null
  }
}
export function createSceneRestoration(options: {
  id: string
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  /** No automatic expiry by default. Explicit reset is a deliberate exit. */
  maxAbsenceMs?: number
  maxBytes?: number
  now?: () => number
}): SceneRestoration {
  const now = options.now ?? Date.now
  const limit = options.maxBytes ?? 262144
  if (
    !options.id ||
    !Number.isInteger(limit) ||
    limit < 1024 ||
    (options.maxAbsenceMs !== undefined &&
      (!Number.isFinite(options.maxAbsenceMs) || options.maxAbsenceMs < 0))
  )
    throw new Error('Invalid scene restoration options')
  const key = `satin-scene:v1:${options.id}`
  let storage = options.storage
  let persisted: string | undefined
  let persistedCache: Record<string, unknown> | undefined
  let values: Record<string, unknown> = Object.create(null)
  const listeners = new Set<() => void>()
  const diagnostics = {
    restored: false,
    readMs: 0,
    writeMs: 0,
    bytes: 0,
    error: null as string | null,
  }
  const started = performance.now()
  try {
    storage ??= typeof localStorage === 'undefined' ? undefined : localStorage
    const raw = storage?.getItem(key)
    if (raw && raw.length * 2 <= limit) {
      const parsed = JSON.parse(raw)
      if (
        parsed?.version === 1 &&
        Number.isFinite(parsed.savedAt) &&
        parsed.values &&
        typeof parsed.values === 'object' &&
        !Array.isArray(parsed.values) &&
        (options.maxAbsenceMs === undefined || now() - parsed.savedAt <= options.maxAbsenceMs)
      ) {
        values = Object.assign(Object.create(null), parsed.values)
        persisted = raw
        diagnostics.restored = true
        diagnostics.bytes = raw.length * 2
      }
    }
  } catch {
    diagnostics.error = 'read-failed'
  }
  diagnostics.readMs = performance.now() - started
  const preparations = new Map<
    string,
    { prepare: () => void; blocked: () => boolean; forceBlocked: () => boolean }
  >()
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  let cancelFrame: (() => void) | undefined
  let idle: number | undefined
  let overdue = false
  let flushing = false
  const cancelQuiet = () => {
    if (timer !== undefined) clearTimeout(timer)
    if (idle !== undefined) globalThis.cancelIdleCallback?.(idle)
    timer = undefined
    idle = undefined
  }
  const cancelScheduled = () => {
    cancelQuiet()
    if (deadline !== undefined) clearTimeout(deadline)
    cancelFrame?.()
    deadline = undefined
    cancelFrame = undefined
    overdue = false
  }
  const forceAtFrame = () => {
    if (cancelFrame !== undefined || [...preparations.values()].some(item => item.forceBlocked()))
      return
    const run = () => {
      cancelFrame = undefined
      if ([...preparations.values()].some(item => item.forceBlocked())) return
      flush()
    }
    if (typeof requestAnimationFrame === 'function') {
      const frame = requestAnimationFrame(run)
      cancelFrame = () => globalThis.cancelAnimationFrame?.(frame)
    } else {
      const task = setTimeout(run, 0)
      cancelFrame = () => clearTimeout(task)
    }
  }
  const schedule = () => {
    if (flushing) return
    cancelQuiet()
    // Two seconds bounds ordinary continuous activity without serializing each
    // event. Interactive ownership defers this deadline until its next publish.
    if (overdue) forceAtFrame()
    else if (deadline === undefined)
      deadline = setTimeout(() => {
        deadline = undefined
        overdue = true
        forceAtFrame()
      }, 2000)
    timer = setTimeout(() => {
      timer = undefined
      const quiet = () => {
        idle = undefined
        if ([...preparations.values()].some(item => item.blocked())) return
        flush()
      }
      if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(quiet)
      else quiet()
    }, 100)
  }
  const persist = () => {
    const start = performance.now()
    try {
      const raw = JSON.stringify({ version: 1, savedAt: now(), values })
      diagnostics.bytes = raw.length * 2
      if (diagnostics.bytes > limit) throw new Error('checkpoint-too-large')
      if (!storage) throw new Error('storage-unavailable')
      storage.setItem(key, raw)
      persisted = raw
      persistedCache = undefined
      diagnostics.error = null
      return true
    } catch {
      diagnostics.error = 'write-failed'
      return false
    } finally {
      diagnostics.writeMs = performance.now() - start
    }
  }
  const flush = () => {
    cancelScheduled()
    flushing = true
    try {
      for (const item of preparations.values()) item.prepare()
      return persist()
    } finally {
      flushing = false
      for (const listener of listeners) listener()
    }
  }
  return {
    diagnostics,
    flush,
    checkpoint(key, prepare, blocked, forceBlocked = blocked) {
      preparations.set(key, { prepare, blocked, forceBlocked })
      schedule()
    },
    connect() {
      if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
      const hidden = () => {
        if (document.visibilityState === 'hidden') flush()
      }
      const hide = () => {
        flush()
      }
      document.addEventListener('visibilitychange', hidden)
      window.addEventListener('pagehide', hide)
      return () => {
        document.removeEventListener('visibilitychange', hidden)
        window.removeEventListener('pagehide', hide)
      }
    },
    readPersisted(key) {
      if (!persisted) return undefined
      // Parse the scene once per successful write, not on each pending ACK retry.
      persistedCache ??= JSON.parse(persisted).values
      const value = persistedCache![key]
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
    },
    read: key => values[key],
    write(key, value) {
      try {
        values[key] = cloneSceneValue(value)
      } catch {
        diagnostics.error = 'invalid-state'
        return false
      }
      schedule()
      for (const listener of listeners) listener()
      return true
    },
    retainEntries(navigator, keys) {
      const prefix = `entry:${navigator}:`
      for (const key of Object.keys(values))
        if (key.startsWith(prefix) && !keys.some(entry => key.startsWith(`${prefix}${entry}:`)))
          delete values[key]
    },
    remove(key) {
      delete values[key]
      schedule()
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    reset() {
      cancelScheduled()
      values = Object.create(null)
      try {
        storage?.removeItem(key)
        persisted = undefined
        persistedCache = undefined
      } catch {
        diagnostics.error = 'reset-failed'
      }
      for (const listener of listeners) listener()
    },
  }
}

export function readSceneValue<T>(
  scene: SceneRestoration | undefined,
  key: string,
  schema: StateSchema<T>,
): T {
  const value = scene?.read(key) as { version?: unknown; value?: unknown } | undefined
  try {
    if (value?.version === schema.version && schema.validate(value.value)) return value.value
  } catch {
    /* Invalid old app state uses its declared default. */
  }
  return schema.initial
}

/** UI checkpoints accept JSON values only, without lossy Date/Map/function coercion. */
export function isSerializableState(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): boolean {
  if (depth > 32) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || ancestors.has(value)) return false
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false
  if (Object.getOwnPropertySymbols(value).length) return false
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) return false
    for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) return false
    delete descriptors.length
  }
  if (Object.values(descriptors).some(item => !item.enumerable || !('value' in item))) return false
  ancestors.add(value)
  const valid = Object.values(descriptors).every(item =>
    isSerializableState(item.value, ancestors, depth + 1),
  )
  ancestors.delete(value)
  return valid
}

/** Validate the actual stored representation, including the app's schema. */
export function cloneSceneValue<T>(value: T, schema?: StateSchema<T>): T {
  if (!isSerializableState(value)) throw new Error('Invalid scene state')
  const cloned = JSON.parse(JSON.stringify(value)) as T
  if (schema && !schema.validate(cloned)) throw new Error('Invalid scene state')
  return cloned
}
