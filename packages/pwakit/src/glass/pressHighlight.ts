import { GLASS_CONTACT_PHYSICS, type GlassContactKind } from './contactPhysics.ts'
import { INTERACTIVE_GLASS_PRESS, InteractivePress } from './lens/interactivePress.ts'
/**
 * The label half of a pressed interactive glass button (the renderer grows and whitens the glass
 * in the same frame). Labels stay live DOM above the glass; each kind's label response is a row
 * of GLASS_CONTACT_PHYSICS (native iPad): a content button's label holds full strength, a bar
 * button's light label washes out into its white glass and its dark label dips for a frame.
 *
 * The label grows with its glass: native iPad scales a held button's label by the glass's own
 * growth (the composer + glyph, "Actions", the toolbar "Save"), and it springs back with the
 * glass. The label replays the renderer's press spring (InteractivePress) about the glass's
 * centre.
 *
 * Opacity and `scale` Web Animations only: no layout, no renderer round trip.
 */
const GPU_LATENCY_MS = 1000 / 60

type Target = { host: HTMLElement; labels: readonly Element[] }
const running = new WeakMap<HTMLElement, Animation[]>()
const scaling = new WeakMap<HTMLElement, Animation[]>()
const FRAME_MS = 1000 / 60
/** Long enough for the release spring's ringing to fall under a hundredth of a point. */
const SETTLE_MS = 1200
const presses = new WeakMap<HTMLElement, InteractivePress>()
const motionSubscriptions = new WeakMap<HTMLElement, () => void>()
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Dark glass carries light labels: the label's own colour decides the fitted response. */
function appearanceOf(labels: readonly Element[], host: HTMLElement) {
  const colour = getComputedStyle(labels[0] ?? host)
    .color.match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number) ?? [0, 0, 0]
  return (colour[0] * 0.2126 + colour[1] * 0.7152 + colour[2] * 0.0722) / 255 > 0.5
    ? 'dark'
    : 'light'
}

/** The glass release of this kind and appearance, which the label returns over. */
function releaseMs(kind: GlassContactKind, appearance: 'light' | 'dark') {
  const light = GLASS_CONTACT_PHYSICS[kind].light
  return light.kind === 'whole' ? light.releaseMs[appearance] : 0
}

export function glassPressHighlight(
  { host, labels }: Target,
  phase: 'pressed' | 'releasing' | 'rest',
  epoch = performance.timeOrigin + performance.now(),
  kind: GlassContactKind = 'button',
) {
  let press = presses.get(host)
  if (phase === 'rest') {
    presses.delete(host)
  } else {
    if (!press) {
      press = new InteractivePress()
      presses.set(host, press)
    }
    if (reducedMotion()) press.reset()
    else if (phase === 'pressed') press.down(epoch)
    else press.up(epoch)
  }
  if (typeof host.animate !== 'function') return
  scaleLabels(host, labels, kind, epoch, phase)
  const current = labels.map(label => Number(getComputedStyle(label).opacity))
  for (const animation of running.get(host) ?? []) animation.cancel()
  const appearance = appearanceOf(labels, host)
  if (phase === 'pressed') {
    const curve = GLASS_CONTACT_PHYSICS[kind].label[appearance]
    if (curve === 'steady') {
      running.set(host, [])
      return
    }
    const duration = curve.at(-1)![0]
    const frames = curve.map(([ms, opacity]) => ({ offset: ms / duration, opacity }))
    // The glass's white arrives from the worker ~1 frame after a DOM animation starts (measured):
    // a light label washes out with it, not before it. A dark label dips first (native).
    const delay = appearance === 'light' ? GPU_LATENCY_MS : 0
    running.set(
      host,
      labels.map(label =>
        label.animate(frames, { duration, delay, fill: 'forwards', easing: 'linear' }),
      ),
    )
    return
  }
  const duration = phase === 'rest' ? 0 : releaseMs(kind, appearance)
  running.set(
    host,
    labels.map((label, i) =>
      label.animate([{ opacity: current[i] }, { opacity: 1 }], {
        duration,
        fill: 'forwards',
        easing: 'linear',
      }),
    ),
  )
}

/** Current uniform scale of a pressed glass button (the renderer's spring, replayed). */
export function glassPressScale(
  host: HTMLElement,
  at = performance.timeOrigin + performance.now(),
) {
  const record = presses.get(host),
    width = host.getBoundingClientRect().width
  if (!record || !width || reducedMotion()) return 1
  const press = record.copy()
  const pressKind = host.dataset.satinGlassPressKind
  const kind = pressKind === 'menu' || pressKind === 'bar' ? pressKind : 'button'
  return 1 + (INTERACTIVE_GLASS_PRESS.growthPt[kind] / width) * press.sample(at)
}

/** The press growth of this glass, as a uniform scale of its layout width at press `amount`. */
function growth(host: HTMLElement, kind: GlassContactKind) {
  const width = host.offsetWidth
  return (amount: number) =>
    width ? 1 + (INTERACTIVE_GLASS_PRESS.growthPt[kind] / width) * amount : 1
}

/** Scales the labels with the glass: the press spring from now until it settles (or holds). */
function scaleLabels(
  host: HTMLElement,
  labels: readonly Element[],
  kind: GlassContactKind,
  epoch: number,
  phase: 'pressed' | 'releasing' | 'rest',
) {
  motionSubscriptions.get(host)?.()
  motionSubscriptions.delete(host)
  for (const animation of scaling.get(host) ?? []) animation.cancel()
  const record = presses.get(host)
  if (!record) {
    scaling.set(host, [])
    return
  }
  const press = record.copy()
  const reduced = reducedMotion()
  const scale = growth(host, kind)
  const frames: Keyframe[] = []
  for (let ms = 0; ms <= SETTLE_MS; ms += FRAME_MS) {
    const amount = press.sample(epoch + ms, reduced)
    frames.push({ scale: String(scale(amount)) })
    if (ms > 0 && !press.needsFrame) break
  }
  const duration = Math.max(FRAME_MS, (frames.length - 1) * FRAME_MS)
  const centre = host.getBoundingClientRect()
  const animations = labels
    .filter((label): label is HTMLElement => label instanceof HTMLElement)
    .map(label => {
      // Grow about the glass's centre, as the glass does, not the label's own.
      const box = label.getBoundingClientRect()
      label.style.transformOrigin = `${centre.left + centre.width / 2 - box.left}px ${
        centre.top + centre.height / 2 - box.top
      }px`
      return label.animate(frames, { duration, fill: 'forwards', easing: 'linear' })
    })
  scaling.set(host, animations)
  if (reducedMotion()) return
  const query = matchMedia('(prefers-reduced-motion: reduce)')
  const stop = () => query.removeEventListener('change', changed)
  const changed = () => {
    if (!query.matches) return
    // Match the worker's live preference change: retire growth, keep its light response.
    record.reset()
    for (const animation of animations) animation.cancel()
    scaling.set(host, [])
    stop()
    motionSubscriptions.delete(host)
  }
  query.addEventListener('change', changed)
  motionSubscriptions.set(host, stop)
  if (phase === 'releasing') {
    const finished = animations.map(animation => animation.finished?.catch(() => {}))
    void Promise.all(finished).then(() => {
      if (motionSubscriptions.get(host) !== stop) return
      stop()
      motionSubscriptions.delete(host)
    })
  }
}
