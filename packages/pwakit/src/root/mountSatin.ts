import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type RootOptions } from 'react-dom/client'
import { launchErrorLayer } from '../app/launchScreen.ts'

/** Mount once from the app entry point, after resolving its initial screen.
 * The first commit runs in this task so installed WebKit cannot defer it behind
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
  performance.mark('satin-mount-start')
  flushSync(() => root.render(content))
  performance.mark('satin-mount-committed')
  return root
}

/** An uncaught render or effect error unmounts the whole app. Without this the launch cover
 * (or a blank page) stays up forever and the failure is invisible; say what failed instead,
 * above the launch cover, with the same presentation as a failed launch. */
export function showAppFailure(error: unknown) {
  performance.mark('satin-app-failed')
  document.querySelector('[data-satin-app-failure]')?.remove()
  const panel = document.createElement('div')
  panel.dataset.satinRole = 'chrome'
  panel.dataset.satinLaunchError = 'true'
  panel.dataset.satinAppFailure = 'true'
  panel.setAttribute('role', 'alert')
  panel.style.zIndex = String(launchErrorLayer)
  const message = document.createElement('div')
  message.className = 'satin-launch-error-message'
  const title = document.createElement('h1')
  title.textContent = 'App Failed to Start'
  const detail = document.createElement('pre')
  detail.style.whiteSpace = 'pre-wrap'
  detail.style.overflowWrap = 'anywhere'
  detail.textContent = error instanceof Error ? error.message : String(error)
  const reload = document.createElement('button')
  reload.type = 'button'
  reload.textContent = 'Reload'
  reload.addEventListener('click', () => window.location.reload())
  message.append(title, detail, reload)
  const icon = document.querySelector<HTMLImageElement>(
    '#satin-launch-screen .satin-launch-icon img',
  )
  if (icon?.src) {
    const image = document.createElement('img')
    image.className = 'satin-launch-error-icon'
    image.src = icon.src
    image.alt = ''
    panel.append(image)
  }
  panel.append(message)
  document.body.append(panel)
}
