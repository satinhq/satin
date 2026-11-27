/*
 * The vertical scroll indicator of a screen's primary scroll view.
 *
 * WebKit's own indicator spans the scroll view's whole frame, and the primary scroll view's frame
 * runs under the navigation bar and the bottom bars. Its indicator therefore starts under the bar
 * at rest and below it once scrolled. Native ranges the indicator over the content insets instead
 * (`verticalScrollIndicatorInsets`), so it never jumps. This draws that indicator in the screen's
 * frame: the track runs from 3 pt below the bar to 3 pt above the bottom inset chain (never into the
 * display's rounded corner), and the thumb
 * follows UIKit's proportions (iOS 27 native reference, iPhone 17 Pro Max: 3 pt wide, 3 pt from the edge,
 * top at the bar's safe edge + 3 pt even under a large title).
 */

/** Minimum thumb length while not rubber-banding, as UIKit keeps. */
const MINIMUM_THUMB_PX = 36
/** Shortest the thumb gets while rubber-banding past an end. */
const MINIMUM_BANDED_THUMB_PX = 7
/** The indicator's distance from the bar's safe edge and from the bottom inset chain. */
const TRACK_INSET_PX = 3
/*
 * The indicator's floor above the bottom safe edge: UIKit keeps it clear of the display's rounded
 * corner (iOS 27 native reference, iPhone 17 Pro Max: 65 pt above the screen bottom with a 34 pt home
 * indicator, with or without a bottom toolbar; 86 pt over a tab bar; 95 pt over a 50 pt composer).
 */
const CORNER_FLOOR_PX = 31
/** How long the indicator stays after the last scroll before it fades. */
const HIDE_DELAY_MS = 500
/** Recovery for a platform contact whose terminal event is lost; never a visual timing fit. */
const CONTACT_FAILSAFE_MS = 30_000

const indicatorOwners = new WeakMap<HTMLElement, () => void>()

export type ScrollIndicatorParts = Readonly<{
  /** The screen's frame the track is laid out in (the screen's motion layer). */
  frame: HTMLElement
  track: HTMLElement
  thumb: HTMLElement
  mode?: 'screen' | 'sheet'
}>

/** The bar's safe edge below the frame top: `--satin-screen-bar-inset` (styles.css). */
function barInset(frame: HTMLElement) {
  return parseFloat(getComputedStyle(frame).getPropertyValue('--satin-screen-bar-inset')) || 0
}

/** The bottom content inset the indicator respects: the inset chain without a bottom toolbar. */
function indicatorBottomInset(scroller: HTMLElement) {
  const style = getComputedStyle(scroller)
  const padding = parseFloat(style.paddingBottom) || 0
  const bottomBar = parseFloat(style.getPropertyValue('--satin-bottom-bar-inset')) || 0
  const safeBottom = parseFloat(style.getPropertyValue('--satin-inset-bottom')) || 0
  return Math.max(padding - bottomBar + TRACK_INSET_PX, safeBottom + CORNER_FLOOR_PX)
}

export function installScrollIndicator(scroller: HTMLElement, parts: ScrollIndicatorParts) {
  indicatorOwners.get(scroller)?.()
  scroller.dataset.satinScrollIndicatorOwned = 'true'
  const { frame, track, thumb, mode = 'screen' } = parts
  let trackLength = 0
  let hideTimer = 0
  let interacting = false
  let heldPointer: number | undefined
  let contactTimer = 0
  let layoutFrame = 0
  let disposed = false
  // Navigation entries also publish a presentation kind; only dialogs own sheet motion/insets.
  const nearestPresentation = frame.closest('dialog[data-satin-presentation]')
  const presentation =
    nearestPresentation?.getAttribute('data-satin-presentation') === 'sheet'
      ? nearestPresentation
      : null
  const sheetSurface = presentation
    ? frame.closest<HTMLElement>('.satin-presentation-surface')
    : null

  const place = () => {
    const visible = scroller.clientHeight
    const total = scroller.scrollHeight
    const range = total - visible
    if (range <= 0 || trackLength <= 0) {
      track.dataset.satinScrollIndicatorScrollable = 'false'
      return
    }
    track.dataset.satinScrollIndicatorScrollable = 'true'
    const offset = scroller.scrollTop
    const overshoot = offset < 0 ? -offset : Math.max(0, offset - range)
    const resting = Math.max(MINIMUM_THUMB_PX, (trackLength * visible) / total)
    const length = Math.max(MINIMUM_BANDED_THUMB_PX, resting - overshoot)
    const progress = Math.min(1, Math.max(0, offset / range))
    const position = progress * (trackLength - length)
    thumb.style.height = `${length}px`
    thumb.style.transform = `translate3d(0, ${position}px, 0)`
  }

  // Detents supply the scale. A rounded clientHeight/border-box ratio is not that transform.
  const measure = () => {
    const frameBox = frame.getBoundingClientRect()
    const scrollerBox = scroller.getBoundingClientRect()
    const frameStyle = getComputedStyle(frame)
    const declaredScale = parseFloat(frameStyle.getPropertyValue('--satin-sheet-content-scale'))
    const scale = declaredScale > 0 ? declaredScale : 1
    const frameHeight = frame.clientHeight === 0 ? 0 : frameBox.height / scale
    const scrollerStyle = getComputedStyle(scroller)
    const padding = parseFloat(scrollerStyle.paddingBottom) || 0
    const bottomBar = parseFloat(scrollerStyle.getPropertyValue('--satin-bottom-bar-inset')) || 0
    let top = (scrollerBox.top - frameBox.top) / scale + TRACK_INSET_PX
    if (mode === 'screen') top += barInset(frame)
    let bottom = (frameBox.bottom - scrollerBox.bottom) / scale
    if (sheetSurface) {
      const surfaceBox = sheetSurface.getBoundingClientRect()
      const surfaceStyle = getComputedStyle(sheetSurface)
      const topRadius = parseFloat(surfaceStyle.borderTopRightRadius) || 0
      const bottomRadius = parseFloat(surfaceStyle.borderBottomRightRadius) || 0
      // The grabber/title precede this content frame. Corners belong to the unscaled surface.
      top = Math.max(top, (surfaceBox.top + topRadius - frameBox.top) / scale)
      bottom = Math.max(
        bottom + Math.max(TRACK_INSET_PX, padding - bottomBar + TRACK_INSET_PX),
        (frameBox.bottom - surfaceBox.bottom + bottomRadius) / scale,
      )
    } else bottom += indicatorBottomInset(scroller)
    track.style.top = `${top}px`
    track.style.bottom = `${bottom}px`
    trackLength = Math.max(0, frameHeight - top - bottom)
    place()
  }
  const dragging = () => presentation?.getAttribute('data-satin-presentation-moving') === 'drag'
  const scheduleMeasure = () => {
    if (disposed || layoutFrame || dragging()) return
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0
      if (!disposed && !dragging()) measure()
    })
  }

  const hide = () => {
    if (heldPointer !== undefined) return
    interacting = false
    track.dataset.satinScrollIndicatorVisible = 'false'
  }
  const scheduleHide = () => {
    window.clearTimeout(hideTimer)
    if (heldPointer === undefined) hideTimer = window.setTimeout(hide, HIDE_DELAY_MS)
  }
  const endContact = () => {
    if (heldPointer === undefined) return
    heldPointer = undefined
    window.clearTimeout(contactTimer)
    window.removeEventListener('pointerup', ended, true)
    window.removeEventListener('pointercancel', ended, true)
    window.removeEventListener('lostpointercapture', ended, true)
    window.removeEventListener('blur', windowBlurred, true)
    document.removeEventListener('visibilitychange', visibilityChanged, true)
    scheduleHide()
  }
  const ended = (event: PointerEvent) => {
    if (event.pointerId === heldPointer) endContact()
  }
  const windowBlurred = (event: FocusEvent) => {
    if (event.target === window) endContact()
  }
  const visibilityChanged = () => {
    if (document.visibilityState === 'hidden') endContact()
  }
  const targetElement = (target: EventTarget | null) =>
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  const startInteraction = (event: PointerEvent) => {
    const target = targetElement(event.target)
    if (!target || !scroller.contains(target)) return
    if (event.pointerType !== 'touch') {
      endContact()
      interacting = true
      scheduleHide()
      return
    }
    if (heldPointer !== undefined) return
    interacting = true
    heldPointer = event.pointerId
    window.clearTimeout(hideTimer)
    // Ancestors may actually scroll by chaining. Input arms them; only their own scroll shows them.
    window.addEventListener('pointerup', ended, true)
    window.addEventListener('pointercancel', ended, true)
    window.addEventListener('lostpointercapture', ended, true)
    window.addEventListener('blur', windowBlurred, true)
    document.addEventListener('visibilitychange', visibilityChanged, true)
    contactTimer = window.setTimeout(endContact, CONTACT_FAILSAFE_MS)
  }
  const wheel = () => {
    endContact()
    interacting = true
    scheduleHide()
  }
  const scrolled = (event: Event) => {
    if (!interacting || event.target !== scroller) return
    place()
    if (track.dataset.satinScrollIndicatorVisible !== 'true')
      track.dataset.satinScrollIndicatorVisible = 'true'
    scheduleHide()
  }

  const resize = new ResizeObserver(scheduleMeasure)
  resize.observe(frame)
  resize.observe(scroller)
  for (const child of scroller.children) resize.observe(child)
  const children = new MutationObserver(() => {
    for (const child of scroller.children) resize.observe(child)
    scheduleMeasure()
  })
  children.observe(scroller, { childList: true })
  scroller.addEventListener('scroll', scrolled, { passive: true })
  scroller.addEventListener('pointerdown', startInteraction, true)
  scroller.addEventListener('wheel', wheel, { passive: true, capture: true })
  const motion = new MutationObserver(scheduleMeasure)
  if (presentation)
    motion.observe(presentation, {
      attributes: true,
      attributeFilter: ['data-satin-presentation-moving'],
    })
  measure()
  const release = () => {
    if (disposed) return
    disposed = true
    endContact()
    window.clearTimeout(hideTimer)
    cancelAnimationFrame(layoutFrame)
    motion.disconnect()
    resize.disconnect()
    children.disconnect()
    scroller.removeEventListener('scroll', scrolled)
    scroller.removeEventListener('pointerdown', startInteraction, true)
    scroller.removeEventListener('wheel', wheel, true)
    hide()
    track.dataset.satinScrollIndicatorScrollable = 'false'
    if (indicatorOwners.get(scroller) === release) indicatorOwners.delete(scroller)
    delete scroller.dataset.satinScrollIndicatorOwned
  }
  indicatorOwners.set(scroller, release)
  return release
}
