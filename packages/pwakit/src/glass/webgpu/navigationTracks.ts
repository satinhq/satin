import type { NavigationGlassRoute } from '../../navigation/glassTransition.ts'
import type { NavigationPose, NavigationTrack } from './productionTracks.ts'
import { zoomGlassMotion } from '../../navigation/zoomGlass.ts'
type Property = 'transform' | 'opacity'
const easingSamplers = new Map<string, Animation>()
function ease(value: number, easing = 'linear') {
  if (easing === 'linear') return value
  let animation = easingSamplers.get(easing)
  if (!animation) {
    animation = new Animation(new KeyframeEffect(null, [], { duration: 1, fill: 'both', easing }))
    easingSamplers.set(easing, animation)
  }
  animation.currentTime = value
  const progress = animation.effect!.getComputedTiming().progress
  if (progress == null) throw Error(`Cannot evaluate navigation easing ${easing}`)
  return progress
}
/** Copy active WAAPI definitions at a commit/input boundary, never per frame. */
function read(element: HTMLElement, property: Property, at: number) {
  const width = element.getBoundingClientRect().width
  const translation = (value: string) => {
    if (value === 'none') return 0
    const resolved = value.replace(
      /([-+\d.e]+)%/g,
      (_, number) => String((Number(number) * width) / 100) + 'px',
    )
    return new DOMMatrixReadOnly(resolved).m41
  }
  const active = element
    .getAnimations()
    .filter(
      a =>
        a.effect instanceof KeyframeEffect &&
        (a.effect as KeyframeEffect).getKeyframes().some(f => f[property] !== undefined),
    )
  const fallback =
    property === 'transform'
      ? translation(getComputedStyle(element).transform)
      : Number(getComputedStyle(element).opacity)
  if (!active.length || active.some(a => a.timeline !== document.timeline || a.startTime == null))
    return { end: at, sample: () => fallback }
  const tracks = active.map(animation => {
    const effect = animation.effect as KeyframeEffect,
      timing = effect.getTiming(),
      frames = effect.getKeyframes(),
      start = Number(animation.startTime) + Number(timing.delay),
      duration = Number(timing.duration)
    if (!Number.isFinite(duration) || duration <= 0 || typeof animation.startTime !== 'number')
      throw Error('Navigation animation has no finite document timeline')
    const values = frames.map(f => ({
      offset: f.computedOffset,
      easing: f.easing,
      value:
        property === 'transform' ? translation(String(f.transform ?? 'none')) : Number(f.opacity),
    }))
    return {
      end: start + duration,
      sample: (now: number) => {
        const progress = ease(Math.max(0, Math.min(1, (now - start) / duration)), timing.easing)
        let hi = values.findIndex(v => v.offset >= progress)
        if (hi < 0) hi = values.length - 1
        const lo = Math.max(0, hi - 1),
          a = values[lo],
          b = values[hi]
        return (
          a.value +
          (b.value - a.value) *
            ease(
              b.offset === a.offset ? 0 : (progress - a.offset) / (b.offset - a.offset),
              a.easing,
            )
        )
      },
    }
  })
  // Satin's transform tracks replace the underlying style on each element.
  return tracks.at(-1)!
}
export function navigationTrack(
  routes: readonly NavigationGlassRoute[],
  at: number,
): NavigationTrack {
  const tracks = routes.map(r => ({
    outer: read(r.screen, 'transform', at),
    inner: read(r.motion, 'transform', at),
    dim: read(r.dim, 'opacity', at),
    zoom: (zoomGlassMotion(r.motion) ?? zoomGlassMotion(r.screen))?.read(at),
  }))
  const end = Math.max(
      at + 1,
      ...tracks.flatMap(t => [t.outer.end, t.inner.end, t.dim.end, t.zoom?.end ?? at]),
    ),
    duration = end - at
  const poses: NavigationPose[] = Array.from(
    { length: Math.max(2, Math.ceil(duration / 4) + 1) },
    (_, i) => {
      const now = at + (duration * i) / Math.max(1, Math.ceil(duration / 4)),
        rear = tracks[0],
        front = tracks.at(-1)!
      return {
        routes: tracks.map(t => ({
          x: t.outer.sample(now) + t.inner.sample(now),
          dim: Math.floor(t.dim.sample(now) * 255) / 255,
          ...(t.zoom ? { zoom: t.zoom.sample(now) } : {}),
        })),
        frontX: front.outer.sample(now) + front.inner.sample(now),
        rearX: rear.outer.sample(now) + rear.inner.sample(now),
        frontDim: Math.floor(front.dim.sample(now) * 255) / 255,
        rearDim: Math.floor(rear.dim.sample(now) * 255) / 255,
      }
    },
  )
  return { epoch: performance.timeOrigin + at, duration, poses }
}
