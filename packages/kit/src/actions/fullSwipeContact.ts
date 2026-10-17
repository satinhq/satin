import { fullSwipeThreshold, rowSwipePosition, type SwipeWidths } from './rowScrub.ts'
import { takeoverSample } from './swipeSpring.ts'
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
 * - A release commits only if the last presented frame showed the takeover. A
 *   2100pt/s flick whose in-zone sample lands after lift-off cancels; a
 *   1300pt/s flick whose in-zone sample lands a frame earlier commits.
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
  now: number
}

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
  /** Row-local x of the latest finger sample. */
  let finger: number | undefined
  /** Set once, at the first takeover of this contact; never moved afterward. */
  let anchor: { side: Side; offset: number; gap: number; time: number } | undefined
  /** Zone state of the last evaluated frame; this is what a release reads. */
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

  function anchoredPosition(raw: number, side: Side, offset: number) {
    const sign = sides[side]
    // The anchor keeps the row on its side even if the finger crosses back.
    const distance = Math.max(0, (raw + offset) * sign)
    return sign * anchoredResistance(distance, width)
  }

  /** Presented row position. `evaluate` is true for presented frames; a release
   * sample is presented with `false`, so it cannot arm or anchor after lift-off. */
  function present(raw: number, now: number, evaluate = true) {
    if (evaluate) {
      engaged = inZone(raw)
      if (engaged && !anchor) {
        const side = sideOf(raw)
        const sign = sides[side]
        const target = sign * (width - destructiveFullSwipe.anchorInset)
        const before = rowSwipePosition(raw, width, configuration, widths)
        anchor = { side, offset: target - raw, gap: before - target, time: now }
      }
    }
    if (!anchor) return rowSwipePosition(raw, width, configuration, widths)
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
    const edge = edges[side]
    if (!edge.allowsFullSwipe) return 0
    if (edge.actions.length === 1) return 1
    const target = isDestructive(edge)
      ? anchor?.side === side
        ? 1
        : 0
      : raw * sides[side] >= thresholds[side]
        ? 1
        : 0
    const sample = takeovers[side].sample(target, now)
    return reducedMotion ? target : Math.max(0, Math.min(1, sample))
  }

  /** Whether releasing with `raw` performs the first action of the presented side. */
  function armed(raw: number) {
    const side = anchor?.side ?? sideOf(raw)
    const edge = edges[side]
    if (!edge.allowsFullSwipe || !firstActionEnabled(edge)) return false
    if (isDestructive(edge)) return engaged && anchor?.side === side
    return raw * sides[side] >= thresholds[side]
  }

  return {
    /** Record the finger's row-local x; the next presented frame evaluates it. */
    track(x: number) {
      finger = x
    },
    present,
    takeover,
    armed,
    anchored: () => anchor !== undefined,
    /** The jump is still visibly moving, so a frame must be presented without input. */
    settling: jumpVisible,
  }
}

export type FullSwipeContact = ReturnType<typeof createFullSwipeContact>

/** A takeover spring that retargets from its presented position and velocity. */
function springState(initial: number, now: number) {
  const state = { from: initial, target: initial, velocity: 0, started: now }
  return {
    sample(target: number, time: number) {
      const sample = takeoverSample(
        state.from,
        state.target,
        state.velocity,
        (time - state.started) / 1000,
      )
      if (target !== state.target) {
        state.from = sample.position
        state.velocity = sample.velocity
        state.target = target
        state.started = time
      }
      return sample.position
    },
  }
}
