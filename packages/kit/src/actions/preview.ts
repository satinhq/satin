/** The interaction host can contain layout wrappers. The lifted surface belongs
 * to the selected semantic row, independently of swipe translation. Content that is
 * not a row lifts itself (native snapshots the view, with its own shape), so a
 * single child element is the source, not the framework's wrapper. */
export function contextPreviewSource(anchor: HTMLElement, target?: Element | null) {
  const selected = target?.closest<HTMLElement>('[data-satin-row]')
  if (selected && anchor.contains(selected)) return selected
  if (anchor.matches('[data-satin-row]')) return anchor
  const rows = anchor.querySelectorAll<HTMLElement>('[data-satin-row]')
  if (rows.length === 1) return rows[0]!
  const content = anchor.querySelector<HTMLElement>('[data-satin-row-action-content]')
  if (!content) return anchor
  // A press during the previous lift's dismissal finds that lift's placeholder beside the
  // content. It is not content: counting it lifted the wrapper instead.
  // The swipe face tint is paint, not content.
  const children = [...content.children].filter(
    child => !child.matches('[data-satin-context-placeholder], [data-satin-swipe-face-tint]'),
  )
  const only = children.length === 1 ? children[0] : null
  return only instanceof HTMLElement ? only : content
}

export type PromotedContextSource = {
  /** The promoted element, still in its own place in the DOM. */
  element: HTMLElement
  /** Whether the source's place in the layout has moved (its scroller scrolled). */
  moved(): boolean
  /** Return the source to its place in the layout. Safe to call more than once. */
  restore(): void
  /** Static own-shape shadow for lifted content. Rows keep their box-shadow and pass null. */
  shadow: HTMLElement | null
}

/** Promote the existing source without changing its DOM ancestry or React ownership.
 * A row lifts as a rounded cell; other content keeps its own shape and paint. */
export function promoteContextSource(source: HTMLElement): PromotedContextSource {
  const rect = source.getBoundingClientRect()
  const width = source.offsetWidth
  const height = source.offsetHeight
  const style = source.getAttribute('style')
  const popover = source.getAttribute('popover')
  const content = !source.matches('[data-satin-row]')
  // Resolved while the source is still in place, so the popover's UA canvas paint can
  // be overwritten without cloning an unpromoted twin into the document.
  const paint = content ? readOwnPaint(source) : null
  const shapes = content ? artworkShapes(source) : []
  const clone = content ? shadowClone(source) : null
  const placeholder = source.ownerDocument.createElement('div')
  placeholder.style.width = `${width}px`
  placeholder.style.height = `${height}px`
  placeholder.setAttribute('aria-hidden', 'true')
  placeholder.dataset.satinContextPlaceholder = 'true'
  source.before(placeholder)
  source.dataset.satinContextLift = content ? 'content' : 'row'
  source.setAttribute('popover', 'manual')
  Object.assign(source.style, {
    position: 'fixed',
    inset: 'auto',
    margin: '0',
    left: `${rect.left + (rect.width - width) / 2}px`,
    top: `${rect.top + (rect.height - height) / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
  })
  // Measured once the source has left the flow: until then the placeholder sits beside it, and a
  // bottom-anchored list (a short chat thread) places both one source-height higher.
  const resting = placeholder.getBoundingClientRect()
  // The top layer's UA popover style paints a canvas background, border and padding.
  let shadow: HTMLElement | null = null
  if (content && clone && paint) {
    applyOwnPaint(source, paint)
    // The copy sits outside the source's ancestors, where styles that depend on them no longer
    // match: a wrapper's cell paint (white corners behind a bubble) or a bubble's tail padding.
    applyOwnPaint(clone, paint)
    shadow = mountContentShadow(source, clone, shapes)
  } else Object.assign(source.style, { border: '0', overflow: 'hidden' })
  // The shadow plate enters the top layer first, so the lifted source paints over its clone.
  shadow?.showPopover?.()
  source.showPopover?.()
  let restored = false
  return {
    element: source,
    shadow,
    moved() {
      const now = placeholder.getBoundingClientRect()
      return Math.abs(now.top - resting.top) > 0.5 || Math.abs(now.left - resting.left) > 0.5
    },
    restore() {
      if (restored) return
      restored = true
      if (shadow?.isConnected) shadow.hidePopover?.()
      shadow?.remove()
      if (source.isConnected) source.hidePopover?.()
      if (popover === null) source.removeAttribute('popover')
      else source.setAttribute('popover', popover)
      if (style === null) source.removeAttribute('style')
      else source.setAttribute('style', style)
      delete source.dataset.satinContextLift
      placeholder.remove()
    },
  }
}

/** Popover UA styles stand in wherever the content's own styles are silent (a canvas
 * background, a border, padding, clipping). Re-apply the used values the content had
 * in place, read before promotion so no unpromoted twin is inserted. */
const ownPaint = [
  'background-color',
  'color',
  'overflow',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
]
function readOwnPaint(source: HTMLElement) {
  const computed = getComputedStyle(source)
  return ownPaint.map(property => computed.getPropertyValue(property))
}

function applyOwnPaint(source: HTMLElement, values: readonly string[]) {
  for (let index = 0; index < ownPaint.length; index++)
    source.style.setProperty(ownPaint[index]!, values[index]!)
}

/** Glyph copy for the drop-shadow. Artwork is omitted: its alpha would force the
 * blur to cover the whole image, which is the frame cost this plate avoids. */
function shadowClone(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.removeAttribute('popover')
  delete clone.dataset.satinContextLift
  for (const element of clone.querySelectorAll<HTMLElement>('[id]')) element.removeAttribute('id')
  for (const image of clone.querySelectorAll<HTMLElement>('img, canvas, video'))
    image.style.visibility = 'hidden'
  Object.assign(clone.style, {
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    margin: '0',
    transform: 'none',
  })
  return clone
}

/** One box per opaque artwork, in the source's border box, sampled once at promotion. */
function artworkShapes(source: HTMLElement) {
  const origin = source.getBoundingClientRect()
  const shapes: {
    left: string
    top: string
    width: string
    height: string
    borderRadius: string
  }[] = []
  for (const image of source.querySelectorAll<HTMLElement>('img, canvas, video')) {
    const rect = image.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    shapes.push({
      left: `${rect.left - origin.left}px`,
      top: `${rect.top - origin.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: getComputedStyle(image).borderRadius,
    })
  }
  return shapes
}

function mountContentShadow(
  source: HTMLElement,
  clone: HTMLElement,
  shapes: ReturnType<typeof artworkShapes>,
) {
  const document = source.ownerDocument
  const plate = document.createElement('div')
  plate.dataset.satinContextShadow = 'true'
  plate.setAttribute('popover', 'manual')
  plate.setAttribute('aria-hidden', 'true')
  plate.setAttribute('inert', '')
  for (const shape of shapes) {
    const layer = document.createElement('div')
    layer.dataset.satinContextShadowShape = 'true'
    Object.assign(layer.style, shape)
    plate.append(layer)
  }
  const paint = document.createElement('div')
  paint.dataset.satinContextShadowPaint = 'true'
  paint.append(clone)
  plate.append(paint)
  Object.assign(plate.style, {
    position: 'fixed',
    inset: 'auto',
    margin: '0',
    padding: '0',
    border: '0',
    background: 'transparent',
    overflow: 'visible',
    pointerEvents: 'none',
    left: source.style.left,
    top: source.style.top,
    width: source.style.width,
    height: source.style.height,
    willChange: 'transform, opacity',
  })
  document.body.append(plate)
  return plate
}

/** The longest a recognised context menu waits for its custom preview's images. The hold
 * normally covers the decode; this only bounds a slow or failing image, which then shows
 * as it arrives rather than holding the menu. */
export const PREVIEW_DECODE_LIMIT_MS = 250

/** Resolves once every image in a custom preview is decoded (or has failed); undefined when
 * there is nothing to wait for. A preview that moves before its pixels exist shows its empty
 * backing for a few frames: the dark tile and late artwork the owner saw lifting an album
 * (nowplaying-art-menu-glitch-2026-10-11). */
export function decodePreviewImages(root: HTMLElement): Promise<void> | undefined {
  // An image without a source has nothing to decode; without decode() (older engines, test
  // DOMs) there is nothing to wait on.
  const pending = [...root.querySelectorAll('img')].filter(
    image => image.getAttribute('src') && typeof image.decode === 'function',
  )
  if (pending.length === 0) return undefined
  return Promise.all(pending.map(image => image.decode().catch(() => undefined))).then(() => {})
}
