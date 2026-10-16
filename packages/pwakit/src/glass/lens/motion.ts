import backgroundDescription from './backgrounds.json'

export type ScriptedScrollMode = 'constant' | 'flick'
export type ScriptedMotionMode = ScriptedScrollMode | 'drag-scripted'

export type MotionSample = Readonly<{
  elapsedMs: number
  offsetCssPx: number
  progress?: number
  timestampMs: number
}>

export type MotionRun = Readonly<{
  completed: boolean
  durationMs: number
  endedAtMs: number
  mode: ScriptedMotionMode
  samples: readonly MotionSample[]
  startedAtMs: number
}>

export const MOTION_SPEC = backgroundDescription.motion
export const NATIVE_WIDGET_Y_REGISTRATION_PX = 14

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export function scriptedScrollOffset(mode: ScriptedScrollMode, elapsedMs: number) {
  const activeMs = clamp(elapsedMs - MOTION_SPEC.delayMs, 0, MOTION_SPEC.durationMs)
  if (mode === 'constant') return (activeMs / 1000) * MOTION_SPEC.constantVelocityPtPerSecond
  const progress = activeMs / MOTION_SPEC.durationMs
  const numerator = 1 - Math.exp(-MOTION_SPEC.flickDecay * progress)
  const denominator = 1 - Math.exp(-MOTION_SPEC.flickDecay)
  return (MOTION_SPEC.flickTravelPt * numerator) / denominator
}

export function scriptedDragProgress(elapsedMs: number) {
  const activeMs = clamp(elapsedMs - MOTION_SPEC.delayMs, 0, MOTION_SPEC.dragDurationMs)
  const linear = activeMs / MOTION_SPEC.dragDurationMs
  return linear * linear * (3 - 2 * linear)
}

export function scriptedDragFrames(progress: number, physicalTopInset: number) {
  const clamped = clamp(progress, 0, 1)
  const interpolate = (start: number[], end: number[]) =>
    start.map((value, index) => value + (end[index] - value) * clamped)
  const capsuleCenter = interpolate(MOTION_SPEC.dragCapsuleStart, MOTION_SPEC.dragCapsuleEnd)
  const circleCenter = interpolate(MOTION_SPEC.dragCircleStart, MOTION_SPEC.dragCircleEnd)
  const layoutY = (physicalY: number) =>
    physicalY + NATIVE_WIDGET_Y_REGISTRATION_PX - physicalTopInset
  return {
    capsule: {
      height: 120,
      width: 300,
      x: capsuleCenter[0] - 150,
      y: layoutY(capsuleCenter[1]) - 60,
    },
    circle: {
      height: 160,
      width: 160,
      x: circleCenter[0] - 80,
      y: layoutY(circleCenter[1]) - 80,
    },
  }
}

export function runScriptedScroll(
  mode: ScriptedScrollMode,
  writeOffset: (offset: number) => void,
  signal?: AbortSignal,
) {
  const startedAtMs = performance.now()
  const samples: MotionSample[] = []
  const totalMs = MOTION_SPEC.delayMs + MOTION_SPEC.durationMs + MOTION_SPEC.settleMs
  writeOffset(0)
  return new Promise<MotionRun>(resolve => {
    const tick = (timestampMs: number) => {
      const elapsedMs = timestampMs - startedAtMs
      const offsetCssPx = scriptedScrollOffset(mode, elapsedMs)
      writeOffset(offsetCssPx)
      samples.push({ elapsedMs, offsetCssPx, timestampMs })
      if (!signal?.aborted && elapsedMs < totalMs) {
        requestAnimationFrame(tick)
        return
      }
      resolve({
        completed: !signal?.aborted,
        durationMs: elapsedMs,
        endedAtMs: timestampMs,
        mode,
        samples,
        startedAtMs,
      })
    }
    requestAnimationFrame(tick)
  })
}

export function runScriptedDrag(writeProgress: (progress: number) => void, signal?: AbortSignal) {
  const startedAtMs = performance.now()
  const samples: MotionSample[] = []
  const totalMs = MOTION_SPEC.delayMs + MOTION_SPEC.dragDurationMs + MOTION_SPEC.settleMs
  writeProgress(0)
  return new Promise<MotionRun>(resolve => {
    const tick = (timestampMs: number) => {
      const elapsedMs = timestampMs - startedAtMs
      const progress = scriptedDragProgress(elapsedMs)
      writeProgress(progress)
      samples.push({ elapsedMs, offsetCssPx: 0, progress, timestampMs })
      if (!signal?.aborted && elapsedMs < totalMs) {
        requestAnimationFrame(tick)
        return
      }
      resolve({
        completed: !signal?.aborted,
        durationMs: elapsedMs,
        endedAtMs: timestampMs,
        mode: 'drag-scripted',
        samples,
        startedAtMs,
      })
    }
    requestAnimationFrame(tick)
  })
}
