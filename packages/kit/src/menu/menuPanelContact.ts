import { animateElement, timelineStart } from '../motion/animate.ts'
import { sampledKeyframes } from '../motion/springTrack.ts'
import { menuPanelPull, menuReturn } from './menuGesture.ts'

/** Reuse the native-fitted menu deformation and release, in the panel's resting coordinates. */
export function beginMenuPanelContact(panel: HTMLElement, x: number, y: number) {
  const bounds = panel.getBoundingClientRect()
  const origin = getComputedStyle(panel).transformOrigin.split(' ').map(Number.parseFloat)
  const originX = bounds.left + (Number.isFinite(origin[0]) ? origin[0] : bounds.width / 2)
  const originY = bounds.top + (Number.isFinite(origin[1]) ? origin[1] : bounds.height / 2)
  const localFrames = new WeakMap<
    HTMLElement,
    { left: number; top: number; xRatio: number; yRatio: number }
  >()
  let pose = { x: 0, y: 0, scaleX: 1, scaleY: 1 }
  let animation: Animation | undefined
  const reduced = panel.ownerDocument.defaultView?.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  const paint = (amount: number) => {
    panel.style.transform =
      amount === 0
        ? ''
        : `translate3d(${pose.x * amount}px, ${pose.y * amount}px, 0) scale(${1 + (pose.scaleX - 1) * amount}, ${1 + (pose.scaleY - 1) * amount})`
  }
  const cancel = () => {
    animation?.cancel()
    animation = undefined
    paint(0)
  }
  return {
    /** Cache before the first transform write; moves use the exact displayed pull pose. */
    localPoint(element: HTMLElement, clientX: number, clientY: number) {
      let frame = localFrames.get(element)
      if (!frame) {
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height) return undefined
        frame = {
          left: rect.left,
          top: rect.top,
          xRatio: element.offsetWidth / rect.width,
          yRatio: element.offsetHeight / rect.height,
        }
        localFrames.set(element, frame)
      }
      return {
        x: ((clientX - originX - pose.x) / pose.scaleX + originX - frame.left) * frame.xRatio,
        y: ((clientY - originY - pose.y) / pose.scaleY + originY - frame.top) * frame.yRatio,
      }
    },
    move(nextX: number, nextY: number) {
      if (reduced || bounds.width <= 0 || bounds.height <= 0) return
      pose = menuPanelPull(nextX, nextY, x, y, bounds)
      paint(1)
    },
    release() {
      if (!panel.isConnected || reduced) return cancel()
      animation?.cancel()
      // Keep the native-fitted return, including its initial derivative and 850 ms tail.
      // Sampling changes delivery only; finger movement still writes the held pose directly.
      const duration = 850
      const count = Math.ceil(duration / (1000 / 240))
      const progress = Array.from({ length: count + 1 }, (_, index) =>
        index === count ? 1 : 1 - menuReturn((index / count) * duration),
      )
      const start = performance.now()
      const current = animateElement(
        panel,
        sampledKeyframes({ duration, progress }, value => {
          const amount = 1 - value
          return {
            transform: `translate3d(${pose.x * amount}px, ${pose.y * amount}px, 0) scale(${1 + (pose.scaleX - 1) * amount}, ${1 + (pose.scaleY - 1) * amount})`,
          }
        }),
        { duration, easing: 'linear', fill: 'both' },
      )
      animation = current
      current.startTime = timelineStart(start)
      void current.finished.then(
        () => {
          if (animation === current) cancel()
        },
        () => {},
      )
    },
    cancel,
  }
}
