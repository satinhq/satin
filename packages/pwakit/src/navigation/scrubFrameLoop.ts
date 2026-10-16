export type ScrubFrameMetrics = Readonly<{
  averageEventsPerFrame: number
  eventsThisFrame: number
  frameCount: number
  inputCount: number
  inputHz?: number
  rafHz?: number
}>

export type ScrubResolution = 'cancel' | 'complete'

type PendingResolution = Readonly<{
  target: ScrubResolution
  velocityPointsPerSecond: number
}>

export type InteractiveScrubFrameLoop = Readonly<{
  dispose(): void
  record(progress: number, inputTime: number): void
  resolve(
    target: ScrubResolution,
    progress: number,
    velocityPointsPerSecond: number,
    inputTime: number,
  ): void
}>

type InteractiveScrubFrameLoopOptions = Readonly<{
  applyProgress(progress: number): void
  cancelFrame(frame: number): void
  onFrame?(metrics: ScrubFrameMetrics): void
  requestFrame(callback: FrameRequestCallback): number
  resolve(target: ScrubResolution, velocityPointsPerSecond: number): void
}>

function observedHz(count: number, firstTime: number, lastTime: number) {
  if (count < 2) return undefined
  const elapsed = lastTime - firstTime
  return elapsed > 0 ? ((count - 1) * 1_000) / elapsed : undefined
}

/**
 * Buffers the newest direct-manipulation sample and gives the transition one
 * coordinated visual commit per display frame. Release thresholds and
 * velocity stay on the unfiltered input stream; resolution begins only after
 * the final raw position has been painted.
 */
export function createInteractiveScrubFrameLoop(
  options: InteractiveScrubFrameLoopOptions,
): InteractiveScrubFrameLoop {
  let disposed = false
  let eventsSinceFrame = 0
  let firstFrameTime = 0
  let firstInputTime = 0
  let frameCount = 0
  let frameRequest: number | undefined
  let inputCount = 0
  let lastFrameTime = 0
  let lastInputTime = 0
  let latestProgress = 0
  let pendingResolution: PendingResolution | undefined

  const renderFrame: FrameRequestCallback = frameTime => {
    frameRequest = undefined
    if (disposed || inputCount === 0) return

    const eventsThisFrame = eventsSinceFrame
    eventsSinceFrame = 0
    frameCount += 1
    if (frameCount === 1) firstFrameTime = frameTime
    lastFrameTime = frameTime

    if (eventsThisFrame > 0) options.applyProgress(latestProgress)
    options.onFrame?.({
      averageEventsPerFrame: inputCount / frameCount,
      eventsThisFrame,
      frameCount,
      inputCount,
      inputHz: observedHz(inputCount, firstInputTime, lastInputTime),
      rafHz: observedHz(frameCount, firstFrameTime, lastFrameTime),
    })

    const resolution = pendingResolution
    pendingResolution = undefined
    if (resolution) {
      options.resolve(resolution.target, resolution.velocityPointsPerSecond)
      return
    }
    scheduleFrame()
  }

  const scheduleFrame = () => {
    if (disposed || frameRequest !== undefined) return
    frameRequest = options.requestFrame(renderFrame)
  }

  const record = (progress: number, inputTime: number) => {
    if (disposed || pendingResolution) return
    latestProgress = progress
    inputCount += 1
    eventsSinceFrame += 1
    if (inputCount === 1) firstInputTime = inputTime
    lastInputTime = inputTime
    scheduleFrame()
  }

  return Object.freeze({
    dispose() {
      if (disposed) return
      disposed = true
      if (frameRequest !== undefined) options.cancelFrame(frameRequest)
      frameRequest = undefined
      pendingResolution = undefined
    },
    record,
    resolve(target, progress, velocityPointsPerSecond, inputTime) {
      if (disposed || pendingResolution) return
      record(progress, inputTime)
      pendingResolution = { target, velocityPointsPerSecond }
      scheduleFrame()
    },
  })
}

export type FilteredScrubSample = Readonly<{
  progress: number
  /** Raw release velocity is deliberately never smoothed. */
  velocityPointsPerSecond: number
}>

type CriticallyDampedScrubFilter = Readonly<{
  reset(): void
  sample(progress: number, time: number, velocityPointsPerSecond: number): FilteredScrubSample
}>

/**
 * A dormant, testable filter candidate for a future measured input-rate gap.
 * It is intentionally not wired into NavigatorHost until native latency gives
 * us a defensible time constant and the physical phone still needs it.
 */
export function createCriticallyDampedScrubFilter(
  timeConstantMs: number,
): CriticallyDampedScrubFilter {
  if (!(timeConstantMs > 0)) {
    throw new Error('Satin scrub filter timeConstantMs must be greater than zero.')
  }

  let current = 0
  let currentVelocity = 0
  let initialized = false
  let previousTime = 0
  const angularFrequency = 1_000 / timeConstantMs

  return Object.freeze({
    reset() {
      current = 0
      currentVelocity = 0
      initialized = false
      previousTime = 0
    },
    sample(progress, time, velocityPointsPerSecond) {
      if (!initialized || time <= previousTime) {
        current = progress
        currentVelocity = 0
        initialized = true
        previousTime = time
        return { progress: current, velocityPointsPerSecond }
      }

      const elapsedSeconds = Math.min(0.05, (time - previousTime) / 1_000)
      const displacement = current - progress
      const coupledVelocity = currentVelocity + angularFrequency * displacement
      const decay = Math.exp(-angularFrequency * elapsedSeconds)
      current = progress + (displacement + coupledVelocity * elapsedSeconds) * decay
      currentVelocity =
        (currentVelocity - angularFrequency * coupledVelocity * elapsedSeconds) * decay
      previousTime = time
      return { progress: current, velocityPointsPerSecond }
    },
  })
}
