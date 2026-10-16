import { describe, expect, it } from 'vitest'
import {
  beginInteractivePopGesture,
  moveInteractivePopGesture,
  resolveInteractivePopDirectionLock,
} from './interactivePop.ts'

function begin() {
  return beginInteractivePopGesture(undefined, {
    isPrimary: true,
    pointerId: 7,
    time: 100,
    width: 402,
    x: 200,
    y: 400,
  })!
}

describe('interactive pop gesture recognition', () => {
  it('claims 15-40 degree rightward paths inside the chosen direction-lock window', () => {
    expect(resolveInteractivePopDirectionLock(9.9, 0)).toBe('tracking')
    for (const angle of [15, 22, 30, 40]) {
      const radians = (angle * Math.PI) / 180
      expect(resolveInteractivePopDirectionLock(10, Math.tan(radians) * 10)).toBe(
        'claim-horizontal',
      )
    }
    expect(resolveInteractivePopDirectionLock(10, 12)).toBe('reject-vertical')
    expect(resolveInteractivePopDirectionLock(-10, 2)).toBe('reject-leftward')
  })

  it('waits through 29 points and recognizes at the measured 30-point intent', () => {
    const tracking = moveInteractivePopGesture(begin(), {
      pointerId: 7,
      time: 200,
      x: 229,
      y: 400,
    })
    expect(tracking.gesture?.state).toBe('tracking')
    expect(tracking.recognized).toBe(false)

    const recognized = moveInteractivePopGesture(tracking.gesture!, {
      pointerId: 7,
      time: 210,
      x: 230,
      y: 400,
    })
    expect(recognized.gesture).toMatchObject({
      progress: 30 / 402,
      state: 'recognized',
    })
    expect(recognized.recognized).toBe(true)
  })

  it('lets vertical intent win without creating navigation jitter', () => {
    expect(
      moveInteractivePopGesture(begin(), {
        pointerId: 7,
        time: 200,
        x: 210,
        y: 431,
      }),
    ).toEqual({
      gesture: undefined,
      recognized: false,
      resolution: 'vertical-rejected',
    })
  })

  it('ignores a second pointer while the primary gesture is active', () => {
    const primary = begin()
    expect(
      beginInteractivePopGesture(primary, {
        isPrimary: false,
        pointerId: 8,
        time: 120,
        width: 402,
        x: 20,
        y: 300,
      }),
    ).toBe(primary)
    expect(
      moveInteractivePopGesture(primary, {
        pointerId: 8,
        time: 150,
        x: 100,
        y: 300,
      }),
    ).toEqual({
      gesture: primary,
      recognized: false,
      resolution: 'foreign-pointer',
    })
  })

  it('keeps tracking a realistic oblique path until horizontal intent wins', () => {
    const firstMove = moveInteractivePopGesture(begin(), {
      pointerId: 7,
      time: 360,
      x: 220,
      y: 429,
    })
    expect(firstMove).toMatchObject({
      recognized: false,
      resolution: 'tracking',
    })

    const recognized = moveInteractivePopGesture(firstMove.gesture!, {
      pointerId: 7,
      time: 720,
      x: 234,
      y: 430,
    })
    expect(recognized).toMatchObject({
      recognized: true,
      resolution: 'recognized',
      gesture: { progress: 34 / 402, state: 'recognized' },
    })
  })

  it('tracks full-screen starts and reports average release velocity', () => {
    const start = beginInteractivePopGesture(undefined, {
      isPrimary: true,
      pointerId: 4,
      time: 1_000,
      width: 402,
      x: 320,
      y: 300,
    })!
    const moved = moveInteractivePopGesture(start, {
      pointerId: 4,
      time: 1_250,
      x: 400,
      y: 300,
    })

    expect(moved.gesture).toMatchObject({
      progress: 80 / 402,
      state: 'recognized',
      velocityPointsPerSecond: 320,
    })
  })
})
