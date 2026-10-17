// Measured iOS 27 navigation bar chrome curves (what bar items do while a page moves) and the
// keyframe builders that turn them into Web Animations keyframes. Pure data and math: no DOM.

/** Incoming bar chrome, measured on the iOS 27.0 Simulator from the presentation layers of stock
 * Measured at every display frame,
 * light and dark agree within 0.04): milliseconds since the page starts moving. A push brings the
 * destination's glass items in faster than a pop brings the revealed screen's back: a push shows
 * 0.56 at 100 ms (Reminders-style list → list, back circle and trailing "…" together), a pop 0.30
 * at 100 ms (Chats thread → root, trailing compose Menu). */
const PUSH_INCOMING = [
  [0, 0],
  [17, 0.05],
  [33, 0.13],
  [50, 0.23],
  [67, 0.34],
  [83, 0.45],
  [100, 0.56],
  [117, 0.65],
  [133, 0.74],
  [150, 0.81],
  [167, 0.86],
  [183, 0.91],
  [200, 0.95],
  [217, 0.98],
  [240, 1],
] as const
const POP_INCOMING = [
  [0, 0],
  [34, 0.03],
  [50, 0.09],
  [67, 0.19],
  [84, 0.3],
  [100, 0.43],
  [117, 0.52],
  [134, 0.63],
  [150, 0.7],
  [167, 0.79],
  [184, 0.84],
  [200, 0.9],
  [217, 0.93],
  [234, 0.97],
  [250, 0.99],
  [267, 1],
] as const

/* Leaving bar chrome, measured like the arriving curves (reference, presentation-layer measurements presentation layers,
 * medians of four runs each, light and dark): a pop's leaving items (Reminders-style list → root:
 * back circle and trailing "…" alike) hold until 33 ms, are 0.72 at 100 ms and gone at 283 ms. A
 * push's leaving items (Chats root → thread, trailing compose) run the same curve 17 ms earlier
 * (within 0.012 at every knot), as the push arrivals lead the pop arrivals. */
const POP_OUTGOING = [
  [0, 1],
  [33, 1],
  [50, 0.99],
  [67, 0.935],
  [83, 0.83],
  [100, 0.72],
  [117, 0.63],
  [133, 0.53],
  [150, 0.42],
  [167, 0.32],
  [183, 0.24],
  [200, 0.18],
  [217, 0.13],
  [233, 0.07],
  [250, 0.04],
  [267, 0.01],
  [283, 0],
] as const
const PUSH_OUTGOING = [
  [0, 1],
  [17, 1],
  [33, 0.99],
  [50, 0.935],
  [67, 0.83],
  [83, 0.72],
  [100, 0.63],
  [117, 0.53],
  [133, 0.42],
  [150, 0.32],
  [167, 0.24],
  [183, 0.18],
  [200, 0.13],
  [217, 0.07],
  [233, 0.04],
  [250, 0.01],
  [267, 0],
] as const

/** iOS 27 bar chrome curves: [milliseconds since the page starts moving, opacity] knots, linear
 * between them. They run only when the page is sent to its end (tap push, back-button pop,
 * completing release). A held back swipe keeps the outgoing items and back control fully shown and
 * the incoming items hidden at every position, and a cancelled release changes nothing.
 * Every curve also drives the item's scale and blur (chromeDissolve). Where a back control replaces
 * a leading item, one glass circle stays put and only the symbols cross-fade (leadingGlassSwap). A
 * screen's principal item is not faded: it is shown at once on push and moves with its page on
 * pop (native). */
export const NAVIGATION_CHROME_CURVES = Object.freeze({
  /** The back control when the destination has none (popping to a root). */
  backLeave: POP_OUTGOING,
  /** The back control arriving with a push from a root. */
  backAppear: PUSH_INCOMING,
  /** The outgoing entry's bar items in a push. */
  pushToolbarLeave: PUSH_OUTGOING,
  /** The outgoing entry's bar items in a pop. */
  popToolbarLeave: POP_OUTGOING,
  /** The destination's bar items in a push. */
  pushToolbarAppear: PUSH_INCOMING,
  /** The revealed entry's bar items in a pop. */
  popToolbarAppear: POP_INCOMING,
} satisfies Record<string, readonly (readonly [number, number])[]>)

/* Native bar items dissolve as one quantity (reference, presentation-layer measurements presentation layers and their
 * CAFilters, 16 push/pop transitions): an arriving or leaving glass item at opacity a is scaled
 * 1 + 0.2 (1 - a) about its centre (residual under 0.003) and blurred 10 (1 - a) pt, platter and
 * symbol together (every sampled ratio 10.0). */
export const NAVIGATION_CHROME_DISSOLVE = Object.freeze({ scale: 0.2, blur: 10 })

/** The keyframe for a chrome item at `opacity`. A shown item carries no scale or filter, so a
 * finished arrival leaves no stacking context or containing block behind its menus. */
export function chromeDissolve(opacity: number): Keyframe {
  const hidden = 1 - opacity
  if (hidden <= 0.001) return { opacity, scale: 'none', filter: 'none' }
  return {
    opacity,
    scale: String(Number((1 + NAVIGATION_CHROME_DISSOLVE.scale * hidden).toFixed(4))),
    filter: `blur(${Number((NAVIGATION_CHROME_DISSOLVE.blur * hidden).toFixed(2))}px)`,
  }
}

/* A leading glass swap (a back control replacing a leading glass item, or replaced by one),
 * measured like the bar curves (reference, presentation-layer measurements presentation layers and CAFilters, Chats root
 * <-> thread, 6 pushes and 6 pops, light and dark; push milliseconds since the page starts moving).
 * The one circle at that spot swells to 1.22 wide and 1.20 tall at 150 ms and is back at 1 at
 * 300 ms (native undershoots to 0.97 and settles at 567 ms; not modelled). Inside it the leaving symbol fades on `leave` and the
 * arriving one fades in as its complement (within 0.01 from 100 ms). Each symbol is scaled
 * 1 - 0.8 (1 - a) of the circle (residual 0.0005 over 277 samples) and blurred like any other bar
 * item. A pop runs all of it 17 ms later (within 0.02 at every knot). */
export const NAVIGATION_LEADING_SWAP = Object.freeze({
  leave: [
    [0, 1],
    [33, 1],
    [50, 0.89],
    [67, 0.79],
    [83, 0.7],
    [100, 0.57],
    [117, 0.485],
    [133, 0.386],
    [150, 0.298],
    [167, 0.223],
    [183, 0.16],
    [200, 0.109],
    [217, 0.061],
    [233, 0.032],
    [250, 0.014],
    [267, 0],
  ],
  /* [milliseconds, scale] of the circle: the mean of native's width and height scale. Native's
   * platter is up to 0.05 wider than tall on the way back; the glass circle stays round. Native
   * then undershoots to 0.97 and settles at 567 ms; that tail outlived the page transition and
   * doubled the swap's missed frames in Catalyst (reference perf), so the circle stops at 1 at 300 ms,
   * where native crosses it. */
  swell: [
    [0, 1],
    [33, 1],
    [50, 1.037],
    [67, 1.074],
    [83, 1.113],
    [100, 1.15],
    [117, 1.181],
    [133, 1.202],
    [150, 1.21],
    [167, 1.205],
    [183, 1.188],
    [200, 1.162],
    [217, 1.133],
    [233, 1.101],
    [250, 1.071],
    [267, 1.023],
    [283, 1.019],
    [300, 1],
  ],
  symbolScale: 0.8,
  popDelay: 17,
} as const)

export type SwapPart = 'circle' | 'leaving' | 'arriving'

/** A leading glass swap's keyframes for `part`, one per swell knot. The back control's visual is
 * the circle (it carries the back glass and the chevron); a symbol inside it takes the swell from
 * it, the leading slot's symbol carries the swell itself (`swells`). `origin` is an interrupted
 * symbol's opacity, which the curve then runs from. */
export function leadingSwapFrames(
  part: SwapPart,
  direction: 'push' | 'pop',
  swells = false,
  origin?: number,
): { frames: Keyframe[]; duration: number } {
  const swap = NAVIGATION_LEADING_SWAP
  const delay = direction === 'pop' ? swap.popDelay : 0
  const duration = swap.swell.at(-1)![0] + delay
  const scale = (value: number) =>
    Math.abs(value - 1) < 0.0005 ? 'none' : String(Number(value.toFixed(4)))
  const knots = delay ? [[0, 1] as const, ...swap.swell] : swap.swell
  const frames = knots.map(([time, swell], index) => {
    const at = index === 0 ? 0 : time + delay
    const offset = at / duration
    if (part === 'circle') return { offset, scale: scale(swell) }
    const leaving = chromeCurveOpacity(swap.leave, at - delay)
    const shown = part === 'leaving' ? leaving : 1 - leaving
    const initial = part === 'leaving' ? 1 : 0
    const endpoint = 1 - initial
    const opacity =
      origin === undefined
        ? shown
        : endpoint + (origin - endpoint) * ((shown - endpoint) / (initial - endpoint))
    const hidden = 1 - opacity
    const own = 1 - swap.symbolScale * hidden
    const keyframe: Keyframe = { offset, opacity }
    if (swells) keyframe.scale = scale(own * swell)
    else keyframe.scale = hidden <= 0.001 ? 'none' : String(Number(own.toFixed(4)))
    keyframe.filter =
      hidden <= 0.001
        ? 'none'
        : `blur(${Number((NAVIGATION_CHROME_DISSOLVE.blur * hidden).toFixed(2))}px)`
    return keyframe
  })
  return { frames, duration }
}

/* A root's presented search field (navigation bar drawer) and its close button, when a screen
 * is pushed over it or popped off it (reference, presentation-layer measurements presentation layers, native reference search-push,
 * 6 pushes and 6 pops, light and dark): native leaves the field where it is on screen (x within
 * 0.1 pt) and only fades it, field and close button as one, with no scale or blur. A pop brings it
 * back on this curve; a push fades it out as its complement (within 0.01 from 50 ms). */
export const NAVIGATION_SEARCH_FIELD_APPEAR = Object.freeze([
  [0, 0],
  [17, 0.3],
  [33, 0.43],
  [50, 0.55],
  [67, 0.65],
  [83, 0.73],
  [100, 0.79],
  [117, 0.84],
  [133, 0.88],
  [150, 0.91],
  [167, 0.93],
  [183, 0.95],
  [200, 0.96],
  [217, 0.97],
  [233, 0.98],
  [267, 0.99],
  [317, 1],
] as const)

export type ChromeCurve = readonly (readonly [number, number])[]

/** The curve's opacity at `milliseconds` (clamped to its first and last knots). */
export function chromeCurveOpacity(curve: ChromeCurve, milliseconds: number) {
  const first = curve[0]!
  if (milliseconds <= first[0]) return first[1]
  for (let index = 1; index < curve.length; index += 1) {
    const [time, value] = curve[index]!
    const [previousTime, previousValue] = curve[index - 1]!
    if (milliseconds <= time)
      return (
        previousValue +
        ((value - previousValue) * (milliseconds - previousTime)) / (time - previousTime)
      )
  }
  return curve.at(-1)![1]
}
