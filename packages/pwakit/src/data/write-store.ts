import { valueEqual } from './value-equal.ts'
type Row = Record<string, unknown>
export type Tables = Record<string, Map<string, Row>>
export type Change = (tables: Tables) => void
/** A durable write that failed after it was published to memory, reported to `db.onError`. */
export interface WriteFailure {
  readonly database: string
  readonly error: Error
}

export function copyTables(tables: Tables): Tables {
  return Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, new Map(rows)]))
}

/** One optimistic journal per database handle; IndexedDB serializes durable commits across handles. */
export class WriteStore {
  tables: Tables
  ready = false
  error?: Error
  private durable: Tables
  private pending: { changes: Change[]; operations: Change[]; cancelled?: Error }[] = []
  private tail: Promise<unknown> = Promise.resolve()
  private loading?: Promise<void>
  private errors = new Set<(failure: WriteFailure) => void>()
  private channel?: BroadcastChannel

  private name: string
  private read: () => Promise<Tables>
  private persist: (changes: Change[]) => Promise<Tables>
  private notify: () => void

  constructor(
    name: string,
    names: string[],
    read: () => Promise<Tables>,
    persist: (changes: Change[]) => Promise<Tables>,
    notify: () => void,
  ) {
    this.name = name
    this.read = read
    this.persist = persist
    this.notify = notify
    this.tables = Object.fromEntries(names.map(name => [name, new Map()]))
    this.durable = this.tables
    this.connect()
  }

  private connect() {
    if (!this.channel && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`satin-data:${this.name}`)
      this.channel.onmessage = () => {
        void this.refresh().catch(() => {})
      }
    }
  }

  private publish() {
    let next = copyTables(this.durable)
    let cancelled: Error | undefined
    for (const entry of this.pending) {
      if (cancelled) entry.cancelled = cancelled
      if (entry.cancelled) continue
      const candidate = copyTables(next)
      try {
        for (const change of entry.changes) change(candidate)
        next = candidate
      } catch (error) {
        cancelled = error instanceof Error ? error : new Error(String(error))
        entry.cancelled = cancelled
      }
    }
    const changed = !valueEqual(this.tables, next)
    this.tables = next
    if (changed) this.notify()
  }

  before(operations: Change[]): Tables {
    const snapshot = copyTables(this.durable)
    for (const entry of this.pending) {
      if (entry.operations === operations) break
      if (!entry.cancelled) for (const change of entry.changes) change(snapshot)
    }
    return snapshot
  }

  load(): Promise<void> {
    this.connect()
    if (this.ready) return Promise.resolve()
    if (!this.loading)
      this.loading = this.refresh().finally(() => {
        this.loading = undefined
      })
    return this.loading
  }

  refresh(): Promise<void> {
    const result = this.tail.then(async () => {
      this.durable = await this.read()
      this.ready = true
      this.error = undefined
      this.publish()
    })
    this.tail = result.catch(error => {
      this.error = error instanceof Error ? error : new Error(String(error))
      this.notify()
    })
    return result
  }

  write(changes: Change[], preparation?: Promise<unknown>): Promise<void> {
    this.connect()
    const entry: { changes: Change[]; operations: Change[]; cancelled?: Error } = {
      changes: preparation ? [] : changes,
      operations: changes,
    }
    // Validate against a detached snapshot before accepting the write.
    const next = copyTables(this.tables)
    try {
      for (const change of entry.changes) change(next)
    } catch (error) {
      return this.failure(error)
    }
    if (preparation) void preparation.catch(() => {})
    this.pending.push(entry)
    this.tables = next
    if (!preparation) this.notify()
    const result = this.tail.then(async () => {
      if (entry.cancelled) {
        const index = this.pending.indexOf(entry)
        if (index >= 0) this.pending.splice(index, 1)
        throw entry.cancelled
      }
      try {
        if (preparation) {
          await preparation
          entry.changes = changes
          this.publish()
          if (entry.cancelled) throw entry.cancelled
        }
        this.durable = await this.persist(changes)
        this.ready = true
        this.error = undefined
        this.pending.splice(this.pending.indexOf(entry), 1)
        this.publish()
        try {
          this.channel?.postMessage(null)
        } catch (error) {
          console.error(
            'Satin cross-context notification failed; foreground refresh remains available',
            error,
          )
        }
      } catch (error) {
        const failure = new Error(`Write cancelled after a failed predecessor: ${String(error)}`)
        for (const pending of this.pending) pending.cancelled = failure
        this.pending = []
        this.publish()
        throw error
      }
    })
    this.tail = result.catch(() => {})
    // Attaching the reporter observes fire-and-forget promises without swallowing their rejection.
    void result.catch(error => this.report(error))
    return result
  }

  private report(value: unknown) {
    const error = value instanceof Error ? value : new Error(String(value))
    this.error = error
    console.error(
      `Satin database ${this.name}: write failed; optimistic changes rolled back`,
      error,
    )
    for (const listener of this.errors) {
      try {
        listener({ database: this.name, error })
      } catch (observerError) {
        console.error('Satin data error observer failed', observerError)
      }
    }
    this.notify()
  }

  failure(error: unknown): Promise<never> {
    const result = Promise.reject<never>(error)
    void result.catch(value => this.report(value))
    return result
  }

  onError(listener: (failure: WriteFailure) => void): () => void {
    this.errors.add(listener)
    return () => {
      this.errors.delete(listener)
    }
  }

  async settled(): Promise<void> {
    await this.tail
    if (this.error) throw this.error
  }
  close() {
    this.channel?.close()
    this.channel = undefined
    this.ready = false
  }
}
