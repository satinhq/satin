import { describe, expect, it } from 'vitest'
import { resolveInteractivePopDirectionLock } from './interactivePop.ts'

// iOS 27 SwiftUI NavigationStack, Simulator HID (swipe-trace construction update, Oct 4): an edge contact
// that starts with `lead` pt at `angle` degrees below horizontal, then continues horizontally.
// Native accepted 14 pt leads up to 44 degrees and 20 pt leads at 30 degrees; it rejected 20 pt
// leads at 35 degrees and steeper, 14 pt leads at 45 degrees and steeper, the owner's swipe 022
// (2 of 2 replays) and vertical drags. Satin must accept whatever native accepts.
function lockFor(points: readonly (readonly [number, number])[]) {
  const [x0, y0] = points[0]!
  for (const [x, y] of points.slice(1)) {
    const result = resolveInteractivePopDirectionLock(x - x0, y - y0)
    if (result !== 'tracking') return result
  }
  return 'tracking'
}

function diagonal(lead: number, angle: number) {
  const radians = (angle * Math.PI) / 180
  const points: [number, number][] = [[3, 400]]
  for (let step = 1; step <= 8; step++)
    points.push([
      3 + (lead * Math.cos(radians) * step) / 8,
      400 + (lead * Math.sin(radians) * step) / 8,
    ])
  const [x1, y1] = points.at(-1)!
  for (let step = 1; step <= 25; step++) points.push([x1 + (220 * step) / 25, y1])
  return points
}

describe('edge-start direction lock against native', () => {
  it.each([
    [14, 30],
    [14, 35],
    [14, 38],
    [14, 41],
    [14, 44],
    [20, 30],
  ])('accepts a %s pt lead at %s degrees like native', (lead, angle) => {
    expect(lockFor(diagonal(lead, angle))).toBe('claim-horizontal')
  })

  it("rejects the owner's 022 like native (its first delivered sample is 13.7 pt right, 14.3 pt down)", () => {
    // Delivered samples of 022 relative to touch-down (owner iPhone, Oct 4).
    const owner022: [number, number][] = [
      [0, 0],
      [13.7, 14.3],
      [22, 16.3],
      [32.3, 16.3],
      [46, 16.3],
      [62.7, 14.3],
      [91, 5.7],
      [121.3, -6.3],
      [154, -18.7],
    ]
    expect(lockFor(owner022)).toBe('reject-vertical')
  })

  it('a truly vertical drag from the edge still belongs to the scroll view', () => {
    const vertical: [number, number][] = Array.from({ length: 30 }, (_, step) => [
      3 + step * 0.17,
      300 + step * 12,
    ])
    expect(lockFor(vertical)).toBe('reject-vertical')
  })
})
