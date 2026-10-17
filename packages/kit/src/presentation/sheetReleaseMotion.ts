import { animateElement } from '../motion/animate.ts'
import { runPresentationMotion } from './presentationMotion.ts'
import { sheetReleasePosition } from './motion.ts'
import { holdPresentationGlassMotion } from './glassMotion.ts'
import { sampledMotionTrack } from '../motion/springTrack.ts'
import { glassShapeTrack } from '../glass/shapeTrackRegistry.ts'
import { accessoryGlassMotion } from '../glass/webgpu/accessoryMorph.ts'

/** This rollout translates one settled layout. It performs no FLIP or reflow:
 * releases above the smallest detent still use the existing layout owner.
 * Static nested glass travels with its captured content. Independently tracked
 * glass cannot reuse that rigid snapshot and stays on the existing path too. */
export function canReleaseSheetOnCompositor(
  layer: HTMLElement,
  from: number,
  smallest: number,
  downwardVelocity: number,
) {
  if (from > smallest || downwardVelocity < 0) return false
  const surface = layer.querySelector<HTMLElement>('.satin-presentation-surface')
  if (!surface) return false
  const nested = [...surface.querySelectorAll<HTMLElement>('[data-satin-glass-region-id]')]
  for (const glass of nested) {
    if (glassShapeTrack(glass) || accessoryGlassMotion(glass)) return false
  }
  // A nested material can sample a moving sibling as well as its own children.
  // Do not freeze its source while an independent layout/transform track runs.
  if (
    nested.length &&
    surface.getAnimations({ subtree: true }).some(animation => {
      if (animation.playState !== 'running' && animation.playState !== 'paused') return false
      const effect = animation.effect as KeyframeEffect | null
      return effect
        ?.getKeyframes()
        .some(frame =>
          [
            'transform',
            'translate',
            'scale',
            'rotate',
            'width',
            'height',
            'top',
            'left',
            'bottom',
            'right',
            'clipPath',
          ].some(property => property in frame),
        )
    })
  )
    return false
  return true
}

/** The existing velocity-bearing dismissal fit, submitted once instead of rewritten each frame.
 * Only the translating part below the smallest detent belongs on the compositor. */
export function sheetReleaseFrames(from: number, smallest: number, gap: number, velocity: number) {
  const transform: Keyframe[] = []
  const dim: Keyframe[] = []
  // Preserve the old tail's endpoint rule (within half a point or 700 ms).
  // Solve its crossing instead of letting the callback cadence set the duration.
  let seconds = 0.7
  for (let step = 0; step <= 168; step++) {
    const at = step / 240
    if (sheetReleasePosition(from, -gap, velocity, at, 'dismiss') <= -gap + 0.5) {
      let low = Math.max(0, at - 1 / 240)
      let high = at
      for (let iteration = 0; iteration < 24; iteration++) {
        const middle = (low + high) / 2
        if (sheetReleasePosition(from, -gap, velocity, middle, 'dismiss') <= -gap + 0.5)
          high = middle
        else low = middle
      }
      seconds = high
      break
    }
  }
  const track = sampledMotionTrack(Math.max(0.001, seconds * 1000), at =>
    sheetReleasePosition(from, -gap, velocity, at / 1000, 'dismiss'),
  )
  for (let index = 0; index < track.values.length; index++) {
    const offset = index / (track.values.length - 1)
    const translation = smallest - (index === track.values.length - 1 ? -gap : track.values[index]!)
    transform.push({ offset, transform: `translateY(${translation}px)` })
    dim.push({ offset, opacity: Math.max(0, 1 - translation / (smallest + gap)) })
  }
  return { transform, dim, duration: Math.max(0.001, seconds * 1000) }
}

export type SheetReleaseMotion = { cancel: () => number }

/** Keep the released pose while the renderer admits its swept source, then share one clock.
 * Cancellation samples the compositor before retiring it, so a new touch cannot jump backwards. */
export function startSheetReleaseMotion(
  layer: HTMLElement,
  from: number,
  smallest: number,
  gap: number,
  velocity: number,
  invalidate: () => void,
  complete: () => void,
): SheetReleaseMotion {
  const dialog = layer.closest('dialog')!
  const dimmer = dialog.querySelector<HTMLElement>('[data-satin-presentation-dimmer]')
  const usesDimmer = dimmer && getComputedStyle(dimmer).display !== 'none'
  const frames = sheetReleaseFrames(from, smallest, gap, velocity)
  const options: KeyframeAnimationOptions = {
    duration: frames.duration,
    easing: 'linear',
    fill: 'both',
  }
  const movement = animateElement(layer, frames.transform, options)
  const dimming = usesDimmer
    ? animateElement(dimmer, frames.dim, options)
    : animateElement(dialog, frames.dim, { ...options, pseudoElement: '::backdrop' })
  const retire = runPresentationMotion({
    layer,
    movement,
    dimming,
    tracksGlass: true,
    phase: 'drag',
    invalidate,
    complete: () => {
      // Write the endpoint before dropping fill, including when an owner declines dismissal.
      layer.style.transform = `translateY(${smallest + gap}px)`
      holdPresentationGlassMotion(layer, smallest + gap)
      dialog.style.setProperty('--satin-presentation-dim', '0')
      retire()
      complete()
    },
  })
  return {
    cancel() {
      const transform = getComputedStyle(layer).transform
      const offset =
        transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : smallest - from
      holdPresentationGlassMotion(layer, offset)
      retire()
      return smallest - offset
    },
  }
}
