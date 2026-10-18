import { expect, it } from 'vitest'
import { swipeRowLayout } from './swipeRowLayout.ts'

it.each([
  [52, true, 44, 60],
  [56, true, 48, 60],
  [58, true, 50, 60],
  [59, true, 50, 60],
  [59.5, true, 50, 60],
  [60, false, 33.5, 60],
  [62, false, 35.5, 60],
  [64, false, 37.5, 60],
  [66, false, 39.5, 60],
  [72, false, 45.5, 60],
  [74, false, 47.5, 60],
  [76, false, 49.5, 60],
  [76.5, false, 49.5, 60],
  [77, false, 50, 50],
  [82.5, false, 50, 50],
  [96, false, 50, 50],
])('matches native row-height calibration at %spt', (height, inline, capsuleHeight, minimumButtonWidth) => {
  expect(swipeRowLayout(height as number)).toEqual({ inline, capsuleHeight, minimumButtonWidth })
})
