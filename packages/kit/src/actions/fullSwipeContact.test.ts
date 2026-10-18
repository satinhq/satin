import { expect, it } from 'vitest'
import {
  createFullSwipeContact,
  destructiveFullSwipe,
  destructiveJumpRemaining,
} from './fullSwipeContact.ts'
import { rowSwipePosition, rowSwipeRaw } from './rowScrub.ts'
import type { SwipeActions } from './types.ts'

// The stock List reference: a 400pt row inset 20pt (screen x = row x + 20), with
// leading Read/Pin and trailing Delete/More, as in the r3 native receipts.
const width = 400
const inset = 20
const tall: SwipeActions = [
  {
    edge: 'leading',
    actions: [
      { id: 'read', label: 'Read' },
      { id: 'pin', label: 'Pin' },
    ],
  },
  {
    edge: 'trailing',
    actions: [
      { id: 'delete', label: 'Delete', role: 'destructive' },
      { id: 'more', label: 'More' },
    ],
  },
]
const widths = { leading: 50, trailing: 50 }

function contact(configuration = tall, options: { caught?: { trailing: number } } = {}) {
  return createFullSwipeContact({
    width,
    configuration,
    widths,
    inline: false,
    now: 0,
    ...options,
  })
}

/** A stroke recognized at screen x `origin`, sampled every 2pt, one frame (1/60s) apart.
 * Raw is recognized travel: finger minus origin, as UIKit's pan translation reports it. */
function stroke(row: ReturnType<typeof contact>, origin: number, fingers: number[], from = 0) {
  return fingers.map((finger, index) => {
    const raw = finger - origin
    const now = from + (index * 1000) / 60
    row.track(finger - inset, now)
    return { finger, raw, now, position: row.present(raw, now), anchored: row.anchored() }
  })
}
/** Native receipts take over at pan -286.7; 2pt sampling lands at -286. */
const near = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThan(1)
const path = (from: number, to: number, step = 2) =>
  Array.from({ length: Math.floor(Math.abs(to - from) / step) + 1 }, (_, index) =>
    from > to ? from - index * step : from + index * step,
  )

it('retains an in-zone delivered move when a flick ends before the next paint', () => {
  const row = createFullSwipeContact({
    width: 984,
    configuration: tall,
    widths: { leading: 84, trailing: 84 },
    inline: true,
    now: 0,
  })
  // iPad native r12: 100pt at 233ms is outside; 69.5pt at 241.7ms
  // enters the zone. Touchend follows the 65pt move at about 250ms.
  row.track(100 - 20, 233)
  row.present(-800, 233)
  expect(row.armed(-800)).toBe(false)
  row.track(69.5 - 20, 241.7)
  row.observe(-830.5, 241.7)
  row.track(65 - 20, 250)
  row.present(-835, 250, false)
  expect(row.armed(-835)).toBe(true)
})

it('takes a destructive full swipe over where the finger is, not after a fixed travel', () => {
  // Native: strokes from x300, x350 and x400 all take over at x88, after
  // 187, 236 and 287pt of recognized travel. A stroke stopping at x90 never does.
  for (const origin of [275, 325, 375]) {
    const samples = stroke(contact(), origin, path(origin, 60))
    const first = samples.find(sample => sample.anchored)!
    expect(first.finger).toBeGreaterThanOrEqual(88)
    expect(first.finger).toBeLessThan(90)
    expect(stroke(contact(), origin, path(origin, 91)).some(sample => sample.anchored)).toBe(false)
  }
  // 165pt of recognized travel that reaches x60 never takes over.
  expect(stroke(contact(), 225, path(225, 60)).some(sample => sample.anchored)).toBe(false)
})

it('jumps to one anchor and then follows the finger 1:1, without jitter at the zone edge', () => {
  const row = contact()
  const forward = stroke(row, 375, path(375, 88))
  const jumped = forward.at(-1)!
  // Hover across the zone edge, then hold still after the jump has settled.
  const hover = stroke(row, 375, [89, 91, 89, 93, 88, 91, 89, 95, 100, 120], jumped.now + 600)
  const offsets = hover.map(sample => sample.position - sample.raw)
  for (const offset of offsets) expect(offset).toBeCloseTo(offsets[0]!, 6)
  // The jump target leaves 29pt of the row showing: -371 of 400.
  expect(offsets[0]! + jumped.raw).toBeCloseTo(-(width - destructiveFullSwipe.anchorInset), 6)
  // Presented position is monotone in raw: no reversal of motion while hovering.
  for (let index = 1; index < hover.length; index++)
    expect(Math.sign(hover[index]!.position - hover[index - 1]!.position)).toBe(
      Math.sign(hover[index]!.raw - hover[index - 1]!.raw),
    )
})

it('matches the native anchored reversal and its soft limit', () => {
  const row = contact()
  const forward = stroke(row, 375, path(375, 60))
  const back = stroke(row, 375, path(60, 140), forward.at(-1)!.now + 300)
  const at = (finger: number) => back.find(sample => sample.finger === finger)!.position
  // r3 reverse-to-140 model geometry, anchor -84.33pt: pan -315/-296.33/-259/-235.
  near(at(60), -381.39)
  near(at(140), -319.33)
  near(back.find(sample => sample.raw === -259)!.position, -343.33)
  // Persistent anchor, not persistent arming: back out of the zone disarms.
  expect(row.anchored()).toBe(true)
  expect(row.armed(back.at(-1)!.raw)).toBe(false)
  // All the way back, the row stays on its side of the anchor (native -79 at x380).
  const home = stroke(row, 375, path(140, 380), back.at(-1)!.now + 300).at(-1)!
  near(home.position, -79.33)
  expect(row.armed(home.raw)).toBe(false)
})

it('arms a release in the zone again after a jittering reversal', () => {
  const row = contact()
  const forward = stroke(row, 375, path(375, 80))
  // r3 destructive-reverse-jitter: back to x82 and released there still deletes.
  const jitter = stroke(row, 375, [82, 84, 82], forward.at(-1)!.now + 50)
  expect(row.armed(jitter.at(-1)!.raw)).toBe(true)
})

it('reads the takeover the last presented frame showed when a fast flick lifts off', () => {
  // r3 2100pt/s: the in-zone sample arrives after lift-off and Delete does not fire.
  const fast = contact()
  stroke(fast, 320, [280, 240, 200, 160, 120])
  fast.track(80 - inset, 100)
  expect(fast.present(-240, 100, false)).toBe(rowSwipePosition(-240, width, tall, widths))
  expect(fast.anchored()).toBe(false)
  expect(fast.armed(-240)).toBe(false)
  // r3 1300pt/s: the in-zone sample is presented a frame before lift-off; it fires.
  const caught = contact()
  stroke(caught, 375, [345, 315, 285, 255, 225, 195, 165, 135, 105, 85])
  expect(caught.anchored()).toBe(true)
  expect(caught.armed(-290)).toBe(true)
})

it('keeps the distance threshold for a non-destructive first action and never re-anchors', () => {
  // Leading Read on the tall row: 205pt cancels and 210pt commits, at any speed.
  for (const [travel, commits] of [
    [205, false],
    [210, true],
  ] as const) {
    const row = contact()
    const samples = stroke(row, 65, path(65, 65 + travel, 5))
    expect(samples.some(sample => sample.anchored)).toBe(false)
    expect(samples.at(-1)!.position).toBe(rowSwipePosition(travel, width, tall, widths))
    expect(row.armed(travel)).toBe(commits)
  }
  // A non-destructive trailing action also commits by distance, outside any zone.
  const flag: SwipeActions = { edge: 'trailing', actions: [{ id: 'flag', label: 'Flag' }] }
  const row = contact(flag)
  stroke(row, 375, path(375, 135))
  expect(row.anchored()).toBe(false)
  expect(row.armed(-240)).toBe(true)
})

it('settles the jump on the native curve from the pose it left', () => {
  // Mean normalized gap of four r3 takeovers at 0, 33, 50, 66, 83 and 100ms.
  for (const [ms, native] of [
    [0, 0.98],
    [33, 0.835],
    [50, 0.565],
    [66, 0.315],
    [83, 0.17],
    [100, 0.095],
  ] as const)
    expect(destructiveJumpRemaining(ms / 1000)).toBeCloseTo(native, 1)
  const row = contact()
  const samples = stroke(row, 375, path(375, 89))
  const takeover = samples.at(-1)!
  // The takeover frame still presents the old pose; the jump starts from it.
  expect(takeover.anchored).toBe(true)
  expect(takeover.position).toBeCloseTo(rowSwipePosition(takeover.raw, width, tall, widths), 9)
  // With the finger held, the row keeps moving until the jump has settled.
  expect(row.settling(takeover.now + 50)).toBe(true)
  const later = row.present(takeover.raw, takeover.now + 50)
  expect(later).toBeLessThan(takeover.position)
  expect(later).toBeGreaterThan(-(width - destructiveFullSwipe.anchorInset))
  expect(row.settling(takeover.now + 400)).toBe(false)
  expect(row.present(takeover.raw, takeover.now + 400)).toBeCloseTo(-371, 0)
})

it('starts a caught row with a fresh mapping and its presented pill takeover', () => {
  const first = contact()
  stroke(first, 375, path(375, 60))
  expect(first.anchored()).toBe(true)
  // A new finger catches the row while it closes from the takeover at -300pt.
  const pose = -300
  const initialRaw = rowSwipeRaw(pose, width, tall, widths)
  const caught = contact(tall, { caught: { trailing: 1 } })
  caught.track(300, 0)
  expect(caught.present(initialRaw, 0)).toBeCloseTo(pose, 6)
  expect(caught.anchored()).toBe(false)
  expect(caught.armed(initialRaw)).toBe(false)
  // Its pill takeover springs from the caught pose rather than restarting at rest.
  expect(caught.takeover('trailing', initialRaw, 0)).toBe(1)
  expect(caught.takeover('trailing', initialRaw, 200)).toBeLessThan(0.01)
})

it('uses the native 25pt recognition origin without moving before horizontal ownership', () => {
  const row = createFullSwipeContact({
    width: 984,
    configuration: tall,
    widths,
    inline: true,
    now: 0,
    origin: { finger: 880, offset: 0, time: 0 },
  })
  // Travel before horizontal ownership neither moves the row nor recognizes the pan.
  row.track(830, 16)
  expect(row.recognizedAt()).toBeUndefined()
  expect(row.present(-40, 16)).toBe(0)
  // Ownership is won on a later sample, back at 20pt of travel.
  row.track(860, 24)
  row.recognize()
  expect(row.present(-10, 24)).toBe(0)
  expect(row.recognizedAt()).toBeUndefined()
  // iPad r123 slow stroke: recognized at 25.5pt with translation -0.5pt.
  row.track(854.5, 225)
  expect(row.translation(-15.5)).toBe(-0.5)
  expect(row.recognizedAt()).toBe(225)
  row.track(740, 550)
  expect(row.translation(-126)).toBe(-115)
  expect(row.present(-126, 550)).toBe(-115)
  // The same recognizer origin survives reversal; it is not a new deadband.
  row.track(850, 600)
  expect(row.translation(-16)).toBe(-5)
})

it('restarts a fast pan from the finger 25ms after touch-down, as the median native stroke', () => {
  // iPad r123/r124/r134 fast step, delivered at 120 Hz: native holds at -52.9pt,
  // the finger at 25ms (843) to its final 790. Without the restart it held -85pt.
  const step = (samples: [number, number][]) => {
    const row = createFullSwipeContact({
      width: 984,
      configuration: tall,
      widths,
      inline: true,
      now: 0,
      origin: { finger: 900, offset: 0, time: 0 },
    })
    row.recognize()
    const held: number[] = []
    for (const [time, x] of samples) {
      row.track(x, time)
      held.push(row.translation(0))
    }
    return { row, held }
  }
  const delivered120 = step([
    [8.3, 884],
    [16.7, 864],
    [25, 843],
    [33.3, 822.5],
    [41.7, 803.5],
    [50, 790],
  ])
  // Recognized at 16.7ms (36pt), the row waits for the restart instead of moving.
  expect(delivered120.row.recognizedAt()).toBe(16.7)
  expect(delivered120.held).toEqual([0, 0, 0, -20.5, -39.5, -53])
  // WebKit may deliver the same stroke at 60 Hz: the restart interpolates to 25ms.
  const delivered60 = step([
    [16.7, 864],
    [33.3, 822.5],
    [50, 790],
  ])
  expect(delivered60.held.at(-1)).toBeCloseTo(-53, 0)
  // A stroke that is still slow at 25ms keeps the 25pt recognition origin.
  const slow = step([
    [30, 880],
    [60, 870],
    [90, 850],
  ])
  expect(slow.held.at(-1)).toBe(-25)
})

it('keeps a single Delete caption centered until a destructive takeover occurs', () => {
  const row = contact({
    edge: 'trailing',
    actions: [{ id: 'delete', label: 'Delete', role: 'destructive' }],
  })
  row.track(240, 100)
  row.present(-140, 100)
  expect(row.takeover('trailing', -140, 100)).toBe(0)
  expect(row.takeover('trailing', -140, 600)).toBe(0)
  expect(row.armed(-140)).toBe(false)
  row.track(60, 700)
  row.present(-320, 700)
  row.takeover('trailing', -320, 700)
  expect(row.takeover('trailing', -320, 1000)).toBeGreaterThan(0.99)
  expect(row.armed(-320)).toBe(true)
})

it('filters ordinary travel and retains row velocity when the finger lifts', async () => {
  const { swipeContactResponse } = await import('./swipeSpring.ts')
  const row = createFullSwipeContact({
    width: 984,
    configuration: tall,
    widths,
    inline: false,
    now: 0,
    trackingResponse: swipeContactResponse,
  })
  row.track(800, 0)
  for (let i = 1; i <= 30; i++) row.present((-85 * i) / 30, i * 10)
  const beforeRelease = row.present(-85, 300, false)
  expect(beforeRelease).toBeGreaterThan(-85)
  expect(beforeRelease).toBeLessThan(-65)
  expect(row.velocity()).toBeLessThan(-200)
  expect(row.settling(300)).toBe(true)
  const settled = row.present(-85, 1300, false)
  expect(settled).toBeCloseTo(-85, 5)
  expect(row.velocity()).toBeCloseTo(0, 5)
})
