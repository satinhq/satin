import { expect, it } from 'vitest'
import { refreshHeight, refreshRelease, refreshReleaseOffset } from './refreshMotion.ts'

it('preserves height-animation positions even when native bottom clamping consumes the spacer', () => {
  for (const scrollTop of [0, 10, 100, 110, 130, 160]) {
    const maximumWithoutSpacer = 100
    const initialScroll = Math.min(scrollTop, maximumWithoutSpacer + refreshHeight)
    const finalScroll = Math.min(scrollTop, maximumWithoutSpacer)
    const displacement = refreshHeight - initialScroll + finalScroll
    for (const { height } of refreshRelease) {
      const oldPosition = height - Math.min(initialScroll, maximumWithoutSpacer + height)
      const compositorPosition = -finalScroll + refreshReleaseOffset(height, displacement)
      expect(compositorPosition).toBeCloseTo(oldPosition, 10)
    }
  }
})
