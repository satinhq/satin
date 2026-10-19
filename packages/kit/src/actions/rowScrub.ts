import { advanceSwipeResponse, type SwipeResponse } from './swipeResponse.ts'
import { swipePillScale } from './swipeSpring.ts'
import { cornerClipPath, roundedCornerPath, type CornerShape } from '../shapes/corners.ts'
import type { FullSwipeContact } from './fullSwipeContact.ts'
import { swipeEdge, type SwipeActions } from './types.ts'

// iOS 27 matched phone reference, light/dark, 1/2/3 actions, both edges:
// color-mask width 60pt, gap 10pt, outer padding 10pt. Capsule 44pt layout / 42-43pt solid mask.
export const swipeGeometry = { buttonWidth: 60, gap: 10, padding: 10, capsuleHeight: 44 } as const
export const swipeOpenWidth = (count: number, buttonWidth = swipeGeometry.buttonWidth as number) =>
  count * (buttonWidth + swipeGeometry.gap) + swipeGeometry.padding

export type SwipeWidths = { leading: number; trailing: number }
export function swipeWidths(host: HTMLElement): SwipeWidths {
  const width = (side: string) => {
    const tray = host.querySelector<HTMLElement>(`[data-satin-swipe-tray="${side}"]`)
    return Number.parseFloat(tray?.style.getPropertyValue('--satin-swipe-button-width') ?? '') || 60
  }
  return { leading: width('leading'), trailing: width('trailing') }
}
const defaultWidths: SwipeWidths = { leading: 60, trailing: 60 }

// reference native UIKit pan receipts, 400pt / 52pt rows. Recognition consumes
// some initial finger travel, especially in fast strokes: the scroll source
// supplies recognized translation, not total finger displacement.
// Normal cancel/commit brackets: trailing 195..220pt; leading two 205..230pt,
// leading three 300..325pt. Flick-only projection is not isolated by these
// bounds and must not be invented from the commanded input duration.
export function fullSwipeThreshold(
  width: number,
  count: number,
  side: 'leading' | 'trailing' = 'trailing',
  buttonWidth = 84,
  inline = true,
) {
  // Tall two-action leading rows cancel at 205pt and commit at 210pt,
  // from slow drags through 1394pt/s flicks. Keep other tall-row fits separate.
  if (!inline) {
    const threshold =
      side === 'leading' && count === 2 ? 207.5 : count === 1 ? 240 : count === 2 ? 232.5 : 265
    return (width / 400) * threshold
  }
  const threshold = width * (207.5 / 400)
  return side === 'leading'
    ? Math.max(threshold, swipeOpenWidth(count, buttonWidth) + 20)
    : threshold
}
export const swipeDragLimit = (width: number, count: number, buttonWidth = 60) =>
  Math.max(width / 2, swipeOpenWidth(count, buttonWidth) + 20)

const clamp = (value: number) => Math.max(0, Math.min(1, value))

/**
 * How much a contact that caught an open or settling row still shows the row's resting
 * actions (1) rather than the drag's own poses (0). It fades out over one open-tray width of
 * travel, so dragging the caught row further grows its action and can take over again, as
 * native does after a light swipe, a release and a second swipe.
 */
export function caughtRowRest(initial: number, raw: number, initialRaw: number, openWidth: number) {
  return initial ? clamp(1 - Math.abs(raw - initialRaw) / openWidth) : 0
}

// Tall stock List rows reveal a 50pt button over 40..70pt of recognized travel.
// Held-input probes at 40, 60 and 80pt produce scale/alpha 0, 2/3 and 1.
function revealScale(distance: number) {
  return clamp((distance - 40) / 30)
}

// iOS 27 short-row captures, both appearances and edges, every third frame.
// The 84pt Read pill grows over 50..114pt; the 96pt Archive pill over 52..124pt.
// Opacity is measured independently of the colored mask height.
const inlineOpacitySamples = [
  [0, 0],
  [0.15, 0.08],
  [0.3, 0.43],
  [0.55, 0.69],
  [0.8, 0.93],
  [1, 1],
] as const
function inlineEntrance(distance: number, buttonWidth: number) {
  const widthDelta = buttonWidth - 84
  const scale = clamp((distance - 50 - widthDelta / 6) / (64 + (widthDelta * 2) / 3))
  let opacity = 1
  for (let index = 1; index < inlineOpacitySamples.length; index++) {
    const [end, to] = inlineOpacitySamples[index]!
    const [start, from] = inlineOpacitySamples[index - 1]!
    if (scale <= end) {
      opacity = from + (to - from) * clamp((scale - start) / (end - start))
      break
    }
  }
  return { scale, opacity }
}

/** A destructive takeover keeps the other actions visible and dimmed. Native tall
 * Delete row (r3 receipts): More fades from 0.73 at 142pt revealed to 0.30 at 381pt. */
function destructiveSecondaryOpacity(distance: number, rowWidth: number) {
  // r31 model alpha: 0.7790 at 301.5pt, 0.6540 at 472pt on a 984pt row.
  // The target reaches 0.3 at the destructive anchor, independent of row height.
  return Math.max(0.3, 1 - (0.7 * distance) / Math.max(1, rowWidth - 29))
}

/** Spatial fit of native's sequential capsule reveal. Rest interpolates the
 * contact pose into the fully revealed spring target; it is never a DOM writer.
 * A destructive takeover packs the other actions against the row and the primary
 * fills the rest (native: primary = revealed - 80 on a tall two-action row). */
export function swipeActionPose(
  position: number,
  index: number,
  count: number,
  takeover = 0,
  rest = 0,
  buttonWidth = 60,
  inline = false,
  allowsFullSwipe = false,
  destructive = false,
  rowWidth = 400,
) {
  const distance = Math.abs(position)
  const open = swipeOpenWidth(count, buttonWidth)
  const excess = Math.max(0, distance - open)
  const localDistance = distance - index * (buttonWidth + 10)
  // reference paired third-pill mask: native 37pt, prior fit 35pt at full reveal.
  // Apply its measured 3pt reveal lead progressively, preserving first-pill
  // entrance samples and the zero-width pose before this action enters.
  const revealLead = inline && index === 2 ? 3 * clamp((localDistance - 50) / 50) : 0
  const entrance = inline ? inlineEntrance(localDistance + revealLead, buttonWidth) : undefined
  const contactScale = entrance?.scale ?? revealScale(localDistance)
  const reveal = contactScale + (clamp(distance / open) - contactScale) * rest
  const expandingDelete = allowsFullSwipe && destructive
  const packed = expandingDelete && index > 0 ? excess : 0
  // iPad stock List, swipe-parity native r6 F383–498 and r28 short/tall: Delete
  // capsule grows inward while its outer edge stays fixed. Its content moves
  // from centered to the leading inset during takeover (F484–493).
  // Keep that content motion on the same measured takeover timeline as the fill.
  const spread =
    expandingDelete && index === 0
      ? 0
      : expandingDelete
        ? packed
        : (((index + 0.5) * excess) / (count + 0.5)) * (1 - takeover)
  const opacity =
    (entrance?.opacity ?? contactScale) + (1 - (entrance?.opacity ?? contactScale)) * rest
  const secondaryOpacity = expandingDelete
    ? Math.min(opacity, destructiveSecondaryOpacity(distance, rowWidth)) * (1 - rest) +
      opacity * rest
    : opacity * (1 - takeover)
  return {
    scale: reveal,
    spread,
    contentAnchor: allowsFullSwipe && destructive && index === 0 ? takeover : 0,
    opacity: index === 0 ? opacity : secondaryOpacity,
    growth:
      index === 0
        ? expandingDelete
          ? excess
          : (inline && allowsFullSwipe ? excess * (1 - takeover) : 0) +
            takeover * Math.max(0, distance - buttonWidth - 20)
        : 0,
  }
}

function capsuleHeight(primary: HTMLElement) {
  // The tray owns the height measured from this row. Use the same value as
  // CSS when extending the fill and recovering a caught takeover.
  const tray = primary.closest<HTMLElement>('[data-satin-swipe-tray]')
  const measured = Number.parseFloat(
    tray?.style.getPropertyValue('--satin-swipe-capsule-height') ?? '',
  )
  if (Number.isFinite(measured)) return measured
  return primary.closest<HTMLElement>('[data-satin-row-actions]')?.dataset.satinSwipeLabelLayout ===
    'below'
    ? 50
    : 44
}

export function swipeActionTracks(
  primary: HTMLElement,
  count: number,
  width: number,
  allowsFullSwipe: boolean,
) {
  const buttons = primary.parentElement?.matches('[data-satin-swipe-tray]')
    ? [...primary.parentElement.querySelectorAll<HTMLElement>('[data-satin-swipe-action]')]
    : [primary]
  const trailing = primary.parentElement?.dataset.satinSwipeTray === 'trailing'
  const inline =
    primary.closest<HTMLElement>('[data-satin-row-actions]')?.dataset.satinSwipeLabelLayout ===
    'inline'
  const destructive = primary.dataset.satinSwipeRole === 'destructive'
  return buttons.flatMap((button, index) => {
    const buttonWidth = Number.parseFloat(getComputedStyle(button).width) || 60
    const middleWidth = Math.max(1, buttonWidth - capsuleHeight(primary))
    const pose = (position: number, raw = position, rest = 0, temporalTakeover?: number) => {
      // The short two-action reference starts primary takeover at the open tray:
      // 198pt leading / 222pt trailing. Taller rows retain their earlier fit.
      const start =
        inline && count === 2
          ? swipeOpenWidth(count, buttonWidth)
          : swipeDragLimit(width, count, buttonWidth) - 8
      const progress = clamp((Math.abs(position) - start) / (count === 2 ? 26 : 14))
      const takeover =
        temporalTakeover ??
        (!allowsFullSwipe
          ? 0
          : (count === 1 && !destructive) || raw === Infinity
            ? 1
            : progress * progress * (3 - 2 * progress))
      return swipeActionPose(
        position,
        index,
        count,
        raw === Infinity ? takeover : takeover * (1 - rest),
        rest,
        buttonWidth,
        inline,
        allowsFullSwipe,
        destructive,
        width,
      )
    }
    const direction = trailing ? -1 : 1
    const partFrame = (part: HTMLElement, value: ReturnType<typeof swipeActionPose>): Keyframe => {
      // Tall stock List r19 F2300..2318: the icon moves to the leading cap,
      // while its caption fades at the old center. They are separate tracks.
      if (part.parentElement?.hasAttribute('data-satin-swipe-label')) {
        if (part.hasAttribute('data-satin-swipe-caption'))
          return { opacity: 1 - value.contentAnchor }
        return {
          transform: `translate3d(${(direction * value.growth * value.contentAnchor) / 2}px,0,0)`,
        }
      }
      return {
        transform: primaryTransform(
          part,
          value.growth,
          middleWidth,
          trailing && inline ? value.contentAnchor : 0,
        ),
      }
    }
    // A committed full swipe whose row stays returns from its takeover pose.
    // Native (iPad o1 leading commit, presentation layer) moves the expanded
    // button's frame back to the resting button in step with the row: its
    // width is linear in the row's progress (82.4 + 0.821 x offset). The
    // capsule shrinks about the centre of that frame and fades with the row.
    const collapsingPose = (from: number, progress: number, takeover: number) => {
      const value = pose(from, from, 0, takeover)
      return { ...value, growth: value.growth * progress }
    }
    return [
      {
        element: button,
        frame(position: number, raw = position, rest = 0, temporalTakeover?: number): Keyframe {
          const value = pose(position, raw, rest, temporalTakeover)
          return {
            transform: `translate3d(${direction * value.spread}px,0,0) scale(${value.scale})`,
            opacity: value.opacity,
          }
        },
        collapsing(from: number, progress: number, scale: number, takeover: number): Keyframe {
          const value = collapsingPose(from, progress, takeover)
          // The button box is the resting capsule and scales about its own
          // centre. The grown capsule's centre is half the growth further out.
          const centring = (value.growth / 2) * (1 - scale)
          return {
            transform: `translate3d(${direction * (value.spread + centring)}px,0,0) scale(${scale})`,
            opacity: value.opacity * progress,
          }
        },
      },
      ...primaryParts(button).map(part => ({
        element: part,
        frame(position: number, raw = position, rest = 0, temporalTakeover?: number): Keyframe {
          return partFrame(part, pose(position, raw, rest, temporalTakeover))
        },
        collapsing(from: number, progress: number, _scale: number, takeover: number): Keyframe {
          return partFrame(part, collapsingPose(from, progress, takeover))
        },
      })),
    ]
  })
}

/** One 60 Hz display refresh: how long after its animation frame starts a painted
 * swipe frame is shown. */
const SWIPE_PRESENTATION_LEAD_MS = 1000 / 60

/** Native scroll offset is authoritative; resistance maps it to the presented row position. */
export function rowSwipePosition(
  raw: number,
  width: number,
  configuration?: SwipeActions,
  widths: SwipeWidths = defaultWidths,
) {
  const side = raw >= 0 ? 'leading' : 'trailing'
  const edge = swipeEdge(configuration, side)
  if (!edge.actions.length) return 0
  const limit = edge.allowsFullSwipe
    ? // Native r28 short/tall Delete: model translation remains 1:1
      // beyond half-width (e.g. recognized -639.5pt gives row x=-619.5 on a
      // 20pt-inset row). The destructive contact owns its separate far-edge limit.
      edge.actions[0]?.role === 'destructive'
      ? width
      : swipeDragLimit(width, edge.actions.length, widths[side])
    : swipeOpenWidth(edge.actions.length, widths[side])
  const excess = Math.max(0, Math.abs(raw) - limit)
  const resistance = edge.allowsFullSwipe && edge.actions.length <= 2 ? 0.25 : 0.2
  return (
    Math.sign(raw) *
    (Math.min(Math.abs(raw), limit) + (resistance * excess) / (1 + (resistance * excess) / width))
  )
}

/** Native iPhone HID brackets a reverse drag on a revealed row between 20pt
 * (reopens) and 40pt (closes), slow and as a 150ms flick. Close at the midpoint:
 * a commanded 40pt contact reaches WebKit as 39.5pt. */
const reverseCloseDistance = 30

/** A revealed row closes after a deliberate reverse drag, without requiring
 * the finger to traverse the entire tray. */
export function rowSwipeShouldClose(initial: number, position: number, drag: number) {
  return (
    Math.abs(position) < 40 ||
    (Math.sign(initial) === Math.sign(position) &&
      Math.sign(drag) === -Math.sign(initial) &&
      Math.abs(drag) >= reverseCloseDistance)
  )
}

/** Invert resistance once when a new finger catches a spring. */
export function rowSwipeRaw(
  position: number,
  width: number,
  configuration?: SwipeActions,
  widths: SwipeWidths = defaultWidths,
) {
  const side = position >= 0 ? 'leading' : 'trailing'
  const edge = swipeEdge(configuration, side)
  const limit = edge.allowsFullSwipe
    ? edge.actions[0]?.role === 'destructive'
      ? width
      : swipeDragLimit(width, edge.actions.length, widths[side])
    : swipeOpenWidth(edge.actions.length, widths[side])
  const excess = Math.max(0, Math.abs(position) - limit)
  const resistance = edge.allowsFullSwipe && edge.actions.length <= 2 ? 0.25 : 0.2
  return (
    Math.sign(position) *
    (Math.min(Math.abs(position), limit) +
      excess / (resistance * Math.max(0.01, 1 - excess / width)))
  )
}

export function primaryParts(primary: HTMLElement) {
  const below =
    primary.closest<HTMLElement>('[data-satin-row-actions]')?.dataset.satinSwipeLabelLayout ===
    'below'
  return [
    ...primary.querySelectorAll<HTMLElement>('[data-satin-swipe-fill], [data-satin-swipe-label]'),
    ...(below ? primary.querySelectorAll<HTMLElement>('[data-satin-swipe-label] > *') : []),
  ]
}

export function primaryTransform(
  part: HTMLElement,
  growth: number,
  middleWidth = 16,
  leadingAnchor = 0,
) {
  const trailing = part.dataset.satinSwipeDirection === 'trailing'
  switch (part.dataset.satinSwipeFill) {
    case 'middle':
      return `scaleX(${1 + growth / middleWidth})`
    case 'end':
      return `translate3d(${trailing ? 0 : growth}px,0,0)`
    case 'start':
      return `translate3d(${trailing ? -growth : 0}px,0,0)`
    default:
      return `translate3d(${((trailing ? -growth : growth) * (1 + leadingAnchor)) / 2}px,0,0)`
  }
}

/** Recover takeover from the presented capsule, including a caught settle. */
export function presentedTakeover(primary: HTMLElement, position: number) {
  const middle = primary.querySelector<HTMLElement>('[data-satin-swipe-fill="middle"]')
  if (!middle || typeof DOMMatrixReadOnly === 'undefined') return 0
  const buttonWidth = Number.parseFloat(getComputedStyle(primary).width) || 60
  const count = primary.parentElement?.children.length ?? 1
  const inline =
    primary.closest<HTMLElement>('[data-satin-row-actions]')?.dataset.satinSwipeLabelLayout ===
    'inline'
  const matrix = new DOMMatrixReadOnly(getComputedStyle(middle).transform)
  const growth = (matrix.a - 1) * Math.max(1, buttonWidth - capsuleHeight(primary))
  if (primary.dataset.satinSwipeRole === 'destructive') {
    // Delete grows before its content takes over, so fill width cannot identify
    // the caught anchor. Recover it from the independently moving label/icon.
    // This also preserves an intermediate anchor when release interrupts entry.
    const label = primary.querySelector<HTMLElement>('[data-satin-swipe-label]')
    const part = inline ? label : label?.querySelector<HTMLElement>(':scope > svg')
    if (!part || growth <= 0) return 0
    const translation = new DOMMatrixReadOnly(getComputedStyle(part).transform).m41
    return clamp((2 * Math.abs(translation)) / growth - (inline ? 1 : 0))
  }
  // A single non-destructive action takes the row over as soon as it grows
  // (see the pose's takeover rule). Its inline overscroll and its takeover
  // give the same fill width, so the width cannot tell them apart.
  if (count === 1 && growth > 0) return 1
  const excess = Math.max(0, Math.abs(position) - swipeOpenWidth(count, buttonWidth))
  const ordinary = inline ? excess : 0
  const expanded = Math.max(0, Math.abs(position) - buttonWidth - 20)
  if (expanded <= ordinary) return 0
  return clamp((growth - ordinary) / (expanded - ordinary))
}

type PillResponse = SwipeResponse & { release?: { time: number; target: number; duration: number } }
const pillResponses = new WeakMap<HTMLElement, PillResponse>()
export function presentedPillResponse(element: HTMLElement, now = performance.now()) {
  const state = pillResponses.get(element)
  if (!state?.release) return state
  const elapsed = Math.max(0, now - state.release.time)
  return elapsed >= state.release.duration
    ? { position: state.release.target, velocity: 0 }
    : advanceSwipeResponse(
        { position: state.position, velocity: state.velocity },
        state.release.target,
        elapsed / 1000,
        swipePillScale,
      )
}
export function retainPillRelease(
  element: HTMLElement,
  state: SwipeResponse,
  target: number,
  time: number,
  duration: number,
) {
  pillResponses.set(element, { ...state, release: { target, time, duration } })
}

export function createRowScrub(
  host: HTMLElement,
  source: HTMLElement,
  content: HTMLElement,
  initial: number,
  width: number,
  configuration: SwipeActions | undefined,
  contact: FullSwipeContact,
) {
  if (!width || source.scrollWidth <= source.clientWidth) return undefined
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const widths = swipeWidths(host)
  const initialRaw = rowSwipeRaw(initial, width, configuration, widths)
  const origin = source.scrollLeft
  const actionUpdates: Array<(now: number, raw: number, position: number) => void> = []
  const contentFrame = swipeContentTrack(content)
  for (const side of ['leading', 'trailing'] as const) {
    const tray = host.querySelector<HTMLElement>(`[data-satin-swipe-tray="${side}"]`)!
    const primary = tray.firstElementChild as HTMLElement | null
    const sign = side === 'leading' ? 1 : -1
    actionUpdates.push((_now, _raw, position) => {
      tray.style.opacity = position * sign > 0 ? '1' : '0'
    })
    if (primary) {
      const edge = swipeEdge(configuration, side)
      const actions = swipeActionTracks(primary, edge.actions.length, width, edge.allowsFullSwipe)
      const openWidth = swipeOpenWidth(edge.actions.length, widths[side])
      let previousTime = performance.now()
      const responses = new Map<HTMLElement, { state: SwipeResponse; target: number }>()
      for (const action of actions) {
        if (!action.element.matches('[data-satin-swipe-action]')) continue
        const frame = action.frame(initial, initial, initial ? 1 : 0)
        const target = Number(String(frame.transform).match(/scale\(([^)]+)\)/)?.[1] ?? 0)
        const state = (initial ? presentedPillResponse(action.element) : undefined) ?? {
          position: target,
          velocity: 0,
        }
        responses.set(action.element, { state, target })
        pillResponses.set(action.element, state)
      }
      const update = (now: number, raw: number, position: number) => {
        // Both takeover springs advance across reversals, but the hidden tray has
        // no pixels to update. Read the scroll source before either tray writes.
        const takeover = contact.takeover(side, raw, now)
        if (position * sign <= 0) return
        const seconds = Math.max(0, (now - previousTime) / 1000)
        previousTime = now
        const rest = caughtRowRest(initial, raw, initialRaw, openWidth)
        for (const action of actions) {
          const frame = action.frame(position, raw, rest, takeover)
          const response = responses.get(action.element)
          if (response) {
            // Native pill scale follows the travel target independently of the
            // row's presented lag; filtering that target twice delays entrance.
            const scaleFrame = contact.anchored()
              ? frame
              : action.frame(
                  rowSwipePosition(raw, width, configuration, widths),
                  raw,
                  rest,
                  takeover,
                )
            const target = Number(String(scaleFrame.transform).match(/scale\(([^)]+)\)/)?.[1] ?? 0)
            // Candidate uses the measured r28 pill poles; r31/r32 establish
            // an underdamped contact response. Physical contact qualification
            // remains in swipe-parity-notes.md. Retain velocity as travel changes;
            // a stationary finger must not freeze the entrance response.
            response.state = reducedMotion
              ? { position: target, velocity: 0 }
              : advanceSwipeResponse(response.state, response.target, seconds, swipePillScale)
            response.target = target
            pillResponses.set(action.element, response.state)
            frame.transform = String(frame.transform).replace(
              /scale\([^)]*\)/,
              `scale(${response.state.position})`,
            )
          }
          // Avoid dirtying style when a capsule part did not change this frame.
          if (frame.transform !== undefined && action.element.style.transform !== frame.transform)
            action.element.style.transform = String(frame.transform)
          if (frame.opacity !== undefined && action.element.style.opacity !== String(frame.opacity))
            action.element.style.opacity = String(frame.opacity)
        }
      }
      actionUpdates.push(update)
    }
  }
  // WebKit owns touch arbitration and the scroll offset. Sample it once per
  // frame and present the row, trays, and fitted takeover together. Mixing a
  // compositor row with main-thread pills exposes every delayed main-thread frame.
  // The contact maps the raw offset, so a takeover's anchor moves row and pills alike.
  let actionFrame = 0
  /** The latest time a painted frame was evaluated for. Reads between frames never go
   * back before it, so a release starts from the pose that was last on screen. */
  let presentedAt = -Infinity
  const rawPosition = () => contact.translation(initialRaw + origin - source.scrollLeft)
  /** Present the current scroll sample. A release passes `evaluate: false`: lifting
   * the finger cannot start a takeover that no frame has shown. */
  const flush = (now = performance.now(), evaluate = true) => {
    const at = Math.max(now, presentedAt)
    const raw = rawPosition()
    const position = contact.present(raw, at, evaluate)
    Object.assign(content.style, contentFrame(position, initial ? 1 : 0))
    for (const update of actionUpdates) update(at, raw, position)
    return { raw, position }
  }
  // A frame painted in an animation frame callback reaches the display one refresh
  // later. Native evaluates its contact motion (the takeover jump, the pill
  // takeover) for the frame's presentation time, so the row is computed for when
  // it will be seen (installed iPad slow commit: the jump otherwise trails native by one frame).
  const paintActions = (frameTime: number) => {
    presentedAt = frameTime + SWIPE_PRESENTATION_LEAD_MS
    flush(presentedAt)
    actionFrame = requestAnimationFrame(paintActions)
  }
  paintActions(performance.now())
  return {
    flush,
    rawPosition,
    position: () => contact.present(rawPosition(), Math.max(performance.now(), presentedAt), false),
    cancel: () => {
      cancelAnimationFrame(actionFrame)
      // Outside contact, the settled side's visibility belongs to the row CSS.
      host.querySelectorAll<HTMLElement>('[data-satin-swipe-tray]').forEach(tray => {
        tray.style.opacity = ''
      })
    },
  }
}

const defaultRowRadius = 26
const defaultRowShape: CornerShape = {
  kind: 'roundedRectangle',
  cornerRadius: defaultRowRadius,
  cornerStyle: 'continuous',
}
type RowCornerGeometry = {
  width: number
  height: number
  revision?: number
  leading?: CornerShape
  trailing?: CornerShape
  refresh?: () => void
  resizeRelease?: () => void
}
const rowCorners = new WeakMap<HTMLElement, RowCornerGeometry>()

/** Called by the row's existing ResizeObserver, never by its frame loop. */
export function updateRowCorners(
  content: HTMLElement,
  width: number,
  height: number,
  actions?: SwipeActions,
) {
  const geometry = rowCorners.get(content) ?? { width, height }
  Object.assign(geometry, {
    width,
    height,
    revision: (geometry.revision ?? 0) + 1,
    leading: swipeEdge(actions, 'leading').shape,
    trailing: swipeEdge(actions, 'trailing').shape,
  })
  rowCorners.set(content, geometry)
  for (const side of ['leading', 'trailing'] as const) {
    content.style.setProperty(
      `--satin-row-${side}-clip`,
      cornerClipPath(geometry[side] ?? defaultRowShape, width, height),
    )
  }
  geometry.refresh?.()
  geometry.resizeRelease?.()
}

/** Rebuild only geometry keyframes on resize. The existing animation keeps its
 * timeline, velocity fit and current time, including an interrupted release. */
export function resizeRowCornerAnimation(
  content: HTMLElement,
  animation: Animation,
  frames: () => Keyframe[],
) {
  const geometry = rowCorners.get(content)
  if (!geometry || !animation) return
  const resize = () => {
    const effect = animation.effect
    if (animation.playState !== 'idle' && effect instanceof KeyframeEffect)
      effect.setKeyframes(frames())
  }
  geometry.resizeRelease = resize
  const clear = () => {
    if (geometry.resizeRelease === resize) geometry.resizeRelease = undefined
  }
  animation.finished?.then(clear, clear)
}

/** Keep section end caps until the first inline action has entered. The
 * revealed face has a fixed continuous corner, independent of text height. */
export function swipeContentTrack(content: HTMLElement) {
  const host = content.closest<HTMLElement>('[data-satin-row-actions]')
  const style = host ? getComputedStyle(host) : undefined
  const resting = [
    style?.borderTopLeftRadius,
    style?.borderTopRightRadius,
    style?.borderBottomRightRadius,
    style?.borderBottomLeftRadius,
  ].map(value => Number.parseFloat(value ?? '') || 0)
  const sectionEnd = resting.some(radius => radius > 0)
  const geometry: RowCornerGeometry = rowCorners.get(content) ?? {
    width: content.offsetWidth,
    height: content.offsetHeight,
  }
  rowCorners.set(content, geometry)
  geometry.resizeRelease = undefined
  const widths = host ? swipeWidths(host) : defaultWidths
  let previousKey = ''
  let clipPath = ''
  let lastPosition = 0
  let lastRest = 0
  const frame = (position: number, rest = 0) => {
    lastPosition = position
    lastRest = rest
    const transform = `translate3d(${position}px,0,0)`
    if (position === 0) return { transform, borderRadius: '', clipPath: 'none' }
    const side = position >= 0 ? 'leading' : 'trailing'
    const custom = geometry[side]
    const inline = host?.dataset.satinSwipeLabelLayout === 'inline'
    const progress =
      inline && sectionEnd
        ? clamp((Math.abs(position) - widths[side] - 20) / 20)
        : clamp(Math.abs(position))
    const rounded = progress + (1 - progress) * rest
    // A settled or middle-row drag reuses its path. Only changing corners or
    // a ResizeObserver geometry update rebuild the small cubic path.
    const key = `${geometry.revision}:${geometry.width}:${geometry.height}:${side}:${rounded}`
    if (key !== previousKey) {
      previousKey = key
      clipPath = custom
        ? cornerClipPath(custom, geometry.width, geometry.height)
        : `path('${roundedCornerPath(
            geometry.width,
            geometry.height,
            resting.map(start => start + (defaultRowRadius - start) * rounded),
          )}')`
    }
    return { transform, borderRadius: '0px', clipPath }
  }
  geometry.refresh = () => Object.assign(content.style, frame(lastPosition, lastRest))
  return frame
}
