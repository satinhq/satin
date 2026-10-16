/*
 * Measured values of SwiftUI's `.navigationTransition(.zoom(sourceID:in:))` on iOS 27.
 *
 * native reference: a stock native fixture (a 180 pt tile with a 10 pt corner in a
 * NavigationStack grid, pushed to a full-screen page), iPhone 17 Pro Max Simulator, iOS 27.0.
 * Core Animation presentation layers were logged on every display tick (the zoom draws through an
 * SDF "window" layer and two portals: the source tile and the page), and idb drove real Simulator
 * touches. Appearance (cross-fade, dim, corner) comes from frames of the same runs, matched to the
 * logged ticks by the window's rectangle. Fits and plots: native measurements
 * (the measured reference, October 11).
 */

/** A spring as Core Animation runs it: natural frequency (rad/s) and damping ratio. */
export type ZoomSpring = Readonly<{ omega: number; zeta: number }>

/** The window's centre and its size each follow their own spring. */
export type ZoomSprings = Readonly<{ center: ZoomSpring; size: ZoomSpring }>

/**
 * Push: the centre and the width move together, critically damped (half way at 88 ms; SwiftUI's
 * duration 0.33 s); the height lags slightly. Native moves the width with the centre, so the
 * width shares the centre's spring here and the height takes the size spring (rms 0.002, 51 ticks).
 */
export const ZOOM_PUSH: ZoomSprings & { height: ZoomSpring } = {
  center: { omega: 19.1, zeta: 1 },
  size: { omega: 19.1, zeta: 1 },
  height: { omega: 16.3, zeta: 0.95 },
}

/** Pop (the back button): centre and size, slightly underdamped (rms 0.005, 49 ticks). */
export const ZOOM_POP: ZoomSprings = {
  center: { omega: 18.9, zeta: 0.93 },
  size: { omega: 16.4, zeta: 0.9 },
}

/** A released drag that dismisses: it bounces about 4% into the source (two drags, rms ≤ 0.01). */
export const ZOOM_DISMISS: ZoomSprings = {
  center: { omega: 13.75, zeta: 0.82 },
  size: { omega: 13.75, zeta: 0.7 },
}

/** A released drag that returns to full screen (rms 0.005). */
export const ZOOM_RETURN: ZoomSprings = {
  center: { omega: 22.6, zeta: 0.94 },
  size: { omega: 22.6, zeta: 0.94 },
}

/** The screen behind darkens to 15% black at full openness, in proportion to the openness
 * (0.028 / 0.043 / 0.063 / 0.079 / 0.099 measured at openness 0.18 / 0.30 / 0.42 / 0.52 / 0.69). */
export const ZOOM_DIM_OPACITY = 0.15

/** The screen behind shrinks about its centre to this scale at full openness (1 − 0.0788 × openness,
 * exact over 17 ticks). It holds there while a finger drags the zoomed screen. */
export const ZOOM_REAR_SCALE = 0.9212

/** The window's corner radius goes from the source's to the display's, in proportion to the
 * openness (residual ≤ 3 pt over 9 frames). 58 pt is the iPhone 17 Pro Max display's; iPad
 * displays are far squarer. */
export const ZOOM_PHONE_DISPLAY_RADIUS = 58
export const ZOOM_PAD_DISPLAY_RADIUS = 18

/** The source tile is drawn over the window's top square and cross-fades with the page: on push it
 * fades out linearly between these times (0.81 / 0.60 / 0.40 / 0.21 at 33 / 50 / 67 / 83 ms)… */
export const ZOOM_PUSH_SOURCE_FADE_MS = { start: 17, end: 100 } as const
/** …and on pop it fades in (0.49 / 0.70 / 0.87 / 0.98 at 67 / 84 / 100 / 117 ms). */
export const ZOOM_POP_SOURCE_FADE_MS = { start: 25, end: 111 } as const

/** Destination portal opacity during a native pop, independent of the source portal.
 * Measured CADisplayLink presentation alpha, iOS 27 stock zoom fixture, October 13:
 * zoom-return-zorder/native/{alpha.mp4,layers-alpha.log,alpha.json}. The page stays
 * opaque through 67 ms, then fades while the already opaque tile continues its flight.
 * These are rounded 60 Hz samples of that channel, not a newly chosen spring. */
export const ZOOM_POP_PAGE_ALPHA: readonly (readonly [number, number])[] = [
  [0, 1],
  [67, 1],
  [83, 0.86253],
  [100, 0.6992],
  [117, 0.55629],
  [133, 0.43524],
  [150, 0.33528],
  [167, 0.25448],
  [183, 0.19035],
  [200, 0.14029],
  [217, 0.10181],
  [233, 0.07266],
  [250, 0.0509],
  [267, 0.03489],
  [283, 0.02331],
  [300, 0.01506],
  [317, 0.0093],
  [333, 0.00536],
  [350, 0.00274],
  [367, 0.00106],
  [383, 0.00003],
  [400, 0],
]

/** The bar's items (the back button's glass, the title) fade in over the push on a smoothstep… */
export const ZOOM_PUSH_CHROME_FADE_MS = 250
/** …and out over the pop, linearly from this window (1 → 0, measured 0.91 at 50 ms, 0.07 at 217 ms). */
export const ZOOM_POP_CHROME_FADE_MS = { start: 33, end: 240 } as const

/*
 * The interactive dismissal (a slow 540 pt drag, 70 ticks, linear throughout): the window's width
 * shrinks 0.000698 of the screen per point dragged and its height 1.223 points per point, both
 * counted from the 12 pt the recognizer needs. Its bottom edge rises with the square of the drag.
 */
export const ZOOM_DRAG_SLOP = 12
export const ZOOM_DRAG_WIDTH_LOSS_PER_POINT = 0.000698
export const ZOOM_DRAG_HEIGHT_LOSS_PER_POINT = 1.223 / 956
export const ZOOM_DRAG_BOTTOM_RISE = 2.94e-4

/** The edge back swipe zooms too (dark run, 3 swipes): the window shrinks uniformly by 0.66 of the
 * finger's travel over the screen's width (0.0015 per point on a 440 pt screen), counted from the
 * recognizer's 18 pt; its left edge follows the finger. 88 pt returned; 298 and 398 pt dismissed. */
export const ZOOM_EDGE_SLOP = 18
export const ZOOM_EDGE_SCALE_LOSS = 0.66

/** A released drag dismisses past this distance down (native: 50 and 80 pt returned, 140 pt
 * dismissed; an 80 pt flick at 849 pt/s still returned, so speed alone does not dismiss). */
export const ZOOM_DISMISS_DISTANCE = 110

/** A drag starts once the finger has moved this far, mostly downward, from where it went down. */
export const ZOOM_DRAG_START_DISTANCE = 10
