/*
 * The zoom transition's interactive dismissal: on a screen that zoomed in from a source, a finger
 * dragging down (with the content scrolled to its top) shrinks the screen, moves it with the
 * finger and, on release, either zooms it back into the source or returns it to full screen.
 *
 * It uses touch events like the sheet's drag (presentation/PresentationSurface.tsx): the drag owns
 * the touch only once it has moved mostly downward, so taps, horizontal back swipes and ordinary
 * scrolling are untouched.
 */

import { navigatorTransitionRuntime, type NavigatorStore } from './store.ts'
import type { TransitionController } from './types.ts'
import { ZOOM_DRAG_START_DISTANCE } from './zoomMotion.ts'
import { beginZoomDrag, visibleZoomSource, zoomDragHandleOf } from './zoomTransition.ts'

type Sample = Readonly<{ x: number; y: number; time: number }>

/** How far back the release velocity looks: the finger's last ~5 frames. */
const VELOCITY_WINDOW_MS = 80

/**
 * Conservative admission, about 26.6 degrees from vertical. Native Music on iPad rejects
 * dx 300 / dy 450 (33.7 degrees), 5/5. Its exact acceptance angle is not yet measured.
 */
const MAX_HORIZONTAL_TO_DOWNWARD_RATIO = 0.5

/** Installs the dismissal drag on a zoomed screen's element; returns its removal. */
export function installZoomDismissDrag(
  screen: HTMLElement,
  entryKey: string,
  navigator: NavigatorStore,
) {
  let origin: (Sample & { target: Element }) | undefined
  /** The drag has claimed this touch: WebKit's own pan never starts. */
  let claimed = false
  let controller: TransitionController | undefined
  let samples: Sample[] = []

  const begin = (event: TouchEvent) => {
    const touch = event.touches[0]
    const single = touch && event.touches.length === 1 && event.target instanceof Element
    origin = single
      ? { x: touch.clientX, y: touch.clientY, time: event.timeStamp, target: event.target }
      : undefined
    claimed = false
    samples = origin ? [origin] : []
  }

  const translationOf = (touch: Touch) => ({
    x: touch.clientX - origin!.x,
    y: touch.clientY - origin!.y,
  })

  /**
   * Decided on the first move. Measured with real touches on the sheet's drag: WebKit holds its
   * own pan back only for the first touchmove, so a preventDefault sent later (at 10 pt) loses
   * the race and the content rubber-bands under the shrinking screen.
   */
  const canClaim = (translation: Readonly<{ x: number; y: number }>) => {
    const downward =
      translation.y > 0 &&
      Math.abs(translation.x) <= translation.y * MAX_HORIZONTAL_TO_DOWNWARD_RATIO
    return (
      downward &&
      isScrolledToTop(origin!.target, screen) &&
      navigator[navigatorTransitionRuntime].canBeginInteractivePop() &&
      visibleZoomSource(entryKey, document.body, screen) !== undefined
    )
  }

  /** The pop begins once the finger has moved far enough to be a drag rather than a tap. */
  const beginPop = (translation: Readonly<{ x: number; y: number }>) => {
    if (Math.hypot(translation.x, translation.y) < ZOOM_DRAG_START_DISTANCE) return
    beginZoomDrag(entryKey, { x: origin!.x, y: origin!.y })
    controller = navigator[navigatorTransitionRuntime].beginInteractivePop()
    if (!controller) {
      origin = undefined
      claimed = false
    }
  }

  const move = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!origin || !touch) return
    samples = [...samples, { x: touch.clientX, y: touch.clientY, time: event.timeStamp }].filter(
      sample => event.timeStamp - sample.time <= VELOCITY_WINDOW_MS,
    )
    const translation = translationOf(touch)
    if (!claimed && !canClaim(translation)) {
      // This touch is a scroll, a tap or a back swipe: leave it alone until the finger lifts.
      origin = undefined
      return
    }
    claimed = true
    if (event.cancelable) event.preventDefault()
    if (!controller) beginPop(translation)
    // The handle exists once the pop has bound to its screens (after React commits it).
    if (controller) zoomDragHandleOf(controller)?.track(translation)
  }

  const end = () => {
    const owned = controller
    controller = undefined
    origin = undefined
    claimed = false
    if (!owned) return
    const handle = zoomDragHandleOf(owned)
    if (handle) handle.release(velocityOf(samples))
    else owned.cancelInteractive?.(0)
    samples = []
  }

  screen.addEventListener('touchstart', begin, { passive: true })
  screen.addEventListener('touchmove', move, { passive: false })
  screen.addEventListener('touchend', end)
  screen.addEventListener('touchcancel', end)
  return () => {
    screen.removeEventListener('touchstart', begin)
    screen.removeEventListener('touchmove', move)
    screen.removeEventListener('touchend', end)
    screen.removeEventListener('touchcancel', end)
  }
}

/** Whether every scroll view between the touched element and the screen is at its top. */
function isScrolledToTop(target: Element, screen: HTMLElement) {
  for (let node: Element | null = target; node && node !== screen; node = node.parentElement) {
    if (node.scrollTop > 0) return false
  }
  return true
}

/** Points per second over the last samples. */
function velocityOf(samples: readonly Sample[]) {
  const first = samples[0]
  const last = samples.at(-1)
  if (!first || !last || last.time <= first.time) return { x: 0, y: 0 }
  const seconds = (last.time - first.time) / 1000
  return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds }
}
