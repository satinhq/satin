// Serialized into the head. Keep the handshake independent of modules.
export async function registerEarlyWorker(
  scope: string,
  onLookupComplete?: (error?: Error) => void,
  resetRequested = false,
  registerAfterLookup = true,
) {
  const workers = navigator.serviceWorker
  if (!workers) {
    onLookupComplete?.()
    return
  }
  const resetKey = 'satin-install-reset:' + scope
  try {
    resetRequested ||= sessionStorage.getItem(resetKey) === '1'
    sessionStorage.removeItem(resetKey)
  } catch {
    // Explicit in-app retry still works without session storage.
  }
  const bounded = async <T>(operation: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Service worker reset did not finish. Please retry.')),
            3000,
          )
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  const expectedScope = new URL(scope, location.href).href
  const expectedScript = new URL(scope + 'sw.js', location.href).href
  let existing: ServiceWorkerRegistration | undefined
  try {
    existing = await bounded(workers.getRegistration(scope))
    const worker = existing?.installing ?? existing?.waiting ?? existing?.active
    if (
      resetRequested &&
      existing?.scope === expectedScope &&
      worker?.scriptURL === expectedScript &&
      !existing.active &&
      existing.installing &&
      !existing.waiting
    ) {
      if (!(await bounded(existing.unregister()))) {
        throw new Error('Service worker reset did not finish. Please retry.')
      }
      existing = undefined
    }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    onLookupComplete?.(failure)
    throw failure
  }
  onLookupComplete?.()
  if (!registerAfterLookup) return
  performance.mark('satin-worker-registration-start')
  const worker = existing?.installing ?? existing?.waiting ?? existing?.active
  const registration =
    existing?.scope === expectedScope && worker?.scriptURL === expectedScript
      ? existing
      : await workers.register(expectedScript, { scope, updateViaCache: 'none' })
  const current = registration.installing ?? registration.waiting ?? registration.active
  current?.postMessage({ type: 'SATIN_DOWNLOAD_PROGRESS_REQUEST' })
}

/** Restart preparation after an explicit failure retry without reloading. */
export function retryFailedInstallation(scope: string): Promise<void> {
  return new Promise((resolve, reject) => {
    void registerEarlyWorker(
      scope,
      error => {
        if (error) reject(error)
        else {
          delete (globalThis as typeof globalThis & { __SATIN_WORKER_LOOKUP_ERROR__?: Error })
            .__SATIN_WORKER_LOOKUP_ERROR__
          resolve()
        }
      },
      true,
      false,
    ).catch(reject)
  })
}
