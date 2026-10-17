import { lagMark, lagTraceEnabled } from './lagTrace.ts'

/** Wall-time evidence, in a common epoch across the main thread and worker.
 * Queue completion is not compositor presentation or scanout. No idle sampler. */
export type GlassTiming = {
  stage: string
  realm: 'main' | 'worker'
  at: number
  ms: number
  detail?: string
  error?: string
}
const events: GlassTiming[] = [],
  startup: GlassTiming[] = []
const totals = new Map<string, { count: number; ms: number; maxMs: number }>()
let firstPresent: GlassTiming | undefined, firstReady: GlassTiming | undefined
let presented = false,
  sink: ((event: GlassTiming) => void) | undefined
let sinkEnabled = () => true
export const glassNow = () => performance.timeOrigin + performance.now()
export function receiveGlassTiming(event: GlassTiming) {
  // The page's lag trace keeps every timing event of both realms (worker events arrive here too).
  if (lagTraceEnabled() && typeof document !== 'undefined')
    lagMark({
      stage: `${event.realm}:${event.stage}`,
      at: event.at,
      ms: event.ms,
      values: { detail: event.detail, error: event.error },
    })
  events.push(event)
  if (events.length > 240) events.shift()
  if (!presented && startup.length < 160) startup.push(event)
  if (event.stage === 'first-present-complete') {
    presented = true
    firstPresent ??= event
  }
  if (event.stage === 'production-prepared') firstReady ??= event
  const key = event.realm + ':' + event.stage,
    t = totals.get(key) ?? { count: 0, ms: 0, maxMs: 0 }
  t.count++
  t.ms += event.ms
  t.maxMs = Math.max(t.maxMs, event.ms)
  totals.set(key, t)
}
const frameSummaries: unknown[] = []
/** Worker frame summaries (per interaction kind), newest last; see frameProbe.ts. */
export function receiveGlassFrames(summaries: readonly unknown[]) {
  frameSummaries.push(...summaries)
  if (frameSummaries.length > 40) frameSummaries.splice(0, frameSummaries.length - 40)
}
export function setGlassTimingSink(
  next: ((event: GlassTiming) => void) | undefined,
  enabled: () => boolean = () => true,
) {
  sink = next
  sinkEnabled = enabled
}
export function glassTiming(
  stage: string,
  at = glassNow(),
  detail?: string | (() => string),
  error?: unknown,
) {
  const send = !!sink && sinkEnabled()
  const detailed = send || lagTraceEnabled()
  const event: GlassTiming = {
    stage,
    at,
    ms: glassNow() - at,
    realm: typeof document === 'undefined' ? 'worker' : 'main',
    detail: typeof detail === 'function' ? (detailed ? detail() : undefined) : detail,
    error: error === undefined ? undefined : String(error),
  }
  receiveGlassTiming(event)
  if (send) sink?.(event)
}
/** Start of a stage that is timed only for the lag trace: no clock read when the trace is off. */
export const traceStageStart = () => (lagTraceEnabled() ? glassNow() : 0)
/** Record a lag-trace-only stage started with `traceStageStart`. Nothing is built or kept when the trace is off. */
export function traceStage(stage: string, started: number, detail?: () => string) {
  if (lagTraceEnabled()) glassTiming(stage, started, detail)
}
export function glassTimed<T>(stage: string, work: () => T, detail?: string | (() => string)): T {
  const at = glassNow()
  try {
    const value = work()
    glassTiming(stage, at, detail)
    return value
  } catch (error) {
    glassTiming(stage, at, detail, error)
    throw error
  }
}
export async function glassTimedAsync<T>(
  stage: string,
  work: () => Promise<T>,
  detail?: string | (() => string),
): Promise<T> {
  const at = glassNow()
  try {
    const value = await work()
    glassTiming(stage, at, detail)
    return value
  } catch (error) {
    glassTiming(stage, at, detail, error)
    throw error
  }
}
export function glassProfile() {
  return {
    firstPresent,
    firstReady,
    startup,
    events,
    frames: frameSummaries,
    totals: Object.fromEntries(totals),
    boundary:
      'Wall time; RPC includes queueing, upload is CPU enqueue, GPU completion excludes compositor/scanout.',
  }
}
