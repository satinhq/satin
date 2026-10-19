import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { webURL } from './urlPolicy.ts'
import { bindFrameDocument, dispatchWebURL, type WebViewLink } from './frameDocument.ts'
export type { WebViewLink } from './frameDocument.ts'

/** The embedded page's load state. A cross-origin page reports `unverified`, because its contents
 * cannot be read. */
export type WebFrameState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; url: string; title: string }
  | { status: 'unverified'; reason: 'cross-origin-or-denied' }
  | { status: 'unavailable'; reason: 'invalid-url' | 'load-error' }
/** Whether a `reload` or `stop` request was sent to the frame, or why not. */
export type WebFrameActionResult =
  | { status: 'dispatched' }
  | { status: 'unavailable'; reason: 'not-mounted' | 'cross-origin-or-denied' }

/** Reads a `WebView`'s state and sends it `reload` and `stop`. Only same-origin frames expose
 * their current page or accept these commands. */
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

/** Makes a controller to pass to a `WebView`, for reading its state and reloading or stopping it. */
export function useWebFrame(): WebFrameController {
  const store = useMemo(() => {
    const value = createFrameStore()
    stores.set(value.controller, value)
    return value
  }, [])
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return store.controller
}

/** The page URL, its accessible title, an optional controller, and what the page may run. Scripts
 * and forms are off by default. */
export interface WebViewProps {
  url: string
  /** Accessible name for the embedded page. */
  title: string
  controller?: WebFrameController
  /** Explicitly allow scripts. Same-origin scripted content must be trusted. */
  allowsJavaScript?: boolean
  allowsForms?: boolean
  /** Same-origin document height, or fill the height supplied by the parent. Foreign frames fill. */
  sizing?: 'fill' | 'content'
  /** Scale wide same-origin documents down to the available width. Default: true. */
  fitsWidth?: boolean
  /** Handles same-origin links synchronously, supplying the authored target (including base[target]).
   * Unavailable when scripts are disabled: WebKit blocks parent-installed frame listeners.
   * For trusted scripted documents, handling a link prevents frame navigation. */
  onOpenURL?: (url: string, link: WebViewLink) => void
  className?: string
  style?: CSSProperties
  onStateChange?: (state: WebFrameState) => void
}

/** Embeds a web page in a sandboxed frame. The browser decides whether the page may be framed, and
 * the frame's storage is partitioned from the app's. */
export function WebView({
  url: input,
  title,
  controller,
  className,
  style,
  onStateChange,
  allowsJavaScript = false,
  allowsForms = false,
  sizing = 'fill',
  fitsWidth = true,
  onOpenURL,
}: WebViewProps) {
  const local = useWebFrame()
  const store = stores.get(controller ?? local)
  if (!store) throw new Error('Use useWebFrame to create a WebFrameController')
  const ref = useRef<HTMLIFrameElement>(null)
  const [contentHeight, setContentHeight] = useState<number>()
  const [loadedHref, setLoadedHref] = useState<string>()
  const cleanupDocument = useRef<(() => void) | undefined>(undefined)
  const openLink = useRef(onOpenURL)
  openLink.current = onOpenURL
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
      cleanupDocument.current?.()
      cleanupDocument.current = undefined
    }
  }, [href, store])
  useEffect(() => {
    setContentHeight(undefined)
    const frame = ref.current
    if (frame?.contentDocument?.body) {
      cleanupDocument.current?.()
      cleanupDocument.current = bindFrameDocument(
        frame,
        {
          sizing,
          fitsWidth,
          onOpenURL: (url, link) => {
            if (openLink.current) openLink.current(url, link)
            else dispatchWebURL(url)
          },
        },
        setContentHeight,
      )
    }
  }, [sizing, fitsWidth])
  const publish = (state: WebFrameState) => {
    store.setState(state)
    observer.current?.(state)
  }
  if (!href) return null
  return (
    <div
      data-satin-webview=""
      className={className}
      style={{
        width: '100%',
        height: sizing === 'content' && contentHeight !== undefined ? contentHeight : '100%',
        ...style,
        position: 'relative',
        isolation: 'isolate',
      }}
    >
      <iframe
        ref={ref}
        src={href}
        title={title}
        style={{
          display: 'block',
          border: 0,
          width: '100%',
          height: '100%',
          visibility: loadedHref === href ? 'visible' : 'hidden',
        }}
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
          cleanupDocument.current?.()
          cleanupDocument.current = undefined
          setContentHeight(undefined)
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
            } else {
              cleanupDocument.current = bindFrameDocument(
                frame!,
                {
                  sizing,
                  fitsWidth,
                  onOpenURL: (url, link) => {
                    if (openLink.current) openLink.current(url, link)
                    else dispatchWebURL(url)
                  },
                },
                setContentHeight,
              )
              publish({ status: 'loaded', url: current.href, title: document.title })
            }
          } catch {
            publish({ status: 'unverified', reason: 'cross-origin-or-denied' })
          }
          setLoadedHref(href)
        }}
      />
      <div data-satin-webview-catcher="" aria-hidden="true" />
    </div>
  )
}
