/** Opt-in lag trace: per-stage marks on the main thread and in the glass worker, for diagnosing
 * where a tab entry, a scroll or a menu run spends its time.
 *
 * Off (the default) nothing is stored and every call site is one boolean test: callers guard the
 * mark with `lagTraceEnabled()` so the mark object is never built. Each realm (page, worker) keeps
 * its own marks; the page enables its renderer with a `lag-trace` request. A renderer that runs in
 * the document shares the page's realm, so there is one list: the renderer's marks are the ones
 * whose stage starts with `worker-`.
 *
 * Enable before the app boots: `globalThis.__SATIN_LAG_TRACE__ = true`. */
export type LagMark = {
  stage: string
  /** Page epoch milliseconds (performance.timeOrigin + performance.now()). */
  at: number
  /** Duration of the stage, when it has one. */
  ms?: number
  /** The main thread's scroll event this mark belongs to. */
  sequence?: number
  values?: Record<string, number | string | boolean | null | undefined>
}

const MARK_LIMIT = 60000
const marks: LagMark[] = []
let enabled = false

/** Whether the page asked for a lag trace before boot. */
export const lagTraceRequested = () =>
  (globalThis as { __SATIN_LAG_TRACE__?: unknown }).__SATIN_LAG_TRACE__ === true

export const lagTraceEnabled = () => enabled

export function setLagTrace(value: boolean) {
  enabled = value
  if (!value) marks.length = 0
}

/** Whether the trace still has room (a long session stops recording, it never grows without bound). */
export const lagTraceHasRoom = () => marks.length < MARK_LIMIT

/** Record a mark. Call only inside `if (lagTraceEnabled())`. Returns the mark, so a caller can
 * complete it when an asynchronous stage (a GPU fence) resolves. */
export function lagMark(mark: LagMark) {
  if (lagTraceHasRoom()) marks.push(mark)
  return mark
}

/** Every mark recorded in this realm so far (oldest first). */
export const lagMarks = (): readonly LagMark[] => marks
