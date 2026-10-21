// This function is serialized into the head. Keep it independent of module loading and React.
export function installLaunchWatchdog(budgetMs: number) {
  // A pending request is not evidence of a failed script. Give bootstrap requests
  // a separate visible-time ceiling; a deadline reports uncertainty, not a network cause.
  const scriptCeilingMs = 60_000
  const loadedScripts = new WeakSet<HTMLScriptElement>()
  let launchVisibleMs = 0
  let failureKind: 'recoverable' | 'fatal' = 'recoverable'
  const pendingScript = () =>
    [...document.querySelectorAll<HTMLScriptElement>('script[src]')].some(
      script => !script.hasAttribute('data-satin-launch-optional') && !loadedScripts.has(script),
    )
  let idleVisibleMs = 0
  let previousTime = performance.now()
  let lastBytes = 0
  let lastActivity = 0
  let revealed = false
  let failed = false
  let recordedError = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let visible = !document.hidden
  let pageHidden = false
  const stopDeadline = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const armDeadline = () => {
    stopDeadline()
    if (revealed || failed || document.hidden || pageHidden) return
    const waitingForScript = pendingScript()
    const elapsed = performance.now() - previousTime
    timer = setTimeout(
      () => {
        timer = undefined
        if (document.hidden || pageHidden) return
        if (pendingScript()) {
          if (launchVisibleMs + performance.now() - previousTime < scriptCeilingMs) {
            armDeadline()
            return
          }
          showFailure('The app script has not finished loading. Try again.')
          return
        }
        showFailure(
          recordedError
            ? 'Launch failed. ' + recordedError.split('\n')[0]!.slice(0, 160)
            : 'Launch stopped making progress. Please retry.',
        )
      },
      Math.max(
        0,
        waitingForScript
          ? scriptCeilingMs - launchVisibleMs - elapsed
          : budgetMs - idleVisibleMs - elapsed,
      ),
    )
  }
  const showFailure = (reason: string, kind: 'recoverable' | 'fatal' = 'recoverable') => {
    if (revealed || (failed && (failureKind === 'fatal' || kind === 'recoverable'))) return
    failed = true
    failureKind = kind
    stopDeadline()
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
  // Script load/error events are receipts for this document's actual elements.
  // Generated auxiliary data is explicitly optional; ordinary scripts remain required.
  type ScriptInput = { type: 'loaded' | 'failed' | 'aborted'; script: HTMLScriptElement }
  const receiveScript = ({ type, script }: ScriptInput) => {
    if (revealed || script.hasAttribute('data-satin-launch-optional')) return
    if (type !== 'loaded') {
      showFailure(
        type === 'aborted'
          ? 'The app script download was interrupted. Try again.'
          : 'The app script could not load. Check your connection and try again.',
        'fatal',
      )
      return
    }
    loadedScripts.add(script)
    const now = performance.now()
    if (visible) launchVisibleMs += now - previousTime
    previousTime = now
    idleVisibleMs = 0
    armDeadline()
  }
  const scriptLoaded = (event: Event) => {
    if (event.target instanceof HTMLScriptElement)
      receiveScript({ type: 'loaded', script: event.target })
  }
  const scriptAborted = (event: Event) => {
    if (event.target instanceof HTMLScriptElement)
      receiveScript({ type: 'aborted', script: event.target })
  }
  window.addEventListener('load', scriptLoaded, true)
  window.addEventListener('abort', scriptAborted, true)
  window.addEventListener(
    'error',
    event => {
      const target = event.target
      if (target instanceof HTMLLinkElement && target.rel === 'stylesheet') {
        target.dataset.satinStyleError = 'true'
        showFailure('App stylesheet failed to load. Retry.', 'fatal')
      } else if (target instanceof HTMLScriptElement) {
        receiveScript({ type: 'failed', script: target })
      } else if (event instanceof ErrorEvent) {
        recordedError = event.message || 'Application script failed to load.'
        showFailure('Launch failed. ' + recordedError.split('\n')[0]!.slice(0, 160), 'fatal')
      }
    },
    true,
  )
  window.addEventListener('unhandledrejection', event => {
    recordedError = event.reason instanceof Error ? event.reason.message : String(event.reason)
    showFailure('Launch failed. ' + recordedError.split('\n')[0]!.slice(0, 160), 'fatal')
  })
  window.addEventListener('satin-glass-error', event => {
    const error = (event as CustomEvent<{ code: string; message: string; fallback?: true }>).detail
    recordedError = error.code + ': ' + error.message
    // Release apps draw the fallback material instead (e.g. iOS without WebGPU).
    if (error.fallback) return
    showFailure('Glass could not start: ' + error.code + '.')
  })
  const recover = () => {
    if (failureKind === 'fatal' && !revealed) return
    failed = false
    ;(
      window as Window & { __SATIN_PRELAUNCH__?: { recover(): void } }
    ).__SATIN_PRELAUNCH__?.recover()
  }

  const receiveProgress = (progress: { loaded: number; activity?: number } | null) => {
    if (revealed) return
    if (progress && (progress.loaded > lastBytes || (progress.activity ?? 0) > lastActivity)) {
      lastBytes = progress.loaded
      lastActivity = progress.activity ?? 0
      idleVisibleMs = 0
      const now = performance.now()
      if (visible) launchVisibleMs += now - previousTime
      previousTime = now
      recover()
      armDeadline()
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
  const visibilityChanged = (event?: Event) => {
    if (event?.type === 'pagehide') pageHidden = true
    if (event?.type === 'pageshow') pageHidden = false
    const now = performance.now()
    if (visible) {
      idleVisibleMs += now - previousTime
      launchVisibleMs += now - previousTime
    }
    previousTime = now
    visible = !document.hidden && !pageHidden
    armDeadline()
  }
  window.addEventListener('satin-launch-revealed', () => {
    revealed = true
    recover()
    stopDeadline()
    window.removeEventListener('load', scriptLoaded, true)
    window.removeEventListener('abort', scriptAborted, true)
    document.removeEventListener('visibilitychange', visibilityChanged)
    window.removeEventListener('pagehide', visibilityChanged)
    window.removeEventListener('pageshow', visibilityChanged)
  })
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('pagehide', visibilityChanged)
  window.addEventListener('pageshow', visibilityChanged)
  armDeadline()
}
