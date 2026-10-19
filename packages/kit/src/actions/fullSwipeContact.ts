import { fullSwipeThreshold, rowSwipePosition, type SwipeWidths } from './rowScrub.ts'
import { takeoverSample } from './swipeSpring.ts'
import { advanceSwipeRampResponse, type SwipePoles } from './swipeResponse.ts'
import { swipeEdge, type SwipeActions } from './types.ts'

/**
 * Destructive full swipe, from the iOS 27 stock List reference (400pt rows, 80pt
 * tall, UIKit pan translation plus per-frame model and presentation geometry;
 * fullswipe r3 receipts, re-read in r4).
 *
 * - The trigger is where the finger is, not how far it went. Strokes starting at
 *   x300, x350 and x400 all take over when the finger reaches screen x88 (row-local
 *   68pt on a 20pt inset row), after 187, 236 and 287pt of travel; x90 never does.
 *   It also needs recognized travel: 165pt that ends at x60 never takes over.
 * - At takeover the row jumps once, to 29pt short of the far edge (-371 of 400),
 *   then follows the finger 1:1 from that anchor for the rest of the contact,
 *   including on the way back. Past 372.5pt it resists (5 contacts, RMS 0.02pt).
 * - The jump settles as a critically damped 48/s spring after one 18ms frame
 *   (4 takeovers, normalized RMS 0.020).
 * - Leaving the zone disarms the release but keeps the anchor and the expanded pill.
 *   All 5 reversals (to x140, 220, 280, 340 and 380) cancel and close to rest.
 * - Lift-off cannot introduce a takeover. Input delivered before lift-off can:
 *   iPad swipe-parity r12/r15 replay the same 835pt / 250ms flick. Native
 *   commits with in-zone moves at 241.7ms and 249.1ms; Satin previously canceled
 *   when no requestAnimationFrame fell between those moves and touchend.
 *   Observe moving contacts at input cadence, independently of paint cadence.
 *
 * Non-destructive first actions never re-anchor. They keep the distance threshold,
 * read at release (leading Read: 205pt cancels, 210pt commits, row 1:1).
 * No velocity projection appears in any of these trials, so none is modelled.
 */
export const destructiveFullSwipe = {
  /** The finger must be within this distance of the row's far edge (bracket 68..70pt). */
  edgeZone: 69,
  /** Recognized travel needed before the zone counts (bracket 165..187pt). */
  minimumTravel: 176,
  /** The jump leaves this much of the row showing. */
  anchorInset: 29,
  /** Past this inset from the far edge, the anchored row resists. */
  limitInset: 27.5,
  resistance: 0.46,
  resistanceLength: 31,
  /** Critically damped approach of the jump, after one held frame. */
  jumpRate: 48,
  jumpDelay: 0.018,
} as const

type Side = 'leading' | 'trailing'
const sides = { leading: 1, trailing: -1 } as const
const sideOf = (sign: number): Side => (sign >= 0 ? 'leading' : 'trailing')

/** Remaining fraction of the jump distance `seconds` after it began. */
export function destructiveJumpRemaining(seconds: number) {
  const elapsed = seconds - destructiveFullSwipe.jumpDelay
  if (elapsed <= 0) return 1
  const rate = destructiveFullSwipe.jumpRate
  return (1 + rate * elapsed) * Math.exp(-rate * elapsed)
}

/** The anchored row tracks 1:1 up to the soft limit, then resists. */
function anchoredResistance(distance: number, width: number) {
  const { limitInset, resistance, resistanceLength } = destructiveFullSwipe
  const limit = width - limitInset
  const excess = distance - limit
  if (excess <= 0) return distance
  return limit + (resistance * excess) / (1 + (resistance * excess) / resistanceLength)
}

type Edge = ReturnType<typeof swipeEdge>

const firstActionEnabled = (edge: Edge) => !!edge.actions[0] && !edge.actions[0].disabled

const isDestructive = (edge: Edge) =>
  edge.allowsFullSwipe && firstActionEnabled(edge) && edge.actions[0]!.role === 'destructive'

export type FullSwipeContactOptions = {
  width: number
  configuration?: SwipeActions
  widths: SwipeWidths
  /** Single-line rows; selects the inline full-swipe threshold. */
  inline: boolean
  /** Pill takeover already presented when this contact caught the row. */
  caught?: Partial<Record<Side, number>>
  reducedMotion?: boolean
  trackingResponse?: SwipePoles
  presentedPosition?: number
  now: number
  /** Measured input origin for a contact beginning on a closed row. The scroll
   * source still arbitrates ownership; its platform-specific pan slop is not
   * the stock List recognizer's translation origin. `time` is the touch-down
   * timestamp on the performance clock. */
  origin?: { finger: number; offset: number; time: number }
}

/**
 * Where a closed row's pan starts tracking, from the iOS 27 stock List on iPad.
 *
 * - Slow strokes: the pan is recognized 25pt from touch-down and the row follows
 *   the finger from that point (r28/r31; a 140pt stroke holds at -115pt).
 * - Fast strokes that cross 25pt within the first frames of the contact start
 *   later. UIKit keeps its pan in "began" for one or more input samples and then
 *   resets the translation to zero wherever the finger is (r123 pan telemetry).
 *   For the same 110pt, 50ms delivered step, 18 native strokes (r107–r141) held
 *   at 0, -32.5, -52.9, -74.1 or -85.1pt: each is the finger at one delivered
 *   sample, so the restart time varies from stroke to stroke.
 *
 * Satin starts such a stroke at the median native restart: the finger position
 * 25ms after touch-down (9 of 18 strokes restart at or before it, 9 after).
 * Until then the row stays put, as native's does while its pan is beginning.
 */
export const swipePanStart = {
  /** Pan recognition distance from touch-down. */
  recognitionDistance: 25,
  /** A pan recognized earlier than this after touch-down restarts its origin here. */
  restartDelayMilliseconds: 25,
} as const

/**
 * One finger's mapping from the row's raw offset to its presented position, plus
 * whether releasing now performs the first action. Created per contact, so a new
 * contact (including one that catches a settling row) starts without an anchor.
 * The scroll-source path and the touch fallback both present through it.
 */
export function createFullSwipeContact(options: FullSwipeContactOptions) {
  const { width, configuration, widths, inline, reducedMotion = false } = options
  const edges = {
    leading: swipeEdge(configuration, 'leading'),
    trailing: swipeEdge(configuration, 'trailing'),
  }
  const thresholds = {
    leading: fullSwipeThreshold(
      width,
      edges.leading.actions.length,
      'leading',
      widths.leading,
      inline,
    ),
    trailing: fullSwipeThreshold(
      width,
      edges.trailing.actions.length,
      'trailing',
      widths.trailing,
      inline,
    ),
  }
  let tracking = { position: options.presentedPosition ?? 0, velocity: 0 }
  let trackingTarget = tracking.position
  let trackingTime = options.now
  function trackPosition(target: number, now: number) {
    if (!options.trackingResponse || reducedMotion) return target
    tracking = advanceSwipeRampResponse(
      tracking,
      trackingTarget,
      target,
      Math.max(0, now - trackingTime) / 1000,
      options.trackingResponse,
    )
    trackingTarget = target
    trackingTime = Math.max(now, trackingTime)
    return tracking.position
  }
  /** Row-local x of the latest finger sample, and when it was delivered. */
  let finger: number | undefined = options.origin?.finger
  let fingerTime = options.origin?.time ?? options.now
  /** The finger sample delivered before the latest one, for timing a zone entry. */
  let previousFinger: { x: number; time: number } | undefined
  let translating = options.origin === undefined
  /** Sign of the recognized pan, and when it was recognized (performance clock). */
  let panDirection = 0
  let recognizedAt: number | undefined
  /** Row-local finger x where the pan's translation is zero, once it has started. */
  let panOrigin: number | undefined
  /** The last sample before a fast pan's restart time, for interpolating to it. */
  let beforeRestart: { x: number; time: number } | undefined

  /** Advance the pan's recognition and start from one delivered sample. */
  function followPan(x: number, time: number, lifted: boolean) {
    const origin = options.origin
    if (!origin || !translating || panOrigin !== undefined) return
    const { recognitionDistance, restartDelayMilliseconds } = swipePanStart
    if (!panDirection) {
      const distance = x - origin.finger
      if (Math.abs(distance) <= recognitionDistance) return
      panDirection = Math.sign(distance)
      recognizedAt = time
    }
    const restartAt = origin.time + restartDelayMilliseconds
    if (recognizedAt! >= restartAt || lifted) {
      // Recognized late enough, or lifted before the restart (unmeasured): the
      // pan tracks from its recognition distance.
      panOrigin = origin.finger + panDirection * recognitionDistance
    } else if (time < restartAt) {
      beforeRestart = { x, time }
    } else {
      // Interpolate the finger to the restart time, so the result does not
      // depend on WebKit's touch delivery rate.
      const previous = beforeRestart ?? { x, time }
      const span = time - previous.time
      const progress = span > 0 ? (restartAt - previous.time) / span : 1
      panOrigin = previous.x + (x - previous.x) * progress
    }
  }

  function translation(raw: number) {
    const origin = options.origin
    if (!origin) return raw
    if (finger === undefined || panOrigin === undefined) return origin.offset
    return origin.offset + finger - panOrigin
  }
  /** Set once, at the first takeover of this contact; never moved afterward. */
  let anchor: { side: Side; offset: number; gap: number; time: number } | undefined
  /** Zone state last evaluated during contact; lift-off only reads it. */
  let engaged = false
  const takeovers = {
    leading: springState(options.caught?.leading ?? 0, options.now),
    trailing: springState(options.caught?.trailing ?? 0, options.now),
  }

  function inZone(raw: number) {
    const side = sideOf(raw)
    if (!raw || finger === undefined || !isDestructive(edges[side])) return false
    const fromFarEdge = side === 'trailing' ? finger : width - finger
    return (
      fromFarEdge <= destructiveFullSwipe.edgeZone &&
      Math.abs(raw) >= destructiveFullSwipe.minimumTravel
    )
  }

  /** Distance from the finger to the row's far edge on `side`. */
  function fromFarEdge(x: number, side: Side) {
    return side === 'trailing' ? x : width - x
  }

  /**
   * When the finger entered the destructive zone. UIKit sees every 120 Hz touch
   * sample, so its takeover starts at the sample that reaches the zone edge.
   * WebKit can coalesce that sample into a later one (installed iPad slow commit: native
   * x89 at 2325ms; Satin's first delivered in-zone sample is x85 at 2333ms), so
   * interpolate between the delivered samples around the edge. When travel, not
   * the finger, was the last condition met, the takeover starts at this sample.
   */
  function zoneEntryTime(side: Side, now: number) {
    const edge = destructiveFullSwipe.edgeZone
    if (finger === undefined) return now
    const previous = previousFinger
    if (!previous || fromFarEdge(previous.x, side) <= edge) return Math.min(fingerTime, now)
    const before = fromFarEdge(previous.x, side)
    const after = fromFarEdge(finger, side)
    const progress = before > after ? (before - edge) / (before - after) : 1
    const entered = previous.time + (fingerTime - previous.time) * Math.min(1, progress)
    return Math.min(entered, now)
  }

  function anchoredPosition(raw: number, side: Side, offset: number) {
    const sign = sides[side]
    // The anchor keeps the row on its side even if the finger crosses back.
    const distance = Math.max(0, (raw + offset) * sign)
    return sign * anchoredResistance(distance, width)
  }

  /** Presented row position. `evaluate` is true during contact; a release
   * sample is presented with `false`, so it cannot arm or anchor after lift-off. */
  function present(raw: number, now: number, evaluate = true) {
    raw = translation(raw)
    const ordinary = !anchor
      ? trackPosition(rowSwipePosition(raw, width, configuration, widths), now)
      : 0
    if (evaluate) {
      engaged = inZone(raw)
      if (engaged && !anchor) {
        const side = sideOf(raw)
        const sign = sides[side]
        const target = sign * (width - destructiveFullSwipe.anchorInset)
        const before = ordinary
        anchor = {
          side,
          offset: target - raw,
          gap: before - target,
          time: zoneEntryTime(side, now),
        }
      }
    }
    if (!anchor) return ordinary
    // Once the jump is within a quarter point, finish it so the row stops writing.
    if (!jumpVisible(now)) anchor.gap = 0
    const remaining = destructiveJumpRemaining((now - anchor.time) / 1000)
    return anchoredPosition(raw, anchor.side, anchor.offset) + anchor.gap * remaining
  }

  function jumpVisible(now: number) {
    if (!anchor) return false
    return Math.abs(anchor.gap) * destructiveJumpRemaining((now - anchor.time) / 1000) > 0.25
  }

  /** Pill takeover for one tray. Destructive edges take over with the anchor and keep
   * it through reversals; other edges follow the distance threshold. */
  function takeover(side: Side, raw: number, now: number) {
    raw = translation(raw)
    const edge = edges[side]
    if (!edge.allowsFullSwipe) return 0
    // A lone Delete is still a partial reveal until the finger enters its zone.
    // iPad r71/r103: native keeps the caption during the held partial stroke.
    if (edge.actions.length === 1 && !isDestructive(edge)) return 1
    const target = isDestructive(edge)
      ? anchor?.side === side
        ? 1
        : 0
      : raw * sides[side] >= thresholds[side]
        ? 1
        : 0
    // The destructive pill takes over with the row's jump, from the same zone entry.
    const changedAt = isDestructive(edge) && anchor?.side === side ? anchor.time : now
    const sample = takeovers[side].sample(target, now, changedAt)
    return reducedMotion ? target : Math.max(0, Math.min(1, sample))
  }

  /** Whether releasing with `raw` performs the first action of the presented side. */
  function armed(raw: number) {
    raw = translation(raw)
    const side = anchor?.side ?? sideOf(raw)
    const edge = edges[side]
    if (!edge.allowsFullSwipe || !firstActionEnabled(edge)) return false
    if (isDestructive(edge)) return engaged && anchor?.side === side
    return raw * sides[side] >= thresholds[side]
  }

  return {
    /** Called only after the row wins horizontal ownership. Vertical contacts
     * must never translate a row merely because their x coordinate changes. */
    recognize() {
      if (translating) return
      translating = true
      if (finger !== undefined) followPan(finger, fingerTime, false)
    },
    translation,
    /** When the pan was recognized (performance clock), or undefined before. Native
     * face appearance starts here, not at WebKit ownership. A contact that catches
     * an open row has no recognition distance and reports its creation time. */
    recognizedAt: () => (options.origin ? recognizedAt : options.now),
    /** Record the finger's row-local x and its delivery time; observe/present
     * evaluates it during contact. `lifted` marks the lift-off sample. */
    track(x: number, time: number, lifted = false) {
      if (finger !== undefined) previousFinger = { x: finger, time: fingerTime }
      finger = x
      fingerTime = time
      followPan(x, time, lifted)
    },
    /** A delivered move may cross the zone between two animation frames.
     * Never call for lift-off: its final coordinate cannot create a takeover. */
    observe(raw: number, now: number) {
      present(raw, now)
    },
    present,
    velocity: () =>
      options.trackingResponse && !anchor && !reducedMotion ? tracking.velocity : undefined,
    takeover,
    armed,
    anchored: () => anchor !== undefined,
    /** The jump is still visibly moving, so a frame must be presented without input. */
    settling: (now: number) =>
      jumpVisible(now) ||
      (!!options.trackingResponse &&
        !anchor &&
        !reducedMotion &&
        (Math.abs(tracking.position - trackingTarget) > 0.01 || Math.abs(tracking.velocity) > 0.1)),
  }
}

export type FullSwipeContact = ReturnType<typeof createFullSwipeContact>

/** A takeover spring that retargets from its presented position and velocity.
 * A new target starts at `changedAt` (when its cause happened, never after
 * `time`), so a takeover first seen by a later frame is already under way. */
function springState(initial: number, now: number) {
  const state = { from: initial, target: initial, velocity: 0, started: now }
  const at = (time: number) =>
    takeoverSample(state.from, state.target, state.velocity, (time - state.started) / 1000)
  return {
    sample(target: number, time: number, changedAt = time) {
      if (target !== state.target) {
        const start = Math.max(state.started, Math.min(changedAt, time))
        const retarget = at(start)
        state.from = retarget.position
        state.velocity = retarget.velocity
        state.target = target
        state.started = start
      }
      return at(time).position
    },
  }
}
