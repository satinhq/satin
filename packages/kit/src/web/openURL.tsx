import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { useAppContext } from '../public/context.ts'
import { Pressable } from '../press/Pressable.tsx'
import { createRouteCodec } from '../navigation/routeCodec.ts'
import { resolveRoutes } from '../public/routeRegistry.ts'
import { webURL } from './urlPolicy.ts'

/** How to open a web page. `prefersInApp` is a preference; the browser decides how the page is
 * presented. */
export interface OpenURLOptions {
  /** Defaults to true. A strict external-browser request is unavailable on this runtime. */
  prefersInApp?: boolean
}

/** What happened to an open request: `handled` in the app, `dispatched` to the browser, or
 * `unavailable` with a reason. `dispatched` does not mean the page loaded. */
export type OpenURLResult =
  | { status: 'handled'; destination: 'app' }
  | { status: 'dispatched'; destination: 'web' }
  | {
      status: 'unavailable'
      reason:
        | 'invalid-url'
        | 'external-browser'
        | 'unregistered-app-url'
        | 'navigation-failed'
        | 'popup-blocked'
    }

/** The function `useOpenURL` returns. It opens a URL and reports the result at once. */
export type OpenURLAction = (url: string, options?: OpenURLOptions) => OpenURLResult

/** Internal factory keeps the same policy in component and imperative actions. */
export function createOpenURLAction(options: {
  scope: string
  openInternal: (url: string) => boolean
  dispatch: (url: string) => boolean
}): OpenURLAction {
  return (input, preference = {}) => {
    const url = webURL(input, options.scope)
    if (!url) return { status: 'unavailable', reason: 'invalid-url' }
    const scope = new URL(options.scope)
    if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) {
      if (options.openInternal(url.href)) return { status: 'handled', destination: 'app' }
      // Never turn a typo or an invalid typed route into a document replacement.
      return { status: 'unavailable', reason: 'unregistered-app-url' }
    }
    if (preference.prefersInApp === false)
      return { status: 'unavailable', reason: 'external-browser' }
    try {
      if (!options.dispatch(url.href)) return { status: 'unavailable', reason: 'popup-blocked' }
      return { status: 'dispatched', destination: 'web' }
    } catch {
      return { status: 'unavailable', reason: 'navigation-failed' }
    }
  }
}

/** Returns a function that opens a URL from an action. App URLs that match a registered route
 * navigate inside the app; other URLs go to the browser. */
export function useOpenURL(): OpenURLAction {
  const runtime = useAppContext()
  return useMemo(
    () =>
      createOpenURLAction({
        scope: new URL(runtime.app.scope, location.origin).href,
        openInternal: input => {
          const url = new URL(input)
          const scope = new URL(runtime.app.scope, location.origin)
          if (url.pathname !== scope.pathname || url.hash) return false
          const encoded = url.searchParams.get('satin-route')
          if (encoded !== null) {
            try {
              const path: unknown = JSON.parse(encoded)
              const codec = createRouteCodec(resolveRoutes(runtime.routes))
              if (!Array.isArray(path) || path.some(entry => !codec.decode(entry))) return false
              const tab = url.searchParams.get('satin-tab')
              if (tab && !runtime.stacks.has(tab)) return false
            } catch {
              return false
            }
          } else if (!url.search) url.searchParams.set('satin-route', '[]')
          else return false
          return runtime.sceneRoutes?.openURL(url.href) ?? false
        },
        dispatch: url => {
          // Create synchronously in the gesture, then sever the opener before loading untrusted content.
          // Opening with noopener directly returns null even on success, hiding popup blocking.
          const page = window.open('about:blank', '_blank')
          if (!page) return false
          try {
            page.opener = null
            page.location.replace(url)
            return true
          } catch {
            page.close()
            throw new Error('Web handoff failed')
          }
        },
      }),
    [runtime],
  )
}

/** The link's destination URL, its content and an optional result callback. */
export interface LinkProps extends OpenURLOptions {
  destination: string
  children: ReactNode
  disabled?: boolean
  className?: string
  style?: CSSProperties
  /** Receives dispatch or rejection immediately, never inferred page completion. */
  onResult?: (result: OpenURLResult) => void
}

/** Opens a URL when pressed, like `useOpenURL`. A press that turns into a scroll does not open
 * it. */
export function Link({ destination, prefersInApp, onResult, children, ...props }: LinkProps) {
  const openURL = useOpenURL()
  return (
    <Pressable
      {...props}
      role="link"
      onPress={() => {
        const result = openURL(destination, { prefersInApp })
        onResult?.(result)
      }}
    >
      {children}
    </Pressable>
  )
}
