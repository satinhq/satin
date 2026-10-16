import { animateElement } from '../motion/animate.ts'
import { Animation } from '../motion/animationValue.ts'
import { registerLayoutAnimation } from '../motion/layoutTransaction.ts'
import { runFrameTimes, sampleChannel, type SpringChannel } from '../motion/springPath.ts'

/** Default List sort fit, iOS 27.0: omega 19.8556, damping ratio 0.94512.
 * 41 native refresh-counter samples over a 330 pt move; RMS 1.40 pt. */
export const LIST_MOVE_ANIMATION: Animation = Animation.spring({
  durationMs: (2 * Math.PI * 1000) / 19.85560151602657,
  bounce: 1 - 0.9451210252171627,
})

// Kept on the existing row wrapper. Swipe actions translate its child independently.
type Rows = ReadonlyMap<string, HTMLElement>
type Run = {
  motion: globalThis.Animation
  animation: Animation
  channel: SpringChannel
  visibility: SpringChannel
  clipExit: boolean
  targetVisibility: number
  finish(): void
}
const runs = new Map<HTMLElement, Run>()
const swipeRemovals = new WeakSet<HTMLElement>()

/** Mark only the synchronous full-swipe transaction, including non-destructive removals. */
export function markRowSwipeRemoval(element: HTMLElement) {
  const row = element.closest<HTMLElement>('[data-satin-section-item]')
  if (row) swipeRemovals.add(row)
  return () => {
    if (row) swipeRemovals.delete(row)
  }
}

const ownedAnimations = new WeakSet<globalThis.Animation>()

export function isRowMove(animation: globalThis.Animation) {
  return ownedAnimations.has(animation)
}

function stop(element: HTMLElement) {
  const run = runs.get(element)
  if (!run) return
  run.motion.cancel()
  run.finish()
}

export function stopRowMoves(rows: Rows) {
  for (const element of rows.values()) stop(element)
}

/** Content coordinates keep scrolling independent of cell movement. */
function position(element: HTMLElement) {
  const scroll = element.closest<HTMLElement>('[data-satin-scroll]')
  return (
    element.getBoundingClientRect().top +
    (scroll?.scrollTop ?? 0) -
    (scroll?.getBoundingClientRect().top ?? 0)
  )
}

export function registerRowMoves(readRows: () => Rows) {
  const ownedElements = new Set<HTMLElement>()
  const exits = new Map<string, HTMLElement>()
  let mounted = true
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  const reduce = () => {
    if (media.matches) for (const element of ownedElements) stop(element)
  }
  media.addEventListener('change', reduce)
  const unregister = registerLayoutAnimation(() => {
    const liveRows = new Map(readRows())
    for (const [key, element] of exits) {
      if (!liveRows.has(key)) liveRows.set(key, element)
    }
    const before = new Map(
      [...liveRows].map(([key, element]) => {
        const run = runs.get(element)
        const time = Number(run?.motion.currentTime ?? 0)
        const velocity = run ? sampleChannel(run.animation, run.channel, time).velocity : 0
        const visibility = run
          ? run.targetVisibility + sampleChannel(run.animation, run.visibility, time).offset
          : 1
        const visibilityVelocity = run
          ? sampleChannel(run.animation, run.visibility, time).velocity
          : 0
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return [
          key,
          {
            element,
            clipExit: Boolean(run?.clipExit || swipeRemovals.has(element)),
            isRow: element.hasAttribute('data-satin-section-item'),
            top: position(element),
            left: bounds.left,
            width: bounds.width,
            height: bounds.height,
            velocity,
            visibility,
            visibilityVelocity,
            scroll: element.closest<HTMLElement>('[data-satin-scroll]'),
            look: {
              color: style.color,
              font: style.font,
              borderRadius: style.borderRadius,
              background:
                style.getPropertyValue('--satin-row-background') ||
                style.getPropertyValue('--satin-list-cell') ||
                style.backgroundColor,
            },
          },
        ] as const
      }),
    )
    const beforeByElement = new Map([...before.values()].map(row => [row.element, row]))
    return requestedAnimation => {
      const animation =
        requestedAnimation === Animation.default ? LIST_MOVE_ANIMATION : requestedAnimation
      const rows = readRows()
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // The before snapshot includes the presented transform. Cancel as one batch, then
      // read resting geometry as one batch; no spring approximation enters the layout delta.
      for (const previous of before.values()) stop(previous.element)
      for (const element of ownedElements) stop(element)
      ownedElements.clear()
      exits.clear()
      const targets = [...rows].map(([key, element]) => ({ key, element, top: position(element) }))
      if (!animation || reduced || !mounted) return
      for (const [key, previous] of before) {
        if (
          !previous.isRow ||
          rows.has(key) ||
          previous.element.isConnected ||
          !previous.scroll?.isConnected
        )
          continue
        // A removed React subtree has already released its handlers and effects. Keep
        // only its paint in an inert layer inside the same scrolling coordinate space.
        const layer = previous.element.ownerDocument.createElement('div')
        layer.setAttribute('data-satin-row-exit', 'true')
        layer.setAttribute('aria-hidden', 'true')
        layer.inert = true
        Object.assign(layer.style, {
          position: 'absolute',
          left: '0px',
          top: '0px',
          margin: '0px',
          width: `${previous.width}px`,
          height: `${previous.height}px`,
          pointerEvents: 'none',
          zIndex: '0',
          ...previous.look,
        })
        layer.append(previous.element)
        const scrollContent = previous.scroll.querySelector('[data-satin-scroll-content]')
        ;(scrollContent ?? previous.scroll).append(layer)
        const placed = layer.getBoundingClientRect()
        layer.style.left = `${previous.left - placed.left}px`
        layer.style.top = `${previous.top - position(layer)}px`
        Object.assign(previous.element.style, previous.look)
        exits.set(key, previous.element)
        targets.push({ key, element: previous.element, top: previous.top })
      }
      for (const { key, element, top } of targets) {
        const previous = beforeByElement.get(element) ?? before.get(key)
        if (!element.isConnected || (!previous && !element.hasAttribute('data-satin-section-item')))
          continue
        // A held reorder handle owns the entire group until its drag ends.
        if (element.parentElement?.querySelector(':scope > [data-satin-reorder-lifted]')) continue
        const ghost = exits.has(key) ? element.parentElement! : undefined
        const clipExit = Boolean(ghost && previous?.clipExit)
        const targetVisibility = ghost ? 0 : 1
        const channel = {
          displacement: previous ? previous.top - top : 0,
          velocity: previous?.velocity ?? 0,
        }
        const visibility = {
          displacement: (previous?.visibility ?? 0) - targetVisibility,
          velocity: previous?.visibilityVelocity ?? 0,
        }
        if (
          Math.abs(channel.displacement) < 0.01 &&
          Math.abs(channel.velocity) < 0.01 &&
          Math.abs(visibility.displacement) < 0.001 &&
          Math.abs(visibility.velocity) < 0.001
        )
          continue
        // Clip settling is measured in points, just like the neighbouring row.
        // A unit-opacity threshold would end the visible collapse too early.
        const extent = clipExit ? previous!.height : 1
        const times = runFrameTimes(animation, [
          channel,
          {
            displacement: visibility.displacement * extent,
            velocity: visibility.velocity * extent,
          },
        ])
        const frames = times.map((ms, index) => {
          const visible =
            index === times.length - 1
              ? targetVisibility
              : Math.max(
                  0,
                  Math.min(1, targetVisibility + sampleChannel(animation, visibility, ms).offset),
                )
          return {
            offset: index / (times.length - 1),
            transform: `translateY(${index === times.length - 1 ? 0 : sampleChannel(animation, channel, ms).offset}px)`,
            // Native full-swipe paint stays opaque while the neighbour clips its bottom.
            // Use the same List spring for that boundary, including the final row.
            opacity: clipExit ? 1 : visible,
            ...(clipExit ? { clipPath: `inset(0 0 ${100 * (1 - visible)}% 0)` } : {}),
          }
        })
        element.setAttribute('data-satin-row-moving', 'true')
        const motion = animateElement(element, frames, {
          duration: times[times.length - 1],
          easing: 'linear',
          fill: ghost ? 'forwards' : 'none',
        })
        const run: Run = {
          motion,
          animation,
          channel,
          visibility,
          clipExit,
          targetVisibility,
          finish,
        }
        runs.set(element, run)
        ownedElements.add(element)
        ownedAnimations.add(motion)
        function finish() {
          if (runs.get(element) !== run) return
          runs.delete(element)
          ownedElements.delete(element)
          element.removeAttribute('data-satin-row-moving')
          if (ghost) {
            ghost.remove()
            if (exits.get(key) === element) exits.delete(key)
          }
        }
        void motion.finished.then(finish, finish)
      }
    }
  })
  return () => {
    mounted = false
    unregister()
    media.removeEventListener('change', reduce)
    for (const element of ownedElements) stop(element)
    ownedElements.clear()
  }
}
