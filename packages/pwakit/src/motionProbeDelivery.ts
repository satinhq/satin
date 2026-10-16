/** A beacon is a best-effort copy, never an acknowledgement. Full reports remain
 * in the outbox until an ordinary POST succeeds, including across page reloads. */
export class MotionProbeOutbox {
  private records: string[] = []
  private storage?: Pick<Storage, 'getItem' | 'setItem'>
  private key: string
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, key: string) {
    this.storage = storage
    this.key = key
    try {
      this.records = JSON.parse(storage?.getItem(key) ?? '[]') as string[]
    } catch {
      /* storage unavailable */
    }
  }
  get pending() {
    return this.records.length
  }
  save(body: string) {
    // One cumulative report per client replaces that client's older snapshot.
    const client = JSON.parse(body).client
    this.records = this.records.filter(record => JSON.parse(record).client !== client)
    this.records.push(body)
    return this.persist()
  }
  private persist() {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.records))
      return Boolean(this.storage)
    } catch {
      return false
    } // in-memory records remain retryable
  }
  async drain(send: (body: string) => Promise<boolean>) {
    for (const body of [...this.records]) {
      if (!(await send(body))) return false
      this.records = this.records.filter(record => record !== body)
      this.persist()
    }
    return true
  }
}

/** Keep the most recent input and release samples under WebKit's beacon quota.
 * The full report is separately durable; truncation is explicit in the copy. */
export function motionBeacon(body: string, limit = 60 * 1024) {
  const full = JSON.parse(body)
  let count = 120
  while (count >= 1) {
    const compact = {
      version: full.version,
      client: full.client,
      build: full.build,
      glassProfile: full.glassProfile
        ? { ...full.glassProfile, events: full.glassProfile.events.slice(-count) }
        : undefined,
      timeOrigin: full.timeOrigin,
      at: full.at,
      url: full.url,
      visibility: full.visibility,
      delivery: { kind: 'background-beacon', compact: true, fullReportPending: true },
      windows: full.windows
        .slice(-2)
        .map((w: { frames: unknown[]; contactFrames?: unknown[]; inputTimes: number[] }) => ({
          ...w,
          frames: w.frames.slice(-count),
          contactFrames: w.contactFrames?.slice(-count),
          inputTimes: w.inputTimes.slice(-count),
        })),
      navigationGlassFrames: full.navigationGlassFrames?.slice(-count),
      touchSamples: full.touchSamples.slice(-count),
      navigationFrames: full.navigationFrames.slice(-count),
      preparations: full.preparations.slice(-count),
      summaries: full.summaries.slice(-2),
    }
    const blob = new Blob([JSON.stringify(compact)], { type: 'application/json' })
    if (blob.size <= limit) return blob
    count = Math.floor(count / 2)
  }
  return undefined
}
