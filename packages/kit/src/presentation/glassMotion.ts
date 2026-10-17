import { lagMark, lagTraceEnabled } from '../glass/webgpu/lagTrace.ts'
import type { AccessoryViewportTrack } from '../glass/webgpu/accessoryTrack.ts'
import { timelineStart } from '../motion/animate.ts'

type Rect = { x: number; y: number; width: number; height: number }

/** The sheet's own material follows screen coordinates. Nested glass stays at rest. */
export type PresentationGlassMotion = {
  rect: Rect
  sampleRect: Rect
  track: AccessoryViewportTrack
  /** One retained-content submission per run, prepared before its clock starts. */
  contentEpoch: number
  admitted: boolean
  ready: Promise<void>
  acknowledge: (track: AccessoryViewportTrack) => void
  current: () => boolean
  start: () => Promise<number>
  dispose: () => void
}

const materials = new WeakMap<Element, PresentationGlassMotion>()
const layers = new WeakMap<Element, PresentationGlassMotion>()
let nextContentEpoch = 0

/** Retarget an already admitted envelope without another capture or content fence. */
export const PRESENTATION_TRACK_EVENT = 'satin-presentation-track'

function animationTrack(animation: Animation) {
  const effect = animation.effect as KeyframeEffect | null
  if (!effect?.getKeyframes) return
  const frames = effect.getKeyframes()
  const duration = Number(effect.getTiming().duration)
  if (frames.length < 2 || !(duration > 0)) return
  if (
    frames.some(
      (frame, index) => Math.abs(frame.computedOffset - index / (frames.length - 1)) > 1e-6,
    )
  )
    return
  const offsets = frames.map(frame => {
    const matrix = new DOMMatrixReadOnly(String(frame.transform ?? 'none'))
    return { x: matrix.e, y: matrix.f }
  })
  return { duration, offsets }
}

function retarget(layer: HTMLElement, track: AccessoryViewportTrack) {
  const motion = layers.get(layer)
  if (!motion?.current() || !motion.admitted) return false
  const { rect, sampleRect } = motion
  // Reuse only source rows admitted for this same layout. A reflow retires the
  // owner through ResizeObserver; a trajectory outside its envelope needs admission.
  if (
    !track.offsets ||
    track.offsets.some(
      offset =>
        rect.x + offset.x < sampleRect.x - 0.5 ||
        rect.y + offset.y < sampleRect.y - 0.5 ||
        rect.x + offset.x + rect.width > sampleRect.x + sampleRect.width + 0.5 ||
        rect.y + offset.y + rect.height > sampleRect.y + sampleRect.height + 0.5,
    )
  )
    return false
  motion.track = track
  const material = layer.querySelector('.satin-presentation-surface')
  window.dispatchEvent(new CustomEvent(PRESENTATION_TRACK_EVENT, { detail: material }))
  return true
}

/** Live finger writes remain imperative; the worker receives their matching held pose. */
export function holdPresentationGlassMotion(layer: HTMLElement, offset: number) {
  const motion = layers.get(layer)
  if (!motion) return
  if (
    !retarget(layer, {
      epoch: Number.MAX_VALUE,
      duration: 1,
      widths: [motion.rect.width, motion.rect.width],
      offsets: [
        { x: 0, y: offset },
        { x: 0, y: offset },
      ],
    })
  )
    motion.dispose()
}

/** Returns the shared document epoch only when this run can start without waiting. */
export function retargetPresentationGlassMotion(
  layer: HTMLElement,
  animation: Animation,
  now: number,
) {
  const motion = layers.get(layer)
  const samples = animationTrack(animation)
  if (!motion || !samples) return
  if (
    !retarget(layer, {
      epoch: performance.timeOrigin + now,
      duration: samples.duration,
      widths: samples.offsets.map(() => motion.rect.width),
      offsets: samples.offsets,
    })
  )
    return
  return timelineStart(now)
}

export const presentationGlassMotion = (element: Element) => materials.get(element)

export function disposePresentationGlassMotion(layer: HTMLElement) {
  layers.get(layer)?.dispose()
}

/** Nested materials keep their resting pixels, but must submit them for the new moving show
 * before the outer clock is acknowledged. A cached draw from the clipped hold is not that handoff. */
export function presentationGlassContentEpoch(element: Element) {
  const own = materials.get(element)
  if (own) return own.contentEpoch
  const layer = element.closest('[data-satin-glass-layer]')
  const motion = layer ? layers.get(layer) : undefined
  return motion?.contentEpoch
}

/** Once the renderer follows the run, neither outer nor nested canvases need DOM polling. */
export function presentationGlassFollowing(element: Element) {
  const layer = element.closest('[data-satin-glass-layer]')
  // Retaining coverage between gestures must not freeze nested scroll/toolbar
  // presenters. Only active sheet travel replaces their DOM viewport sampling.
  return (
    !!layer &&
    layers.get(layer)?.admitted === true &&
    !!layer.closest('dialog')?.hasAttribute('data-satin-presentation-moving')
  )
}

/** Reuse the actual WAAPI samples, including overshoot; never fit a second spring here. */
export function preparePresentationGlassMotion(
  layer: HTMLElement,
  animation: Animation,
  { retain = false }: { retain?: boolean } = {},
): PresentationGlassMotion | undefined {
  const material = layer.querySelector<HTMLElement>('.satin-presentation-surface')
  if (!material) return
  const usesFallback = () => !!material.querySelector(':scope > [data-satin-fallback-material]')
  let ownsMaterial = material.hasAttribute('data-satin-glass-region-id') && !usesFallback()
  const effect = animation.effect as KeyframeEffect | null
  if (!effect?.getKeyframes) return
  const frames = effect.getKeyframes()
  const duration = Number(effect.getTiming().duration)
  if (frames.length < 2 || !(duration > 0)) return
  // These framework tracks have evenly spaced translation samples and linear interpolation.
  if (
    frames.some(
      (frame, index) => Math.abs(frame.computedOffset - index / (frames.length - 1)) > 1e-6,
    )
  )
    return
  const offsets = frames.map(frame => {
    const matrix = new DOMMatrixReadOnly(String(frame.transform ?? 'none'))
    return { x: matrix.e, y: matrix.f }
  })
  const transform = new DOMMatrixReadOnly(getComputedStyle(layer).transform || 'none')
  const bounds = material.getBoundingClientRect()
  const rect = {
    x: bounds.x - transform.e,
    y: bounds.y - transform.f,
    width: bounds.width,
    height: bounds.height,
  }
  const minX = Math.min(...offsets.map(offset => offset.x))
  const maxX = Math.max(...offsets.map(offset => offset.x))
  const minY = Math.min(...offsets.map(offset => offset.y))
  const maxY = Math.max(...offsets.map(offset => offset.y))
  const trace = (stage: string, values?: Record<string, number | string | boolean>) => {
    if (lagTraceEnabled())
      lagMark({
        stage: `sheet-motion-${stage}`,
        at: performance.timeOrigin + performance.now(),
        values,
      })
  }
  trace('prepared', { width: rect.width, height: rect.height, ownsMaterial })
  let started!: (epoch: number) => void
  const running = new Promise<number>(resolve => {
    started = resolve
  })
  let prepared!: () => void
  const ready = new Promise<void>(resolve => {
    prepared = resolve
  })
  let preparedReady = !ownsMaterial
  let startRequested = false
  let startFrame = 0
  let timelineEpoch = 0
  const motion: PresentationGlassMotion = {
    rect,
    contentEpoch: ++nextContentEpoch,
    sampleRect: {
      x: rect.x + minX,
      y: rect.y + minY,
      width: rect.width + maxX - minX,
      height: rect.height + maxY - minY,
    },
    // Prepare coverage and the first glass while WAAPI is held at sample zero.
    track: { epoch: Number.MAX_VALUE, duration, widths: offsets.map(() => rect.width), offsets },
    admitted: false,
    ready,
    current: () => layers.get(layer) === motion,
    acknowledge(track) {
      if (!motion.current() || motion.track !== track) return
      preparedReady = true
      prepared()
      if (track.epoch !== Number.MAX_VALUE) {
        motion.admitted = true
        trace('admitted')
        started(timelineEpoch)
      }
    },
    start() {
      if (!motion.current() || startRequested) return running
      startRequested = true
      // Coverage, resource installation and the nested-content fence may take many frames.
      // Keep sample zero throughout that work instead of spending the entrance behind the hold.
      if (!preparedReady) window.dispatchEvent(new Event('satin-presentation-motion'))
      void ready.then(() => {
        if (!motion.current()) return
        // A long task can leave the document clock over a second behind. Acquire both
        // clocks at a rendering update so a stall cannot look like suspension drift.
        startFrame = requestAnimationFrame(() => {
          startFrame = 0
          if (!motion.current()) return
          const start = performance.now()
          timelineEpoch = timelineStart(start)
          motion.track = { ...motion.track, epoch: performance.timeOrigin + start }
          motion.admitted = !ownsMaterial
          if (!ownsMaterial) started(timelineEpoch)
          else window.dispatchEvent(new Event('satin-presentation-motion'))
        })
      })
      return running
    },
    dispose() {
      if (layers.get(layer) !== motion) return
      trace('retired')
      cancelAnimationFrame(startFrame)
      resize.disconnect()
      fallback.disconnect()
      window.removeEventListener('resize', motion.dispose)
      window.visualViewport?.removeEventListener('resize', motion.dispose)
      materials.delete(material)
      layers.delete(layer)
      // A reflow retires this sampled path. Resume the existing DOM-following path
      // immediately instead of leaving a visible restoration paused until the watchdog.
      motion.admitted = false
      prepared()
      started(timelineStart(performance.now()))
      window.dispatchEvent(new Event('satin-presentation-motion'))
    },
  }
  const resize = new ResizeObserver(entries => {
    const size = entries[0]?.borderBoxSize?.[0]
    if (
      size &&
      (Math.abs(size.inlineSize - rect.width) > 0.5 || Math.abs(size.blockSize - rect.height) > 0.5)
    ) {
      trace('reflow', { width: size.inlineSize, height: size.blockSize })
      motion.dispose()
    }
  })
  // CSS fallback samples its backdrop live. A demotion must release a pending
  // GPU admission rather than leave a visible modal waiting for a retired worker.
  const fallback = new MutationObserver(() => {
    if (!ownsMaterial || !usesFallback() || !motion.current()) return
    ownsMaterial = false
    preparedReady = true
    prepared()
    if (motion.track.epoch !== Number.MAX_VALUE) {
      motion.admitted = true
      started(timelineEpoch)
    }
  })
  layers.get(layer)?.dispose()
  resize.observe(material)
  fallback.observe(material, { childList: true })
  window.addEventListener('resize', motion.dispose)
  window.visualViewport?.addEventListener('resize', motion.dispose)
  if (ownsMaterial) materials.set(material, motion)
  else prepared()
  layers.set(layer, motion)
  // A sheet can retain its admitted full travel envelope between gestures. Its
  // modal owner, resize or replacement retires it; a finished animation does not.
  if (!retain) void animation.finished.then(motion.dispose, motion.dispose)
  return motion
}
