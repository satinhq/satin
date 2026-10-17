import { animateElement } from '../motion/animate.ts'
import appearanceFrames from './nativeContextAppearance.json'
import { keyed } from '../glass/lens/menuField.ts'
import { CONTEXT_DISMISSAL_MS, contextDismissal } from '../glass/lens/menuContextPresentation.ts'
import measured from './nativeContextMotion.json'

/** Recognition on the touch clock: the menu commits and the lifted preview replaces the
 * pressed row. Native iPad Notes, native opening measurements counter-valid device capture: the pressed
 * row is last seen at contact +315 ms and the lifted preview first at +331 ms; the phone
 * threshold sweep cancels at 300 ms and opens at 400 ms. */
export const CONTEXT_HOLD_MS = 320
/** Zero of the fitted opening curves (dim, preview, glass) on the same touch clock. The r8
 * capture crosses 10/50/95 % page dim at +415/482/565 ms; those curves cross them at
 * 160/211/297 ms. Every curve is still flat at recognition, so nothing jumps. */
export const CONTEXT_CURVE_MS = 265
// The measured lift is stationary through this point. Let directional gestures
// resolve before mounting their otherwise unused context menu and glass scene.
export const CONTEXT_STILL_MS = 150
const CONTEXT_ENTER_MS = measured.enter.duration
/** r8 device capture: the preview rises from the held 1.007 to 1.020 in 50 ms after recognition. */
const CONTEXT_HANDOFF_MS = 50
const growth: [number, number][] = [
  [0, 1],
  [CONTEXT_STILL_MS, 1],
  [250, 1.005],
  [333, 1.01],
  [400, 1.015],
  [480, 1.02],
  [570, 1.025],
  [670, 1.03],
  [750, 1.035],
]
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const currentAppearance = () =>
  document.documentElement.dataset.satinAppearance === 'dark' ? 'dark' : 'light'
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress
const at = (keys: [number, number][], ms: number) => {
  if (ms <= keys[0]![0]) return keys[0]![1]
  const next = keys.findIndex(([time]) => time >= ms)
  if (next < 0) return keys.at(-1)![1]
  const [t0, v0] = keys[next - 1]!
  const [t1, v1] = keys[next]!
  return lerp(v0, v1, (ms - t0) / (t1 - t0))
}

/** The held preview's scale `ms` after contact (before recognition). */
export function contextHoldScale(ms: number) {
  return at(growth, ms)
}

function openFrames(appearance: 'light' | 'dark') {
  const frames = appearanceFrames[appearance]
  const enter = measured.enter.keyframes.map(
    frame => [frame[0]! * CONTEXT_ENTER_MS, frame[4]!] as [number, number],
  )
  const filter = (ms: number) => {
    const parts = frames.map(([time, , value]) => {
      const match = /contrast\(([\d.]+)\) brightness\(([\d.]+)\)/.exec(String(value))
      return [Number(time), match ? Number(match[1]) : 1, match ? Number(match[2]) : 1] as const
    })
    const contrast = at(
      parts.map(([time, value]) => [time, value]),
      ms,
    )
    const brightness = at(
      parts.map(([time, , value]) => [time, value]),
      ms,
    )
    return `contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)})`
  }
  return {
    times: frames.map(([time]) => Number(time)),
    scale: (ms: number) => 1 + ((keyed(enter, ms) - 1) * 7) / 6,
    filter,
  }
}

/** The held lift runs on the touch clock (`recognitionEpoch` is the curve zero, CONTEXT_CURVE_MS
 * after contact). Once recognized, the preview leaves the scale it is showing (`from`) and joins
 * the fitted opening curve within the measured hand-off, so nothing pops. */
export function animateContextLift(
  element: HTMLElement,
  recognitionEpoch: number,
  preparing: boolean,
  from = 1,
  shadow: HTMLElement | null = null,
) {
  if (reducedMotion() || typeof element.animate !== 'function') return
  const epoch = recognitionEpoch - performance.timeOrigin
  if (preparing) {
    const duration = growth.at(-1)![0]
    const animation = animateElement(
      element,
      growth.map(([time, scale]) => ({ offset: time / duration, transform: `scale(${scale})` })),
      { duration, easing: 'linear', fill: 'forwards' },
    )
    animation.startTime = epoch - CONTEXT_CURVE_MS
    return animation
  }
  const curve = openFrames(currentAppearance())
  const duration = curve.times.at(-1)!
  const since = Math.min(duration, Math.max(0, performance.now() - epoch))
  const joined = Math.min(duration, since + CONTEXT_HANDOFF_MS)
  const target = curve.scale(joined)
  const scale = (ms: number) =>
    ms <= since
      ? from
      : ms >= joined
        ? curve.scale(ms)
        : lerp(from, target, (ms - since) / (joined - since))
  const times = [...new Set([0, ...curve.times, since, joined])].sort((a, b) => a - b)
  // The tone curve is a row's pressed grey clearing to its lifted cell. Other content has
  // no pressed cell, so it does not take this filter.
  const row = element.dataset.satinContextLift !== 'content'
  const frames = times.map(time => ({
    offset: time / duration,
    transform: `scale(${scale(time)})`,
    ...(row && { filter: curve.filter(time) }),
  }))
  const animation = animateElement(element, frames, {
    duration,
    easing: 'linear',
    fill: 'forwards',
  })
  animation.startTime = epoch
  // The shadow plate scales with the card. These keyframes are transform only:
  // the artwork box-shadow and the glyph drop-shadow are not rewritten.
  if (!row && shadow && typeof shadow.animate === 'function') {
    const shadowAnimation = animateElement(
      shadow,
      frames.map(({ offset, transform }) => ({ offset, transform })),
      { duration, easing: 'linear', fill: 'forwards' },
    )
    shadowAnimation.startTime = epoch
  }
  return animation
}

/** Settled pose of lifted content: its native scale and the move that keeps it on screen. */
export type ContextLiftPose = Readonly<{ scale: number; dx: number; dy: number }>
const CONTENT_LIFT_STEPS = 30

/** Native iPad lifted content (native iPad warm-light chat-tall, 3 counter-qualified trials,
 * native motion curve fits). At recognition the content leaves its hold scale and settles into its
 * pose on this ease-out: remaining (1 - phase) ** power over `duration` ms (x RMS 0.08 of a
 * 12 pt move). On dismissal it returns onto its source faster than the dim fades (RMS 0.015). */
export const CONTEXT_CONTENT_SETTLE = { delay: 0, duration: 176, power: 1.5 }
export const CONTEXT_CONTENT_RETURN = { delay: 8, duration: 176, power: 2.35 }
type ContentEase = typeof CONTEXT_CONTENT_SETTLE

/** Remaining fraction (1 -> 0) of a content settle or return `ms` after it starts. */
export function contextContentRemaining(fit: ContentEase, ms: number) {
  const phase = Math.min(1, Math.max(0, (ms - fit.delay) / fit.duration))
  return (1 - phase) ** fit.power
}
const contentLiftMs = CONTEXT_CONTENT_SETTLE.delay + CONTEXT_CONTENT_SETTLE.duration
const contentReturnMs = CONTEXT_CONTENT_RETURN.delay + CONTEXT_CONTENT_RETURN.duration
const settleProgress = (ms: number) => 1 - contextContentRemaining(CONTEXT_CONTENT_SETTLE, ms)

/** A content settle on the recognition clock, the clock the menu's glass emerges on. Nothing can
 * draw before the page commits the lift (`since` ms after recognition), so the content holds its
 * start until then and joins the fitted settle within the measured hand-off: one time function
 * for the lift and the glass, with no jump to catch up. Without an epoch it starts now. */
function settleTimeline(recognitionEpoch: number | undefined) {
  const since =
    recognitionEpoch === undefined
      ? 0
      : Math.min(contentLiftMs, Math.max(0, performance.now() - recognitionEpoch))
  const joined = since > 0 ? Math.min(contentLiftMs, since + CONTEXT_HANDOFF_MS) : 0
  const progress = (ms: number) => {
    if (ms >= joined) return settleProgress(ms)
    if (ms <= since) return 0
    return settleProgress(joined) * ((ms - since) / (joined - since))
  }
  const steps = Array.from(
    { length: CONTENT_LIFT_STEPS + 1 },
    (_, index) => (index / CONTENT_LIFT_STEPS) * contentLiftMs,
  )
  const times = [...new Set([...steps, since, joined])].sort((a, b) => a - b)
  const startTime =
    recognitionEpoch === undefined ? undefined : recognitionEpoch - performance.timeOrigin
  return { times, progress, startTime }
}

function liftTransform(pose: ContextLiftPose, from: number, progress: number) {
  const scale = from + (pose.scale - from) * progress
  return `translate(${pose.dx * progress}px, ${pose.dy * progress}px) scale(${scale})`
}

/** Recognized non-row content grows from the scale its hold shows (`from`) to its settled pose,
 * on the recognition clock when given (settleTimeline); its shadow plate moves with it. */
export function animateContentLift(
  element: HTMLElement,
  pose: ContextLiftPose,
  from: number,
  shadow: HTMLElement | null,
  recognitionEpoch?: number,
) {
  if (reducedMotion() || typeof element.animate !== 'function') {
    element.style.transform = liftTransform(pose, from, 1)
    if (shadow) shadow.style.transform = element.style.transform
    return
  }
  const { times, progress, startTime } = settleTimeline(recognitionEpoch)
  const frames = times.map(time => ({
    offset: time / contentLiftMs,
    transform: liftTransform(pose, from, progress(time)),
  }))
  const options = { duration: contentLiftMs, easing: 'linear', fill: 'forwards' } as const
  const animations = [animateElement(element, frames, options)]
  if (shadow && typeof shadow.animate === 'function')
    animations.push(animateElement(shadow, frames, options))
  if (startTime !== undefined) for (const animation of animations) animation.startTime = startTime
  return animations[0]
}

/** A custom preview grows out of its source's box into its own (`from` maps the preview's box
 * onto the source), while the source hides under it. Same settle as the content lift (native
 * grid preview: about 90 % of the way at +100 ms), on the recognition clock when given.
 *
 * The preview leaves the scale the hold shows (`holdScale`). The source stays opaque, at that
 * scale, until the preview over it is opaque: a cross-fade of two half-transparent copies
 * darkens the artwork for a few frames (owner, nowplaying-art-menu-glitch). */
export function animateContextPreview(
  preview: HTMLElement,
  source: HTMLElement,
  from: Readonly<{ dx: number; dy: number; scaleX: number; scaleY: number }>,
  { holdScale = 1, recognitionEpoch }: { holdScale?: number; recognitionEpoch?: number } = {},
) {
  const startX = from.scaleX * holdScale,
    startY = from.scaleY * holdScale
  const transform = (progress: number) =>
    `translate(${from.dx * (1 - progress)}px, ${from.dy * (1 - progress)}px) ` +
    `scale(${startX + (1 - startX) * progress}, ${startY + (1 - startY) * progress})`
  if (reducedMotion() || typeof preview.animate !== 'function') {
    source.style.opacity = '0'
    return []
  }
  const { times, progress, startTime } = settleTimeline(recognitionEpoch)
  const options = { duration: contentLiftMs, easing: 'linear', fill: 'forwards' } as const
  const frames = times.map(time => {
    const value = progress(time)
    return {
      offset: time / contentLiftMs,
      transform: transform(value),
      opacity: Math.min(1, value * 3),
    }
  })
  const sourceFrames = frames.map(({ offset, opacity }) => ({
    offset,
    transform: `scale(${holdScale})`,
    opacity: opacity < 1 ? 1 : 0,
  }))
  const animations = [
    animateElement(preview, frames, options),
    animateElement(source, sourceFrames, options),
  ]
  if (startTime !== undefined) for (const animation of animations) animation.startTime = startTime
  return animations
}

/** Native backdrop fade shares the recognition epoch with the opaque lift and glass. */
export function animateContextBackdrop(element: HTMLElement, recognitionEpoch: number) {
  if (reducedMotion() || typeof element.animate !== 'function') return
  const animation = animateElement(
    element,
    appearanceFrames[currentAppearance()].map(([time, opacity]) => ({
      offset: Math.min(1, Number(time) / 450),
      opacity: Number(opacity),
    })),
    { duration: 450, fill: 'both' },
  )
  animation.startTime = recognitionEpoch - performance.timeOrigin
  return animation
}

/** The open backdrop's opacity `ms` after the curve zero. */
function backdropOpacity(ms: number) {
  return at(
    appearanceFrames[currentAppearance()].map(([time, opacity]) => [Number(time), Number(opacity)]),
    ms,
  )
}

/** Dismissal: the dim fades out on the native ease-out from whatever it is showing. A row's
 * lift settles back on the same clock; lifted content returns on its own, faster fit. */
export function animateContextDismissal(
  backdrop: HTMLElement | null | undefined,
  preview: HTMLElement | null | undefined,
  recognitionEpoch: number,
  shadow: HTMLElement | null = null,
) {
  if (reducedMotion()) return []
  const appearance = currentAppearance()
  const total = CONTEXT_DISMISSAL_MS
  const opened = backdropOpacity(performance.now() - (recognitionEpoch - performance.timeOrigin))
  const steps = Array.from({ length: 16 }, (_, index) => index / 15)
  const remaining = (offset: number) => contextDismissal(appearance, offset * total)
  const animations: Animation[] = []
  if (backdrop && typeof backdrop.animate === 'function') {
    animations.push(
      animateElement(
        backdrop,
        steps.map(offset => ({ offset, opacity: opened * remaining(offset) })),
        { duration: total, fill: 'forwards' },
      ),
    )
  }
  if (preview && typeof preview.animate === 'function') {
    const shown = getComputedStyle(preview)
    // A computed transform reads matrix(a, 0, 0, d, tx, ty); `a` is the scale and lifted
    // content may also have moved to stay on screen.
    const matrix = /^matrix\(([^)]+)\)/.exec(shown.transform)?.[1]?.split(',').map(Number)
    const scale = matrix?.[0] ?? 1
    const moveX = matrix?.[4] ?? 0
    const moveY = matrix?.[5] ?? 0
    for (const running of preview.getAnimations()) running.cancel()
    const transformAt = (left: number) => {
      const move = moveX || moveY ? `translate(${moveX * left}px, ${moveY * left}px) ` : ''
      return `${move}scale(${1 + (scale - 1) * left})`
    }
    if (shadow) {
      // Content: the plate already holds the blurred shadow. Fade that layer's
      // opacity and scale both with transform. Rebuilding drop-shadow keyframes
      // would repaint the blur on the main thread for the whole dismissal.
      for (const running of shadow.getAnimations()) running.cancel()
      const returned = (offset: number) =>
        contextContentRemaining(CONTEXT_CONTENT_RETURN, offset * contentReturnMs)
      const options = { duration: contentReturnMs, fill: 'forwards' } as const
      animations.push(
        animateElement(
          preview,
          steps.map(offset => ({ offset, transform: transformAt(returned(offset)) })),
          options,
        ),
      )
      if (typeof shadow.animate === 'function') {
        animations.push(
          animateElement(
            shadow,
            steps.map(offset => ({
              offset,
              transform: transformAt(returned(offset)),
              opacity: returned(offset),
            })),
            options,
          ),
        )
      }
    } else {
      const { boxShadow, filter } = shown
      // Rows: the painted cell's box-shadow fades in place. Content never takes this path.
      animations.push(
        animateElement(
          preview,
          steps.map(offset => ({
            offset,
            transform: transformAt(remaining(offset)),
            boxShadow: fadeShadow(boxShadow, remaining(offset)),
            filter: fadeShadow(filter, remaining(offset)),
          })),
          { duration: total, fill: 'forwards' },
        ),
      )
    }
  }
  return animations
}

/** Dismissal of a custom preview: it returns into its source's box on the content return fit,
 * the open played backwards. It stays opaque for the first two thirds of the way and fades over
 * the last third, as it became opaque over the first third of its growth, so what moves back is
 * the preview, not a translucent wash over a source already back in place. A fade from the
 * first frame read as the tile snapping back with a grey platter fading around it (owner,
 * Music Home tile, 2026-10-14). The source comes back under the fading preview and leads it
 * (1 - preview^4), so their combined coverage stays near whole. Native's own preview fade on
 * dismissal is UNMEASURED; the return geometry is the measured content return. */
export function animateContextPreviewDismissal(
  preview: HTMLElement,
  source: HTMLElement,
  to: Readonly<{ dx: number; dy: number; scaleX: number; scaleY: number }>,
) {
  if (reducedMotion() || typeof preview.animate !== 'function') return []
  const shownOpacity = Number(getComputedStyle(preview).opacity) || 1
  for (const running of [...preview.getAnimations(), ...source.getAnimations()]) running.cancel()
  const steps = Array.from({ length: 31 }, (_, index) => index / 30)
  const frames = steps.map(offset => {
    const left = contextContentRemaining(CONTEXT_CONTENT_RETURN, offset * contentReturnMs)
    return {
      offset,
      transform:
        `translate(${to.dx * (1 - left)}px, ${to.dy * (1 - left)}px) ` +
        `scale(${1 + (to.scaleX - 1) * (1 - left)}, ${1 + (to.scaleY - 1) * (1 - left)})`,
      opacity: shownOpacity * Math.min(1, left * 3),
    }
  })
  const options = { duration: contentReturnMs, fill: 'forwards' } as const
  return [
    animateElement(preview, frames, options),
    animateElement(
      source,
      frames.map(({ offset }, index) => ({
        offset,
        opacity: 1 - (frames[index]!.opacity / shownOpacity) ** 4,
      })),
      options,
    ),
  ]
}

/** Scale every rgb/rgba alpha in a computed box-shadow or drop-shadow filter. */
function fadeShadow(shadow: string, amount: number) {
  if (!shadow || shadow === 'none') return 'none'
  return shadow.replace(/rgba?\(([^)]+)\)/g, (_, channels: string) => {
    const [red, green, blue, alpha = '1'] = channels.split(/[\s,/]+/).filter(Boolean)
    return `rgba(${red}, ${green}, ${blue}, ${(Number(alpha) * amount).toFixed(3)})`
  })
}
