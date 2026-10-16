import { watchBackgroundUpdates } from './backgroundUpdate.ts'
import { prepareColdLaunchUpdate } from './coldLaunchUpdate.ts'

/** Once launch reveals the app, only suspension may replace its document.
 * A late download stays ready for that boundary instead of flashing visible
 * content back to the launch cover, even before the user's first input. */
export function watchReleaseUpdates(scope: string, canApply: () => boolean) {
  let disposed = false
  let checking = false
  let hidden = document.hidden
  let boundary = 0
  let retryBoundary = false
  const attempt = () => {
    if (disposed || checking || !document.hidden || !canApply()) return
    const startedAt = boundary
    const safe = () => !disposed && startedAt === boundary && document.hidden && canApply()
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
      hidden = document.hidden
      boundary++
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
