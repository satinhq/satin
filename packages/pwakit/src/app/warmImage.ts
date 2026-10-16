/** Fetch an app image at idle so a later screen can avoid a CacheStorage read. */
const images = new Map<string, Promise<string>>()
const objectUrls = new Map<string, string>()
let generation = 0
let teardownRegistered = false
const onPageHide = (event: Event) => {
  if (!(event as PageTransitionEvent).persisted) releaseWarmedAppImages()
}

/** Release URLs when the app document closes, or explicitly when its image set changes. */
export function releaseWarmedAppImages(): void {
  generation += 1
  images.clear()
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
}

export function warmAppImageWhenIdle(source: string): Promise<string> {
  const url = new URL(source, location.href)
  if (url.origin !== location.origin) throw new Error('Warm app images must be same-origin')
  const existing = images.get(url.href)
  if (existing) return existing
  if (!teardownRegistered && typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide)
    teardownRegistered = true
  }
  const startedInGeneration = generation
  const task = new Promise<void>(resolve => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), { timeout: 1_500 })
    else setTimeout(resolve, 500)
  }).then(async () => {
    const response = await fetch(url.href)
    if (!response.ok)
      throw new Error(`App image warm-up failed: ${response.status} ${url.pathname}`)
    // A service-worker-served precache Response has an empty url; only a real redirect is checked.
    if (response.redirected && response.url && new URL(response.url).origin !== location.origin)
      throw new Error('App image warm-up redirected off-origin')
    const blob = await response.blob()
    if (startedInGeneration !== generation) return url.href
    const objectUrl = URL.createObjectURL(blob)
    if (startedInGeneration !== generation) {
      URL.revokeObjectURL(objectUrl)
      return url.href
    }
    objectUrls.set(url.href, objectUrl)
    return objectUrl
  })
  images.set(url.href, task)
  void task.catch(() => {
    if (images.get(url.href) === task) images.delete(url.href)
  })
  return task
}
