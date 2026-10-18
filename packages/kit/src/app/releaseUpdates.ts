import { watchBackgroundUpdates } from './backgroundUpdate.ts'
import { prepareColdLaunchUpdate } from './coldLaunchUpdate.ts'

export const RELAUNCH_AFTER_MS = 15 * 60_000

/** Once launch reveals the app, only suspension may replace its document.
 * A late download stays ready for that boundary instead of flashing visible
 * content back to the launch cover, even before the user's first input. */
export function watchReleaseUpdates(scope: string, canApply: () => boolean) {
  let disposed = false
  let checking = false
  let hidden = document.hidden
  let hiddenAt = hidden ? Date.now() : null
  let relaunching = false
  let boundary = 0
  let retryBoundary = false
  const attempt = () => {
    if (disposed || relaunching || checking || !document.hidden || !canApply()) return
    const startedAt = boundary
    const safe = () =>
      !disposed && !relaunching && startedAt === boundary && document.hidden && canApply()
    checking = true
    void prepareColdLaunchUpdate(scope, () => {}, {
      background: true,
      canActivate: safe,
    }).finally(() => {
      checking = false
      // A claim/check from the previous boundary may finish after visibility
      // changes. Retry that new boundary once, never loop on a denied worker.
      if (retryBoundary) {
        retryBoundary = false
        attempt()
      }
    })
  }
  const visibilityChanged = () => {
    if (hidden !== document.hidden) {
      const suspendedFor = hiddenAt === null ? 0 : Date.now() - hiddenAt
      hidden = document.hidden
      hiddenAt = hidden ? Date.now() : null
      boundary++
      // A long suspension is a new launch, even when WebKit retained the page.
      // Reload immediately at this boundary; never wait for a visible download
      // and then replace content the user has started using.
      if (!hidden && suspendedFor >= RELAUNCH_AFTER_MS && canApply()) {
        relaunching = true
        window.location.reload()
        return
      }
      if (checking) retryBoundary = true
    }
    attempt()
  }
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('pagehide', visibilityChanged)
  const stopChecks = watchBackgroundUpdates(scope, attempt)
  attempt()
  return {
    attempt,
    dispose() {
      disposed = true
      stopChecks()
      document.removeEventListener('visibilitychange', visibilityChanged)
      window.removeEventListener('pagehide', visibilityChanged)
    },
  }
}
