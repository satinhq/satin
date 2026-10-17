import { expect, it } from 'vitest'
import { tabMinimizeInkFrame } from './tabMinimizeInk.ts'

it('keeps trailing items separated as they fade, rather than collecting at the selected icon', () => {
  const positions = [138, 223, 308].map(centre => {
    const frame = tabMinimizeInkFrame({
      progress: 0.85,
      fade: 0.9,
      width: 360,
      centre,
      selectedCentre: 53,
      selected: false,
    })
    expect(frame.opacity).toBeCloseTo(0.1)
    return centre + frame.x
  })
  expect(positions[1]! - positions[0]!).toBeGreaterThan(65)
  expect(positions[2]! - positions[1]!).toBeGreaterThan(65)
})
it('keeps the selected icon visible and centres it inside the compact aperture for every selection', () => {
  for (const centre of [53, 138, 223, 308]) {
    const frame = tabMinimizeInkFrame({
      progress: 1,
      fade: 1,
      width: 360,
      centre,
      selectedCentre: centre,
      selected: true,
    })
    expect(centre + frame.x).toBe(31)
    expect(frame.scale).toBe(1)
    expect(frame.opacity).toBe(1)
    expect(
      tabMinimizeInkFrame({
        progress: 1,
        fade: 1,
        width: 360,
        centre,
        selectedCentre: 53,
        selected: false,
      }).opacity,
    ).toBe(0)
  }
})
