import { reportGlassError } from '../glass/errors.ts'
import { GLASS_READINESS_BUDGET_MS, VisibleDeadline } from '../glass/visibleDeadline.ts'
import { preparePresentationGlassMotion, retargetPresentationGlassMotion } from './glassMotion.ts'

/** One admission, clock and cancellation contract for programmatic and gesture sheet tails. */
export function runPresentationMotion({
  layer,
  movement,
  dimming,
  tracksGlass,
  phase,
  invalidate,
  complete,
}: {
  layer: HTMLElement
  movement: Animation
  dimming: Animation
  tracksGlass: boolean
  phase: 'entrance' | 'dismissal' | 'drag'
  invalidate: () => void
  complete: () => void
}) {
  const node = layer.closest('dialog')!
  const epoch = tracksGlass
    ? retargetPresentationGlassMotion(layer, movement, performance.now())
    : undefined
  const glass =
    tracksGlass && epoch === undefined
      ? preparePresentationGlassMotion(layer, movement, { retain: true })
      : undefined
  let cancelled = false
  let frame = 0
  const sample = () => {
    if (epoch !== undefined || glass?.admitted) return
    invalidate()
    frame = requestAnimationFrame(sample)
  }
  const deadline = glass
    ? new VisibleDeadline(GLASS_READINESS_BUDGET_MS, () => {
        if (cancelled) return
        reportGlassError(
          'readiness-timeout',
          new Error('Sheet motion coverage did not submit'),
          'presentation-motion',
        )
        movement.finish()
        dimming.finish()
      })
    : undefined
  const start = (epoch?: number) => {
    if (cancelled) return
    deadline?.cancel()
    if (glass || epoch !== undefined) {
      for (const animation of [movement, dimming]) {
        animation.play()
        animation.startTime = epoch ?? document.timeline.currentTime
      }
    }
    node.setAttribute('data-satin-presentation-moving', phase)
    frame = requestAnimationFrame(sample)
  }
  if (glass) {
    for (const animation of [movement, dimming]) {
      animation.pause()
      animation.currentTime = 0
    }
    // Coverage capture is deferred while movement is marked; the release pose stays visible.
    node.removeAttribute('data-satin-presentation-moving')
    deadline!.start()
    void glass.start().then(start)
    invalidate()
  } else start(epoch)
  const stopSampling = () => {
    deadline?.cancel()
    cancelAnimationFrame(frame)
    if (glass && !glass.admitted) glass.dispose()
  }
  void Promise.all([movement.finished, dimming.finished]).then(
    () => {
      if (cancelled) return
      stopSampling()
      complete()
    },
    () => {},
  )
  return () => {
    cancelled = true
    stopSampling()
    movement.cancel()
    dimming.cancel()
  }
}
