import { valueEqual } from './value-equal.ts'
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  WriteStore,
  copyTables,
  type Tables,
  type Change,
  type WriteFailure,
} from './write-store.ts'
export type { WriteFailure } from './write-store.ts'

/** A stored record with named values. */
export type DatabaseRecord = Record<string, unknown>
/** The property keys whose values are strings. */
export type StringPropertyKey<T> = { [K in keyof T]-?: T[K] extends string ? K : never }[keyof T] &
  string
/** A mapping from declared index names to record properties. */
export type CollectionIndexes<T> = Record<string, keyof T & string>

/** A collection's record type, key and indexes, made by `collection` for `defineDatabase`. */
export interface CollectionDefinition<
  T extends object,
  K extends StringPropertyKey<T> = StringPropertyKey<T>,
  I extends CollectionIndexes<T> = CollectionIndexes<T>,
> {
  readonly key: K
  readonly indexes: I
  readonly __row?: T
}

/**
 * Declares a collection of records keyed by one string field, like a SwiftData `@Model` with a
 * unique attribute. The curried form, `collection<Note>()({ key, indexes })`, infers index names.
 *
 * @example
 * notes: collection<Note>()({ key: 'id', indexes: { byDate: 'createdAt' } })
 */
export function collection<T extends object>(options: {
  key: StringPropertyKey<T>
  indexes?: CollectionIndexes<T>
}): CollectionDefinition<T, StringPropertyKey<T>, CollectionIndexes<T>>
export function collection<T extends object>(): <
  K extends StringPropertyKey<T>,
  I extends CollectionIndexes<T> = Record<string, never>,
>(options: {
  key: K
  indexes?: I
}) => CollectionDefinition<T, K, I>
export function collection<T extends object>(options?: {
  key: StringPropertyKey<T>
  indexes?: CollectionIndexes<T>
}) {
  const create = (value: { key: StringPropertyKey<T>; indexes?: CollectionIndexes<T> }) => ({
    key: value.key,
    indexes: value.indexes ?? {},
  })
  return options ? create(options) : create
}

/** The record type stored by a collection declaration. */
export type RecordOfCollection<D> = D extends { readonly __row?: infer T extends object }
  ? T
  : never
/** The index names declared by a collection. */
export type IndexesOfCollection<D extends CollectionSchema[string]> = {
  [K in keyof D['indexes']]: Extract<D['indexes'][K], keyof RecordOfCollection<D> & string>
}
/** The named collections in a database declaration. */
export type CollectionSchema = Record<
  string,
  { readonly key: string; readonly indexes: Record<string, string>; readonly __row?: object }
>
/** The accepted record updates for a collection. */
export type CollectionUpdateMethods<T extends object> = {
  update(key: string, update: Partial<T> | ((row: T) => T)): Promise<void>
}
/** The typed collection handles available inside a database transaction. */
export type TransactionCollections<S extends CollectionSchema> = {
  [N in keyof S]: TransactionCollection<RecordOfCollection<S[N]>> &
    CollectionUpdateMethods<RecordOfCollection<S[N]>>
}
/** An awaited migration over the database transaction collections. */
export type DatabaseMigration<S extends CollectionSchema> = (
  tx: TransactionCollections<S>,
) => void | Promise<void>

/** Application initialization errors must not trigger automatic connection recovery. */
class InitializationFailure extends Error {
  constructor(cause: unknown) {
    super('Database initialization failed', { cause })
  }
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB request failed'))
  })
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

function connectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'InvalidStateError' ||
    error.name === 'UnknownError' ||
    /connection.*clos|database.*clos|connection.*lost/i.test(error.message)
  )
}

/** An immutable query over a collection: `index`, `keyRange`, `reverse`, `limit` and `filter` each
 * return a new query. `useQuery` hands one to its configure callback. */
export class Query<T extends object, I extends CollectionIndexes<T>> {
  readonly source?: keyof I & string
  readonly range?: IDBKeyRange
  readonly direction: IDBCursorDirection
  readonly maximum?: number
  readonly predicate?: (row: T) => boolean

  constructor(
    options: {
      source?: keyof I & string
      range?: IDBKeyRange
      direction?: IDBCursorDirection
      maximum?: number
      predicate?: (row: T) => boolean
    } = {},
  ) {
    this.source = options.source
    this.range = options.range
    this.direction = options.direction ?? 'next'
    this.maximum = options.maximum
    this.predicate = options.predicate
  }

  index(name: keyof I & string, range?: IDBKeyRange): Query<T, I> {
    return new Query({ ...this, source: name, range })
  }
  keyRange(range: IDBKeyRange): Query<T, I> {
    return new Query({ ...this, range })
  }
  reverse(): Query<T, I> {
    return new Query({ ...this, direction: 'prev' })
  }
  limit(count: number): Query<T, I> {
    if (!Number.isSafeInteger(count) || count < 0)
      throw new RangeError('Query limit must be a nonnegative integer')
    return new Query({ ...this, maximum: count })
  }
  filter(predicate: (row: T) => boolean): Query<T, I> {
    return new Query({ ...this, predicate })
  }
}

/** A collection as seen inside `db.transaction`: its writes commit together or not at all. */
export interface TransactionCollection<T extends object> {
  get(key: string): Promise<T | undefined>
  put(row: T): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  updateAll(update: (row: T) => T): Promise<void>
}

function transactionCollection<T extends object>(
  store: IDBObjectStore,
): TransactionCollection<T> & CollectionUpdateMethods<T> {
  return {
    get: key => request(store.get(key)) as Promise<T | undefined>,
    update: async (key, update) => {
      const current = (await request(store.get(key))) as T | undefined
      if (!current) throw new Error(`Record ${key} does not exist`)
      const next = typeof update === 'function' ? update(current) : { ...current, ...update }
      if (next[store.keyPath as keyof T] !== key)
        throw new DOMException('An update cannot change a record key', 'DataError')
      await request(store.put(next))
    },
    put: async row => {
      await request(store.put(row))
    },
    delete: async key => {
      await request(store.delete(key))
    },
    clear: async () => {
      await request(store.clear())
    },
    updateAll: update =>
      new Promise((resolve, reject) => {
        const cursor = store.openCursor()
        // The update request is enqueued inside the cursor callback while the transaction is active.
        cursor.onerror = () => reject(cursor.error ?? new Error('IndexedDB cursor failed'))
        const fail = (error: unknown) => {
          reject(error)
          try {
            store.transaction.abort()
          } catch {
            /* already aborted */
          }
        }
        cursor.onsuccess = () => {
          try {
            const current = cursor.result
            if (!current) {
              resolve()
              return
            }
            const updated = update(current.value as T)
            const write = current.update(updated)
            write.onerror = () => fail(write.error ?? new Error('IndexedDB update failed'))
            write.onsuccess = () => {
              try {
                current.continue()
              } catch (error) {
                fail(error)
              }
            }
          } catch (error) {
            fail(error)
          }
        }
      }),
  }
}

/** One collection of a database (`db.notes`). Once loaded, writes publish to memory at once, so
 * `useQuery` sees them immediately; the returned promise settles after the durable commit. */
export interface Collection<T extends object, I extends CollectionIndexes<T>> {
  get(key: string): Promise<T | undefined>
  put(row: T): Promise<void>
  delete(key: string): Promise<void>
  query(configure?: (query: Query<T, I>) => Query<T, I>): Promise<T[]>
  subscribe(listener: () => void): () => void
}

function select(
  rows: Map<string, DatabaseRecord>,
  definition: CollectionSchema[string],
  query: Query<DatabaseRecord, CollectionIndexes<DatabaseRecord>>,
): DatabaseRecord[] {
  const field = query.source ? definition.indexes[query.source] : definition.key
  if (!field) throw new Error(`Unknown index ${query.source}`)
  const ordered = [...rows.values()]
    .filter(row => {
      try {
        indexedDB.cmp(row[field] as IDBValidKey, row[field] as IDBValidKey)
        return !query.range || query.range.includes(row[field] as IDBValidKey)
      } catch {
        return false
      }
    })
    .sort(
      (left, right) =>
        indexedDB.cmp(left[field] as IDBValidKey, right[field] as IDBValidKey) ||
        indexedDB.cmp(left[definition.key] as string, right[definition.key] as string),
    )
  let selected = ordered
  if (query.direction.endsWith('unique'))
    selected = ordered.filter(
      (row, index) =>
        index === 0 ||
        indexedDB.cmp(row[field] as IDBValidKey, ordered[index - 1][field] as IDBValidKey) !== 0,
    )
  if (query.direction.startsWith('prev')) selected.reverse()
  if (query.predicate) selected = selected.filter(row => query.predicate!(structuredClone(row)))
  return structuredClone(selected.slice(0, query.maximum))
}
const snapshots = new WeakMap<
  object,
  {
    key: string
    ready(): boolean
    error(): Error | undefined
    revision(): object
    get(key: string): DatabaseRecord | undefined
    query(
      configure?: (
        query: Query<DatabaseRecord, CollectionIndexes<DatabaseRecord>>,
      ) => Query<DatabaseRecord, CollectionIndexes<DatabaseRecord>>,
    ): DatabaseRecord[]
  }
>()

/** The JSON document `exportJSON` writes and `importJSON` reads. */
export interface ExportDocument {
  format: 'satin-data'
  name: string
  version: number
  collections: Record<string, DatabaseRecord[]>
}

/**
 * Opens the app's local database (IndexedDB), like a SwiftData `ModelContainer`. Each collection
 * becomes a property of the result. Bump `version` with a migration whenever the schema changes.
 * Export and import are built in, so offer them to the user.
 *
 * @example
 * export const db = defineDatabase({
 *   name: 'notes', version: 1,
 *   collections: { notes: collection<Note>()({ key: 'id' }) },
 * })
 */
export function defineDatabase<const S extends CollectionSchema>(config: {
  name: string
  version: number
  collections: S
  migrations?: Partial<Record<number, DatabaseMigration<S>>>
  /** Runs once on creation, after migrations, in the same atomic upgrade transaction. */
  seed?: DatabaseMigration<S>
}): {
  [N in keyof S]: Collection<RecordOfCollection<S[N]>, IndexesOfCollection<S[N]>> &
    CollectionUpdateMethods<RecordOfCollection<S[N]>>
} & {
  transaction<N extends keyof S & string, R>(
    names: readonly N[],
    action: (tx: Pick<TransactionCollections<S>, N>) => R | Promise<R>,
  ): Promise<R>
  exportJSON(): Promise<Blob>
  importJSON(input: Blob | string, mode: 'replace' | 'merge'): Promise<void>
  onError(listener: (failure: WriteFailure) => void): () => void
  close(): void
} {
  if (!config.name || !Number.isSafeInteger(config.version) || config.version < 1)
    throw new TypeError('Database name and positive integer version are required')
  const names = Object.keys(config.collections)
  if (names.length === 0) throw new TypeError('A database needs at least one collection')
  let connection: IDBDatabase | undefined
  let opening: Promise<IDBDatabase> | undefined
  const listeners = new Map<string, Set<() => void>>(names.map(name => [name, new Set()]))
  const notify = (changed: readonly string[]) => {
    for (const name of changed) {
      for (const listener of listeners.get(name) ?? []) {
        try {
          listener()
        } catch (error) {
          console.error('Satin data subscriber failed', error)
        }
      }
    }
  }
  const invalidate = () => {
    connection?.close()
    connection = undefined
    opening = undefined
  }

  function open(): Promise<IDBDatabase> {
    activate()
    if (connection) return Promise.resolve(connection)
    if (opening) return opening
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
      const operation = indexedDB.open(config.name, config.version)
      let migrationError: unknown
      let initializationFailed = false
      let abandoned = false
      operation.onupgradeneeded = event => {
        const db = operation.result
        const tx = operation.transaction!
        try {
          for (const name of names) {
            const definition = config.collections[name]
            const store = db.objectStoreNames.contains(name)
              ? tx.objectStore(name)
              : db.createObjectStore(name, { keyPath: definition.key })
            if (store.keyPath !== definition.key)
              throw new TypeError(`Collection ${name} cannot change its key path in place`)
            for (const indexName of Array.from(store.indexNames)) {
              if (
                !(indexName in definition.indexes) ||
                store.index(indexName).keyPath !== definition.indexes[indexName]
              )
                store.deleteIndex(indexName)
            }
            for (const [indexName, field] of Object.entries(definition.indexes)) {
              if (!store.indexNames.contains(indexName)) store.createIndex(indexName, field)
            }
          }
          const txCollections = Object.fromEntries(
            names.map(name => [name, transactionCollection(tx.objectStore(name))]),
          ) as TransactionCollections<S>
          // Keep the upgrade active across asynchronous initialization. No parallel store.
          let initializing = true
          const stopInitialization = () => {
            initializing = false
          }
          tx.addEventListener('abort', stopInitialization, { once: true })
          tx.addEventListener('complete', stopInitialization, { once: true })
          const keepAlive = () => {
            if (!initializing) return
            const operation = tx.objectStore(names[0]).count()
            operation.onsuccess = keepAlive
          }
          keepAlive()
          const run = async () => {
            for (let version = event.oldVersion + 1; version <= config.version; version++) {
              const migration = config.migrations?.[version]
              if (migration) await migration(txCollections)
            }
            if (event.oldVersion === 0) await config.seed?.(txCollections)
          }
          void run()
            .finally(stopInitialization)
            .catch(error => {
              initializationFailed = true
              migrationError = error
              try {
                tx.abort()
              } catch {
                /* transaction already ended */
              }
            })
        } catch (error) {
          initializationFailed = true
          migrationError = error
          try {
            tx.abort()
          } catch {
            /* transaction already ended */
          }
        }
      }
      operation.onerror = () => {
        abandoned = true
        if (opening === attempt) opening = undefined
        reject(
          initializationFailed
            ? new InitializationFailure(migrationError)
            : (operation.error ?? new Error('Could not open database')),
        )
      }
      operation.onblocked = () => {
        abandoned = true
        if (opening === attempt) opening = undefined
        reject(new Error(`Database ${config.name} upgrade is blocked by another open tab`))
      }
      operation.onsuccess = () => {
        if (abandoned) {
          operation.result.close()
          return
        }
        if (initializationFailed) {
          operation.result.close()
          if (opening === attempt) opening = undefined
          reject(new InitializationFailure(migrationError))
          return
        }
        const opened = operation.result
        connection = opened
        const closed = () => {
          if (connection !== opened) return
          connection = undefined
          opening = undefined
        }
        opened.onversionchange = () => {
          opened.close()
          closed()
        }
        opened.onclose = closed
        resolve(opened)
      }
    })
    opening = attempt
    return attempt
  }

  async function run<R>(
    stores: readonly string[],
    mode: IDBTransactionMode,
    action: (tx: IDBTransaction) => R | Promise<R>,
    retry = false,
  ): Promise<R> {
    let started = false
    try {
      const db = await open()
      const tx = db.transaction([...stores], mode)
      const done = complete(tx)
      // Observe an abort even when a cursor action has not settled yet.
      void done.catch(() => {})
      started = true
      let result: R
      try {
        result = await action(tx)
      } catch (error) {
        try {
          tx.abort()
        } catch {
          /* already closed */
        }
        void done.catch(() => {})
        throw error
      }
      await done
      return result
    } catch (error) {
      if (error instanceof InitializationFailure) throw error.cause
      if (!retry && connectionError(error) && (!started || mode === 'readonly')) {
        invalidate()
        return run(stores, mode, action, true)
      }
      throw error
    }
  }

  const readTables = async (tx: IDBTransaction): Promise<Tables> => {
    const entries = await Promise.all(
      names.map(async name => {
        const rows = (await request(tx.objectStore(name).getAll())) as DatabaseRecord[]
        return [
          name,
          new Map(rows.map(row => [row[config.collections[name].key] as string, row])),
        ] as const
      }),
    )
    return Object.fromEntries(entries)
  }
  const memory = new WriteStore(
    config.name,
    names,
    () => run(names, 'readonly', readTables),
    changes =>
      run(names, 'readwrite', async tx => {
        const tables = await readTables(tx)
        const before = copyTables(tables)
        for (const change of changes) change(tables)
        for (const name of names) {
          const store = tx.objectStore(name)
          for (const key of before[name].keys()) if (!tables[name].has(key)) store.delete(key)
          for (const [key, row] of tables[name]) {
            if (before[name].get(key) !== row) store.put(row)
          }
        }
        return tables
      }),
    () => notify(names),
  )
  const resume = () => {
    if (!document.hidden) {
      invalidate()
      void memory.refresh().catch(() => {})
    }
  }
  let listening = false
  function activate() {
    if (!listening && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', resume)
      window.addEventListener('pageshow', resume)
      listening = true
    }
  }
  activate()
  const putChange = (name: string, row: DatabaseRecord): Change => {
    const value = structuredClone(row)
    const key = value[config.collections[name].key]
    if (typeof key !== 'string') throw new TypeError(`Invalid key in ${name}`)
    return tables => {
      tables[name].set(key, value)
    }
  }
  const updateChange = (
    name: string,
    key: string,
    update: Partial<DatabaseRecord> | ((row: DatabaseRecord) => DatabaseRecord),
  ): Change => {
    const patch = typeof update === 'function' ? update : structuredClone(update)
    return tables => {
      const current = tables[name].get(key)
      if (!current) throw new Error(`Record ${key} does not exist`)
      const row =
        typeof patch === 'function' ? patch(structuredClone(current)) : { ...current, ...patch }
      if (row[config.collections[name].key] !== key)
        throw new DOMException('An update cannot change a record key', 'DataError')
      tables[name].set(key, structuredClone(row))
    }
  }
  const api: Record<string, unknown> = {}
  for (const name of names) {
    const snapshot = () => memory.tables[name]
    const collectionApi = {
      get: async (key: string) => {
        await memory.load()
        return structuredClone(snapshot().get(key))
      },
      put: (row: DatabaseRecord) => {
        try {
          return memory.write([putChange(name, row)])
        } catch (error) {
          return memory.failure(error)
        }
      },
      update: (
        key: string,
        update: Partial<DatabaseRecord> | ((row: DatabaseRecord) => DatabaseRecord),
      ) => {
        return memory.write(
          [updateChange(name, key, update)],
          memory.ready ? undefined : memory.load(),
        )
      },
      delete: (key: string) =>
        memory.write([
          tables => {
            tables[name].delete(key)
          },
        ]),
      query: async (
        configure?: (
          query: Query<DatabaseRecord, CollectionIndexes<DatabaseRecord>>,
        ) => Query<DatabaseRecord, CollectionIndexes<DatabaseRecord>>,
      ) => {
        await memory.load()
        return select(snapshot(), config.collections[name], configure?.(new Query()) ?? new Query())
      },
      subscribe: (listener: () => void) => {
        const group = listeners.get(name)!
        group.add(listener)
        return () => {
          group.delete(listener)
        }
      },
    }
    snapshots.set(collectionApi, {
      key: config.collections[name].key,
      ready: () => memory.ready,
      error: () => memory.error,
      revision: snapshot,
      get: key => structuredClone(snapshot().get(key)),
      query: configure =>
        select(snapshot(), config.collections[name], configure?.(new Query()) ?? new Query()),
    })
    api[name] = collectionApi
  }
  api.transaction = <R>(
    stores: readonly string[],
    action: (
      tx: Record<
        string,
        TransactionCollection<DatabaseRecord> & CollectionUpdateMethods<DatabaseRecord>
      >,
    ) => R | Promise<R>,
  ): Promise<R> => {
    if (!stores.length || stores.some(name => !names.includes(name)))
      throw new TypeError('Unknown or empty transaction collection list')
    const changes: Change[] = []
    const cold = !memory.ready
    const execute = (): R | Promise<R> => {
      const draft = copyTables(cold ? memory.before(changes) : memory.tables)
      const append = (change: Change) => {
        change(draft)
        changes.push(change)
        return Promise.resolve()
      }
      const collections = Object.fromEntries(
        stores.map(name => [
          name,
          {
            get: (key: string) => {
              const value = structuredClone(draft[name].get(key))
              // Legacy read/put transactions detect concurrent modifications instead of overwriting them.
              changes.push(tables => {
                if (!valueEqual(tables[name].get(key), value))
                  throw new Error(
                    `Concurrent modification of ${name}/${key}; retry the transaction`,
                  )
              })
              return Promise.resolve(value)
            },
            put: (row: DatabaseRecord) => append(putChange(name, row)),
            update: (
              key: string,
              update: Partial<DatabaseRecord> | ((row: DatabaseRecord) => DatabaseRecord),
            ) => append(updateChange(name, key, update)),
            delete: (key: string) =>
              append(tables => {
                tables[name].delete(key)
              }),
            clear: () =>
              append(tables => {
                tables[name].clear()
              }),
            updateAll: (update: (row: DatabaseRecord) => DatabaseRecord) =>
              append(tables => {
                for (const [key, row] of tables[name]) {
                  const next = structuredClone(update(structuredClone(row)))
                  if (next[config.collections[name].key] !== key)
                    throw new DOMException('An update cannot change a record key', 'DataError')
                  tables[name].set(key, next)
                }
              }),
          },
        ]),
      )
      return action(collections)
    }
    try {
      if (!memory.ready) {
        const prepared = memory.load().then(execute)
        return memory.write(changes, prepared).then(() => prepared)
      }
      const result = execute()
      const prepared =
        result && typeof (result as Promise<R>).then === 'function'
          ? Promise.resolve(result)
          : undefined
      return memory.write(changes, prepared).then(() => result)
    } catch (error) {
      return memory.failure(error)
    }
  }

  api.onError = (listener: (failure: WriteFailure) => void) => memory.onError(listener)
  api.exportJSON = async (): Promise<Blob> => {
    await memory.settled()
    const data = await run(names, 'readonly', async tx => {
      const result: Record<string, DatabaseRecord[]> = {}
      for (const name of names)
        result[name] = (await request(tx.objectStore(name).getAll())) as DatabaseRecord[]
      return result
    })
    return new Blob(
      [
        JSON.stringify({
          format: 'satin-data',
          name: config.name,
          version: config.version,
          collections: data,
        } satisfies ExportDocument),
      ],
      { type: 'application/json' },
    )
  }
  api.importJSON = async (input: Blob | string, mode: 'replace' | 'merge'): Promise<void> => {
    if (mode !== 'replace' && mode !== 'merge')
      throw new TypeError('Import mode must be replace or merge')
    const parsed: unknown = JSON.parse(typeof input === 'string' ? input : await input.text())
    if (!parsed || typeof parsed !== 'object') throw new TypeError('Invalid Satin data document')
    const doc = parsed as Partial<ExportDocument>
    if (
      doc.format !== 'satin-data' ||
      doc.name !== config.name ||
      doc.version !== config.version ||
      !doc.collections ||
      typeof doc.collections !== 'object' ||
      Object.keys(doc.collections).sort().join() !== [...names].sort().join()
    )
      throw new TypeError('Incompatible Satin data document')
    for (const name of names) {
      const rows = doc.collections[name]
      const key = config.collections[name].key
      if (
        !Array.isArray(rows) ||
        rows.some(row => !row || typeof row !== 'object' || typeof row[key] !== 'string')
      )
        throw new TypeError(`Invalid rows in ${name}`)
    }
    const changes: Change[] = []
    for (const name of names) {
      if (mode === 'replace')
        changes.push(tables => {
          tables[name].clear()
        })
      for (const row of doc.collections![name]) changes.push(putChange(name, row))
    }
    await memory.write(changes)
  }
  api.close = () => {
    invalidate()
    memory.close()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
      listening = false
    }
  }
  return api as ReturnType<typeof defineDatabase<S>>
}

type DataSnapshot<T> = { data: T; loading: boolean; error?: Error }
type CachedCollection = NonNullable<ReturnType<typeof snapshots.get>>

/** Reuse detached, unchanged rows so a single write does not invalidate every memoized child. */
function shareQueryRows<T extends object>(previous: T[], next: T[], key?: string): T[] {
  const byKey = key ? new Map(previous.map(row => [Reflect.get(row, key), row])) : undefined
  const shared = next.map((row, index) => {
    const old = byKey ? byKey.get(Reflect.get(row, key!)) : previous[index]
    return old && valueEqual(old, row) ? old : row
  })
  return shared.length === previous.length && shared.every((row, index) => row === previous[index])
    ? previous
    : shared
}

/** One observer per hook selection. Reads stay synchronous; only hydration is asynchronous. */
function createDataObserver<T>(
  source: { subscribe(listener: () => void): () => void },
  empty: T,
  readCached: (cached: CachedCollection) => T,
  load: () => Promise<T>,
  initial?: DataSnapshot<T>,
  reconcile = (previous: T, next: T): T => (valueEqual(previous, next) ? previous : next),
) {
  const serverSnapshot: DataSnapshot<T> = { data: empty, loading: true }
  let result = initial ?? serverSnapshot
  let previousRevision: object | undefined
  let previousError: Error | undefined
  let hasRead = false

  const publish = (data: T, loading: boolean, error?: Error) => {
    const stableData = reconcile(result.data, data)
    if (stableData !== result.data || loading !== result.loading || error !== result.error) {
      result = { data: stableData, loading, error }
    }
    return result
  }
  const getSnapshot = () => {
    const cached = snapshots.get(source)
    if (!cached?.ready()) return result
    const revision = cached.revision()
    const error = cached.error()
    // Cache even opaque structured-clone values and thrown errors between store revisions.
    if (hasRead && revision === previousRevision && error === previousError) {
      return result
    }
    hasRead = true
    previousRevision = revision
    previousError = error
    try {
      return publish(readCached(cached), false, error)
    } catch (error) {
      return publish(result.data, false, error as Error)
    }
  }
  const subscribe = (listener: () => void) => {
    let active = true
    let sequence = 0
    const refresh = () => {
      if (!active) return
      const current = ++sequence
      if (snapshots.get(source)?.ready()) {
        listener()
        return
      }
      void load().then(
        data => {
          if (!active || current !== sequence) return
          // An empty hydration may not publish a table change. Read it here as well.
          if (snapshots.get(source)?.ready()) getSnapshot()
          else publish(data, false)
          listener()
        },
        error => {
          if (!active || current !== sequence) return
          publish(result.data, false, error as Error)
          listener()
        },
      )
    }
    const unsubscribe = source.subscribe(refresh)
    refresh()
    return () => {
      active = false
      unsubscribe()
    }
  }
  return { getSnapshot, subscribe, getServerSnapshot: () => serverSnapshot }
}

/**
 * SwiftData `@Query`: a collection's records as `{ data, loading, error }`, kept live. Local writes
 * show up synchronously, before they persist.
 *
 * @example
 * const { data: notes } = useQuery(db.notes, query => query.index('byDate').reverse())
 */
export function useQuery<T extends object, I extends CollectionIndexes<T>>(
  source: Collection<T, I>,
  configure?: (query: Query<T, I>) => Query<T, I>,
): { data: T[]; loading: boolean; error?: Error } {
  const committed = useRef<{ source: Collection<T, I>; result: DataSnapshot<T[]> } | undefined>(
    undefined,
  )
  const observer = useMemo(() => {
    const cached = snapshots.get(source)
    const initial =
      committed.current?.source === source && (!cached || cached.ready())
        ? committed.current.result
        : undefined
    return createDataObserver(
      source,
      [] as T[],
      cached => cached.query(configure as never) as T[],
      () => source.query(configure),
      initial,
      (previous, next) => shareQueryRows(previous, next, cached?.key),
    )
  }, [source, configure])
  const result = useSyncExternalStore(
    observer.subscribe,
    observer.getSnapshot,
    observer.getServerSnapshot,
  )
  // Reuse equal values across inline callbacks without publishing an abandoned render's selection.
  useLayoutEffect(() => {
    committed.current = { source, result }
  }, [source, result])
  return result
}

/** One record by key, kept live; `data` is undefined while loading and when no record exists. */
export function useRecord<T extends object, I extends CollectionIndexes<T>>(
  source: Collection<T, I>,
  key: string,
): { data?: T; loading: boolean; error?: Error } {
  const observer = useMemo(
    () =>
      createDataObserver(
        source,
        undefined as T | undefined,
        cached => cached.get(key) as T | undefined,
        () => source.get(key),
      ),
    [source, key],
  )
  return useSyncExternalStore(observer.subscribe, observer.getSnapshot, observer.getServerSnapshot)
}

let lastTime = 0
let sequence = 0
/** A new unique record id that sorts by creation time. */
export function newId(): string {
  const now = Math.max(Date.now(), lastTime)
  sequence = now === lastTime ? sequence + 1 : 0
  lastTime = now
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `${now.toString(36).padStart(10, '0')}-${sequence.toString(36).padStart(4, '0')}-${random}`
}

/** Asks WebKit not to evict the app's data under storage pressure; true when granted. */
export async function requestPersistentStorage(): Promise<boolean> {
  return navigator.storage?.persist?.() ?? false
}
/** The app's storage usage and quota in bytes, when WebKit reports them. */
export async function estimateStorage(): Promise<{ usage?: number; quota?: number }> {
  return navigator.storage?.estimate?.() ?? {}
}
