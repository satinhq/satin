type Rect = Readonly<{ x: number; y: number; width: number; height: number }>

/** How far a trigger's centre may sit from the middle of the screen and still get a centred
 * panel (points). iPhone 17 Pro Max Simulator, iOS 27.0, a 129 pt capsule trigger at 14
 * positions: centred at 4.5, 15.5, 19.5 and 20.5 pt from the middle, edge-aligned at 25.5, 29.5,
 * 30.5 and beyond. Other screen widths were not measured. */
export const MENU_CENTER_BAND = 22

/** Lifted non-row content (iPhone 17 Pro Max Simulator, iOS 27.0, stock `.contextMenu` on a grid
 * tile with and without `preview:`; native menu measurements native-iphone stills): the menu sits 20 pt from
 * the lifted box (tile 19.8, preview 20.0) and takes the box's leading or trailing edge on its
 * side of the screen, with no centred band (tall bubbles 19.5 and 30 pt off centre align
 * leading; content exactly centred is unmeasured and aligns leading). iPad does the same for
 * lifted bubbles (native iPad: tall leading, short trailing, 18-19 pt at the 1 pt contour
 * resolution), and puts a custom preview's menu beside it, top-aligned, 20-21 pt away. */
export const CONTEXT_CONTENT_GAP = 20

/** How much lifted non-row content grows. A 192 x 230 pt grid tile settles at 1.115 and a
 * 159 x 38 pt bubble at 1.15 (same stills); a full-width row keeps its own measured lift. Both
 * points fit growing the longest side by 26 pt, at most 1.15. Two sizes were measured. */
export function contextContentScale(width: number, height: number) {
  const longest = Math.max(width, height, 1)
  return Math.min(1.15, (longest + 26) / longest)
}

/** Where lifted content (or its custom preview, `size`) settles: centred on its resting source,
 * kept inside the screen (native keeps 20 pt), and moved up or down only when its menu would fit
 * neither below nor above it. Native tile and preview stills: centred on the whole tile
 * (artwork and labels), clamped to the 20 pt side margin. Tall bubbles (native menu measurements stills):
 * the content moves the shorter way that frees room for its menu (3 positions), and content too
 * tall to share the screen with its menu sits at the bottom with the menu over its top. */
export function contextLiftBox(
  rest: Rect,
  size: Readonly<{ width: number; height: number }>,
  menuHeight: number,
  available: Rect,
): Rect {
  const width = Math.min(size.width, available.width)
  const height = Math.min(size.height, available.height)
  const clamp = (value: number, start: number, extent: number, length: number) =>
    Math.max(start, Math.min(value, start + Math.max(0, extent - length)))
  const x = clamp(rest.x + (rest.width - width) / 2, available.x, available.width, width)
  let y = clamp(rest.y + (rest.height - height) / 2, available.y, available.height, height)
  const bottom = available.y + available.height
  const fitsBelow = y + height + CONTEXT_CONTENT_GAP + menuHeight <= bottom
  const fitsAbove = y - CONTEXT_CONTENT_GAP - menuHeight >= available.y
  if (!fitsBelow && !fitsAbove) {
    const up = bottom - menuHeight - CONTEXT_CONTENT_GAP - height
    const down = available.y + menuHeight + CONTEXT_CONTENT_GAP
    y = up < available.y ? bottom - height : Math.abs(up - y) <= Math.abs(down - y) ? up : down
  }
  return { x, y, width, height }
}

/** Stock Menu keeps its first row over the trigger. The September 27 iPad
 * reference puts its center 3pt below the text trigger (3.5pt for ellipsis).
 * Center the panel horizontally, then move it inside the usable viewport.
 *
 * iPhone (October 1 reference, capsule, full-width, toolbar-group and circle triggers): a trigger
 * near the middle of the screen gets a panel centred on it; any other trigger gets a panel whose
 * edge is the trigger glass's own edge on its side of the screen (a toolbar group's edge, whichever
 * member opened the menu). The panel's top is the trigger's top; when it does not fit below, its
 * bottom is the trigger's bottom and it opens upward. This is an idiom distinction, not a
 * window-width breakpoint. */
export function menuPanelPlacement(
  trigger: Rect,
  panel: Rect,
  firstRow: Rect | undefined,
  available: Rect,
  phone = false,
  source: 'trigger' | 'context' | 'context-content' | 'context-preview' = 'trigger',
) {
  const clamp = (value: number, start: number, extent: number, size: number) =>
    Math.max(start, Math.min(value, start + Math.max(0, extent - size)))
  const triggerCenter = trigger.x + trigger.width / 2
  if (source !== 'trigger') {
    // Native iPad paired held state: 17pt between a row and its menu edge. A phone row's menu
    // sits 12 pt below the row; lifted content (or a custom preview) keeps 20 pt from its lifted
    // box, and the menu takes the box's edge on its side of the screen (CONTEXT_CONTENT_GAP).
    const content = source !== 'context'
    if (!phone && source === 'context-preview') {
      // iPad: beside the preview on the roomier side, when it fits there (a right-column tile's
      // preview gets its menu on the left).
      const right = available.x + available.width
      const before = trigger.x - CONTEXT_CONTENT_GAP - panel.width
      const after = trigger.x + trigger.width + CONTEXT_CONTENT_GAP
      const roomierBefore = trigger.x - available.x > right - (trigger.x + trigger.width)
      const fitsBefore = before >= available.x
      const fitsAfter = after + panel.width <= right
      if (fitsBefore || fitsAfter)
        return {
          left: (roomierBefore && fitsBefore) || !fitsAfter ? before : after,
          top: clamp(trigger.y, available.y, available.height, panel.height),
        }
    }
    const gap = content ? CONTEXT_CONTENT_GAP : phone ? 12 : 17
    const below = trigger.y + trigger.height + gap
    const above = trigger.y - panel.height - gap
    const offset = triggerCenter - (available.x + available.width / 2)
    // Lifted content keeps an edge even 19.5 pt off centre (r2 698 pt bubble: leading).
    const left = !content
      ? triggerCenter - panel.width / 2
      : offset <= 0
        ? trigger.x
        : trigger.x + trigger.width - panel.width
    const bottom = available.y + available.height
    // Lifted content's menu takes the roomier side when it fits there (native: a second-row
    // tile and a lower bubble open upward, a first-row tile and a preview downward).
    const roomier = content && trigger.y - available.y > bottom - (trigger.y + trigger.height)
    // Content too tall to leave room on either side keeps the menu over its top.
    const over = content && above < available.y && below + panel.height > bottom
    return {
      left: clamp(left, available.x, available.width, panel.width),
      top: clamp(
        over
          ? available.y
          : above >= available.y && (roomier || below + panel.height > bottom)
            ? above
            : below,
        available.y,
        available.height,
        panel.height,
      ),
    }
  }
  if (phone) {
    const offset = triggerCenter - (available.x + available.width / 2)
    const left =
      Math.abs(offset) <= MENU_CENTER_BAND
        ? triggerCenter - panel.width / 2
        : offset < 0
          ? trigger.x
          : trigger.x + trigger.width - panel.width
    const top = menuOpensUpward(trigger, panel, available)
      ? trigger.y + trigger.height - panel.height
      : trigger.y
    return {
      left: clamp(left, available.x, available.width, panel.width),
      top: clamp(top, available.y, available.height, panel.height),
    }
  }
  const rowCenter = firstRow ? firstRow.y + firstRow.height / 2 - panel.y : panel.height / 2
  return {
    left: clamp(triggerCenter - panel.width / 2, available.x, available.width, panel.width),
    top: clamp(
      trigger.y + trigger.height / 2 + 3 - rowCenter,
      available.y,
      available.height,
      panel.height,
    ),
  }
}

/** An iPhone menu hangs from its trigger's top, and opens upward from its trigger's bottom when
 * it would not fit below (and does fit above). */
export function menuOpensUpward(trigger: Rect, panel: Rect, available: Rect) {
  const fitsBelow = trigger.y + panel.height <= available.y + available.height
  const fitsAbove = trigger.y + trigger.height - panel.height >= available.y
  return !fitsBelow && fitsAbove
}
