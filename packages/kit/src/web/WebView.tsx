import { useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from 'react'
import { webURL } from './urlPolicy.ts'

export type WebFrameState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; url: string; title: string }
  | { status: 'unverified'; reason: 'cross-origin-or-denied' }
  | { status: 'unavailable'; reason: 'invalid-url' | 'load-error' }
export type WebFrameActionResult =
  | { status: 'dispatched' }
  | { status: 'unavailable'; reason: 'not-mounted' | 'cross-origin-or-denied' }

/** Only same-origin frames expose their current page or accept reload/stop commands. */
export interface WebFrameController {
  readonly state: WebFrameState
  reload(): WebFrameActionResult
  stop(): WebFrameActionResult
}

type FrameStore = ReturnType<typeof createFrameStore>
const stores = new WeakMap<WebFrameController, FrameStore>()
function createFrameStore() {
  let frame: HTMLIFrameElement | null = null
  let state: WebFrameState = { status: 'idle' }
  const listeners = new Set<() => void>()
  const command = (action: (window: Window) => void): WebFrameActionResult => {
    if (!frame?.contentWindow) return { status: 'unavailable', reason: 'not-mounted' }
    try {
      if (!frame.contentDocument || frame.contentWindow.location.origin !== location.origin)
        return { status: 'unavailable', reason: 'cross-origin-or-denied' }
      action(frame.contentWindow)
      return { status: 'dispatched' }
    } catch {
      return { status: 'unavailable', reason: 'cross-origin-or-denied' }
    }
  }
  const controller: WebFrameController = {
    get state() {
      return state
    },
    reload: () => command(window => window.location.reload()),
    stop: () => command(window => window.stop()),
  }
  return {
    controller,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setState(value: WebFrameState) {
      state = value
      listeners.forEach(listener => listener())
    },
    attach(value: HTMLIFrameElement) {
      if (frame && frame !== value) throw new Error('A WebFrameController can own only one WebView')
      frame = value
    },
    detach(value: HTMLIFrameElement) {
      if (frame === value) frame = null
    },
  }
}

/** Observe a WebView and request the operations its origin permits. */
export function useWebFrame(): WebFrameController {
  const store = useMemo(() => {
    const value = createFrameStore()
    stores.set(value.controller, value)
    return value
  }, [])
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return store.controller
}

export interface WebViewProps {
  url: string
  /** Accessible name for the embedded page. */
  title: string
  controller?: WebFrameController
  /** Explicitly allow scripts. Same-origin scripted content must be trusted. */
  allowsJavaScript?: boolean
  allowsForms?: boolean
  className?: string
  style?: CSSProperties
  onStateChange?: (state: WebFrameState) => void
}

/** A sandboxed embedded page. Framing policy and partitioned storage remain browser-owned. */
export function WebView({
  url: input,
  title,
  controller,
  className,
  style,
  onStateChange,
  allowsJavaScript = false,
  allowsForms = false,
}: WebViewProps) {
  const local = useWebFrame()
  const store = stores.get(controller ?? local)
  if (!store) throw new Error('Use useWebFrame to create a WebFrameController')
  const ref = useRef<HTMLIFrameElement>(null)
  const observer = useRef(onStateChange)
  observer.current = onStateChange
  const url = webURL(
    input,
    typeof location === 'undefined' ? 'https://invalid.invalid/' : location.href,
  )
  const href = url?.href
  useEffect(() => {
    const frame = ref.current
    if (frame) store.attach(frame)
    store.setState(href ? { status: 'loading' } : { status: 'unavailable', reason: 'invalid-url' })
    observer.current?.(store.getSnapshot())
    return () => {
      if (frame) store.detach(frame)
    }
  }, [href, store])
  const publish = (state: WebFrameState) => {
    store.setState(state)
    observer.current?.(state)
  }
  if (!href) return null
  return (
    <iframe
      ref={ref}
      src={href}
      title={title}
      className={className}
      style={{ border: 0, width: '100%', height: '100%', ...style }}
      sandbox={[
        'allow-same-origin',
        allowsJavaScript && 'allow-scripts',
        allowsForms && 'allow-forms',
      ]
        .filter(Boolean)
        .join(' ')}
      referrerPolicy="no-referrer"
      onError={() => publish({ status: 'unavailable', reason: 'load-error' })}
      onLoad={() => {
        try {
          const frame = ref.current
          const document = frame?.contentDocument
          const current = frame?.contentWindow?.location
          if (
            !document ||
            !current ||
            current.href === 'about:blank' ||
            current.origin !== location.origin
          ) {
            publish({ status: 'unverified', reason: 'cross-origin-or-denied' })
          } else publish({ status: 'loaded', url: current.href, title: document.title })
        } catch {
          publish({ status: 'unverified', reason: 'cross-origin-or-denied' })
        }
      }}
    />
  )
}
