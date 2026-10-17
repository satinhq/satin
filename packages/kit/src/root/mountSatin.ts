import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type RootOptions } from 'react-dom/client'
import { prelaunchController, showLaunchFailure } from '../app/launchScreenRuntime.ts'

/** Mount once from the app entry point, after resolving its initial screen.
 * After managed styles load, the first commit runs synchronously so WebKit cannot defer it behind
 * its launch presentation. Later updates retain React's normal scheduling.
 * Do not call from a component or an effect, or suspend the initial screen.
 */
export function mountSatin(
  container: Element | DocumentFragment,
  content: ReactNode,
  options?: RootOptions,
) {
  const root = createRoot(container, {
    ...options,
    onUncaughtError: (error, info) => {
      showAppFailure(error)
      if (options?.onUncaughtError) options.onUncaughtError(error, info)
      else reportError(error)
    },
  })
  let disposed = false
  const unmount = root.unmount.bind(root)
  root.unmount = () => {
    disposed = true
    unmount()
  }
  const commit = () => {
    if (disposed) return
    performance.mark('satin-mount-start')
    flushSync(() => root.render(content))
    performance.mark('satin-mount-committed')
  }
  // A glass renderer cannot measure or present an unstyled React tree. The
  // independent head environment owns this wait, including any load failure.
  if (document.querySelector('link[data-satin-style]')) {
    void prelaunchController().stylesReady().then(commit, error => {
      if (!disposed) showLaunchFailure(error instanceof Error ? error.message : String(error))
    })
  } else commit()
  return root
}

/** An uncaught render or effect error unmounts the whole app. Without this the launch cover
 * (or a blank page) stays up forever and the failure is invisible; say what failed instead,
 * above the launch cover, with the same presentation as a failed launch. */
export function showAppFailure(error: unknown) {
  performance.mark('satin-app-failed')
  showLaunchFailure(error instanceof Error ? error.message : String(error), 'App Failed to Start')
}
