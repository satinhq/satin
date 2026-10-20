import type { DownloadProgress } from './launchScreen.ts'
import { prepareDestinationImages } from '../image/resource.ts'

/** Resolves only after the worker has atomically installed the complete bundle.
 * An existing active worker is sufficient offline; never await an update fetch. */
export async function prepareOfflineBundle(
  scope: string,
  timeoutMs = 20_000,
  onProgress?: (progress: DownloadProgress | null) => void,
): Promise<boolean> {
  const online = navigator.onLine
  if (!('serviceWorker' in navigator)) {
    if (online === false)
      throw new Error(
        'Connect to open this app. Offline installation is unavailable in this browser.',
      )
    performance.mark('satin-connected-only-launch')
    console.info(
      'Satin: service workers are unavailable; launching connected-only. Offline launch is not available on this origin.',
    )
    performance.mark('satin-launch-connected-only')
    return true
  }
  const { existing, expectedScript } = await findOwnRegistration(scope)
  // Updates are optional. The worker activates a completed replacement after
  // all clients close; the next process launch then receives that bundle.
  if (existing?.active?.state === 'activated') {
    performance.mark('satin-worker-active')
    return true
  }
  // WebKit can expose the registration before its first worker is assigned.
  // Re-registering joins that job; update() requires a newest worker and throws
  // InvalidStateError in this interval. It also retries an empty failed install.
  let registration = existing
  if (!registration) {
    try {
      registration = await navigator.serviceWorker.register(`${scope}sw.js`, {
        scope,
        updateViaCache: 'none',
      })
    } catch (error) {
      if (navigator.onLine === false) {
        throw new Error('Check your connection and try again. Resource: ' + expectedScript, {
          cause: error,
        })
      }
      throw error
    }
  }
  if (registration.active?.state === 'activated') {
    performance.mark('satin-worker-active')
    return true
  }
  // Do not await this job: on WebKit it may resolve only after installation.
  // Attach the progress and updatefound listeners while the bytes are arriving.
  const registrationJob =
    existing && !existing.installing && !existing.waiting && !existing.active
      ? navigator.serviceWorker.register(`${scope}sw.js`, { scope, updateViaCache: 'none' })
      : null
  await waitForActivation(registration, registrationJob, timeoutMs, onProgress)
  performance.mark('satin-worker-active')
  return true
}

/** The scope's registration, when its worker is this app's script. Finishes a worker reset the
 * document head started first, and gives the lookup 3 s. */
async function findOwnRegistration(scope: string) {
  // The head may be replacing an interrupted first install. Finish that lookup
  // before subscribing, or this page could keep watching the discarded worker.
  const workerJob = (globalThis as typeof globalThis & { __SATIN_WORKER_LOOKUP__?: Promise<void> })
    .__SATIN_WORKER_LOOKUP__
  if (workerJob) await workerJob
  const lookupError = (globalThis as typeof globalThis & { __SATIN_WORKER_LOOKUP_ERROR__?: Error })
    .__SATIN_WORKER_LOOKUP_ERROR__
  if (lookupError) throw lookupError
  performance.mark('satin-worker-lookup-start')
  let lookupTimer: ReturnType<typeof setTimeout> | undefined
  let found: ServiceWorkerRegistration | undefined
  try {
    found = await Promise.race([
      navigator.serviceWorker.getRegistration(scope),
      new Promise<never>((_resolve, reject) => {
        lookupTimer = setTimeout(
          () => reject(new Error('Service worker lookup did not finish. Please retry.')),
          3000,
        )
      }),
    ])
  } finally {
    clearTimeout(lookupTimer)
  }
  const expectedScope = new URL(scope, location.href).href
  const expectedScript = new URL(scope + 'sw.js', location.href).href
  const newest = found?.installing ?? found?.waiting ?? found?.active
  const existing =
    found &&
    (!found.scope || found.scope === expectedScope) &&
    (!newest?.scriptURL || newest.scriptURL === expectedScript)
      ? found
      : undefined
  performance.mark('satin-worker-lookup-end')
  return { existing, expectedScript }
}

type InstallFailure = { stalled?: boolean; networkFailure?: boolean; url: string; reason: string }

/** The worker's install failure as a message the launch screen can show. */
function installFailureMessage(failure: InstallFailure) {
  if (failure.stalled)
    return 'The server stopped responding. Resource: ' + failure.url + '. Please retry.'
  if (failure.networkFailure) return 'Check your connection and try again. Resource: ' + failure.url
  return (
    'Could not prepare ' +
    failure.url +
    ': ' +
    failure.reason +
    '. Deploy the complete matching build, then retry.'
  )
}

/** Resolves once the registration's worker is activated. Download progress (forwarded to
 * `onProgress`) extends the deadline; an install failure or a stall past `timeoutMs` rejects. */
function waitForActivation(
  registration: ServiceWorkerRegistration,
  registrationJob: Promise<ServiceWorkerRegistration> | null,
  timeoutMs: number,
  onProgress: ((progress: DownloadProgress | null) => void) | undefined,
) {
  return new Promise<void>((resolve, reject) => {
    let lastLoaded = 0
    let lastActivity = 0
    let timer: ReturnType<typeof setTimeout>
    let redundantTimer: ReturnType<typeof setTimeout> | undefined
    const deadline = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        cleanup()
        reject(
          new Error(
            'Offline installation timed out without download progress. Retry with a connection.',
          ),
        )
      }, timeoutMs)
    }
    const receive = (event: MessageEvent) => {
      if (!watched.has(event.source as ServiceWorker)) return
      const data = event.data
      if (data?.type === 'SATIN_INSTALL_FAILURE') {
        cleanup()
        reject(new Error(installFailureMessage(data)))
        return
      }
      if (
        data?.type === 'SATIN_DOWNLOAD_PROGRESS' &&
        Number.isFinite(data.loaded) &&
        Number.isFinite(data.total)
      ) {
        if (data.downloading && (data.loaded > lastLoaded || (data.activity ?? 0) > lastActivity)) {
          lastLoaded = data.loaded
          lastActivity = data.activity ?? 0
          deadline()
        }
        onProgress?.(data.downloading ? data : null)
      }
    }
    navigator.serviceWorker.addEventListener?.('message', receive)
    // Worker messages are queued until DOMContentLoaded unless the queue is opened (see the head watchdog).
    navigator.serviceWorker.startMessages?.()
    const watched = new Set<ServiceWorker>()
    const cleanup = () => {
      clearTimeout(timer)
      clearTimeout(redundantTimer)
      navigator.serviceWorker.removeEventListener?.('message', receive)
      onProgress?.(null)
      registration.removeEventListener('updatefound', check)
      for (const worker of watched) worker.removeEventListener('statechange', check)
    }
    const check = () => {
      if (registration.active?.state === 'activated') {
        cleanup()
        resolve()
        return
      }
      for (const worker of [registration.installing, registration.waiting, registration.active]) {
        if (worker && !watched.has(worker)) {
          watched.add(worker)
          worker.addEventListener('statechange', check)
          worker.postMessage?.({ type: 'SATIN_DOWNLOAD_PROGRESS_REQUEST' })
        }
      }
      if (
        [...watched].some(worker => worker.state === 'redundant') &&
        !registration.installing &&
        !registration.active
      ) {
        // WebKit can report redundant before delivering this worker's failure message.
        // Keep listening briefly; persisted diagnostics belong to earlier attempts.
        if (redundantTimer === undefined) {
          clearTimeout(timer)
          redundantTimer = setTimeout(
            () => {
              cleanup()
              reject(new Error('The offline bundle did not finish installing.'))
            },
            Math.min(timeoutMs, 250),
          )
        }
      }
    }
    deadline()
    registration.addEventListener('updatefound', check)
    registrationJob?.catch(error => {
      cleanup()
      reject(error)
    })
    check()
  })
}

/** Admission owns the entire five-second launch deadline. A stuck required
 * Image reports the existing retry screen rather than revealing undecoded art. */
export async function prepareLaunchContent(root: HTMLElement, signal?: AbortSignal): Promise<void> {
  performance.mark('satin-content-prepare-start')
  const controller = new AbortController()
  let requiredReady = false
  let finish = () => {}
  const cancelled = () => {
    controller.abort()
    finish()
  }
  const optional = [
    document.fonts.ready,
    ...[...root.querySelectorAll('img')].map(image => {
      image.loading = 'eager'
      return image.decode()
    }),
  ]
  const required = prepareDestinationImages(root, controller.signal).then(() => {
    if (!controller.signal.aborted) requiredReady = true
  })
  try {
    await new Promise<void>((resolve, reject) => {
      finish = resolve
      signal?.addEventListener('abort', cancelled, { once: true })
      if (signal?.aborted) {
        cancelled()
        return
      }
      const timer = setTimeout(() => {
        if (requiredReady) resolve()
        else reject(new Error('Artwork did not finish preparing. Please retry.'))
      }, 5_000)
      const complete = () => {
        clearTimeout(timer)
        resolve()
      }
      finish = complete
      void Promise.all([required, Promise.allSettled(optional)]).then(complete, error => {
        clearTimeout(timer)
        reject(error)
      })
    })
  } finally {
    controller.abort()
    signal?.removeEventListener('abort', cancelled)
  }
  if (!signal?.aborted) performance.mark('satin-content-prepared')
}
