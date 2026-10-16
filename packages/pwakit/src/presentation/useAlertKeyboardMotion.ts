import { animateElement, timelineStart } from '../motion/animate.ts'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { GlassRegionRegistry } from '../glass/regionRegistry.ts'
import { alertKeyboardState } from './motion.ts'
import { editable } from '../keyboard/adapter.ts'

type KeyboardMotion = {
  panel: HTMLElement
  animation: Animation
  target: number
  from: number
  velocity: number
  start: number
  frame: number
}
function stopMotion(active: RefObject<KeyboardMotion | null>, dialog: HTMLDialogElement | null) {
  const value = active.current
  active.current = null
  if (value) {
    cancelAnimationFrame(value.frame)
    value.animation.cancel()
    value.panel.style.top = `${value.target}px`
    value.panel.style.transform = 'translateY(-50%)'
  }
  if (dialog?.getAttribute('data-satin-presentation-moving') === 'keyboard')
    dialog.removeAttribute('data-satin-presentation-moving')
}

/** Animate the measured viewport destination without guessing the keyboard's height.
 * Commit the new layout once and carry its old visible centre with a transform.
 */
export function useAlertKeyboardMotion(
  dialog: RefObject<HTMLDialogElement | null>,
  enabled: boolean,
  center: number,
  keyboardVisible: boolean,
  regions?: GlassRegionRegistry,
  /** False while the keyboard's geometry is anticipated (a tap focus), not yet reported. */
  keyboardReported = keyboardVisible,
) {
  const previous = useRef<{
    center: number
    keyboardVisible: boolean
    keyboardReported: boolean
  } | null>(null)
  const active = useRef<KeyboardMotion | null>(null)
  useLayoutEffect(() => {
    if (!enabled) {
      previous.current = null
      stopMotion(active, dialog.current)
      return
    }
    const before = previous.current
    previous.current = { center, keyboardVisible, keyboardReported }
    // A keyboard that was only anticipated and never came (a hardware keyboard) keeps editing.
    if (before?.keyboardReported && !keyboardVisible) {
      const editor = document.activeElement
      // WebKit's native caret can retain the old composited position while
      // the panel returns. End editing before applying that return motion.
      if (editable(editor) && dialog.current?.contains(editor)) editor.blur()
    }
    if (before === null || before.center === center) return
    // Safe-area/rotation updates without a keyboard retain their existing policy.
    if (!before.keyboardVisible && !keyboardVisible && !active.current) return
    const panel = dialog.current?.querySelector<HTMLElement>('[data-satin-glass-layer]')
    const value = active.current
    const pose = value
      ? alertKeyboardState(value.from, 0, value.velocity, (performance.now() - value.start) / 1000)
      : { position: 0, velocity: 0 }
    stopMotion(active, dialog.current)
    if (!panel || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (panel) {
        panel.style.top = `${center}px`
        panel.style.transform = 'translateY(-50%)'
      }
      regions?.invalidate()
      return
    }
    const from = before.center - center + pose.position
    const frames = Array.from({ length: 85 }, (_, index) => ({
      offset: index / 84,
      transform: `translateY(-50%) translateY(${index === 84 ? 0 : alertKeyboardState(from, 0, pose.velocity, index / 120).position}px)`,
    }))
    // WebKit can paint the new layout before a pending animation contributes its
    // first keyframe. Keep the old visible centre in the underlying style too.
    panel.style.top = `${center}px`
    panel.style.transform = `translateY(-50%) translateY(${from}px)`
    const start = performance.now()
    const animation = animateElement(panel, frames, {
      duration: 700,
      easing: 'linear',
      fill: 'both',
    })
    animation.startTime = timelineStart(start)
    const motion = {
      panel,
      animation,
      target: center,
      from,
      velocity: pose.velocity,
      start,
      frame: 0,
    }
    active.current = motion
    dialog.current?.setAttribute('data-satin-presentation-moving', 'keyboard')
    const sample = () => {
      regions?.invalidate()
      motion.frame = requestAnimationFrame(sample)
    }
    motion.frame = requestAnimationFrame(sample)
    const settled = () => {
      if (active.current === motion) {
        stopMotion(active, dialog.current)
        regions?.invalidate()
      }
    }
    void animation.finished.then(settled, settled)
  }, [dialog, enabled, center, keyboardVisible, keyboardReported, regions])
  useLayoutEffect(
    () => () => {
      previous.current = null
      stopMotion(active, dialog.current)
    },
    [dialog],
  )
}
