import {
  prepareMountedContent,
  hasPendingContent,
  imageRequiredForReveal,
} from './contentReadiness.ts'

export const emptyImageSource =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='

/** One decode cache for artwork and glass rasterization, including responsive candidates. */
export interface ImageRequest {
  readonly srcSet?: string
  readonly sizes?: string
  readonly crossOrigin?: '' | 'anonymous' | 'use-credentials'
  readonly referrerPolicy?: HTMLImageElement['referrerPolicy']
  readonly priority?: boolean
}
type DecodedImage = {
  promise: Promise<HTMLImageElement>
  image: HTMLImageElement
  ready: boolean
  users: number
  bytes: number
  failed: boolean
}
const decoded = new Map<string, DecodedImage>()
// A software retention limit, not a claim about WebKit's resident decoded memory.
const retainedBytes = 32 * 1024 * 1024
const retainedFailures = 64
function trimDecoded() {
  const entries = [...new Set(decoded.values())]
  let failures = entries.filter(entry => entry.failed).length
  let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0)
  for (const entry of entries) {
    if (entry.failed && !entry.users && failures > retainedFailures) {
      for (const [key, value] of decoded) if (value === entry) decoded.delete(key)
      failures--
    }
    if (bytes <= retainedBytes) continue
    if (!entry.ready || entry.users) continue
    for (const [key, value] of decoded) if (value === entry) decoded.delete(key)
    bytes -= entry.bytes
  }
}
function touch(entry: DecodedImage) {
  const keys = [...decoded].filter(([, value]) => value === entry).map(([key]) => key)
  for (const key of keys) decoded.delete(key)
  for (const key of keys) decoded.set(key, entry)
}

function sourceKey(url: string) {
  return typeof document === 'undefined' ? url : new URL(url, document.baseURI).href
}
export function imageRequestKey(url: string, request: ImageRequest) {
  return JSON.stringify([
    sourceKey(url),
    request.crossOrigin ?? null,
    request.referrerPolicy ?? '',
    request.srcSet ?? '',
    request.sizes ?? '',
    request.srcSet ? globalThis.innerWidth : 0,
    request.srcSet ? globalThis.innerHeight : 0,
    request.srcSet ? globalThis.devicePixelRatio : 0,
  ])
}
export function peekDecodedImage(url: string, request: ImageRequest = {}) {
  const entry = decoded.get(imageRequestKey(url, request))
  if (entry) touch(entry)
  return entry?.ready ? entry.image : undefined
}
/** Failed requests settle content admission too. Remember the outcome across
 * suspended React retries, which may reconstruct a preparation before it commits. */
export function imageDecodeFailed(url: string, request: ImageRequest = {}) {
  return decoded.get(imageRequestKey(url, request))?.failed === true
}
/** A confirmed reconnect may retry a failed bundled request. Keep successful
 * cached pixels and existing consumers; retire only the remembered failure. */
export function retryFailedImage(url: string, request: ImageRequest = {}) {
  const entry = decoded.get(imageRequestKey(url, request))
  if (entry?.failed) for (const [key, value] of decoded) if (value === entry) decoded.delete(key)
}
export function decodedImage(url: string, request: ImageRequest = {}): Promise<HTMLImageElement> {
  const key = imageRequestKey(url, request)
  const existing = decoded.get(key)
  if (existing && !existing.failed) {
    touch(existing)
    if (request.priority) existing.image.fetchPriority = 'high'
    return existing.promise
  }
  if (existing) {
    for (const [key, value] of decoded) if (value === existing) decoded.delete(key)
  }
  const image = new globalThis.Image()
  image.decoding = 'async'
  if (request.crossOrigin !== undefined) image.crossOrigin = request.crossOrigin
  if (request.referrerPolicy) image.referrerPolicy = request.referrerPolicy
  image.fetchPriority = request.priority ? 'high' : 'auto'
  if (request.sizes) image.sizes = request.sizes
  if (request.srcSet) image.srcset = request.srcSet
  image.src = sourceKey(url)
  const entry: DecodedImage = {
    image,
    ready: false,
    users: 0,
    bytes: 0,
    failed: false,
    promise: image
      .decode()
      .then(() => {
        if (request.srcSet && image.currentSrc) {
          image.src = image.currentSrc
          image.srcset = ''
        }
        entry.ready = true
        entry.bytes = image.naturalWidth * image.naturalHeight * 4 || 0
        // Glass uses the browser-selected URL, so it reuses these exact pixels.
        decoded.set(
          imageRequestKey(image.currentSrc || url, {
            crossOrigin: request.crossOrigin,
            referrerPolicy: request.referrerPolicy,
          }),
          entry,
        )
        trimDecoded()
        return image
      })
      .catch(error => {
        entry.failed = true
        trimDecoded()
        throw error
      }),
  }
  decoded.set(key, entry)
  return entry.promise
}

export function retainDecodedImage(url: string, request: ImageRequest = {}) {
  const ready = decodedImage(url, request)
  const entry = decoded.get(imageRequestKey(url, request))!
  entry.users++
  let released = false
  return {
    ready,
    release() {
      if (released) return
      released = true
      entry.users--
      trimDecoded()
    },
  }
}

export type ImageCapture = { source: string; ready: Promise<HTMLImageElement> }
/** The element changed source or unmounted before its decode finished: not a failure. */
export class SupersededImage extends Error {
  constructor(source: string) {
    super(`Image capture superseded: ${source}`)
  }
}
const captures = new WeakMap<HTMLImageElement, ImageCapture>()
export const imageCapture = (element: HTMLImageElement) => captures.get(element)
/** A failed content request contributes no image pixels. Replacement races still
 * invalidate the measurement; renderer assets must never use this boundary. */
export async function settleContentImage(ready: Promise<HTMLImageElement | undefined>) {
  try {
    return await ready
  } catch (error) {
    if (error instanceof SupersededImage) throw error
    return undefined
  }
}

/** Capture the displayed consumer, including raw img, without a second URL request. */
export function paintedImage(element: HTMLImageElement) {
  const capture = imageCapture(element)
  if (capture) return observedContentImage(capture.ready)
  if (!element.getAttribute('src') && !element.getAttribute('srcset'))
    return Promise.resolve(undefined)
  if (element.complete && element.naturalWidth === 0) return Promise.resolve(undefined)
  const source = element.currentSrc || element.src
  return observedContentImage(
    element.decode().then(() => {
      if ((element.currentSrc || element.src) !== source) throw new SupersededImage(source)
      return element
    }),
  )
}

/** Measurement stores this promise before rasterization, which may skip a region-owned
 * node or discard a stale scene. Observe retirement immediately while preserving the
 * rejection on the original promise so an eventual capture still remeasures. */
function observedContentImage(ready: Promise<HTMLImageElement | undefined>) {
  const pixels = settleContentImage(ready)
  void pixels.catch(() => {})
  return pixels
}

/** Counts capture registrations and retirements: a kept glass measurement holds the capture it
 * read (glass/lens/mirrorReuse.ts). */
let captureRevision = 0
export const imageCaptureRevision = () => captureRevision
/** Waiters on a retired capture (glass preparation, a push) are released at once, never held
 * until a decode nobody displays any more settles. */
export function registerImageCapture(element: HTMLImageElement, capture: ImageCapture) {
  let retire = () => {}
  const retired = new Promise<never>((_, reject) => {
    retire = () => reject(new SupersededImage(capture.source))
  })
  const registered = { source: capture.source, ready: Promise.race([capture.ready, retired]) }
  registered.ready.catch(() => {})
  captures.set(element, registered)
  captureRevision++
  return () => {
    retire()
    if (captures.get(element) !== registered) return
    captures.delete(element)
    captureRevision++
  }
}

/** Target preparation budget for visible bundled artwork. A missed budget is a
 * performance failure, never permission to reveal an undecoded local Image.
 * Owner correction: the implementation contract October 10. */
export const DESTINATION_IMAGE_BUDGET_MS = 100

/** Local Images must be ready before reveal. The entering route is translated offscreen,
 * so visibility is measured in the route's own coordinates. The budget is a checkpoint:
 * after a miss, keep the source visible and the destination paused until ready or aborted.
 * AsyncImage's remote placeholder does not register a pending capture. */
export async function prepareDestinationImages(
  root: HTMLElement,
  signal: AbortSignal,
  budget = DESTINATION_IMAGE_BUDGET_MS,
): Promise<void> {
  const deadline = performance.now() + budget
  while (!signal.aborted) {
    const mounted = prepareMountedContent(root, signal)
    if (mounted) await mounted
    if (signal.aborted) return
    const selected = visibleCaptures(root)
    const remaining = deadline - performance.now()
    if (!selected.size) {
      if (hasPendingContent(root)) continue
      return
    }
    const settled = await new Promise<boolean>(resolve => {
      const timer = remaining > 0 ? setTimeout(() => finish(false), remaining) : undefined
      function finish(value: boolean) {
        if (timer !== undefined) clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        resolve(value)
      }
      const abort = () => finish(false)
      signal.addEventListener('abort', abort, { once: true })
      void Promise.allSettled([...selected.values()].map(capture => capture.ready)).then(() =>
        finish(true),
      )
    })
    if (signal.aborted) return
    if (!settled) continue
    // Route content can mount or become visible while another image decodes.
    // Admit the current destination, including new or replaced requests, rather
    // than only checking that the original elements still have the same source.
    const current = [...visibleCaptures(root)].every(
      ([image, capture]) => selected.get(image) === capture,
    )
    if (current && !hasPendingContent(root)) return
  }
}

/** Synchronous empty admission keeps image-free tab selection immediate. */
export function hasDestinationImages(root: HTMLElement) {
  return hasPendingContent(root) || visibleCaptures(root).size > 0
}

function visibleCaptures(root: HTMLElement) {
  const selected = new Map<HTMLImageElement, ImageCapture>()
  for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
    const capture = captures.get(image)
    if (capture && imageRequiredForReveal(root, image)) selected.set(image, capture)
  }
  return selected
}

const viewportSubscribers = new Set<() => void>()
const notifyViewport = () => {
  for (const notify of viewportSubscribers) notify()
}
export function subscribeImageViewport(notify: () => void) {
  if (!viewportSubscribers.size) window.addEventListener('resize', notifyViewport)
  viewportSubscribers.add(notify)
  return () => {
    viewportSubscribers.delete(notify)
    if (!viewportSubscribers.size) window.removeEventListener('resize', notifyViewport)
  }
}
export const imageViewport = () =>
  `${globalThis.innerWidth}:${globalThis.innerHeight}:${globalThis.devicePixelRatio}`
