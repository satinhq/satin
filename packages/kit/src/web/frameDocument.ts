import { webURL } from './urlPolicy.ts'

/** A link's authored browsing-context target, supplied when link interception is available. */
export interface WebViewLink {
  readonly target: string
}

export interface FrameDocumentOptions {
  sizing: 'fill' | 'content'
  fitsWidth: boolean
  /** Native anchors work without frame scripts or parent-installed click listeners. */
  nativeLinks?: boolean
  allowsLinkOpening?: boolean
  onOpenURL?: (url: string, link: WebViewLink) => void
}

/** Shared by frame links and the public URL handoff. Call synchronously from a user action. */
export function dispatchWebURL(url: string) {
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
}

/** Apply before revealing the frame. Never turn an executable or credentialed URL into a popup. */
export function prepareFrameLinks(
  document: Document,
  nativeLinks: boolean,
  allowsLinkOpening = true,
) {
  if (nativeLinks && allowsLinkOpening) {
    // Popup permissions belong to links, not to authored form targets or base[target].
    for (const form of document.querySelectorAll('form')) form.setAttribute('target', '_self')
    for (const control of document.querySelectorAll('[formtarget]'))
      control.setAttribute('formtarget', '_self')
  }
  for (const anchor of document.querySelectorAll('a,area')) {
    const href =
      anchor.getAttribute('href') ?? anchor.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (href === null) continue
    const url = webURL(href, document.baseURI)
    anchor.removeAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (!url || !allowsLinkOpening) {
      anchor.removeAttribute('href')
      anchor.removeAttribute('target')
      anchor.removeAttribute('ping')
      continue
    }
    // Resolve now, so a later base element change cannot change the allowed destination.
    anchor.setAttribute('href', url.href)
    if (nativeLinks) {
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
      anchor.removeAttribute('ping')
      anchor.removeAttribute('download')
    }
  }
}

/** Parent-owned observers work even when the embedded document cannot run scripts. */
export function bindFrameDocument(
  frame: HTMLIFrameElement,
  options: FrameDocumentOptions,
  setHeight: (height: number | undefined) => void,
) {
  const document = frame.contentDocument
  if (!document) return () => {}
  const nativeLinks = options.nativeLinks ?? false
  const prepareLinks = () => prepareFrameLinks(document, nativeLinks, options.allowsLinkOpening)
  // A standalone SVG document has no HTML body, but its anchors still need the policy.
  prepareLinks()
  const body = document.body
  const root = document.documentElement
  if (!body || !root) return () => {}
  const view = frame.ownerDocument.defaultView!
  const ownedProperties = ['zoom', 'width', 'height', 'min-height']
  const originalBodyStyle = ownedProperties.map(name => [
    name,
    body.style.getPropertyValue(name),
    body.style.getPropertyPriority(name),
  ])
  const originalRootStyle = ['height', 'min-height'].map(name => [
    name,
    root.style.getPropertyValue(name),
    root.style.getPropertyPriority(name),
  ])
  const policy = document.createElement('style')
  policy.textContent = options.fitsWidth
    ? 'html{overflow-x:hidden!important}img,video,svg,canvas{max-width:100%!important;height:auto}'
    : ''
  document.head.append(policy)
  let disposed = false
  let scheduled = 0
  let measuredWidth = 0
  const mutation = new MutationObserver(() => {
    mutation.disconnect()
    prepareLinks()
    observeMutations()
    schedule()
  })
  const observeMutations = () =>
    mutation.observe(body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
  const measure = () => {
    scheduled = 0
    if (disposed || !frame.isConnected) return
    const width = frame.clientWidth
    measuredWidth = width
    if (!width) return
    mutation.disconnect()
    // Measure unscaled overflow at the current viewport width, not at a previous zoom.
    if (options.fitsWidth) {
      body.style.zoom = '1'
      body.style.width = 'auto'
    }
    if (options.sizing === 'content') {
      root.style.height = 'auto'
      root.style.minHeight = '0'
      body.style.height = 'auto'
      body.style.minHeight = '0'
    }
    const naturalWidth = Math.max(width, root.scrollWidth, body.scrollWidth)
    const scale = options.fitsWidth ? Math.min(1, width / naturalWidth) : 1
    const computed = view.getComputedStyle(body)
    const marginX = (parseFloat(computed.marginLeft) || 0) + (parseFloat(computed.marginRight) || 0)
    const marginY = (parseFloat(computed.marginTop) || 0) + (parseFloat(computed.marginBottom) || 0)
    if (scale < 1) {
      body.style.width = `${Math.max(0, naturalWidth - marginX)}px`
      body.style.zoom = String(scale)
    }
    if (options.sizing === 'content') {
      const height = Math.ceil(
        Math.max(body.getBoundingClientRect().height, body.scrollHeight * scale) + marginY * scale,
      )
      setHeight(height)
    }
    observeMutations()
  }
  function schedule() {
    if (!disposed && !scheduled) scheduled = view.requestAnimationFrame(measure)
  }
  const resize = new ResizeObserver(schedule)
  resize.observe(body)
  const frameResize = new ResizeObserver(() => {
    if (frame.clientWidth !== measuredWidth) schedule()
  })
  frameResize.observe(frame)
  const click = (event: MouseEvent) => {
    if (event.type === 'auxclick' ? event.button !== 1 : event.button !== 0) return
    const element = event.target as Element | null
    const anchor = element?.closest?.('a[href],area[href]')
    if (!anchor) return
    // This prevents frame history even for executable or unsupported links.
    event.preventDefault()
    const url = webURL(anchor.getAttribute('href') ?? '', document.baseURI)
    if (!url || options.allowsLinkOpening === false) return
    const target =
      anchor.getAttribute('target') ??
      document.querySelector('base[target]')?.getAttribute('target') ??
      '_self'
    if (options.onOpenURL) options.onOpenURL(url.href, { target })
    else dispatchWebURL(url.href)
  }
  if (!nativeLinks) {
    document.addEventListener('click', click, true)
    document.addEventListener('auxclick', click, true)
  }
  document.addEventListener('load', schedule, true)
  document.fonts?.addEventListener('loadingdone', schedule)
  void document.fonts?.ready.then(schedule)
  measure()
  return () => {
    disposed = true
    view.cancelAnimationFrame(scheduled)
    resize.disconnect()
    frameResize.disconnect()
    mutation.disconnect()
    document.removeEventListener('click', click, true)
    document.removeEventListener('auxclick', click, true)
    document.removeEventListener('load', schedule, true)
    document.fonts?.removeEventListener('loadingdone', schedule)
    policy.remove()
    for (const [name, value, priority] of originalBodyStyle)
      body.style.setProperty(name!, value!, priority)
    for (const [name, value, priority] of originalRootStyle)
      root.style.setProperty(name!, value!, priority)
  }
}
