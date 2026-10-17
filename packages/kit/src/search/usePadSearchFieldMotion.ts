import { useLayoutEffect, useRef, type RefObject } from 'react'
import { animateElement, animateLayout } from '../motion/animate.ts'
import { menuSpring, menuSpringSettle, type MenuSpring } from '../glass/lens/menuSpring.ts'
import type { GlassRegionRegistry } from '../glass/regionRegistry.ts'
import samples from './padSearchFieldSamples.json'

function observed(rows: number[][], ms: number, column = 1) {
  if (ms <= rows[0]![0]!) return rows[0]![column]!
  for (let i = 1; i < rows.length; i++) {
    const left = rows[i - 1]!,
      right = rows[i]!
    if (ms <= right[0]!)
      return (
        left[column]! +
        ((right[column]! - left[column]!) * (ms - left[0]!)) / (right[0]! - left[0]!)
      )
  }
  return rows.at(-1)![column]!
}

/** One field-owned layout track also moves the adjacent toolbar items. */
export function usePadSearchFieldMotion(
  row: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  presented: boolean,
  searchTab: boolean,
  regions?: GlassRegionRegistry,
) {
  const previous = useRef(presented)
  const heightAnimation = useRef<Animation | null>(null)
  const running = useRef<{
    start: number
    duration: number
    sample: (ms: number) => number
    animation: Animation
  } | null>(null)
  useLayoutEffect(() => {
    if (!enabled || previous.current === presented) return
    const oldPresented = previous.current
    previous.current = presented
    const item = row.current?.closest<HTMLElement>('[data-satin-search-pad-item]')
    if (!item) return
    const now = performance.now()
    const old = running.current
    const elapsed = old ? now - old.start : 0
    const interrupted = old !== null && elapsed < old.duration
    const from = interrupted ? old.sample(elapsed) : oldPresented ? 280 : 240
    const velocity = interrupted
      ? (old.sample(elapsed + 0.5) - old.sample(elapsed - 0.5)) * 1000
      : 0
    old?.animation.cancel()
    heightAnimation.current?.cancel()
    const target = presented ? 280 : 240
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      running.current = null
      return
    }
    let duration: number
    let sample: (ms: number) => number
    if (searchTab && !interrupted) {
      const rows = presented ? samples.activate : samples.dismiss
      duration = rows.at(-1)![0]!
      sample = ms => 240 + 40 * observed(rows, ms)
    } else {
      // reference ordinary field: independent activate/dismiss fits, RMS .303/.277 pt.
      // An interrupted tab track carries its measured velocity into its fitted spring.
      const omega = searchTab
        ? presented
          ? 17.805645
          : 11.419662
        : presented
          ? 16.212655
          : 16.137595
      const zeta = searchTab ? (presented ? 0.374592 : 0.64327) : presented ? 0.799286 : 0.797249
      const spring: MenuSpring = {
        omega,
        zeta,
        delay: 0,
        velocity: Math.abs(from - target) > 0.001 ? velocity / (from - target) : 0,
      }
      duration = menuSpringSettle(spring)
      sample = ms => target + (from - target) * menuSpring(spring, ms).value
    }
    const count = Math.max(1, Math.ceil(duration / (1000 / 60)))
    const frames = Array.from({ length: count + 1 }, (_, index) => {
      const width = index === count ? target : sample((duration * index) / count)
      return { width: `${width}px`, flexBasis: `${width}px`, offset: index / count }
    })
    const animation = animateLayout(item, frames, { duration, easing: 'linear' })
    if (searchTab && !interrupted && row.current) {
      const rows = presented ? samples.activate : samples.dismiss
      heightAnimation.current = animateElement(
        row.current,
        Array.from({ length: count + 1 }, (_, index) => ({
          transform: `scaleY(${index === count ? 1 : observed(rows, (duration * index) / count, 2)})`,
          offset: index / count,
        })),
        { duration, easing: 'linear' },
      )
    }
    running.current = { start: now, duration, sample, animation }
    let frame = 0
    const update = () => {
      regions?.invalidate()
      if (animation.playState === 'running') frame = requestAnimationFrame(update)
    }
    update()
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [enabled, presented, searchTab, regions, row])
  useLayoutEffect(
    () => () => {
      running.current?.animation.cancel()
      heightAnimation.current?.cancel()
    },
    [],
  )
}
