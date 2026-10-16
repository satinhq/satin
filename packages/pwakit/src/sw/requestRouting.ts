export type AppShellRequestCategory = 'navigation' | 'precache' | 'passthrough'

export interface AppShellRequestDescriptor {
  readonly cache?: string
  readonly method: string
  readonly mode: string
  readonly url: string
}

/**
 * The generated worker serializes this exact function into sw.js. Keep it
 * self-contained: runtime dependencies cannot cross the generated-worker
 * boundary.
 */
export function classifyAppShellRequest(
  request: AppShellRequestDescriptor,
  workerOrigin: string,
  precacheUrls: ReadonlySet<string>,
  publicRoutes: readonly string[] = [],
): AppShellRequestCategory {
  if (request.method !== 'GET') return 'passthrough'

  const url = new URL(request.url)
  if (url.origin !== workerOrigin) return 'passthrough'
  // Authorization callbacks must reach their dedicated document, never an installed shell.
  if (
    url.searchParams.has('state') &&
    (url.searchParams.has('code') || url.searchParams.has('error'))
  )
    return 'passthrough'
  const path = url.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') || '/'
  if (publicRoutes.some(route => (route.replace(/\/$/, '') || '/') === path)) return 'passthrough'
  if (request.mode === 'navigate') return 'navigation'
  if (request.cache === 'no-store') return 'passthrough'
  if (precacheUrls.has(url.pathname)) return 'precache'
  return 'passthrough'
}
