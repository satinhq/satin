// @vitest-environment jsdom
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, expect, it, vi } from 'vitest'
import { collection, defineDatabase } from './database.ts'
const schema = { notes: collection<{ id: string; pinned: boolean; text: string }>()({ key: 'id' }) }
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
})
it('publishes a write before the persistence promise settles', async () => {
  const db = defineDatabase({ name: 'sync', version: 1, collections: schema })
  await db.notes.put({ id: 'a', pinned: false, text: 'A' })
  const listener = vi.fn()
  db.notes.subscribe(listener)
  const saved = db.notes.put({ id: 'a', pinned: true, text: 'A' })
  expect(listener).toHaveBeenCalledTimes(1)
  await saved
  db.close()
})

it('keeps ten rapid functional toggles ordered across two handles and reload', async () => {
  const first = defineDatabase({ name: 'shared', version: 1, collections: schema })
  const second = defineDatabase({ name: 'shared', version: 1, collections: schema })
  await first.notes.put({ id: 'a', pinned: false, text: '0' })
  await second.notes.get('a')
  const writes = Array.from({ length: 10 }, (_, index) =>
    (index % 2 ? first : second).notes.update('a', row => ({
      ...row,
      pinned: !row.pinned,
      text: String(Number(row.text) + 1),
    })),
  )
  await Promise.all(writes)
  first.close()
  second.close()
  const reloaded = defineDatabase({ name: 'shared', version: 1, collections: schema })
  expect(await reloaded.notes.get('a')).toMatchObject({ pinned: false, text: '10' })
  reloaded.close()
})

it('rolls back injected persistence failure and reports it through onError', async () => {
  const { IDBObjectStore } = await import('fake-indexeddb')
  const db = defineDatabase({ name: 'rollback', version: 1, collections: schema })
  await db.notes.put({ id: 'a', pinned: false, text: 'A' })
  const errors = vi.fn()
  db.onError(errors)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new DOMException('Injected full disk', 'QuotaExceededError')
  })
  const saved = db.notes.update('a', { pinned: true })
  expect(await db.notes.get('a')).toMatchObject({ pinned: true })
  await expect(saved).rejects.toThrow('Injected full disk')
  expect(await db.notes.get('a')).toMatchObject({ pinned: false })
  expect(errors).toHaveBeenCalledTimes(1)
  put.mockRestore()
  consoleError.mockRestore()
  db.close()
  const reloaded = defineDatabase({ name: 'rollback', version: 1, collections: schema })
  expect(await reloaded.notes.get('a')).toMatchObject({ pinned: false })
  reloaded.close()
})

it('publishes synchronous transaction changes atomically before returning', async () => {
  const db = defineDatabase({ name: 'transaction', version: 1, collections: schema })
  await db.notes.put({ id: 'a', pinned: false, text: 'A' })
  const listener = vi.fn()
  db.notes.subscribe(listener)
  const saved = db.transaction(['notes'], tx => {
    void tx.notes.update('a', { pinned: true })
    void tx.notes.put({ id: 'b', pinned: true, text: 'B' })
  })
  expect(listener).toHaveBeenCalledTimes(1)
  expect(await db.notes.query()).toHaveLength(2)
  await saved
  db.close()
})

it('renders loaded query and record changes synchronously without a loading frame', async () => {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')
  const { useQuery, useRecord } = await import('./database.ts')
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const db = defineDatabase({ name: 'hooks', version: 1, collections: schema })
  await db.notes.put({ id: 'a', pinned: false, text: 'A' })
  await db.notes.put({ id: 'b', pinned: false, text: 'B' })
  const frames: { loading: boolean; pinned?: boolean; count: number }[] = []
  function View({ id }: { id: string }) {
    const record = useRecord(db.notes, id)
    const query = useQuery(db.notes)
    frames.push({
      loading: record.loading || query.loading,
      pinned: record.data?.pinned,
      count: query.data.length,
    })
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<View id="a" />))
  frames.length = 0
  let saved!: Promise<void>
  act(() =>
    flushSync(() => {
      saved = db.notes.update('a', row => ({ ...row, pinned: !row.pinned }))
    }),
  )
  expect(frames.at(-1)).toEqual({ loading: false, pinned: true, count: 2 })
  await act(async () => saved)
  await act(async () => root.render(<View id="b" />))
  expect(frames.every(frame => !frame.loading)).toBe(true)
  await act(async () => root.unmount())
  db.close()
})

it('refreshes subscribers in another context after a durable broadcast', async () => {
  const first = defineDatabase({ name: 'broadcast', version: 1, collections: schema })
  const second = defineDatabase({ name: 'broadcast', version: 1, collections: schema })
  await first.notes.put({ id: 'a', pinned: false, text: 'A' })
  await second.notes.get('a')
  const observed = new Promise<void>(resolve => {
    second.notes.subscribe(() => {
      void second.notes.get('a').then(row => {
        if (row?.pinned) resolve()
      })
    })
  })
  await first.notes.update('a', { pinned: true })
  await observed
  first.close()
  second.close()
})

it('preserves issue order for cold updates and asynchronous transactions', async () => {
  const initial = defineDatabase({ name: 'cold', version: 1, collections: schema })
  await initial.notes.put({ id: 'a', pinned: false, text: 'initial' })
  initial.close()
  const db = defineDatabase({ name: 'cold', version: 1, collections: schema })
  const first = db.notes.update('a', { text: 'first' })
  const second = db.notes.put({ id: 'a', pinned: true, text: 'second' })
  await Promise.all([first, second])
  expect(await db.notes.get('a')).toMatchObject({ text: 'second' })
  let release!: () => void
  const blocked = new Promise<void>(resolve => {
    release = resolve
  })
  const transaction = db.transaction(['notes'], async tx => {
    await blocked
    await tx.notes.update('a', { text: 'third' })
  })
  const fourth = db.notes.update('a', { text: 'fourth' })
  release()
  await Promise.all([transaction, fourth])
  expect(await db.notes.get('a')).toMatchObject({ text: 'fourth' })
  db.close()
})

it('cancels dependent writes on failure, then accepts a fresh retry', async () => {
  const { IDBObjectStore } = await import('fake-indexeddb')
  const db = defineDatabase({ name: 'cancel', version: 1, collections: schema })
  await db.notes.put({ id: 'a', pinned: false, text: 'A' })
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new Error('injected')
  })
  const first = db.notes.update('a', { text: 'first' })
  const second = db.notes.update('a', { text: 'second' })
  const results = await Promise.allSettled([first, second])
  expect(results.map(result => result.status)).toEqual(['rejected', 'rejected'])
  expect(await db.notes.get('a')).toMatchObject({ text: 'A' })
  put.mockRestore()
  await db.notes.update('a', { text: 'retry' })
  expect(await db.notes.get('a')).toMatchObject({ text: 'retry' })
  consoleError.mockRestore()
  db.close()
})

it('a cold transaction cannot read a later optimistic write', async () => {
  const original = defineDatabase({ name: 'cold-transaction', version: 1, collections: schema })
  await original.notes.put({ id: 'a', pinned: false, text: 'initial' })
  original.close()
  const db = defineDatabase({ name: 'cold-transaction', version: 1, collections: schema })
  let read: string | undefined
  const earlier = db.transaction(['notes'], async tx => {
    const row = await tx.notes.get('a')
    read = row?.text
    await tx.notes.put({ ...row!, text: 'earlier' })
  })
  const later = db.notes.put({ id: 'a', pinned: true, text: 'later' })
  await Promise.all([earlier, later])
  expect(read).toBe('initial')
  expect(await db.notes.get('a')).toMatchObject({ text: 'later' })
  db.close()
})
