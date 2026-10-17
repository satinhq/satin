import { ActivityIndicatorSegments } from '../controls/ActivityIndicatorSegments.tsx'
import { useContext, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { ScreenContext } from '../navigation/navigationContext.tsx'
import { TabActivityContext } from '../tabs/context.ts'
import type { TaskAction } from '../tasks/useTask.ts'
import { refreshHeight, refreshRelease, refreshReleaseOffset } from './refreshMotion.ts'
import { useRefreshAction } from './refreshable.ts'
import { animateElement, timelineStart } from '../motion/animate.ts'

// Native iPad sweep: 268 pt did not arm, 276 pt did.
// Midpoint candidate; exact threshold and iPhone gesture parity remain pending.
const pullThreshold = 272

/** An additive control inside the existing native WebKit scroll surface. */
export function RefreshControl({
  surface,
  content,
  action,
}: {
  surface: RefObject<HTMLDivElement | null>
  content: RefObject<HTMLDivElement | null>
  action: TaskAction
}) {
  const screen = useContext(ScreenContext)
  const tabActive = useContext(TabActivityContext)
  const active = tabActive && !screen?.lifecycle.isCovered
  const { running, run } = useRefreshAction(action, active)
  const container = useRef<HTMLDivElement>(null)
  const spinner = useRef<SVGSVGElement>(null)
  const wasRunning = useRef(false)
  const release = useRef<Animation | null>(null)

  useEffect(() => {
    const element = surface.current
    const indicator = spinner.current
    if (!element || !indicator || !active || running) return
    let touching = false
    let eligible = false
    let distance = 0
    const paint = () => {
      distance = Math.max(0, -element.scrollTop)
      indicator.style.opacity = String(Math.min(1, distance / refreshHeight))
      indicator.style.transform = `scale(${Math.min(1, distance / refreshHeight)})`
    }
    const reset = () => {
      distance = 0
      indicator.style.opacity = '0'
      indicator.style.transform = 'scale(0)'
    }
    const start = (event: TouchEvent) => {
      reset()
      touching = event.touches.length === 1
      eligible = touching && element.scrollTop <= 0
    }
    const scroll = () => {
      if (touching && eligible) paint()
    }
    const end = () => {
      if (touching && eligible && distance >= pullThreshold) run()
      else reset()
      touching = false
      eligible = false
    }
    const cancel = () => {
      reset()
      touching = false
      eligible = false
    }
    element.addEventListener('touchstart', start, { passive: true })
    element.addEventListener('scroll', scroll, { passive: true })
    element.addEventListener('touchend', end, { passive: true })
    element.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      element.removeEventListener('touchstart', start)
      element.removeEventListener('scroll', scroll)
      element.removeEventListener('touchend', end)
      element.removeEventListener('touchcancel', cancel)
    }
  }, [surface, active, running, run])

  useLayoutEffect(() => {
    const element = container.current
    const indicator = spinner.current
    const carrier = content.current
    if (!element || !indicator || !carrier) return
    release.current?.cancel()
    release.current = null
    if (running) {
      element.style.height = `${refreshHeight}px`
      if (!wasRunning.current && surface.current) surface.current.scrollTop += refreshHeight
      indicator.style.opacity = '1'
      indicator.style.transform = 'scale(1)'
    } else if (wasRunning.current && active) {
      // Commit layout once. Native scroll clamping/anchoring may consume some of the
      // spacer change, so retain the actual visible displacement, not a guessed 60 pt.
      const before = carrier.getBoundingClientRect().top
      element.style.height = '0px'
      const displacement = before - carrier.getBoundingClientRect().top
      indicator.style.top = '15px'
      const duration = refreshRelease.at(-1)!.time
      const finish = () => {
        indicator.style.opacity = '0'
        indicator.style.top = '-45px'
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || displacement === 0) {
        finish()
      } else {
        const start = performance.now()
        const animation = animateElement(
          carrier,
          refreshRelease.map(sample => ({
            transform: `translateY(${refreshReleaseOffset(sample.height, displacement)}px)`,
            offset: sample.time / duration,
          })),
          { duration, easing: 'linear', fill: 'both' },
        )
        animation.startTime = timelineStart(start)
        release.current = animation
        void animation.finished.then(
          () => {
            if (release.current !== animation) return
            finish()
            animation.cancel()
            release.current = null
          },
          () => {},
        )
      }
    } else {
      element.style.height = '0px'
      indicator.style.opacity = '0'
    }
    wasRunning.current = running
  }, [running, active, surface, content])
  useLayoutEffect(() => () => release.current?.cancel(), [])

  return (
    <div ref={container} style={{ height: 0, position: 'relative', flexShrink: 0 }}>
      <svg
        ref={spinner}
        role={running ? 'progressbar' : undefined}
        aria-label={running ? 'Refreshing' : undefined}
        aria-hidden={!running}
        width="30"
        height="30"
        viewBox="0 0 20 20"
        style={{
          position: 'absolute',
          left: 'calc(50% - 15px)',
          top: running ? 15 : -45,
          opacity: 0,
          color: 'var(--satin-list-secondary)',
          pointerEvents: 'none',
        }}
      >
        <ActivityIndicatorSegments running={running} />
      </svg>
    </div>
  )
}
