// Bound presentation readiness. Expiration is a visible error, never a material substitution.
export const GLASS_LAUNCH_BUDGET_MS = 2_500

/** Bound idle preparation by visible time. Suspension pauses the remaining
 * budget; download progress resets it. A timeout is terminal until Retry. */
export function armPreparationBudget(
  expire: () => void,
  lastProgress: () => number,
  doc: Document = document,
) {
  let idleVisibleMs = 0
  let previousTime = performance.now()
  let previousProgress = lastProgress()
  let visible = doc.visibilityState === 'visible'
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  const dispose = () => {
    disposed = true
    clearInterval(timer)
    doc.removeEventListener('visibilitychange', visibilityChanged)
  }
  const update = () => {
    if (disposed) return
    const now = performance.now()
    const progress = lastProgress()
    if (progress > previousProgress) {
      idleVisibleMs = 0
      previousTime = Math.max(previousTime, progress)
      previousProgress = progress
    }
    if (visible) idleVisibleMs += now - previousTime
    previousTime = now
    visible = doc.visibilityState === 'visible'
    if (visible && idleVisibleMs >= 30_000) {
      dispose()
      expire()
    }
  }
  const visibilityChanged = () => {
    update()
    clearInterval(timer)
    timer = undefined
    if (visible && !disposed) timer = setInterval(update, 1000)
  }
  doc.addEventListener('visibilitychange', visibilityChanged)
  if (visible) timer = setInterval(update, 1000)
  return dispose
}

export function glassLaunchTimedOut(prepared: boolean, glassReady: boolean, elapsedMs: number) {
  return prepared && !glassReady && elapsedMs >= GLASS_LAUNCH_BUDGET_MS
}

/** Run `expire` once the page has been visible for `budgetMs` without interruption.
 * A hidden page cannot present (WebKit defers its GPU work), so hidden time never
 * counts; each return to visible starts a fresh budget. Returns a disposer. */
export function armVisibleLaunchBudget(
  expire: () => void,
  budgetMs = GLASS_LAUNCH_BUDGET_MS,
  doc: Document = document,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    clearTimeout(timer)
    timer = undefined
    if (doc.visibilityState === 'visible')
      timer = setTimeout(() => {
        timer = undefined
        if (doc.visibilityState === 'visible') expire()
      }, budgetMs)
  }
  arm()
  doc.addEventListener('visibilitychange', arm)
  return () => {
    clearTimeout(timer)
    doc.removeEventListener('visibilitychange', arm)
  }
}
