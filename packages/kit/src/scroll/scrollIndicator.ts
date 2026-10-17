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

export type ScrollIndicatorParts = Readonly<{
  /** The screen's frame the track is laid out in (the screen's motion layer). */
  frame: HTMLElement
  track: HTMLElement
  thumb: HTMLElement
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
  const { frame, track, thumb } = parts
  let trackLength = 0
  let hideTimer = 0
  let interacting = false

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

  // The track follows the primary's frame and insets; it changes only on layout, never per scroll.
  const measure = () => {
    const frameBox = frame.getBoundingClientRect()
    const scrollerBox = scroller.getBoundingClientRect()
    const top = scrollerBox.top - frameBox.top + barInset(frame) + TRACK_INSET_PX
    const bottom = frameBox.bottom - scrollerBox.bottom + indicatorBottomInset(scroller)
    track.style.top = `${top}px`
    track.style.bottom = `${bottom}px`
    trackLength = Math.max(0, frameBox.height - top - bottom)
    place()
  }

  const hide = () => {
    interacting = false
    track.dataset.satinScrollIndicatorVisible = 'false'
  }
  // Only a scroll the person drives shows the indicator; restoration and scrollTo do not flash it.
  const startInteraction = () => {
    interacting = true
  }
  const scrolled = () => {
    if (!interacting) return
    place()
    if (track.dataset.satinScrollIndicatorVisible !== 'true')
      track.dataset.satinScrollIndicatorVisible = 'true'
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(hide, HIDE_DELAY_MS)
  }

  const resize = new ResizeObserver(measure)
  resize.observe(frame)
  resize.observe(scroller)
  for (const child of scroller.children) resize.observe(child)
  const children = new MutationObserver(() => {
    for (const child of scroller.children) resize.observe(child)
    measure()
  })
  children.observe(scroller, { childList: true })
  scroller.addEventListener('scroll', scrolled, { passive: true })
  scroller.addEventListener('touchstart', startInteraction, { passive: true })
  scroller.addEventListener('wheel', startInteraction, { passive: true })
  measure()
  return () => {
    window.clearTimeout(hideTimer)
    resize.disconnect()
    children.disconnect()
    scroller.removeEventListener('scroll', scrolled)
    scroller.removeEventListener('touchstart', startInteraction)
    scroller.removeEventListener('wheel', startInteraction)
    hide()
  }
}
