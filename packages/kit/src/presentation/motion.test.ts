import { expect, it } from 'vitest'
import {
  alertKeyboardState,
  dialogEntranceFrames,
  sheetDetentPosition,
  sheetEntranceFrames,
  sheetReleasePosition,
  presentationReturnFrames,
} from './motion.ts'

it('a reversing sheet keeps moving in the incoming direction before turning around', () => {
  const frames = presentationReturnFrames(120, 0.7, 'sheet', 1000).transform
  const position = (frame: Keyframe) => Number(String(frame.transform).slice(11, -3))
  expect(position(frames[0]!)).toBe(120)
  expect(position(frames[1]!)).toBeGreaterThan(120)
  expect(position(frames[12]!)).toBeLessThan(120)
  expect(position(frames.at(-1)!)).toBe(0)
})

it('retains the measured native expansion tail within its 1.3 pt maximum residual', () => {
  // native-light-medium-large.mp4; edge samples in expand-release-fit.json.
  const samples = [
    [0.033334, 123],
    [0.068334, 104.6667],
    [0.116667, 86],
    [0.168334, 75],
    [0.201667, 70.3333],
  ]
  for (const [time, position] of samples)
    expect(
      Math.abs(sheetReleasePosition(146.6667, 62, -807.9005, time!, 'expand') - position!),
    ).toBeLessThan(1.3)
})
it('follows a native drag-dismiss release within its fitted residual', () => {
  // native-motion r2 light-1791508708453 instance 8: sheet height above the screen bottom (pt),
  // fitted start 360.0 pt at -2570 pt/s; the seeded fit's maximum error on this clip is 1.1 pt.
  const samples = [
    [0.016816, 313.84],
    [0.066816, 188.4],
    [0.116816, 100.08],
    [0.166816, 48.88],
    [0.216816, 23.28],
  ]
  for (const [time, height] of samples)
    expect(
      Math.abs(sheetReleasePosition(359.9984, 0, -2569.9787, time!, 'dismiss') - height!),
    ).toBeLessThan(1.2)
})
it('release curves start at the contact position and settle without permanent displacement', () => {
  for (const phase of ['dismiss', 'expand', 'collapse'] as const) {
    expect(sheetReleasePosition(300, 500, 200, 0, phase)).toBe(300)
    expect(sheetReleasePosition(300, 500, 200, 2, phase)).toBeCloseTo(500, 3)
  }
  expect(sheetEntranceFrames(497).at(-1)?.transform).toBe('translateY(0px)')
})

it('matches independent visible native dialog title positions', () => {
  for (const [kind, origin, rest, samples] of [
    [
      'alert',
      220,
      88,
      [
        [0.028333, 71],
        [0.061667, 77],
        [0.115, 84],
        [0.211667, 88],
      ],
    ],
    // native reference reference popover width in points (row source, light): 240 at rest, 0.23 at 0.
    [
      'confirmation',
      0,
      240,
      [
        [0.045, 100.6],
        [0.08, 150.2],
        [0.113, 194.6],
        [0.148, 222.7],
        [0.182, 235.4],
      ],
    ],
  ] as const) {
    const frames = dialogEntranceFrames(kind)
    for (const [time, measured] of samples) {
      const index = (time / 0.7) * 84,
        low = Math.floor(index)
      const scaleAt = (i: number) => Number(String(frames[i]!.transform).slice(6, -1))
      const scale = scaleAt(low) + (scaleAt(low + 1) - scaleAt(low)) * (index - low)
      // The popover grows ~1400 pt/s mid-entrance; 4.5 pt is a few ms of PTS jitter.
      const tolerance = kind === 'alert' ? 1.1 : 4.5
      expect(Math.abs(origin + (rest - origin) * scale - measured)).toBeLessThan(tolerance)
    }
  }
})

it('matches the second warmed native keyboard recording with the first recording spring', () => {
  // Sep 27 native-hostok-manual/keyboard-holdout.json. Only onset was aligned
  // for this holdout; the measured centre removes the separate entrance scale.
  const samples = [
    [0.031552, 468.507634],
    [0.073219, 414.503817],
    [0.141552, 361.5],
    [0.211552, 342.5],
    [0.256552, 338.5],
    [0.326552, 336.5],
    [0.378219, 335.5],
  ]
  for (const [time, measured] of samples)
    expect(Math.abs(alertKeyboardState(492, 335.5, 0, time!).position - measured!)).toBeLessThan(
      4.6,
    )
  const interrupted = alertKeyboardState(492, 335.5, 0, 0.09)
  const resumed = alertKeyboardState(interrupted.position, 400, interrupted.velocity, 0)
  expect(resumed.position).toBeCloseTo(interrupted.position, 8)
  expect(resumed.velocity).toBeCloseTo(interrupted.velocity, 8)
})

it('matches native grabber tap trajectories, including their slightly overdamped tails', () => {
  // Native template y goes up when sheet height increases. 454/65 are the
  // tracked template origins, not the grabber centre (459/70).
  for (const [time, y] of [
    [0.03341, 404],
    [0.086743, 278],
    [0.135076, 182],
    [0.18841, 124],
    [0.240076, 94],
    [0.33841, 71],
  ]) {
    expect(Math.abs(454 - sheetDetentPosition(0, 389, time!) - y!)).toBeLessThan(5.6)
  }
  for (const [time, y] of [
    [0.03266, 117],
    [0.085994, 246],
    [0.13266, 342],
    [0.185994, 398],
    [0.235994, 427],
    [0.33766, 448],
  ]) {
    expect(Math.abs(454 - sheetDetentPosition(389, 0, time!) - y!)).toBeLessThan(6.5)
  }
})
