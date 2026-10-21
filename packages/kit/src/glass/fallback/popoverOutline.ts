import { POPOVER_ARROW_HALF_BASE, POPOVER_ARROW_HEIGHT, type PopoverArrow } from '../regions.ts'
import type { CapsuleShape } from '../renderSpecs.ts'

/** One backdrop aperture: painting a second translucent triangle would double the join's tint. */
export function popoverOutline(shape: CapsuleShape, arrow: PopoverArrow) {
  const width = shape.halfWidth * 2
  const height = shape.halfHeight * 2
  const arrowHeight = POPOVER_ARROW_HEIGHT * arrow.scale
  const halfBase = POPOVER_ARROW_HALF_BASE * arrow.scale
  const top = arrow.edge === 'top' ? arrowHeight : 0
  const bottom = top + height
  const radius = shape.radius
  const bottomRadius = shape.bottomRadius ?? radius
  const x = arrow.x - (shape.centerX - shape.halfWidth)
  const topArrow =
    arrow.edge === 'top' ? `L ${x - halfBase} ${top} L ${x} 0 L ${x + halfBase} ${top}` : ''
  const bottomArrow =
    arrow.edge === 'bottom'
      ? `L ${x + halfBase} ${bottom} L ${x} ${bottom + arrowHeight} L ${x - halfBase} ${bottom}`
      : ''
  const path = [
    `M ${radius} ${top}`,
    topArrow,
    `L ${width - radius} ${top} A ${radius} ${radius} 0 0 1 ${width} ${top + radius}`,
    `L ${width} ${bottom - bottomRadius} A ${bottomRadius} ${bottomRadius} 0 0 1 ${width - bottomRadius} ${bottom}`,
    bottomArrow,
    `L ${bottomRadius} ${bottom} A ${bottomRadius} ${bottomRadius} 0 0 1 0 ${bottom - bottomRadius}`,
    `L 0 ${top + radius} A ${radius} ${radius} 0 0 1 ${radius} ${top} Z`,
  ].join(' ')
  return { path, top, height: height + arrowHeight, width }
}
