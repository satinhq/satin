import type { ZoomRect } from './zoomGeometry.ts'

/** The same viewport-space window that the compositor draws, sampled on its animation clock. */
export type ZoomGlassPose = Readonly<{
  x: number
  y: number
  scale: number
  origin: readonly [number, number]
  clip: readonly [number, number, number, number]
  radius: number
}>

type ZoomGlassMotion = {
  layout: ZoomRect
  carriers: readonly HTMLElement[]
  read: (at: number) => { end: number; sample: (time: number) => ZoomGlassPose }
}
const motions = new WeakMap<HTMLElement, ZoomGlassMotion>()

export function registerZoomGlass(element: HTMLElement, motion: ZoomGlassMotion) {
  motions.set(element, motion)
  return () => {
    if (motions.get(element) === motion) motions.delete(element)
  }
}

export const zoomGlassMotion = (element: HTMLElement) => motions.get(element)

/** Layout capture is synchronous. Important declarations override WAAPI only for these reads,
 * and are restored before returning to WebKit; no animation clock or painted frame changes. */
export function withZoomAtRest<T>(element: HTMLElement, read: () => T): T {
  const carriers = new Set<HTMLElement>()
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement)
    for (const carrier of motions.get(ancestor)?.carriers ?? []) carriers.add(carrier)
  const saved = [...carriers].map(carrier => ({
    carrier,
    value: carrier.style.getPropertyValue('transform'),
    priority: carrier.style.getPropertyPriority('transform'),
    visibility: carrier.style.getPropertyValue('visibility'),
    visibilityPriority: carrier.style.getPropertyPriority('visibility'),
  }))
  for (const { carrier } of saved) {
    carrier.style.setProperty('transform', 'none', 'important')
    // The entrance remains hidden until its first glass submission. Capture its real
    // content synchronously while that presentation barrier is still closed.
    carrier.style.setProperty('visibility', 'visible', 'important')
  }
  try {
    return read()
  } finally {
    for (const { carrier, value, priority, visibility, visibilityPriority } of saved) {
      if (value) carrier.style.setProperty('transform', value, priority)
      else carrier.style.removeProperty('transform')
      if (visibility) carrier.style.setProperty('visibility', visibility, visibilityPriority)
      else carrier.style.removeProperty('visibility')
    }
  }
}

/** In-content presenters travel inside the CSS window. Keep their material and allocation
 * in the route's resting coordinates, rather than capturing Home through a scaled button. */
export function zoomRestRect(element: HTMLElement): ZoomRect | undefined {
  let ancestor: HTMLElement | null = element
  while (ancestor && !motions.has(ancestor)) ancestor = ancestor.parentElement
  if (!ancestor) return undefined
  const motion = motions.get(ancestor)!
  const at = performance.now()
  const pose = motion.read(at).sample(at)
  const rect = element.getBoundingClientRect()
  return {
    x: motion.layout.x + (rect.x - pose.x) / pose.scale,
    y: motion.layout.y + (rect.y - pose.y) / pose.scale,
    width: rect.width / pose.scale,
    height: rect.height / pose.scale,
  }
}
