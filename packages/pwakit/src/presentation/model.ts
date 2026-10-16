import { concentricRadius, type DisplayCornerMetrics } from '../safe-area/displayCorners.ts'
import { createLayoutClassState } from '../layout/layoutClass.ts'
import { POPOVER_ARROW_HEIGHT } from '../glass/regions.ts'

/** Native iOS 27 iPad sheet width (form sheet and detent sheet alike), 580 pt in both orientations. */
export const SHEET_MAX_WIDTH = 580

/* Where a sheet sits, from native iOS 27 (iPhone 17 Pro Max and iPad Pro 13-inch native reference stills):
 * - `edge`: iPhone portrait and compact width. Bottom-attached; medium is an inset floating card.
 * - `fill`: compact height (iPhone landscape). The whole screen at every detent, no corners,
 *   grabber or dim; a downward swipe still dismisses.
 * - `form`: regular width and height (iPad) with only the large detent, SwiftUI's default. A
 *   centred 580 x 660 pt form sheet, measured on physical iPad in both orientations.
 * - `floating`: regular width and height with other detents. 580 pt wide, standing `bottom`
 *   points above the screen's bottom edge (the safe-area inset). */
export type SheetPlacement =
  | Readonly<{ kind: 'edge' }>
  | Readonly<{ kind: 'fill' }>
  | Readonly<{ kind: 'form'; bottom: number }>
  | Readonly<{ kind: 'floating'; bottom: number }>

/** Native's preferred form height is independent of orientation. Constrain it only when the
 * presenting viewport cannot hold it, rather than subtracting a device-specific margin. */
export function formSheetHeight(viewportHeight: number) {
  return Math.min(660, viewportHeight)
}

export function sheetPlacement(
  viewport: { width: number; height: number },
  bottomInset: number,
  onlyLarge: boolean,
  viewportTop = 0,
): SheetPlacement {
  const layout = createLayoutClassState(viewport).layoutClass
  if (layout.vertical === 'compact') return { kind: 'fill' }
  if (layout.horizontal === 'compact') return { kind: 'edge' }
  if (onlyLarge) {
    const freeHeight = viewport.height - formSheetHeight(viewport.height)
    // Center in the full window while room permits. A constrained window must still
    // contain the form inside its layout viewport, without moving above its origin.
    return { kind: 'form', bottom: Math.min(freeHeight, (freeHeight + viewportTop) / 2) }
  }
  return { kind: 'floating', bottom: bottomInset }
}

export function sheetExpansion(height: number, medium: number, large: number) {
  return large > medium
    ? Math.max(0, Math.min(1, (height - medium) / (large - medium)))
    : Number(height >= large)
}

/** The same frame calculation serves React's resting layout and transient motion. */
export function sheetFrame(
  viewportWidth: number,
  expansion: number,
  keyboardHeight: number,
  placement: SheetPlacement = { kind: 'edge' },
) {
  if (placement.kind === 'fill')
    return { width: viewportWidth, left: 0, bottom: 0, contentScale: 1 }
  if (placement.kind === 'form') {
    const width = Math.min(viewportWidth, SHEET_MAX_WIDTH)
    return { width, left: (viewportWidth - width) / 2, bottom: placement.bottom, contentScale: 1 }
  }
  const width = Math.min(viewportWidth - 16 * (1 - expansion), SHEET_MAX_WIDTH)
  const rest = placement.kind === 'floating' ? placement.bottom : 0
  return {
    width,
    left: (viewportWidth - width) / 2,
    bottom: Math.max(rest + 8 * (1 - expansion), keyboardHeight),
    contentScale: width / Math.min(viewportWidth, SHEET_MAX_WIDTH),
  }
}

/** Only an equally inset screen-edge card has the display's corner centre. A centred form,
 * keyboard-raised card or narrow multitasking window keeps its own measured sheet corners. */
export function sheetCornerShape(
  frame: ReturnType<typeof sheetFrame>,
  placement: SheetPlacement | undefined,
  viewport: { width: number; height: number },
  screen: { width: number; height: number },
  display: DisplayCornerMetrics,
) {
  const cornerRadius = placement?.kind === 'form' ? 34 : 38
  const atDisplayEdge =
    placement?.kind === 'edge' &&
    display.source !== 'fallback' &&
    Math.abs(viewport.width - screen.width) < 1 &&
    Math.abs(frame.left - frame.bottom) < 0.5
  return {
    kind: 'roundedRectangle' as const,
    cornerRadius,
    ...(atDisplayEdge ? { bottomCornerRadius: concentricRadius(display.radius, frame.left) } : {}),
    cornerStyle: 'continuous' as const,
  }
}

/** `PresentationDetent`: a sheet's supported resting height. */
export type PresentationDetent =
  'medium' | 'large' | Readonly<{ height: number }> | Readonly<{ fraction: number }>

export function detentHeight(detent: PresentationDetent, available: number): number {
  if (!Number.isFinite(available) || available <= 0)
    throw new Error('Sheet requires a positive available height.')
  if (detent === 'medium') return available / 2
  if (detent === 'large') return available
  const value = 'height' in detent ? detent.height : detent.fraction * available
  if (!Number.isFinite(value) || value <= 0 || ('fraction' in detent && detent.fraction > 1))
    throw new Error('Sheet detents require positive heights or fractions in (0, 1].')
  return Math.min(value, available)
}
export function resolveDetents(detents: readonly PresentationDetent[], available: number) {
  if (!detents.length) throw new Error('Sheet requires at least one detent.')
  return [...new Set(detents.map(detent => detentHeight(detent, available)))].sort((a, b) => a - b)
}
/** Functional release policy. Velocity is points/ms. */
export function releaseDetent(
  height: number,
  velocity: number,
  heights: readonly number[],
  dismissDisabled: boolean,
) {
  const candidates = dismissDisabled ? heights : [0, ...heights]
  // A directional flick advances one stop; slow releases choose the closest stop.
  const directional =
    Math.abs(velocity) >= 0.5
      ? candidates.filter(value => (velocity < 0 ? value > height : value < height))
      : candidates
  const choices = directional.length ? directional : candidates
  return choices.reduce((best, value) =>
    Math.abs(value - height) < Math.abs(best - height) ? value : best,
  )
}
export function rubberBandHeight(height: number, maximum: number) {
  return height <= maximum
    ? Math.max(0, height)
    : maximum + maximum * (1 - 1 / (1 + (height - maximum) / maximum))
}

/** The painted drag position. Below its smallest detent a sheet keeps that size and slides down
 * with the finger (native never shrinks a sheet to dismiss it); without interactive dismissal it
 * resists there as it does above its largest detent. The result can be negative: off-screen. */
export function sheetDragHeight(
  height: number,
  smallest: number,
  largest: number,
  dismissDisabled: boolean,
) {
  if (height > largest) return rubberBandHeight(height, largest)
  if (height >= smallest || !dismissDisabled) return height
  const excess = smallest - height
  return smallest - smallest * (1 - 1 / (1 + excess / smallest))
}

/** How far a sheet painted at `height` has slid below its smallest detent, and its size there. */
export function sheetTravel(height: number, smallest: number) {
  return { size: Math.max(height, smallest), offset: Math.max(0, smallest - height) }
}

/** Native material changes at the midpoint of the medium-to-large drag.
 * The recorded switch is bracketed by top edges 257.67 and 244.67 pt.
 * Keep material choice separate from the final full-width frame geometry. */
export function usesExpandedSheetMaterial(height: number, medium: number, large: number) {
  return height >= (medium + large) / 2
}

/** Space kept between an alert's text field and the keyboard's top edge before the keyboard comes. */
export const ALERT_FIELD_KEYBOARD_CLEARANCE = 8
/**
 * Where an alert with a text field rests while no keyboard is reported.
 *
 * Measured on the iPad (1366 x 1024): the centred alert's field ends at 531 pt and the keyboard's
 * top is at 526 pt. WebKit scrolls the document whenever a caret it could see is covered by the
 * keyboard, for 300 ms, before any script can move the alert. An alert that already rests with
 * its field above the keyboard to come gives WebKit nothing to reveal. On a phone the centred
 * field is clear already and the centre is unchanged.
 *
 * `fieldReach` is how far the field's bottom edge lies below the alert's centre.
 */
export function alertRestingCenter(
  center: number,
  fieldReach: number,
  layoutHeight: number,
  expectedKeyboardHeight: number,
  keyboardCenter: number,
) {
  if (expectedKeyboardHeight <= 0) return center
  const clearLine = layoutHeight - expectedKeyboardHeight - ALERT_FIELD_KEYBOARD_CLEARANCE
  // Never above where the keyboard itself would put the alert.
  return Math.min(center, Math.max(keyboardCenter, clearLine - fieldReach))
}

/* Native iOS 27 `confirmationDialog` on iPhone is a popover from its source (native reference fixture reference,
 * iPhone 17 Pro Max, 3x stills): 240 pt wide. From a list row it sits above the row, centred on it,
 * with a 14 pt arrow whose tip lies 16.5 pt inside the row's top edge. From a toolbar button it grows
 * out of the button: same top edge, 10 pt from the screen edge on the button's side, no arrow. */
export const CONFIRMATION_POPOVER_WIDTH = 240
export const CONFIRMATION_ARROW_HEIGHT = POPOVER_ARROW_HEIGHT
const POPOVER_SCREEN_MARGIN = 10
const POPOVER_ARROW_OVERLAP = 16.5
const POPOVER_ARROW_HALF_BASE = 16
const POPOVER_ARROW_CORNER_CLEARANCE = 20

export type PopoverAnchor = { left: number; top: number; right: number; bottom: number }
export type ConfirmationPopoverFrame = {
  left: number
  top: number
  /** Where the arrow meets the body, in the popover's own x; absent when nothing points. */
  arrow?: { x: number; edge: 'top' | 'bottom' }
  /** The point it grows from and shrinks into, in its own coordinates (arrow tip or button). */
  origin?: { x: number; y: number }
}

export function confirmationPopoverFrame(
  anchor: PopoverAnchor | null,
  anchorInBar: boolean,
  height: number,
  viewport: { width: number; top: number; bottom: number },
): ConfirmationPopoverFrame {
  const width = CONFIRMATION_POPOVER_WIDTH
  const margin = POPOVER_SCREEN_MARGIN
  if (!anchor) {
    return {
      left: (viewport.width - width) / 2,
      top: (viewport.top + viewport.bottom) / 2 - height / 2,
    }
  }
  const anchorCenter = (anchor.left + anchor.right) / 2
  if (anchorInBar) {
    const trailing = anchorCenter > viewport.width / 2
    const left = trailing ? viewport.width - margin - width : margin
    return {
      left,
      top: anchor.top,
      origin: { x: anchorCenter - left, y: (anchor.bottom - anchor.top) / 2 },
    }
  }
  const center = Math.min(
    Math.max(anchorCenter, margin + width / 2),
    viewport.width - margin - width / 2,
  )
  const left = center - width / 2
  const arrowLimit = POPOVER_ARROW_HALF_BASE + POPOVER_ARROW_CORNER_CLEARANCE
  const arrowX = Math.min(Math.max(anchorCenter - left, arrowLimit), width - arrowLimit)
  const overlap = Math.min(POPOVER_ARROW_OVERLAP, (anchor.bottom - anchor.top) / 2)
  const above = anchor.top + overlap - CONFIRMATION_ARROW_HEIGHT - height
  if (above >= viewport.top + margin)
    return {
      left,
      top: above,
      arrow: { x: arrowX, edge: 'bottom' },
      origin: { x: arrowX, y: height + CONFIRMATION_ARROW_HEIGHT },
    }
  return {
    left,
    top: anchor.bottom - overlap + CONFIRMATION_ARROW_HEIGHT,
    arrow: { x: arrowX, edge: 'top' },
    origin: { x: arrowX, y: -CONFIRMATION_ARROW_HEIGHT },
  }
}
