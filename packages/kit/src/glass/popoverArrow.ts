import type { PopoverArrow } from './regions.ts'

/** A confirmation popover names its arrow on its glass element (`--satin-popover-arrow`:
 * `top|bottom <x px>` in layout points). The measured frame carries the presentation transform,
 * so the arrow takes the same scale. */
export function popoverArrow(
  element: HTMLElement,
  rect: { width: number },
): PopoverArrow | undefined {
  const [edge, value] = element.style.getPropertyValue('--satin-popover-arrow').trim().split(/\s+/)
  const x = Number.parseFloat(value ?? '')
  if ((edge !== 'top' && edge !== 'bottom') || !Number.isFinite(x) || !element.offsetWidth)
    return undefined
  const scale = rect.width / element.offsetWidth
  return { edge, x: x * scale, scale }
}
