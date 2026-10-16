import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { useAppContext } from '../public/context.ts'
import { Pressable } from '../press/Pressable.tsx'
import { createRouteCodec } from '../navigation/routeCodec.ts'
import { resolveRoutes } from '../public/routeRegistry.ts'
import { webURL } from './urlPolicy.ts'

/** A preference for the browser-owned presentation, not a Safari launch guarantee. */
export interface OpenURLOptions {
  /** Defaults to true. A strict external-browser request is unavailable on this runtime. */
  prefersInApp?: boolean
}

/** Dispatched means WebKit accepted the action; it does not mean the page loaded. */
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

/** Open a web URL from an action. Registered app URLs stay in the current document. */
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

export interface LinkProps extends OpenURLOptions {
  destination: string
  children: ReactNode
  disabled?: boolean
  className?: string
  style?: CSSProperties
  /** Receives dispatch or rejection immediately, never inferred page completion. */
  onResult?: (result: OpenURLResult) => void
}

/** An accessible URL action with the framework's press and scroll-cancellation policy. */
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
