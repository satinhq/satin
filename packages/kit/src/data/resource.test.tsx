// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { defineResource } from './resource.ts'
import { useResource } from './useResource.ts'

function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

it('prefetch and destination share content, and a re-push renders it immediately', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const response = deferred<string>()
  const resource = defineResource((_key: string) => response.promise, { maxEntries: 1 })
  const prefetch = resource.prefetch('mail')
  const load = resource.load('mail')
  response.resolve('A message already read')
  await prefetch
  expect(await load).toBe('A message already read')
  const element = document.createElement('div')
  const root = createRoot(element)
  const rendered: string[] = []
  function Detail() {
    const result = useResource(resource, 'mail')
    const text = result.loading ? 'Spinner' : result.data!
    rendered.push(text)
    return text
  }
  try {
    await act(async () => root.render(<Detail />))
    await act(async () => root.render(null))
    await act(async () => root.render(<Detail />))
    expect(element.textContent).toBe('A message already read')
    expect(rendered).not.toContain('Spinner')
  } finally {
    act(() => root.unmount())
  }
  await resource.prefetch('another-message')
  expect(resource.getSnapshot('mail').hasData).toBe(false)
})

it('keeps seeded and loaded content visible through refresh and offline failure', async () => {
  const response = deferred<string>()
  const resource = defineResource((_key: string) => response.promise, { staleTime: 0 })
  resource.seed('mail', 'List preview')
  const loading = resource.load('mail')
  expect(resource.getSnapshot('mail')).toMatchObject({
    data: 'List preview',
    loading: false,
    refreshing: true,
  })
  response.resolve('Full message')
  await loading
  resource.seed('mail', 'Older list preview')
  expect(resource.getSnapshot('mail').data).toBe('Full message')
  const offline = defineResource((_key: string) => Promise.reject<string>(new Error('Offline')))
  offline.seed('mail', 'Retained message')
  await offline.prefetch('mail')
  expect(offline.getSnapshot('mail')).toMatchObject({
    data: 'Retained message',
    loading: false,
    refreshing: false,
    error: new Error('Offline'),
  })
})

it('clear and invalidation prevent late obsolete responses from restoring private data', async () => {
  const old = deferred<string>()
  const next = deferred<string>()
  let attempt = 0
  const resource = defineResource((_key: string) => (++attempt === 1 ? old.promise : next.promise))
  // React's external-store listener reads immediately during clear notification.
  const stopReading = resource.subscribe('account:mail', () => resource.getSnapshot('account:mail'))
  const first = resource.load('account:mail')
  const cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' })
  await Promise.resolve()
  resource.clear()
  const second = resource.load('account:mail')
  next.resolve('New account')
  await second
  old.resolve('Private old account')
  await cancelled
  expect(resource.getSnapshot('account:mail').data).toBe('New account')
  stopReading()

  const pending = deferred<string>()
  let current = pending.promise
  const changes = defineResource((_key: string) => current)
  changes.seed('mail', 'Before mutation')
  const stale = changes.load('mail')
  const invalidated = expect(stale).rejects.toMatchObject({ name: 'AbortError' })
  await Promise.resolve()
  current = Promise.resolve('After mutation')
  const unsubscribe = changes.subscribe('mail', () => {})
  changes.invalidate('mail')
  await changes.load('mail')
  pending.resolve('Obsolete server reply')
  await invalidated
  expect(changes.getSnapshot('mail').data).toBe('After mutation')
  unsubscribe()
})

it('cancelling one speculative reader preserves another reader of the same message', async () => {
  const response = deferred<string>()
  let transportSignal: AbortSignal | undefined
  const resource = defineResource((_key: string, signal) => {
    transportSignal = signal
    return response.promise
  })
  const first = new AbortController()
  const second = new AbortController()
  const firstRead = resource.prefetch('shared', first.signal)
  const secondRead = resource.prefetch('shared', second.signal)
  await Promise.resolve()
  first.abort()
  await firstRead
  expect(transportSignal!.aborted).toBe(false)
  const destination = resource.load('shared')
  second.abort()
  await secondRead
  expect(transportSignal!.aborted).toBe(false)
  response.resolve('Shared body')
  expect(await destination).toBe('Shared body')
  expect(resource.getSnapshot('shared').data).toBe('Shared body')
})
