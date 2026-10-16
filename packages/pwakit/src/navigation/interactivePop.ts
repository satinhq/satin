import { NAVIGATION_DIRECTION_LOCK_PX, NAVIGATION_HORIZONTAL_INTENT_PX } from './motionTokens.ts'
import { createReleaseVelocityTracker, type ReleaseVelocityTracker } from './releaseVelocity.ts'

export type InteractivePopDirectionLock =
  'claim-horizontal' | 'reject-leftward' | 'reject-vertical' | 'tracking'

export function resolveInteractivePopDirectionLock(
  deltaX: number,
  deltaY: number,
): InteractivePopDirectionLock {
  const absoluteX = Math.abs(deltaX)
  const absoluteY = Math.abs(deltaY)
  if (Math.max(absoluteX, absoluteY) < NAVIGATION_DIRECTION_LOCK_PX) {
    return 'tracking'
  }
  if (deltaX > 0 && absoluteX > absoluteY) return 'claim-horizontal'
  if (absoluteY >= absoluteX) return 'reject-vertical'
  return 'reject-leftward'
}

export type InteractivePopGesture = Readonly<{
  currentX: number
  currentY: number
  pointerId: number
  progress: number
  releaseVelocity: ReleaseVelocityTracker
  startX: number
  startY: number
  state: 'recognized' | 'tracking'
  velocityPointsPerSecond: number
  width: number
}>

export type InteractivePopMove = Readonly<{
  gesture?: InteractivePopGesture
  recognized: boolean
  resolution:
    'foreign-pointer' | 'leftward-rejected' | 'recognized' | 'tracking' | 'vertical-rejected'
}>

function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, progress))
}

export function beginInteractivePopGesture(
  existing: InteractivePopGesture | undefined,
  input: Readonly<{
    isPrimary: boolean
    pointerId: number
    time: number
    width: number
    x: number
    y: number
  }>,
) {
  if (existing || !input.isPrimary || input.width <= 0) return existing
  const releaseVelocity = createReleaseVelocityTracker()
  releaseVelocity.record(input.x, input.time)
  return {
    currentX: input.x,
    currentY: input.y,
    pointerId: input.pointerId,
    progress: 0,
    releaseVelocity,
    startX: input.x,
    startY: input.y,
    state: 'tracking',
    velocityPointsPerSecond: 0,
    width: input.width,
  } satisfies InteractivePopGesture
}

export function moveInteractivePopGesture(
  gesture: InteractivePopGesture,
  input: Readonly<{ pointerId: number; time: number; x: number; y: number }>,
): InteractivePopMove {
  if (gesture.pointerId !== input.pointerId) {
    return { gesture, recognized: false, resolution: 'foreign-pointer' }
  }

  const velocityPointsPerSecond = gesture.releaseVelocity.record(input.x, input.time)

  const deltaX = input.x - gesture.startX
  const deltaY = input.y - gesture.startY
  if (
    gesture.state === 'tracking' &&
    Math.abs(deltaY) >= NAVIGATION_HORIZONTAL_INTENT_PX &&
    Math.abs(deltaY) >= Math.abs(deltaX)
  ) {
    return {
      gesture: undefined,
      recognized: false,
      resolution: 'vertical-rejected',
    }
  }
  if (gesture.state === 'tracking' && deltaX <= -NAVIGATION_HORIZONTAL_INTENT_PX) {
    return {
      gesture: undefined,
      recognized: false,
      resolution: 'leftward-rejected',
    }
  }

  const recognized =
    gesture.state === 'recognized' ||
    (deltaX >= NAVIGATION_HORIZONTAL_INTENT_PX && deltaX > Math.abs(deltaY))
  if (!recognized) {
    return {
      gesture: {
        ...gesture,
        currentX: input.x,
        currentY: input.y,
        velocityPointsPerSecond,
      },
      recognized: false,
      resolution: 'tracking',
    }
  }

  const nextGesture: InteractivePopGesture = {
    ...gesture,
    currentX: input.x,
    currentY: input.y,
    progress: clampProgress(deltaX / gesture.width),
    state: 'recognized',
    velocityPointsPerSecond,
  }
  return {
    gesture: nextGesture,
    recognized: gesture.state !== 'recognized',
    resolution: 'recognized',
  }
}
