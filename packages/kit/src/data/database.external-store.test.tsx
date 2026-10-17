// @vitest-environment jsdom
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb'
import { act, memo, useState, Profiler, startTransition, Suspense, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { collection, defineDatabase, type Query, useQuery, useRecord } from './database.ts'

const schema = { notes: collection<{ id: string; text: string }>()({ key: 'id' }) }
let root: Root
let element: HTMLDivElement
const databases: ReturnType<typeof defineDatabase<typeof schema>>[] = []

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  element = document.createElement('div')
  root = createRoot(element)
})

afterEach(async () => {
  await act(async () => root.unmount())
  databases.splice(0).forEach(database => database.close())
  vi.restoreAllMocks()
})

function database() {
  const db = defineDatabase({
    name: `external-${databases.length}`,
    version: 1,
    collections: schema,
  })
  databases.push(db)
  return db
}

it('commits a warm mount once and a write once in the same act without a loading blink', async () => {
  const db = database()
  await db.notes.put({ id: 'a', text: 'before' })
  const commits = vi.fn()
  const frames: string[] = []
  function Reader() {
    const record = useRecord(db.notes, 'a')
    const query = useQuery(db.notes)
    useLayoutEffect(() => {
      frames.push(`${record.loading}/${query.loading}/${record.data?.text}/${query.data[0]?.text}`)
    })
    return <span>{record.data?.text}</span>
  }
  await act(async () =>
    root.render(
      <Profiler id="reader" onRender={commits}>
        <Reader />
      </Profiler>,
    ),
  )
  expect(commits).toHaveBeenCalledTimes(1)
  commits.mockClear()
  frames.length = 0
  let saved!: Promise<void>
  act(() => {
    saved = db.notes.update('a', { text: 'after' })
  })
  expect(element.textContent).toBe('after')
  expect(commits).toHaveBeenCalledTimes(1)
  expect(frames).toEqual(['false/false/after/after'])
  await act(async () => saved)
  expect(commits).toHaveBeenCalledTimes(1)
})

it('never commits torn sibling records when the store changes during a concurrent render', async () => {
  const db = database()
  await db.notes.put({ id: 'a', text: 'before' })
  const commits: string[] = []
  let saved: Promise<void> | undefined
  function Reader({ name }: { name: string }) {
    const record = useRecord(db.notes, 'a')
    return <span data-reader={name}>{record.data?.text}</span>
  }
  function InterleavedWrite() {
    // Simulate a store publication after one sibling read and before the other.
    saved ??= db.notes.update('a', { text: 'after' })
    return null
  }
  await act(async () => {
    startTransition(() =>
      root.render(
        <Profiler id="siblings" onRender={() => commits.push(element.textContent ?? '')}>
          <Reader name="first" />
          <InterleavedWrite />
          <Reader name="second" />
        </Profiler>,
      ),
    )
  })
  await act(async () => saved)
  expect(commits.length).toBeGreaterThan(0)
  expect(commits.every(value => value === 'afterafter')).toBe(true)
})

it('keeps result identities on parent renders, unrelated writes and equal reconciliation', async () => {
  const db = database()
  await db.notes.put({ id: 'a', text: 'A' })
  await db.notes.put({ id: 'b', text: 'B' })
  const results: { record: ReturnType<typeof useRecord>; query: ReturnType<typeof useQuery> }[] = []
  function Reader() {
    const record = useRecord(db.notes, 'a')
    const query = useQuery(db.notes, query => query.filter(note => note.id === 'a'))
    results.push({ record, query })
    return null
  }
  await act(async () => root.render(<Reader />))
  const initial = results.at(-1)!
  await act(async () => root.render(<Reader />))
  expect(results.at(-1)?.record).toBe(initial.record)
  expect(results.at(-1)?.query).toBe(initial.query)
  await act(async () => db.notes.update('b', { text: 'changed elsewhere' }))
  expect(results.at(-1)?.record).toBe(initial.record)
  expect(results.at(-1)?.query).toBe(initial.query)
})

it('caches opaque structured-clone rows rather than allocating on each snapshot read', async () => {
  const { Blob } = await import('node:buffer')
  const db = database()
  const note = { id: 'a', text: 'A', attachment: new Blob(['attachment']) }
  await db.notes.put(note)
  const commits = vi.fn()
  const results: { record: ReturnType<typeof useRecord>; query: ReturnType<typeof useQuery> }[] = []
  function Reader() {
    const record = useRecord(db.notes, 'a')
    const query = useQuery(db.notes)
    results.push({ record, query })
    return null
  }
  await act(async () =>
    root.render(
      <Profiler id="opaque" onRender={commits}>
        <Reader />
      </Profiler>,
    ),
  )
  expect(commits).toHaveBeenCalledTimes(1)
  const initial = results.at(-1)!
  await act(async () =>
    root.render(
      <Profiler id="opaque" onRender={commits}>
        <Reader />
      </Profiler>,
    ),
  )
  expect(results.at(-1)?.record).toBe(initial.record)
  expect(results.at(-1)?.query).toBe(initial.query)
  expect(commits).toHaveBeenCalledTimes(2)
})

it('reads a changed configure callback and a warm record key in the next render', async () => {
  const db = database()
  await db.notes.put({ id: 'a', text: 'A' })
  await db.notes.put({ id: 'b', text: 'B' })
  function Reader({ id }: { id: string }) {
    const query = useQuery(db.notes, query => query.filter(note => note.id === id))
    const record = useRecord(db.notes, id)
    return (
      <span>
        {query.data[0]?.text}/{record.data?.text}/{String(query.loading || record.loading)}
      </span>
    )
  }
  await act(async () => root.render(<Reader id="a" />))
  await act(async () => root.render(<Reader id="b" />))
  expect(element.textContent).toBe('B/B/false')
})

it('does not let a suspended render replace the committed query subscription callback', async () => {
  const db = database()
  await db.notes.put({ id: 'a', text: 'A' })
  await db.notes.put({ id: 'b', text: 'B' })
  const suspended = new Promise<void>(() => {})
  const configureA = vi.fn((query: Query<{ id: string; text: string }, {}>) =>
    query.filter(note => note.id === 'a'),
  )
  const configureB = vi.fn((query: Parameters<typeof configureA>[0]) =>
    query.filter(note => note.id === 'b'),
  )
  function Reader({ pending }: { pending: boolean }) {
    const query = useQuery(db.notes, pending ? configureB : configureA)
    if (pending) throw suspended
    return <span>{query.data[0]?.text}</span>
  }
  await act(async () =>
    root.render(
      <Suspense fallback="waiting">
        <Reader pending={false} />
      </Suspense>,
    ),
  )
  await act(async () => {
    startTransition(() =>
      root.render(
        <Suspense fallback="waiting">
          <Reader pending />
        </Suspense>,
      ),
    )
  })
  expect(element.textContent).toBe('A')
  const pendingReads = configureB.mock.calls.length
  let saved!: Promise<void>
  act(() => {
    saved = db.notes.update('a', { text: 'updated A' })
    expect(configureB).toHaveBeenCalledTimes(pendingReads)
  })
  await act(async () => saved)
  await act(async () =>
    root.render(
      <Suspense fallback="waiting">
        <Reader pending={false} />
      </Suspense>,
    ),
  )
  expect(element.textContent).toBe('updated A')
})

it('hydrates an empty cold collection without remaining stuck in loading', async () => {
  const db = database()
  const frames: boolean[] = []
  function Reader() {
    const query = useQuery(db.notes)
    const record = useRecord(db.notes, 'missing')
    frames.push(query.loading || record.loading)
    return (
      <span>
        {String(query.loading || record.loading)}/{query.data.length}/{record.data?.text}
      </span>
    )
  }
  await act(async () => root.render(<Reader />))
  await act(async () => {
    await db.notes.query()
  })
  expect(frames[0]).toBe(true)
  expect(element.textContent).toBe('false/0/')
})

it('retains hydration errors and recovers when the source is subsequently loaded', async () => {
  let failMigration = true
  const db = defineDatabase({
    name: 'hydration-failure',
    version: 1,
    collections: schema,
    migrations: {
      1: () => {
        if (failMigration) throw new Error('cannot open')
      },
    },
  })
  databases.push(db)
  function Reader() {
    const query = useQuery(db.notes)
    const record = useRecord(db.notes, 'a')
    return (
      <span>
        {String(query.loading || record.loading)}/{query.error?.message}/{record.error?.message}/
        {record.data?.text}
      </span>
    )
  }
  await act(async () => root.render(<Reader />))
  await act(async () => {
    await expect(db.notes.query()).rejects.toThrow('cannot open')
  })
  expect(element.textContent).toBe('false/cannot open/cannot open/')
  failMigration = false
  await act(async () => db.notes.put({ id: 'a', text: 'material' }))
  expect(element.textContent).toBe('false///material')
})

it('does not reuse another source record while a newly selected database is cold', async () => {
  const first = database()
  const second = database()
  await first.notes.put({ id: 'a', text: 'first' })
  const frames: string[] = []
  function Reader({ db }: { db: typeof first }) {
    const record = useRecord(db.notes, 'a')
    const query = useQuery(db.notes)
    frames.push(`${record.data?.text}/${query.data[0]?.text}/${record.loading}/${query.loading}`)
    return null
  }
  await act(async () => root.render(<Reader db={first} />))
  frames.length = 0
  await act(async () => root.render(<Reader db={second} />))
  await act(async () => {
    await second.notes.query()
  })
  expect(frames[0]).toBe('undefined/undefined/true/true')
  expect(frames.every(frame => !frame.includes('first'))).toBe(true)
  expect(frames.at(-1)).toBe('undefined/undefined/false/false')
})

it('does not seed a new cold query with a previous selection after the database closes', async () => {
  const db = database()
  await db.notes.put({ id: 'a', text: 'A' })
  await db.notes.put({ id: 'b', text: 'B' })
  const frames: string[] = []
  function Reader({ id }: { id: string }) {
    const query = useQuery(db.notes, query => query.filter(note => note.id === id))
    frames.push(`${query.data[0]?.text}/${query.loading}`)
    return null
  }
  await act(async () => root.render(<Reader id="a" />))
  db.close()
  frames.length = 0
  await act(async () => root.render(<Reader id="b" />))
  await act(async () => {
    await db.notes.query()
  })
  expect(frames[0]).toBe('undefined/true')
  expect(frames.at(-1)).toBe('B/false')
})

it('caches a thrown configure error and keeps the last successful query data', async () => {
  const db = database()
  await db.notes.put({ id: 'a', text: 'A' })
  let invalid = false
  const failure = new Error('invalid query')
  function Reader() {
    const query = useQuery(db.notes, query => {
      if (invalid) throw failure
      return query
    })
    return (
      <span>
        {query.data[0]?.text}/{query.error?.message}/{String(query.loading)}
      </span>
    )
  }
  await act(async () => root.render(<Reader />))
  invalid = true
  await act(async () => root.render(<Reader />))
  expect(element.textContent).toBe('A/invalid query/false')
  invalid = false
  await act(async () => root.render(<Reader />))
  expect(element.textContent).toBe('A//false')
})

it('renders a remote refresh through the same store snapshot', async () => {
  const first = database()
  await first.notes.put({ id: 'a', text: 'before' })
  const second = defineDatabase({ name: 'external-0', version: 1, collections: schema })
  databases.push(second)
  await second.notes.get('a')
  let resolveRefresh!: () => void
  const refreshed = new Promise<void>(resolve => {
    resolveRefresh = resolve
  })
  const unsubscribe = second.notes.subscribe(resolveRefresh)
  function Reader() {
    const record = useRecord(second.notes, 'a')
    const query = useQuery(second.notes)
    return (
      <span>
        {record.data?.text}/{query.data[0]?.text}/{String(record.loading || query.loading)}
      </span>
    )
  }
  await act(async () => root.render(<Reader />))
  await act(async () => {
    await first.notes.update('a', { text: 'remote' })
    await refreshed
  })
  expect(element.textContent).toBe('remote/remote/false')
  unsubscribe()
})

it('publishes rollback data and errors through the hook snapshot', async () => {
  const db = database()
  await db.notes.put({ id: 'a', text: 'before' })
  function Reader() {
    const record = useRecord(db.notes, 'a')
    const query = useQuery(db.notes)
    return (
      <span>
        {record.data?.text}/{query.data[0]?.text}/{record.error?.message}/
        {String(record.loading || query.loading)}
      </span>
    )
  }
  await act(async () => root.render(<Reader />))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new Error('disk failed')
  })
  let saved!: Promise<void>
  act(() => {
    saved = db.notes.update('a', { text: 'optimistic' })
  })
  expect(element.textContent).toBe('optimistic/optimistic//false')
  await act(async () => {
    await expect(saved).rejects.toThrow('disk failed')
  })
  expect(element.textContent).toBe('before/before/disk failed/false')
})

it('server-renders a stable loading result without opening IndexedDB', () => {
  const db = database()
  const open = vi.spyOn(indexedDB, 'open')
  function Reader() {
    const query = useQuery(db.notes)
    const record = useRecord(db.notes, 'a')
    return <span>{String(query.loading && record.loading)}</span>
  }
  expect(renderToString(<Reader />)).toContain('true')
  expect(open).not.toHaveBeenCalled()
})

it('preserves an unchanged row draft through other writes and query reordering', async () => {
  const db = database()
  await db.notes.put({ id: 'b', text: 'original' })
  await db.notes.put({ id: 'c', text: 'other' })
  const Editor = memo(function Editor({ note }: { note: { id: string; text: string } }) {
    const [draft, setDraft] = useState(note.text)
    useLayoutEffect(() => setDraft(note.text), [note])
    return (
      <button data-id={note.id} onClick={() => setDraft('unsaved')}>
        {draft}
      </button>
    )
  })
  function Reader() {
    const { data } = useQuery(db.notes, query => query)
    return data.map(note => <Editor key={note.id} note={note} />)
  }
  await act(async () => root.render(<Reader />))
  const draft = () => element.querySelector<HTMLButtonElement>('[data-id="b"]')!
  await act(async () => draft().click())
  await act(async () => db.notes.put({ id: 'c', text: 'changed' }))
  expect(draft().textContent).toBe('unsaved')
  await act(async () => db.notes.put({ id: 'a', text: 'prepended' }))
  expect(draft().textContent).toBe('unsaved')
  await act(async () => db.notes.put({ id: 'b', text: 'saved elsewhere' }))
  expect(draft().textContent).toBe('saved elsewhere')
})
