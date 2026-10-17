import { expect, it } from 'vitest'
import { barItemsFadeOpacity } from './searchMotion.ts'

// reference item 3: native `.searchable` with a standard (inline) title, iOS 27.0 native reference header-styles.
// Background-corrected opacity of the bar's title "Search" against the field's travel, two takes.
const NATIVE_TITLE = [
  [2.0, 0.797],
  [7.2, 0.475],
  [13.7, 0.256],
  [20.8, 0.113],
  [27.5, 0.052],
] as const

it("fades the bar's title and items out within the field's first 30 pt of travel", () => {
  for (const [travel, opacity] of NATIVE_TITLE) {
    expect(barItemsFadeOpacity(travel)).toBeCloseTo(opacity, 1)
  }
})
