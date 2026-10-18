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
    const controller = (
      window as Window & {
        __SATIN_PRELAUNCH__?: {
          error(reason: string, title?: string, retry?: () => void, detail?: string): void
        }
      }
    ).__SATIN_PRELAUNCH__
    controller?.error(reason, 'Unable to Open App', undefined, 'Last stage: ' + stage)
    performance.mark('satin-launch-failed')
  }
  window.addEventListener(
    'error',
    event => {
      const target = event.target
      if (target instanceof HTMLLinkElement && target.rel === 'stylesheet') {
        target.dataset.satinStyleError = 'true'
        showFailure('App stylesheet failed to load. Retry.')
      } else if (target instanceof HTMLScriptElement) {
        showFailure('The application script failed to load. Please retry.')
      } else if (event instanceof ErrorEvent) {
        recordedError = event.message || 'Application script failed to load.'
        showFailure('Launch failed. ' + recordedError.split('\n')[0]!.slice(0, 160))
      }
    },
    true,
  )
  window.addEventListener('unhandledrejection', event => {
    recordedError = event.reason instanceof Error ? event.reason.message : String(event.reason)
    showFailure('Launch failed. ' + recordedError.split('\n')[0]!.slice(0, 160))
  })
  window.addEventListener('satin-glass-error', event => {
    const error = (event as CustomEvent<{ code: string; message: string; fallback?: true }>).detail
    recordedError = error.code + ': ' + error.message
    // Release apps draw the fallback material instead (e.g. iOS without WebGPU).
    if (error.fallback) return
    showFailure('Glass could not start: ' + error.code + '.')
  })
  const recover = () => {
    failed = false
    ;(
      window as Window & { __SATIN_PRELAUNCH__?: { recover(): void } }
    ).__SATIN_PRELAUNCH__?.recover()
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
          window as unknown as { __SATIN_PRELAUNCH__?: { progress(value: unknown): void } }
        ).__SATIN_PRELAUNCH__?.progress(progress)
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
