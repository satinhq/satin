import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { collection, defineDatabase } from './database.ts'

let factory: IDBFactory
beforeEach(() => {
  factory = new IDBFactory()
  vi.stubGlobal('indexedDB', factory)
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function blockedUpgrade() {
  const externalRequest = factory.open('blocked-upgrade', 1)
  externalRequest.onupgradeneeded = () =>
    externalRequest.result.createObjectStore('entries', { keyPath: 'id' })
  const external = await new Promise<IDBDatabase>((resolve, reject) => {
    externalRequest.onsuccess = () => resolve(externalRequest.result)
    externalRequest.onerror = () => reject(externalRequest.error)
  })
  const open = vi.spyOn(factory, 'open')
  const database = defineDatabase({
    name: 'blocked-upgrade',
    version: 2,
    collections: { entries: collection<{ id: string; text: string }>({ key: 'id', indexes: {} }) },
  })
  const reading = database.entries.get('first')
  // The memory store queues its initial read behind already-issued writes.
  await Promise.resolve()
  const pendingRequest = open.mock.results[0]!.value as IDBOpenDBRequest
  const lateResult = new Promise<IDBDatabase>((resolve, reject) => {
    pendingRequest.addEventListener('success', () => resolve(pendingRequest.result), { once: true })
    pendingRequest.addEventListener('error', () => reject(pendingRequest.error), { once: true })
  })
  return { external, database, open, reading, lateResult }
}

it('names an upgrade blocked by another tab and lets the caller retry after the tab closes', async () => {
  const { external, database, reading, lateResult } = await blockedUpgrade()
  try {
    await expect(reading).rejects.toThrow(
      'Database blocked-upgrade upgrade is blocked by another open tab',
    )
    external.close()
    await lateResult
    await database.entries.put({ id: 'first', text: 'saved after retry' })
    expect(await database.entries.get('first')).toEqual({ id: 'first', text: 'saved after retry' })
  } finally {
    external.close()
    database.close()
    ;(await lateResult).close()
  }
})

it('closes the abandoned connection when a blocked request succeeds late', async () => {
  const { external, database, reading, lateResult } = await blockedUpgrade()
  try {
    await expect(reading).rejects.toThrow('upgrade is blocked')
    database.close()
    external.close()
    const abandonedConnection = await lateResult
    expect(() => abandonedConnection.transaction('entries')).toThrow(
      expect.objectContaining({ name: 'InvalidStateError' }),
    )
    await database.entries.put({ id: 'retry', text: 'saved after retry' })
    expect(await database.entries.get('retry')).toEqual({ id: 'retry', text: 'saved after retry' })
  } finally {
    external.close()
    database.close()
    ;(await lateResult).close()
  }
})
