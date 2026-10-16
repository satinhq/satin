/** Shared terminal budget for a visible glass presentation, including source preparation. */
export const GLASS_READINESS_BUDGET_MS = 10_000

/** A fixed budget of foreground time; backgrounding cannot turn a stalled
 * renderer into a false readiness failure. Cancel also removes the listener. */
export class VisibleDeadline {
  private timer: ReturnType<typeof setTimeout> | undefined
  private since = 0
  private spent = 0
  private active = false
  private visible = true
  private budgetMs: number
  private expired: () => void
  constructor(budgetMs: number, expired: () => void) {
    this.budgetMs = budgetMs
    this.expired = expired
  }
  get pending() {
    return this.active
  }
  /** Region visibility shares the document's budget; neither kind of hiding resets it. */
  setVisible(visible: boolean) {
    this.visible = visible
    this.visibility()
  }
  start() {
    if (this.active) return
    this.active = true
    this.spent = 0
    document.addEventListener('visibilitychange', this.visibility)
    this.resume()
  }
  cancel() {
    this.active = false
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    document.removeEventListener('visibilitychange', this.visibility)
  }
  private resume() {
    if (
      !this.active ||
      !this.visible ||
      this.timer !== undefined ||
      document.visibilityState !== 'visible'
    )
      return
    this.since = performance.now()
    this.timer = setTimeout(
      () => {
        this.cancel()
        this.expired()
      },
      Math.max(0, this.budgetMs - this.spent),
    )
  }
  private visibility = () => {
    if (this.visible && document.visibilityState === 'visible') this.resume()
    else if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
      this.spent += performance.now() - this.since
    }
  }
}
