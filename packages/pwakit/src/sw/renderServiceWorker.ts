import { installPushHandlers } from './pushRuntime.ts'
import {
  APP_SHELL_APPLY_UPDATE,
  APP_SHELL_APPLY_COLD_UPDATE,
  APP_SHELL_APPLY_BACKGROUND_UPDATE,
  APP_SHELL_BUILD_ID_REQUEST,
  APP_SHELL_BUILD_ID_RESPONSE,
  APP_SHELL_COLD_UPDATE_DENIED,
} from './protocol.ts'
import { classifyAppShellRequest } from './requestRouting.ts'
import type { AppShellPrecacheManifest } from './manifest.ts'

export interface RenderServiceWorkerOptions {
  readonly publicRoutes?: readonly string[]
  /** Opt-in response timing headers for local diagnosis. Never use in a production build. */
  readonly diagnosticTimingHeaders?: boolean
  /** Read-only asset fallback names. Unscoped legacy caches are never deleted automatically. */
  readonly legacyCacheNames?: readonly string[]
  readonly manifest: AppShellPrecacheManifest
}

export function renderServiceWorker({
  publicRoutes = [],
  diagnosticTimingHeaders = false,
  legacyCacheNames = [],
  manifest,
}: RenderServiceWorkerOptions) {
  const classifier = classifyAppShellRequest.toString()

  return `'use strict'

const BUILD_ID = ${JSON.stringify(manifest.buildId)}
// The leading colon is outside every valid historical cachePrefix. An old
// deployed worker's prefix cleanup therefore cannot erase a new installation.
// Use the registration URL, not the shell URL or a path-prefix approximation:
// sibling and nested registrations own disjoint namespaces on this origin.
const OWNED_CACHE_PREFIX = ':satin:app-shell:v2:' + encodeURIComponent(self.registration.scope) + ':'
// Document bindings survive worker restarts and are outside build-cache pruning.
const CLIENT_CACHE_NAME = ':satin:app-shell-clients:v1:' + encodeURIComponent(self.registration.scope)
const CACHE_NAME = OWNED_CACHE_PREFIX + ${JSON.stringify(manifest.cacheName)}
const LEGACY_CACHE_PREFIX = ${JSON.stringify(manifest.cachePrefix)}
const SHELL_URL = ${JSON.stringify(manifest.shellUrl)}
const PRECACHE_ENTRIES = ${JSON.stringify(manifest.entries, null, 2)}
const PRECACHE_URLS = new Set(PRECACHE_ENTRIES.map((entry) => new URL(entry.url, self.location.origin).pathname))
${diagnosticTimingHeaders ? 'const SW_BOOT = Date.now()' : ''}
const LEGACY_CACHE_NAMES = new Set(${JSON.stringify(legacyCacheNames)})
const classifyAppShellRequest = ${classifier}

;(${installPushHandlers.toString()})(self, SHELL_URL)

let progress = { type: 'SATIN_DOWNLOAD_PROGRESS', buildId: BUILD_ID, loaded: 0, activity: 0, total: PRECACHE_ENTRIES.reduce((sum, entry) => sum + (entry.bytes || 0), 0), downloading: false }
let installFailure
async function reportProgress() {
  if (installFailure) return
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (installFailure) return
  for (const client of clients) client.postMessage(progress)
}
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    progress.downloading = true
    await reportProgress()
    const activeDownloads = new Set()
    let failureReport
    const download = async (entry) => {
      let networkFailure = true
      let stalled = false
      const controller = new AbortController()
      let reader
      let idleTimer
      let rejectIdle
      const idleFailure = new Promise((_resolve, reject) => {
        rejectIdle = reject
      })
      const cancelDownload = error => {
        if (controller.signal.aborted) return
        rejectIdle(error)
        controller.abort()
        // Reject the race even if a broken stream ignores cancellation.
        try {
          reader?.cancel().catch(() => {})
        } catch {}
      }
      activeDownloads.add(cancelDownload)
      // A cold server may take longer to answer than a stream may stay silent: the response gets
      // the deadline \`satin check\` gives it (30 s), the body 8 s between chunks.
      const resetIdle = (seconds = 8) => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          stalled = true
          cancelDownload(new Error('The server stopped responding for ' + seconds + ' s: ' + entry.url))
        }, seconds * 1000)
      }
      resetIdle(30)
      try {
        const request = new Request(entry.url, { cache: 'reload', signal: controller.signal })
        const response = await Promise.race([fetch(request), idleFailure])
        resetIdle()
        progress.activity++
        await reportProgress()
        if (installFailure) throw new Error('Installation cancelled')
        networkFailure = false
        if (!response.ok || response.type === 'opaque') throw new Error('HTTP ' + response.status)
        if (response.redirected) throw new Error('Precache resource redirected')
        const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
        const expectedMime = /\\.m?js$/.test(entry.url) ? /^(text|application)\\/(javascript|ecmascript|x-javascript)$/
          : /\\.css$/.test(entry.url) ? /^text\\/css$/ : null
        if (expectedMime && !expectedMime.test(mime)) throw new Error('Incorrect Content-Type: ' + mime)
        networkFailure = true
        reader = response.body?.getReader()
        const chunks = []
        let received = 0
        if (reader) {
          while (true) {
            const { done, value } = await Promise.race([reader.read(), idleFailure])
            if (installFailure) throw new Error('Installation cancelled')
            if (done) break
            if (value.byteLength > 0) resetIdle()
            chunks.push(value)
            received += value.byteLength
            progress.loaded += value.byteLength
            await reportProgress()
          }
        }
        clearTimeout(idleTimer)
        networkFailure = false
        // Build sizes count decoded bytes, as does a fetch response stream.
        if (entry.bytes !== undefined && received !== entry.bytes) throw new Error('Precache size mismatch: ' + entry.url)
        const blob = new Blob(chunks)
        if (entry.revision && /^[a-f0-9]{64}$/.test(entry.revision)) {
          const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
          const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
          if (hash !== entry.revision) throw new Error('Precache SHA-256 mismatch')
        }
        if (installFailure) throw new Error('Installation cancelled')
        await cache.put(request, new Response(blob, { status: response.status, statusText: response.statusText, headers: response.headers }))
      } catch (error) {
        if (!installFailure) {
          installFailure = { type: 'SATIN_INSTALL_FAILURE', buildId: BUILD_ID, url: entry.url,
            reason: error instanceof Error ? error.message : String(error), networkFailure, stalled }
          progress.downloading = false
          for (const cancel of activeDownloads) cancel(error)
          // Report before waiting for sibling fetches or cache writes to settle.
          failureReport = (async () => {
            console.error('[Satin installation]', installFailure.url, installFailure.reason)
            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            for (const client of clients) client.postMessage(installFailure)
          })()
        }
        throw error
      } finally {
        clearTimeout(idleTimer)
        activeDownloads.delete(cancelDownload)
      }
    }
    const critical = PRECACHE_ENTRIES.filter(entry => entry.url === SHELL_URL || /\\.(?:m?js|css|woff2?|ttf|otf)$/.test(entry.url))
    // WebKit may fail an install when hundreds of fetches and cache writes run
    // together. Keep parallelism bounded while preserving critical-first order.
    const downloadBatch = async entries => {
      let next = 0
      const results = await Promise.allSettled(Array.from({ length: Math.min(6, entries.length) }, async () => {
        while (!installFailure && next < entries.length) await download(entries[next++])
      }))
      const rejected = results.find(result => result.status === 'rejected')
      if (rejected) throw rejected.reason
    }
    try {
      await downloadBatch(critical)
      await downloadBatch(PRECACHE_ENTRIES.filter(entry => !critical.includes(entry)))
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) client.postMessage({ type: 'SATIN_INSTALL_SUCCESS', buildId: BUILD_ID })
    } catch (error) {
      await failureReport
      throw error
    } finally {
      progress.downloading = false
      await reportProgress()
    }
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SATIN_DOWNLOAD_PROGRESS_REQUEST') {
    if (!installFailure) event.source?.postMessage(progress)
    return
  }
  if (event.data?.type === ${JSON.stringify(APP_SHELL_BUILD_ID_REQUEST)}) {
    const response = {
      type: ${JSON.stringify(APP_SHELL_BUILD_ID_RESPONSE)},
      buildId: BUILD_ID,
    }
    if (event.ports[0]) event.ports[0].postMessage(response)
    else event.source?.postMessage(response)
    return
  }

  if (event.data?.type === ${JSON.stringify(APP_SHELL_APPLY_UPDATE)}) {
    event.waitUntil(self.skipWaiting())
  }
  if (event.data?.type === ${JSON.stringify(APP_SHELL_APPLY_COLD_UPDATE)} || event.data?.type === ${JSON.stringify(APP_SHELL_APPLY_BACKGROUND_UPDATE)}) {
    event.waitUntil((async () => {
      const scope = new URL(self.registration.scope).pathname
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const background = event.data.type === ${JSON.stringify(APP_SHELL_APPLY_BACKGROUND_UPDATE)}
      if (!event.source?.id || background && event.source.visibilityState !== 'hidden' || clients.some(client => client.id !== event.source.id && new URL(client.url).pathname.startsWith(scope))) {
        event.source?.postMessage({ type: ${JSON.stringify(APP_SHELL_COLD_UPDATE_DENIED)} })
        return
      }
      // Bind the source before the irrevocable claim. This also covers a
      // document served by a deployed worker predating persistent bindings.
      try {
        let previousCache = await clientCache(event.source.id)
        if (!previousCache) {
          // A legacy suspended document may already have refused an earlier
          // claim. Its active worker cannot identify the document's bundle.
          if (background && typeof event.data.previousBuildId !== 'string') {
            throw new Error('Legacy document bundle is unknown; defer to cold launch')
          }
          const previousBuildId = typeof event.data.previousBuildId === 'string'
            ? event.data.previousBuildId : await activeBuildId()
          if (previousBuildId) previousCache = OWNED_CACHE_PREFIX + LEGACY_CACHE_PREFIX + previousBuildId
        }
        if (!previousCache || !(await caches.keys()).includes(previousCache)) {
          throw new Error('Previous bundle unavailable')
        }
        await bindClient(event.source.id, previousCache)
      } catch {
        event.source.postMessage({ type: ${JSON.stringify(APP_SHELL_COLD_UPDATE_DENIED)} })
        return
      }
      await self.skipWaiting()
    })())
  }
})

async function retireUnusedCaches(navigatingClientId) {
  // A timed-out activation or an explicit update can leave an old document
  // alive. Its immutable worker/chunk graph must remain available after claim.
  const scope = new URL(self.registration.scope).pathname
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (clients.some(client => client.id !== navigatingClientId && new URL(client.url).pathname.startsWith(scope))) return
  const cacheNames = await caches.keys()
  // A second deployment may already be precaching. Never delete its cache.
  if (self.registration.installing || self.registration.waiting) return
  // Historical names (including explicitly configured legacy names) carry no
  // reliable ownership proof. Leave them intact; another registration may still
  // use or be populating them. Cache contents and client absence are not proof.
  await Promise.all(cacheNames.filter(name => name !== CACHE_NAME && name.startsWith(OWNED_CACHE_PREFIX))
    .map(name => caches.delete(name)))
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await retireUnusedCaches()
    await self.clients.claim()
  })())
})

// Older deployed documents do not send previousBuildId. Ask the still-active
// worker before skipWaiting, using the build-ID protocol those releases know.
function activeBuildId() {
  return new Promise(resolve => {
    if (!self.registration.active) {
      resolve(null)
      return
    }
    const channel = new MessageChannel()
    const finish = buildId => {
      clearTimeout(timer)
      channel.port1.close()
      resolve(buildId)
    }
    const timer = setTimeout(() => finish(null), 200)
    channel.port1.onmessage = event => {
      if (event.data?.type === ${JSON.stringify(APP_SHELL_BUILD_ID_RESPONSE)} && typeof event.data.buildId === 'string') {
        finish(event.data.buildId)
      }
    }
    try {
      self.registration.active.postMessage({ type: ${JSON.stringify(APP_SHELL_BUILD_ID_REQUEST)} }, [channel.port2])
    } catch {
      finish(null)
    }
  })
}

function clientKey(clientId) {
  return new URL('__satin_client__/' + encodeURIComponent(clientId), self.registration.scope).pathname
}

async function bindClient(clientId, cacheName) {
  if (!clientId) return
  const cache = await caches.open(CLIENT_CACHE_NAME)
  await cache.put(new Request(clientKey(clientId)), new Response(cacheName))
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const liveKeys = new Set(clients.map(client => clientKey(client.id)))
  liveKeys.add(clientKey(clientId))
  const prefix = clientKey('')
  await Promise.all((await cache.keys()).filter(request => {
    const path = new URL(request.url).pathname
    return path.startsWith(prefix) && !liveKeys.has(path)
  }).map(request => cache.delete(request)))
}

async function clientCache(clientId) {
  if (!clientId) return null
  const binding = await caches.match(clientKey(clientId), { cacheName: CLIENT_CACHE_NAME })
  if (!binding) return null
  const name = await binding.text()
  return name.startsWith(OWNED_CACHE_PREFIX) ? name : null
}

async function retainedAsset(request, clientId) {
  try {
    const key = new URL(request.url).pathname
    const boundCache = await clientCache(clientId)
    if (boundCache) {
      const bound = await caches.match(key, { cacheName: boundCache })
      if (bound) return bound
      // A bound old document must never get another build's shared pathname.
      return fetch(request)
    }
    // CacheStorage has no read-only Cache.keys API. Rebuild the owned-name
    // snapshot from CacheStorage.keys on each fallback request: an install can
    // add a successor at any time, and a prune must never be undone by open().
    for (const name of await caches.keys()) {
      const owned = name.startsWith(OWNED_CACHE_PREFIX)
      const legacy = !name.startsWith(':satin:') && !name.startsWith('satin-push-inbox-v1:') &&
        (name.startsWith(LEGACY_CACHE_PREFIX) || LEGACY_CACHE_NAMES.has(name))
      if ((!owned && !legacy) || name === CACHE_NAME) continue
      const response = await caches.match(key, { cacheName: name })
      if (response) return response
    }
  } catch {
    // A failed cache lookup cannot prevent the ordinary network request.
  }
  return fetch(request)
}

async function cacheFirst(request, clientId) {
  const cacheKey = new URL(request.url).pathname
  ${diagnosticTimingHeaders ? 'const matchStarted = performance.now()' : ''}
  const boundCache = await clientCache(clientId)
  const cached = await caches.match(cacheKey, { cacheName: boundCache || CACHE_NAME })
  if (!cached) return fetch(request)
  ${
    diagnosticTimingHeaders
      ? `
  const headers = new Headers(cached.headers)
  headers.set('x-sw-boot', String(SW_BOOT))
  headers.set('x-sw-match-ms', String(Math.round((performance.now() - matchStarted) * 100) / 100))
  return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers })`
      : 'return cached'
  }
}

async function installedNavigation(clientId) {
  // A scoped CacheStorage match avoids opening a Cache handle on cold fetch.
  const shell = await caches.match(SHELL_URL, { cacheName: CACHE_NAME })
  // Metadata quota/storage trouble must not make a good cached shell unusable.
  if (shell) await bindClient(clientId, CACHE_NAME).catch(() => {})
  // Never mix new network HTML with assets from an older installed worker.
  return shell ?? new Response('Installed bundle unavailable. Reconnect and reinstall.', { status: 503 })
}

self.addEventListener('fetch', (event) => {
  const category = classifyAppShellRequest(
    event.request,
    self.location.origin,
    PRECACHE_URLS,
    ${JSON.stringify(publicRoutes)},
  )

  if (category === 'navigation') {
    event.respondWith(installedNavigation(event.resultingClientId))
    event.waitUntil(retireUnusedCaches(event.resultingClientId))
  } else if (category === 'precache') {
    event.respondWith(cacheFirst(event.request, event.clientId))
  } else if (event.request.method === 'GET' && event.request.cache !== 'no-store' &&
      new URL(event.request.url).origin === self.location.origin &&
      ['script', 'worker', 'sharedworker', 'style', 'font', 'image'].includes(event.request.destination)) {
    event.respondWith(retainedAsset(event.request, event.clientId))
  } else if (
    new URL(event.request.url).origin === self.location.origin &&
    !['audio', 'video', 'track'].includes(event.request.destination) &&
    !event.request.headers.has('range')
  ) {
    // Explicitly settle uncached same-origin requests. Installed WebKit can leave an
    // unhandled fetch event pending after an auxiliary browser page closes. Media and
    // cross-origin requests keep the browser's own handling (range streaming, CORS).
    event.respondWith(fetch(event.request))
  }
})
`
}
