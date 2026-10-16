import { toolbarMaterialOwner, toolbarMenuContents } from './toolbarMaterialContext.ts'
import { lowerShapeTop } from './lens/drawableTop.ts'
import { glassAperture } from './shapeTrackRegistry.ts'
import { shapeTrackClock } from './shapeTrack.ts'

/** The span is a layout slot and may stretch across a flex/grid column. It is not the trigger. */
export function menuTriggerElement(anchor: HTMLElement | null) {
  return (
    anchor?.querySelector<HTMLElement>('[data-satin-glass-effect]') ??
    anchor?.querySelector<HTMLElement>('button') ??
    (anchor?.firstElementChild as HTMLElement | null | undefined)
  )
}

/** The glass a Menu morphs out of, and the menu's own button when that glass is wider than it.
 * A glass button is its own glass. A plain button inside a toolbar group shares the group's one
 * glass platter with its neighbours: native morphs the whole platter into the menu (its drop
 * forms under the pressed member and the neighbours' symbols fade with the platter). */
export function menuTriggerSource(anchor: HTMLElement | null) {
  const owner = toolbarMaterialOwner(menuTriggerElement(anchor))
  if (owner) {
    return { glass: owner, member: menuTriggerElement(anchor) ?? undefined }
  }
  const own = anchor?.querySelector<HTMLElement>('[data-satin-glass-effect]')
  if (own) return { glass: own, member: undefined }
  const group = anchor?.closest<HTMLElement>('[data-satin-toolbar-group]')
  if (!group) return { glass: menuTriggerElement(anchor) ?? undefined, member: undefined }
  return { glass: group, member: menuTriggerElement(anchor) ?? undefined }
}

/** A toolbar's material lives outside its content; hide and lock the complete content run. */
export function menuTriggerContents(anchor: HTMLElement | null) {
  const { glass } = menuTriggerSource(anchor)
  return toolbarMaterialOwner(menuTriggerElement(anchor))
    ? toolbarMenuContents(menuTriggerElement(anchor))
    : glass
      ? [glass]
      : []
}

/** The same viewport-space aperture as the pressed region, including its top-edge pivot.
 * Read the rendered corner radius so a custom rounded rectangle stays a rectangle. */
export function menuTriggerGeometry(
  rect: { x: number; y: number; width: number; height: number },
  radius: number,
  scale = 1,
) {
  const width = rect.width * scale,
    height = rect.height * scale
  const shape = lowerShapeTop({ centerY: rect.height / 2, halfHeight: height / 2 }, rect.y)
  return {
    x: rect.x - (width - rect.width) / 2,
    y: rect.y + shape.centerY - shape.halfHeight,
    width,
    height,
    radius: Math.min(Math.max(0, radius * scale), width / 2, height / 2),
  }
}

/** A return aperture must still be visible in the current viewport and its clipping ancestors. */
export function menuTriggerReturnGeometry(
  anchor: HTMLElement | null,
  viewport: { x: number; y: number; width: number; height: number },
  at = shapeTrackClock(),
) {
  const { glass } = menuTriggerSource(anchor)
  if (!anchor?.isConnected || !glass?.isConnected) return undefined
  const rect = glassAperture(glass, at)
  let left = Math.max(rect.x, viewport.x)
  let top = Math.max(rect.y, viewport.y)
  let right = Math.min(rect.x + rect.width, viewport.x + viewport.width)
  let bottom = Math.min(rect.y + rect.height, viewport.y + viewport.height)
  for (let parent = glass.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    const clipsX = /auto|scroll|hidden|clip/.test(style.overflowX)
    const clipsY = /auto|scroll|hidden|clip/.test(style.overflowY)
    if (!clipsX && !clipsY) continue
    const bounds = parent.getBoundingClientRect()
    if (clipsX) {
      left = Math.max(left, bounds.left)
      right = Math.min(right, bounds.right)
    }
    if (clipsY) {
      top = Math.max(top, bounds.top)
      bottom = Math.min(bottom, bounds.bottom)
    }
  }
  if (rect.width <= 0 || rect.height <= 0 || right <= left || bottom <= top) return undefined
  return menuTriggerHasGlass(glass)
    ? menuTriggerGeometry(rect, rect.radius)
    : menuLabelTrigger(rect)
}

/** Plain value labels (a menu-style Picker's value, a text Menu label) have no material of
 * their own, but the native Picker's drop still leaves the label (picker-glass-sheet). */
export function menuTriggerHasGlass(element: HTMLElement | undefined) {
  return !!element?.matches(
    '[data-satin-glass-effect], [data-satin-glass-button], [data-satin-toolbar-group], [data-satin-toolbar-glass]',
  )
}
/** The virtual trigger of a plain label: the label's own box as a capsule. It takes part in
 * the shared glass field like a glass button's, but draws no glass at rest. */
export function menuLabelTrigger(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    radius: rect.height / 2,
  }
}

/** How a plain trigger takes part in the menu's glass. An icon-only button (a box at least
 * two thirds as thick as it is long, like the Now Playing ellipsis) is a glyph: its drop is a
 * glass button's that swells out of nothing. A wider box is a text label: menu-style Picker
 * values keep their measured label drop (picker-glass-sheet). */
export function plainMenuSourceKind(rect: { width: number; height: number }): 'glyph' | 'label' {
  const thick = Math.min(rect.width, rect.height),
    long = Math.max(rect.width, rect.height)
  return long > 0 && thick / long >= 2 / 3 ? 'glyph' : 'label'
}

/* First resolved native context body, native opening measurements: a 92x25 pt aperture below
 * the resting preview. The preview itself never enters the material field. */
export function contextMenuSeed(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: rect.x + rect.width / 2 - 46,
    y: rect.y + rect.height + 2,
    width: 92,
    height: 25,
    radius: 12.5,
  }
}

/** Where a dismissed context menu's body collapses: the same 92x25 pt aperture as its open seed,
 * on the side of its source that faces the menu. Native's body shrinks back into its source; a
 * menu placed above its preview (a grid tile near the bottom of the screen) collapses onto the
 * source's top edge rather than travelling across the preview to the seed below it. The facing
 * side is principled, not measured: only the below-the-source seed has a native capture. */
export function contextMenuReturnSeed(
  source: { x: number; y: number; width: number; height: number },
  panel?: { y: number; height: number },
) {
  const below = contextMenuSeed(source)
  const panelAbove =
    panel && panel.height > 0 && panel.y + panel.height / 2 < source.y + source.height / 2
  return panelAbove ? { ...below, y: source.y - 2 - below.height } : below
}
