// This function is serialized into the head. Keep it independent of module loading and React.
export function installLaunchWatchdog(budgetMs: number) {
  let idleVisibleMs = 0
  let previousTime = performance.now()
  let lastBytes = 0
  let lastActivity = 0
  let revealed = false
  let failed = false
  let recordedError = ''
  const showFailure = (reason: string) => {
    if (failed || revealed) return
    failed = true
    const marks = performance
      .getEntriesByType('mark')
      .filter(mark => mark.name.startsWith('satin-'))
    const stage = marks.at(-1)?.name ?? 'satin-document-head'
    console.error('[Satin launch]', reason, 'Last stage:', stage, recordedError)
    const screen = document.createElement('section')
    screen.id = 'satin-launch-error'
    screen.setAttribute('role', 'alert')
    screen.style.cssText =
      'position:fixed;inset:0;z-index:20002;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;box-sizing:border-box;background:var(--satin-launch-background,#f2f2f7);color:var(--satin-launch-ink,#1c1c1e);font:17px/1.45 system-ui;text-align:center;pointer-events:auto'
    const title = document.createElement('h1')
    title.textContent = 'Unable to Open App'
    title.style.cssText = 'font-size:24px;margin:0 0 12px'
    const message = document.createElement('p')
    message.textContent = reason
    message.style.maxWidth = '420px'
    const reached = document.createElement('p')
    reached.textContent = 'Last stage: ' + stage
    reached.style.cssText = 'font-size:13px;opacity:.65;overflow-wrap:anywhere'
    const retry = document.createElement('button')
    retry.textContent = 'Retry'
    retry.style.cssText =
      'font:600 17px system-ui;color:#007aff;background:transparent;border:0;padding:16px 32px;min-height:44px'
    retry.onclick = () => {
      const definition = (window as typeof window & { __SATIN_DEFINITION__?: { scope: string } })
        .__SATIN_DEFINITION__
      try {
        sessionStorage.setItem('satin-install-reset:' + (definition?.scope ?? '/'), '1')
      } catch {
        // A reload can still join the worker after its own deadline.
      }
      location.reload()
    }
    screen.append(title, message, reached, retry)
    // A stalled document can reach this deadline before its body arrives. Paint
    // the failure from the existing document root instead of waiting on parsing.
    ;(document.body ?? document.documentElement).append(screen)
    if (!document.body) {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          if (screen.isConnected) document.body?.append(screen)
        },
        { once: true },
      )
    }
    const cover = document.getElementById('satin-launch-screen')
    const controller = (
      window as Window & {
        __SATIN_LAUNCH_SCREEN__?: { fail(onRetired: () => void): void; restore(): void }
      }
    ).__SATIN_LAUNCH_SCREEN__
    const ring = document.getElementById('satin-launch-progress')
    if (cover && ring && !ring.hasAttribute('hidden') && controller) {
      // Put the failure underneath the cover until its visible arc completes.
      screen.style.zIndex = '19999'
      controller.fail(() => {
        if (failed) screen.style.zIndex = '20002'
      })
    } else if (cover) cover.hidden = true
    performance.mark('satin-launch-failed')
  }
  window.addEventListener('error', event => {
    recordedError = event.message || 'Application script failed to load.'
  })
  window.addEventListener('unhandledrejection', event => {
    recordedError = event.reason instanceof Error ? event.reason.message : String(event.reason)
  })
  window.addEventListener('satin-glass-error', event => {
    const error = (event as CustomEvent<{ code: string; message: string }>).detail
    recordedError = error.code + ': ' + error.message
    showFailure('Glass could not start: ' + error.code + '.')
  })
  const recover = () => {
    const restoreCover = failed
    failed = false
    document.getElementById('satin-launch-error')?.remove()
    const cover = document.getElementById('satin-launch-screen')
    // The runtime owns normal ring settlement and cover retirement. Only undo
    // the cover hiding performed by this watchdog's own failure screen.
    if (cover && restoreCover) {
      const controller = (
        window as Window & {
          __SATIN_LAUNCH_SCREEN__?: { restore(): void }
        }
      ).__SATIN_LAUNCH_SCREEN__
      if (controller) controller.restore()
      else cover.hidden = false
    }
  }
  const receiveProgress = (progress: { loaded: number; activity?: number } | null) => {
    if (progress && (progress.loaded > lastBytes || (progress.activity ?? 0) > lastActivity)) {
      lastBytes = progress.loaded
      lastActivity = progress.activity ?? 0
      idleVisibleMs = 0
      previousTime = performance.now()
      recover()
    } else if (!progress) {
      lastBytes = 0
      lastActivity = 0
    }
  }
  window.addEventListener('satin-launch-progress', event => {
    receiveProgress((event as CustomEvent<{ loaded: number } | null>).detail)
  })
  // Keep message order when two diagnostics arrive within the same millisecond.
  window.addEventListener('satin-worker-lookup-error', event => {
    showFailure(String((event as CustomEvent<string>).detail))
  })
  let lastInstallationTime = 0
  // Listen in the head, before a bootstrap module can start downloading.
  navigator.serviceWorker?.addEventListener('message', event => {
    const worker = event.source as ServiceWorker | null
    const definition = (window as Window & { __SATIN_DEFINITION__?: { scope: string } })
      .__SATIN_DEFINITION__
    const expected = new URL((definition?.scope ?? '/') + 'sw.js', location.href).href
    if (worker?.scriptURL !== expected) return
    const progress = event.data
    if (progress?.type === 'SATIN_INSTALL_FAILURE') {
      console.error('[Satin installation]', progress.url, progress.reason)
      lastInstallationTime = Math.max(Date.now(), lastInstallationTime + 1)
      const failure = { ...progress, recordedAt: lastInstallationTime }
      try {
        localStorage.setItem(
          'satin-install-failure:' + (definition?.scope ?? '/'),
          JSON.stringify(failure),
        )
        localStorage.setItem(
          'satin-install-failure:' + (definition?.scope ?? '/') + ':build:' + progress.buildId,
          JSON.stringify(failure),
        )
      } catch {
        /* Diagnostics remain available in the console if storage is unavailable. */
      }
      window.dispatchEvent(new Event('satin-install-diagnostics'))
      // A replacement install is optional. The current scoped controller
      // serves a successfully installed bundle even while the cover is shown.
      const cachedController = navigator.serviceWorker?.controller
      if (!revealed && cachedController?.scriptURL !== expected) {
        showFailure(
          progress.stalled
            ? 'The server stopped responding. Resource: ' + progress.url + '. Please retry.'
            : progress.networkFailure
              ? 'Check your connection and try again. Resource: ' + progress.url
              : 'Could not prepare ' +
                progress.url +
                ': ' +
                progress.reason +
                '. Deploy the complete matching build, then retry.',
        )
      }
      return
    }
    if (progress?.type === 'SATIN_INSTALL_SUCCESS' && typeof progress.buildId === 'string') {
      lastInstallationTime = Math.max(Date.now(), lastInstallationTime + 1)
      // Clear the previous failure even if quota prevents writing the success record.
      try {
        localStorage.removeItem('satin-install-failure:' + (definition?.scope ?? '/'))
      } catch {
        /* A newer success record can still supersede a failure that could not be removed. */
      }
      try {
        localStorage.setItem(
          'satin-install-success:' + (definition?.scope ?? '/'),
          JSON.stringify({ buildId: progress.buildId, recordedAt: lastInstallationTime }),
        )
      } catch {
        /* A successful install remains usable when storage is unavailable. */
      }
      window.dispatchEvent(new Event('satin-install-diagnostics'))
      return
    }
    if (
      progress?.type === 'SATIN_DOWNLOAD_PROGRESS' &&
      progress.downloading &&
      Number.isFinite(progress.loaded) &&
      progress.loaded >= 0
    ) {
      receiveProgress(progress)
      // A first install can download before the application module is available.
      // Controlled documents are cached launches/updates and keep their existing policy.
      if (!navigator.serviceWorker?.controller && !revealed)
        (
          window as unknown as { __SATIN_LAUNCH_SCREEN__?: { progress(value: unknown): void } }
        ).__SATIN_LAUNCH_SCREEN__?.progress(progress)
    }
  })
  // A client's worker messages are queued until DOMContentLoaded, and a bootstrap module that
  // never finishes holds DOMContentLoaded back: the worker's "this resource stalled" message
  // would then never arrive. Open the queue now that the listener exists.
  navigator.serviceWorker?.startMessages?.()
  window.addEventListener('satin-launch-revealed', () => {
    revealed = true
    recover()
    clearInterval(timer)
  })
  document.addEventListener('visibilitychange', () => {
    previousTime = performance.now()
  })
  const timer = setInterval(() => {
    const now = performance.now()
    if (!document.hidden) idleVisibleMs += now - previousTime
    previousTime = now
    if (idleVisibleMs >= budgetMs) {
      showFailure(
        recordedError
          ? 'Launch failed. ' + recordedError.split('\n')[0]!.slice(0, 160)
          : 'Launch stopped making progress. Please retry.',
      )
    }
  }, 250)
}
