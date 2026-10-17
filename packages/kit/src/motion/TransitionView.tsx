import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animateElement } from './animate.ts'
import type { Animation } from './animationValue.ts'
import { isLayoutTransaction, registerLayoutAnimation } from './layoutTransaction.ts'
import { fadeSettleMs, runFrameTimes, sampleChannel, type SpringChannel } from './springPath.ts'
import { identityPose, Transition, transitionPose, type TransitionPose } from './transition.ts'

/** Whether the content is visible, the transition to use and the content. */
export type TransitionViewProps = Readonly<{
  visible: boolean
  transition?: Transition
  children: ReactNode
}>
const keys = ['x', 'y', 'scale', 'opacity'] as const
type Channels = Record<(typeof keys)[number], SpringChannel>
type Run = {
  motion: globalThis.Animation
  animation: Animation
  channels: Channels
  target: TransitionPose
}

function presented(run: Run) {
  const time = Number(run.motion.currentTime ?? 0)
  const pose = { ...run.target }
  const velocity = { x: 0, y: 0, scale: 0, opacity: 0 }
  for (const key of keys) {
    const sample = sampleChannel(run.animation, run.channels[key], time)
    pose[key] += sample.offset
    velocity[key] = sample.velocity
  }
  return { pose, velocity }
}
function frame(pose: TransitionPose): Keyframe {
  return {
    transform: `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.scale})`,
    opacity: Math.max(0, Math.min(1, pose.opacity)),
  }
}

/** Shows or hides its content with a transition when `visible` changes inside `withAnimation`.
 * Keep the view itself mounted. Hidden content stays mounted and inert until its exit finishes,
 * and the first render does not animate.
 * @experimental General transitions still require installed-device motion qualification.
 */
export function TransitionView({
  visible,
  transition = Transition.opacity,
  children,
}: TransitionViewProps) {
  const [retained, setRetained] = useState(visible)
  const elementRef = useRef<HTMLDivElement>(null)
  const state = useRef({ visible, transition })
  const run = useRef<Run | undefined>(undefined)
  // A newly inserted child must join the same synchronous React commit.
  if (visible && !retained) setRetained(true)

  useLayoutEffect(() => {
    const changed = state.current.visible !== visible
    state.current = { visible, transition }
    if (changed && !isLayoutTransaction()) {
      run.current?.motion.cancel()
      run.current = undefined
      if (!visible) setRetained(false)
    }
  })

  useLayoutEffect(() => {
    const element = elementRef.current!
    const media = element.ownerDocument.defaultView!.matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => {
      const previous = run.current
      run.current = undefined
      previous?.motion.cancel()
    }
    const settle = () => {
      stop()
      if (!state.current.visible) setRetained(false)
    }
    const reduce = () => {
      if (media.matches) settle()
    }
    media.addEventListener('change', reduce)
    const unregister = registerLayoutAnimation(() => {
      const wasVisible = state.current.visible
      const previous = run.current ? presented(run.current) : undefined
      return animation => {
        const { visible: isVisible, transition: effect } = state.current
        if (wasVisible === isVisible) return
        stop()
        if (!animation || media.matches) {
          settle()
          return
        }
        const bounds = element.getBoundingClientRect()
        const hidden = transitionPose(
          effect,
          isVisible ? 'insertion' : 'removal',
          bounds.width,
          bounds.height,
          getComputedStyle(element).direction === 'rtl',
        )
        const from = previous?.pose ?? (isVisible ? hidden : identityPose)
        const target = isVisible ? identityPose : hidden
        const channels = Object.fromEntries(
          keys.map(key => [
            key,
            {
              displacement: from[key] - target[key],
              velocity: previous?.velocity[key] ?? 0,
            },
          ]),
        ) as Channels
        const times = runFrameTimes(animation, Object.values(channels), fadeSettleMs(animation))
        const frames = times.map((time, index) => {
          const pose = { ...target }
          if (index < times.length - 1) {
            for (const key of keys)
              pose[key] += sampleChannel(animation, channels[key], time).offset
          }
          return { ...frame(pose), offset: index / (times.length - 1) }
        })
        const motion = animateElement(element, frames, {
          duration: times.at(-1),
          easing: 'linear',
          fill: 'both',
        })
        const current = { motion, animation, channels, target }
        run.current = current
        const finish = () => {
          if (run.current === current) settle()
        }
        motion.finished.then(finish, finish)
      }
    })
    return () => {
      unregister()
      media.removeEventListener('change', reduce)
      stop()
    }
  }, [])

  return (
    <div ref={elementRef} hidden={!retained} inert={!visible} aria-hidden={!visible || undefined}>
      {retained ? children : null}
    </div>
  )
}
