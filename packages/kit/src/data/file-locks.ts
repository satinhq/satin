const queues = new Map<string, Promise<unknown>>()
const readers = new Map<string, number>()

export interface PayloadLease {
  readonly released: Promise<void>
  release(): void
}
export function coordinated(): boolean {
  return !!globalThis.navigator?.locks?.request
}
export async function metadataLock<T>(
  name: string,
  mode: LockMode,
  action: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted()
  if (coordinated()) return navigator.locks.request(name, { mode, signal }, action)
  if (mode === 'shared') return action()
  const previous = queues.get(name) ?? Promise.resolve()
  const result = previous
    .catch(() => {})
    .then(() => {
      signal?.throwIfAborted()
      return action()
    })
  queues.set(name, result)
  try {
    return await result
  } finally {
    if (queues.get(name) === result) queues.delete(name)
  }
}
export function payloadLease(name: string): Promise<PayloadLease> {
  if (!coordinated()) {
    readers.set(name, (readers.get(name) ?? 0) + 1)
    let active = true
    let finish!: () => void
    const released = new Promise<void>(resolve => {
      finish = resolve
    })
    return Promise.resolve({
      released,
      release() {
        if (!active) return
        active = false
        const count = readers.get(name)! - 1
        if (count) readers.set(name, count)
        else readers.delete(name)
        finish()
      },
    })
  }
  let finish!: () => void
  const released = new Promise<void>(resolve => {
    finish = resolve
  })
  return new Promise((resolve, reject) => {
    void navigator.locks
      .request(name, { mode: 'shared' }, async () => {
        let release!: () => void
        const finished = new Promise<void>(done => {
          release = done
        })
        resolve({ release, released })
        await finished
      })
      .then(finish, error => {
        finish()
        reject(error)
      })
  })
}
export async function collectUnleased(name: string, action: () => Promise<void>): Promise<boolean> {
  if (!coordinated()) {
    if (readers.has(name)) return false
    await action()
    return true
  }
  return navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) return false
    await action()
    return true
  })
}
