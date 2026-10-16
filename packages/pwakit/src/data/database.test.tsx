// @vitest-environment jsdom
import { act } from 'react'
import { Blob as NodeBlob } from 'node:buffer'
import { createRoot } from 'react-dom/client'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { collection, defineDatabase, newId, useQuery, useRecord } from './database.ts'

interface Entry {
  id: string
  createdAt: number
  text: string
  mood?: string
}
type Tag = { id: string; label: string }
const entries = collection<Entry>({ key: 'id', indexes: { byDate: 'createdAt' } })
const tags = collection<Tag>()({ key: 'id' })
let count = 0
function database(
  version = 1,
  migrations?: Record<
    number,
    (tx: {
      entries: { updateAll: (update: (row: Entry) => Entry) => Promise<void> }
    }) => Promise<void>
  >,
) {
  return defineDatabase({
    name: `test-${count}`,
    version,
    collections: { entries, tags },
    migrations,
  })
}
beforeEach(() => {
  count++
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('writes and reads records, and orders a bounded index range', async () => {
  const db = database()
  await db.entries.put({ id: 'a', createdAt: 10, text: 'A' })
  await db.entries.put({ id: 'b', createdAt: 20, text: 'B' })
  await db.entries.put({ id: 'c', createdAt: 30, text: 'C' })
  expect(await db.entries.get('b')).toMatchObject({ text: 'B' })
  expect(
    (
      await db.entries.query(q => q.index('byDate', IDBKeyRange.bound(10, 25)).reverse().limit(1))
    ).map(row => row.id),
  ).toEqual(['b'])
  expect(
    (await db.entries.query(q => q.filter(row => row.createdAt >= 20))).map(row => row.id),
  ).toEqual(['b', 'c'])
  await db.entries.delete('b')
  expect(await db.entries.get('b')).toBeUndefined()
  db.close()
})

it('commits two collections together and notifies multiple subscribers after commit', async () => {
  const db = database()
  const first = vi.fn(),
    second = vi.fn(),
    tagListener = vi.fn()
  const off = db.entries.subscribe(first)
  db.entries.subscribe(second)
  db.tags.subscribe(tagListener)
  await db.transaction(['entries', 'tags'], async tx => {
    await tx.entries.put({ id: 'a', createdAt: 1, text: 'A' })
    await tx.tags.put({ id: 't', label: 'T' })
  })
  expect([
    first.mock.calls.length,
    second.mock.calls.length,
    tagListener.mock.calls.length,
  ]).toEqual([1, 1, 1])
  off()
  await db.entries.put({ id: 'b', createdAt: 2, text: 'B' })
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(2)
  db.close()
})

it('runs ordered migration in the upgrade transaction and preserves data on failure', async () => {
  const original = database()
  await original.entries.put({ id: 'a', createdAt: 1, text: 'A' })
  original.close()
  const upgraded = database(3, {
    2: async tx => {
      await tx.entries.updateAll(row => ({ ...row, mood: 'neutral' }))
    },
    3: async tx => {
      await tx.entries.updateAll(row => ({ ...row, text: `${row.text}!` }))
    },
  })
  expect(await upgraded.entries.get('a')).toMatchObject({ mood: 'neutral', text: 'A!' })
  upgraded.close()
  const failed = database(4, {
    4: async tx => {
      await tx.entries.updateAll(() => {
        throw new Error('bad migration')
      })
    },
  })
  await expect(failed.entries.get('a')).rejects.toThrow('bad migration')
  const stillThree = database(3)
  expect(await stillThree.entries.get('a')).toMatchObject({ mood: 'neutral', text: 'A!' })
  stillThree.close()
})

it('exports and imports atomically with explicit replace and merge', async () => {
  const db = database()
  await db.entries.put({ id: 'a', createdAt: 1, text: 'A' })
  await db.tags.put({ id: 't', label: 'T' })
  const exportText = await (await db.exportJSON()).text()
  expect(JSON.parse(exportText)).toMatchObject({ format: 'satin-data', version: 1 })
  await db.entries.put({ id: 'b', createdAt: 2, text: 'B' })
  await db.importJSON(exportText, 'merge')
  expect(await db.entries.get('b')).toBeDefined()
  await db.importJSON(exportText, 'replace')
  expect(await db.entries.get('b')).toBeUndefined()
  await expect(
    db.importJSON(exportText.replace('"version":1', '"version":2'), 'replace'),
  ).rejects.toThrow()
  expect(await db.entries.get('a')).toBeDefined()
  db.close()
})

it('reopens after a forced close and after a visible resume', async () => {
  const db = database()
  await db.entries.put({ id: 'a', createdAt: 1, text: 'A' })
  db.close()
  expect(await db.entries.get('a')).toBeDefined()
  document.dispatchEvent(new Event('visibilitychange'))
  expect(await db.entries.get('a')).toBeDefined()
  db.close()
})

it('updates live query and record hooks on writes', async () => {
  const db = database()
  const snapshots: string[] = []
  function Viewer() {
    const list = useQuery(db.entries, q => q.limit(1))
    const record = useRecord(db.entries, 'a')
    snapshots.push(`${list.data.length}:${record.data?.text ?? 'missing'}`)
    return null
  }
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  await act(async () => {
    root.render(<Viewer />)
  })
  await act(async () => {
    await db.entries.put({ id: 'a', createdAt: 1, text: 'A' })
    await new Promise(resolve => setTimeout(resolve, 10))
  })
  expect(snapshots.at(-1)).toBe('1:A')
  await act(async () => {
    await db.entries.delete('a')
    await new Promise(resolve => setTimeout(resolve, 10))
  })
  expect(snapshots.at(-1)).toBe('0:missing')
  await act(async () => {
    root.unmount()
  })
  db.close()
})

it('makes sortable unique ids even within one millisecond', () => {
  const one = newId(),
    two = newId()
  expect(one < two).toBe(true)
})

it('seeds once after migrations across concurrent handles, reopening, clearing and upgrades', async () => {
  const name = `seed-${count}`
  const make = () =>
    defineDatabase({
      name,
      version: 1,
      collections: { entries },
      migrations: {
        1: async tx => {
          await tx.entries.put({ id: 'migration', createdAt: 0, text: 'Migrated' })
        },
      },
      seed: async tx => {
        expect(await tx.entries.get('migration')).toMatchObject({ text: 'Migrated' })
        await new Promise(resolve => setTimeout(resolve, 0))
        if (await tx.entries.get('seed')) throw new Error('Seed ran twice')
        await tx.entries.put({ id: 'seed', createdAt: 1, text: 'Seeded' })
      },
    })
  const first = make(),
    second = make()
  expect(await Promise.all([first.entries.get('seed'), second.entries.get('seed')])).toEqual([
    { id: 'seed', createdAt: 1, text: 'Seeded' },
    { id: 'seed', createdAt: 1, text: 'Seeded' },
  ])
  await first.entries.update('seed', { text: 'Edited' })
  first.close()
  second.close()
  const reopened = make()
  expect(await reopened.entries.get('seed')).toMatchObject({ text: 'Edited' })
  await reopened.entries.delete('seed')
  reopened.close()
  const upgraded = defineDatabase({
    name,
    version: 2,
    collections: { entries },
    migrations: {
      2: async tx => {
        await tx.entries.put({ id: 'upgrade', createdAt: 2, text: 'Upgraded' })
      },
    },
    seed: async () => {
      throw new Error('Cleared records must not be reseeded')
    },
  })
  expect(await upgraded.entries.get('seed')).toBeUndefined()
  expect(await upgraded.entries.get('upgrade')).toMatchObject({ text: 'Upgraded' })
  upgraded.close()
  expect(() => defineDatabase({ name: 'empty', version: 1, collections: {} })).toThrow(
    'at least one collection',
  )
})

it('rolls back failed asynchronous seeding and retries creation without partial records', async () => {
  const name = `failed-seed-${count}`
  const failure = new Error('Seed source unavailable')
  const failed = defineDatabase({
    name,
    version: 1,
    collections: { entries },
    seed: async tx => {
      await tx.entries.put({ id: 'partial', createdAt: 0, text: 'Must roll back' })
      await new Promise(resolve => setTimeout(resolve, 0))
      throw failure
    },
  })
  await expect(failed.entries.get('partial')).rejects.toBe(failure)
  failed.close()
  const falsyFailure = defineDatabase({
    name,
    version: 1,
    collections: { entries },
    seed: async tx => {
      expect(await tx.entries.get('partial')).toBeUndefined()
      await tx.entries.put({ id: 'partial', createdAt: 0, text: 'Must also roll back' })
      throw false
    },
  })
  await expect(falsyFailure.entries.get('partial')).rejects.toBe(false)
  falsyFailure.close()
  const material = defineDatabase({
    name,
    version: 1,
    collections: { entries },
    seed: async tx => {
      expect(await tx.entries.get('partial')).toBeUndefined()
      await tx.entries.put({ id: 'ready', createdAt: 0, text: 'Material' })
    },
  })
  expect(await material.entries.get('ready')).toMatchObject({ text: 'Material' })
  material.close()
})

it('rejects seed connection-like errors without automatically repeating side effects', async () => {
  const failure = Object.assign(new Error('Seed source unavailable'), { name: 'UnknownError' })
  let failFirstCreation = true
  const database = defineDatabase({
    name: `seed-retry-${count}`,
    version: 1,
    collections: { entries },
    seed: async tx => {
      await tx.entries.put({ id: 'ready', createdAt: 0, text: 'Created' })
      if (failFirstCreation) {
        failFirstCreation = false
        throw failure
      }
    },
  })
  await expect(database.entries.get('ready')).rejects.toBe(failure)
  expect(await database.entries.get('ready')).toMatchObject({ text: 'Created' })
  database.close()
})
