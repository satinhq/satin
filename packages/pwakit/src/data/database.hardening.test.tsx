// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { collection, defineDatabase, useRecord, type Collection } from './database.ts'

type Entry = { id: string; text: string }
const entries = collection<Entry>({ key: 'id' })
let databaseNumber = 0

function database(version = 1) {
  return defineDatabase({
    name: `hardening-${databaseNumber}`,
    version,
    collections: { entries },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => {
    resolve = complete
  })
  return { promise, resolve }
}

beforeEach(() => {
  databaseNumber++
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('clears the previous record immediately when a delayed record key changes', async () => {
  const nextRecord = deferred<Entry | undefined>()
  const source: Collection<Entry, Record<string, never>> = {
    get: vi.fn(key => (key === 'a' ? Promise.resolve({ id: 'a', text: 'A' }) : nextRecord.promise)),
    put: vi.fn(),
    delete: vi.fn(),
    query: vi.fn(),
    subscribe: () => () => {},
  }
  const snapshots: ReturnType<typeof useRecord<Entry, Record<string, never>>>[] = []
  function Viewer({ recordKey }: { recordKey: string }) {
    snapshots.push(useRecord(source, recordKey))
    return null
  }
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  try {
    await act(async () => root.render(<Viewer recordKey="a" />))
    expect(snapshots.at(-1)).toEqual({ data: { id: 'a', text: 'A' }, loading: false })
    snapshots.length = 0
    await act(async () => root.render(<Viewer recordKey="b" />))
    expect(snapshots.length).toBeGreaterThan(0)
    for (const snapshot of snapshots) expect(snapshot).toEqual({ loading: true })
    await act(async () => nextRecord.resolve({ id: 'b', text: 'B' }))
    expect(snapshots.at(-1)).toEqual({ data: { id: 'b', text: 'B' }, loading: false })
  } finally {
    await act(async () => root.unmount())
  }
})

it('clears the previous record immediately when its collection changes', async () => {
  const nextRecord = deferred<Entry | undefined>()
  function source(
    get: Collection<Entry, Record<string, never>>['get'],
  ): Collection<Entry, Record<string, never>> {
    return { get, put: vi.fn(), delete: vi.fn(), query: vi.fn(), subscribe: () => () => {} }
  }
  const first = source(() => Promise.resolve({ id: 'a', text: 'First collection' }))
  const second = source(() => nextRecord.promise)
  let snapshot: ReturnType<typeof useRecord<Entry, Record<string, never>>>
  function Viewer({ collection: current }: { collection: typeof first }) {
    snapshot = useRecord(current, 'a')
    return null
  }
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  try {
    await act(async () => root.render(<Viewer collection={first} />))
    expect(snapshot!).toEqual({ data: { id: 'a', text: 'First collection' }, loading: false })
    await act(async () => root.render(<Viewer collection={second} />))
    expect(snapshot!).toEqual({ loading: true })
    await act(async () => nextRecord.resolve({ id: 'a', text: 'Second collection' }))
    expect(snapshot!).toEqual({ data: { id: 'a', text: 'Second collection' }, loading: false })
  } finally {
    await act(async () => root.unmount())
  }
})

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Operation did not settle')), 500)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

it('rejects a query with the original error when its cursor predicate throws', async () => {
  const db = database()
  const failure = new Error('predicate failed')
  try {
    await db.entries.put({ id: 'a', text: 'A' })
    await expect(
      bounded(
        db.entries.query(query =>
          query.filter(() => {
            throw failure
          }),
        ),
      ),
    ).rejects.toBe(failure)
    expect(await db.entries.get('a')).toEqual({ id: 'a', text: 'A' })
  } finally {
    db.close()
  }
})

it('rejects a cursor key-changing update and rolls back the transaction', async () => {
  const db = database()
  try {
    await db.entries.put({ id: 'a', text: 'A' })
    await expect(
      bounded(
        db.transaction(['entries'], tx =>
          tx.entries.updateAll(row => ({
            ...row,
            id: 'b',
          })),
        ),
      ),
    ).rejects.toMatchObject({ name: 'DataError' })
    expect(await db.entries.get('a')).toEqual({ id: 'a', text: 'A' })
    expect(await db.entries.get('b')).toBeUndefined()
  } finally {
    db.close()
  }
})

it('rejects a key-changing migration cursor and preserves the prior database version', async () => {
  const original = database()
  await original.entries.put({ id: 'a', text: 'A' })
  original.close()
  const upgrade = defineDatabase({
    name: `hardening-${databaseNumber}`,
    version: 2,
    collections: { entries },
    migrations: { 2: tx => tx.entries.updateAll(row => ({ ...row, id: 'b' })) },
  })
  try {
    await expect(bounded(upgrade.entries.get('a'))).rejects.toMatchObject({ name: 'DataError' })
    const unchanged = database()
    try {
      expect(await unchanged.entries.get('a')).toEqual({ id: 'a', text: 'A' })
    } finally {
      unchanged.close()
    }
  } finally {
    upgrade.close()
  }
})

it('rolls back replacement import across collections when a later store write fails', async () => {
  const name = `hardening-${databaseNumber}`
  const db = defineDatabase({ name, version: 1, collections: { entries, archive: entries } })
  await db.entries.put({ id: 'a', text: 'Original entry' })
  await db.archive.put({ id: 'b', text: 'Original archive' })
  const failure = new Error('archive write failed')
  const originalPut = IDBObjectStore.prototype.put
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: InstanceType<typeof IDBObjectStore>,
    ...arguments_
  ) {
    if (this.name === 'archive') throw failure
    return originalPut.apply(this, arguments_)
  })
  try {
    await expect(
      db.importJSON(
        JSON.stringify({
          format: 'satin-data',
          name,
          version: 1,
          collections: {
            entries: [{ id: 'new-a', text: 'Replacement entry' }],
            archive: [{ id: 'new-b', text: 'Replacement archive' }],
          },
        }),
        'replace',
      ),
    ).rejects.toBe(failure)
    expect(await db.entries.get('a')).toEqual({ id: 'a', text: 'Original entry' })
    expect(await db.archive.get('b')).toEqual({ id: 'b', text: 'Original archive' })
    expect(await db.entries.get('new-a')).toBeUndefined()
  } finally {
    put.mockRestore()
    db.close()
  }
})

it('does not replay a write transaction after its action reports a connection error', async () => {
  const db = database()
  const failure = new DOMException('connection lost after starting', 'UnknownError')
  const action = vi.fn(async (tx: { entries: { put(row: Entry): Promise<void> } }) => {
    await tx.entries.put({ id: 'a', text: 'A' })
    throw failure
  })
  try {
    await expect(db.transaction(['entries'], action)).rejects.toBe(failure)
    expect(action).toHaveBeenCalledTimes(1)
    expect(await db.entries.get('a')).toBeUndefined()
  } finally {
    db.close()
  }
})

it('preserves committed write success and notifies later subscribers when one throws', async () => {
  const db = database()
  const failure = new Error('subscriber failed')
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  const later = vi.fn()
  db.entries.subscribe(() => {
    throw failure
  })
  db.entries.subscribe(later)
  try {
    await expect(db.entries.put({ id: 'a', text: 'A' })).resolves.toBeUndefined()
    expect(later).toHaveBeenCalledTimes(1)
    expect(await db.entries.get('a')).toEqual({ id: 'a', text: 'A' })
    expect(report).toHaveBeenCalledWith('Satin data subscriber failed', failure)
  } finally {
    report.mockRestore()
    db.close()
  }
})

it('closes an abandoned blocked upgrade before a retry and a later version upgrade', async () => {
  const original = database()
  await original.entries.put({ id: 'a', text: 'A' })
  original.close()
  const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
    const operation = indexedDB.open(`hardening-${databaseNumber}`, 1)
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error)
  })
  const connections: IDBDatabase[] = []
  let cleaning = false
  const originalOpen = indexedDB.open.bind(indexedDB)
  const open = vi.spyOn(indexedDB, 'open').mockImplementation((...arguments_) => {
    const operation = originalOpen(...arguments_)
    operation.addEventListener('success', () => {
      if (cleaning) operation.result.close()
      else connections.push(operation.result)
    })
    return operation
  })
  const upgrade = database(2)
  const later = database(3)
  try {
    await expect(bounded(upgrade.entries.get('a'))).rejects.toThrow('upgrade is blocked')
    const retry = upgrade.entries.get('a')
    blocker.close()
    await expect(bounded(retry)).resolves.toEqual({ id: 'a', text: 'A' })
    upgrade.close()
    await expect(bounded(later.entries.get('a'))).resolves.toEqual({ id: 'a', text: 'A' })
  } finally {
    cleaning = true
    blocker.close()
    for (const connection of connections) connection.close()
    upgrade.close()
    later.close()
    open.mockRestore()
  }
})
