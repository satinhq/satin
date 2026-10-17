import { describe, expect, it } from 'vitest'
import { TabMotion, TAB_INTERACTIVE_MOTION, TAB_MOTION, nearestTab } from './tabMotion.ts'
import { NATIVE_HELD_TOP_TAB } from '../webgpu/interactionProfiles.ts'

describe('tab interaction lifecycle', () => {
  it('starts an unselected-tab press on down and preserves its trajectory on up', () => {
    const held = new TabMotion()
    const tapped = new TabMotion()
    for (const motion of [held, tapped]) {
      motion.down(223, 2, 100)
      motion.sample(150, false)
      expect(motion.frame.centre).toBeGreaterThan(53)
      expect(motion.selected).toBe(0)
    }
    const releaseFrame = { ...tapped.frame }
    const releaseMix = tapped.lensMix
    tapped.up(150)
    tapped.sample(150, false)
    expect(tapped.frame).toEqual(releaseFrame)
    expect(tapped.lensMix).toBe(releaseMix)
    held.sample(200, false)
    tapped.sample(200, false)
    expect(tapped.frame.centre).toBeCloseTo(held.frame.centre, 8)
    expect(tapped.frame.height).toBeGreaterThan(52)
    held.sample(1100, false)
    expect(held.active).toBe(true)
    expect(held.lensMix).toBe(1)
    held.up(1100)
    held.sample(1100, false)
    expect(held.lensMix).toBe(1)
    held.sample(1800, false)
    expect(held.selected).toBe(2)
    expect(held.active).toBe(false)
  })
  it('keeps selection until release settles, including the native halfway destination', () => {
    const motion = new TabMotion()
    motion.down(53, 0, 0)
    motion.move(179)
    motion.sample(600, false)
    expect(motion.selected).toBe(0)
    motion.up(600)
    motion.sample(900, false)
    expect(motion.selected).toBe(0)
    expect(motion.sample(1300, false)).toBe(1)
    expect(motion.frame).toEqual({ centre: 138, width: 96, height: 52 })
    expect(nearestTab(180.5)).toBe(1)
  })

  it('cancels a drag back to the committed tab and permits the next gesture', () => {
    const motion = new TabMotion()
    motion.reset(1)
    motion.down(138, 1, 100)
    motion.move(308)
    motion.sample(300, false)
    motion.up(300, true)
    motion.sample(1000, false)
    expect(motion.selected).toBe(1)
    expect(motion.active).toBe(false)
    expect(motion.down(138, 1, 1100)).toBe(true)
    expect(motion.down(223, 2, 1110)).toBe(false)
  })

  it('jumps to the selected endpoint when Reduced Motion changes during travel', () => {
    const motion = new TabMotion()
    motion.select(3, 100)
    motion.sample(200, false)
    expect(motion.selected).toBe(0)
    expect(motion.sample(201, true)).toBe(3)
    expect(motion.frame).toEqual({ centre: 308, width: 96, height: 52 })
    expect(motion.active).toBe(false)
  })

  it('retargets from the presented position without a discontinuity', () => {
    const motion = new TabMotion()
    motion.select(3, 100)
    motion.sample(200, false)
    const before = { ...motion.frame }
    motion.select(0, 200)
    motion.sample(200, false)
    expect(motion.frame).toEqual(before)
    motion.sample(900, false)
    expect(motion.frame.centre).toBe(53)
  })

  it('preserves the presented lens when a second finger-down interrupts travel', () => {
    const motion = new TabMotion()
    motion.select(3, 100)
    motion.sample(200, false)
    const before = { ...motion.frame }
    const lens = motion.lensMix
    motion.down(53, 0, 200)
    motion.sample(200, false)
    expect(motion.frame).toEqual(before)
    expect(motion.lensMix).toBe(lens)
  })

  it('keeps a held clear lens continuous when a drag releases onto another tab', () => {
    const motion = new TabMotion()
    motion.down(53, 0, 100)
    motion.move(179)
    motion.sample(700, false)
    expect(motion.lensMix).toBe(1)
    motion.up(700)
    motion.sample(700, false)
    expect(motion.lensMix).toBe(1)
    motion.sample(750, false)
    expect(motion.lensMix).toBeGreaterThan(0)
    expect(motion.lensMix).toBeLessThan(1)
    motion.sample(1000, false)
    expect(motion.lensMix).toBe(0)
    motion.sample(1400, false)
    expect(motion.lensMix).toBe(0)
    expect(motion.selected).toBe(1)
  })
})

it('clear lens follows contact, returns to frost and skips Reduced Motion', () => {
  const motion = new TabMotion()
  motion.down(53, 0, 100)
  motion.sample(400, false)
  expect(motion.lensMix).toBe(1)
  motion.up(400)
  motion.sample(450, false)
  expect(motion.lensMix).toBeGreaterThan(0)
  expect(motion.lensMix).toBeLessThan(1)
  motion.sample(1100, false)
  expect(motion.lensMix).toBe(0)
  motion.down(53, 0, 1200)
  motion.sample(1600, true)
  expect(motion.lensMix).toBe(0)
})

// The stationary endpoint is delivered repeatedly by the Simulator HID path.
// Its displayed centre has stopped; pressure against a clamp is not velocity.
it.each([
  [-16, 0, 53],
  [376, 3, 308],
])('relaxes strain while held past end %s', (edge, selected, centre) => {
  const motion = new TabMotion()
  motion.reset(selected)
  motion.down(centre, selected, 100)
  for (let now = 116; now <= 2100; now += 16) {
    motion.move(edge)
    motion.sample(now, false)
  }
  expect(motion.lensMix).toBe(1)
  expect(motion.frame.width).toBeCloseTo(119, 2)
  expect(motion.frame.height).toBeCloseTo(73, 2)
})

it('always submits the exact resting capsule after completed and cancelled boundary gestures', () => {
  for (const hz of [30, 60, 120])
    for (const initial of [0, 1, 2, 3]) {
      for (const edge of [-100, -16, 0, 53, 308, 360, 500]) {
        for (const duration of [16, 100, 200, 1600])
          for (const hold of [0, 800]) {
            for (const cancelled of [false, true])
              for (const reduced of [false, true]) {
                const motion = new TabMotion(),
                  centres = [53, 138, 223, 308]
                motion.reset(initial)
                motion.down(centres[initial], initial, 100)
                let now = 100
                for (; now < 100 + duration; now += 1000 / hz) {
                  motion.move(
                    centres[initial] + ((edge - centres[initial]) * (now - 100)) / duration,
                  )
                  motion.sample(now, reduced)
                }
                motion.move(edge)
                motion.sample(now, reduced)
                const arrival = now
                for (; now < arrival + hold; now += 1000 / hz) motion.sample(now, reduced)
                motion.up(now, cancelled)
                const target = cancelled ? initial : nearestTab(edge)
                motion.sample(now + 651, reduced)
                expect(motion.active).toBe(false)
                expect(motion.lensMix).toBe(0)
                expect(motion.selected).toBe(target)
                expect(motion.frame).toEqual({ centre: centres[target], width: 96, height: 52 })
                expect(motion.capsule()).toEqual({
                  centerX: centres[target],
                  centerY: 31,
                  halfWidth: 48,
                  halfHeight: 26,
                  radius: 26,
                })
                motion.sample(now + 2000, reduced)
                expect(motion.frame).toEqual({ centre: centres[target], width: 96, height: 52 })
              }
          }
      }
    }
})

it('carries flick velocity and dimensions across finger-up, including after frost', () => {
  const motion = new TabMotion()
  motion.down(53, 0, 100)
  for (let t = 110; t <= 400; t += 10) motion.sample(t, false)
  for (let t = 410; t <= 500; t += 10) {
    motion.move(53 + (t - 400) * 1.7)
    motion.sample(t, false)
  }
  const before = { ...motion.frame }
  motion.up(500)
  motion.sample(500, false)
  expect(motion.frame).toEqual(before)
  motion.sample(501, false)
  expect(motion.frame.centre - before.centre).toBeGreaterThan(1)
  for (let t = 510; t <= 640; t += 10) motion.sample(t, false)
  expect(motion.lensMix).toBe(0)
  expect(motion.active).toBe(true)
  expect(motion.frame.height).not.toBe(52)
  motion.sample(1151, false)
  expect(motion.frame).toEqual({ centre: 223, width: 96, height: 52 })
})

it('keeps a frosted release alive through its small size rebound', () => {
  const motion = new TabMotion()
  motion.down(223, 2, 100)
  for (let t = 110; t <= 1000; t += 10) motion.sample(t, false)
  motion.up(1000)
  for (let t = 1010; t <= 1240; t += 10) motion.sample(t, false)
  expect(motion.lensMix).toBe(0)
  expect(motion.frame.height).toBeLessThan(52)
  expect(motion.active).toBe(true)
  motion.sample(1651, false)
  expect(motion.frame).toEqual({ centre: 223, width: 96, height: 52 })
})

it('preserves the frosted deformed frame when another contact interrupts release', () => {
  const motion = new TabMotion()
  motion.down(53, 0, 100)
  for (let t = 110; t <= 400; t += 10) motion.sample(t, false)
  for (let t = 410; t <= 500; t += 10) {
    motion.move(53 + (t - 400) * 1.7)
    motion.sample(t, false)
  }
  motion.up(500)
  for (let t = 510; t <= 700; t += 10) motion.sample(t, false)
  const before = { ...motion.frame }
  expect(motion.lensMix).toBe(0)
  motion.down(138, 1, 700)
  motion.sample(700, false)
  expect(motion.frame).toEqual(before)
})

it('preserves the configured two-tab endpoint through the final sample', () => {
  const motion = new TabMotion()
  motion.configure([105.5, 294.5], 184, 52, 398)
  motion.down(294.5, 1, 100)
  motion.sample(117, false)
  motion.up(130)
  for (let at = 134; at < 1200; at += 17) motion.sample(at, false)
  expect(motion.active).toBe(false)
  expect(motion.frame).toEqual({ centre: 294.5, width: 184, height: 52 })
  expect(motion.lensMix).toBe(0)
})

it('returns the released selection while preserving the in-flight pill', () => {
  const motion = new TabMotion()
  motion.down(138, 1, 100)
  motion.sample(150, false)
  const before = { ...motion.frame }
  expect(motion.up(150)).toBe(1)
  expect(motion.active).toBe(true)
  expect(motion.frame).toEqual(before)
  expect(motion.up(160)).toBeUndefined()
  motion.sample(200, false)
  motion.down(223, 2, 210)
  expect(motion.up(220, true, 1)).toBe(1)
  motion.sample(1000, false)
  expect(motion.selected).toBe(1)
})

it('uses the native tab attack and releases continuously from an interrupted press', () => {
  const motion = new TabMotion(TAB_INTERACTIVE_MOTION, { widthDelta: 23, height: 73, edgeShift: 0 })
  motion.configure([100, 250], 107.5, 54, 360)
  motion.down(100, 0, 1000)
  motion.sample(1048, false)
  expect((motion.frame.height - 54) / 19).toBeGreaterThan(0.18)
  motion.sample(1165, false)
  expect((motion.frame.height - 54) / 19).toBeGreaterThan(0.9)
  expect((motion.frame.height - 54) / 19).toBeLessThan(0.94)
  const height = motion.frame.height
  motion.up(1165)
  motion.sample(1165, false)
  expect(motion.frame.height).toBe(height)
  motion.sample(2000, false)
  expect(motion.frame.height).toBe(54)
  expect(motion.needsFrame).toBe(false)
})

it('shares native attack timing with consumer tab geometries', () => {
  const motion = new TabMotion(TAB_INTERACTIVE_MOTION)
  motion.configure([100, 300], 180, 54, 400)
  motion.down(100, 0, 1000)
  motion.sample(1165, false)
  expect(motion.lensMix).toBeGreaterThan(0.9)
  expect(motion.lensMix).toBeLessThan(0.94)
})

it('snaps the first configuration and an unrelated idle selection', () => {
  const motion = new TabMotion()
  motion.configure([50, 150, 250], 80, 52, 300, { selected: 2 })
  expect(motion.frame.centre).toBe(250)
  expect(motion.active).toBe(false)
  motion.configure([50, 150, 250], 80, 52, 300, { selected: 1 })
  expect(motion.frame.centre).toBe(150)
  expect(motion.active).toBe(false)
})

it('ignores an identical configuration during selection travel', () => {
  const motion = new TabMotion()
  motion.configure([50, 150, 250], 80, 52, 300, { selected: 0 })
  motion.select(2, 100)
  motion.sample(150, false)
  const before = { ...motion.frame }
  motion.configure([50, 150, 250], 80, 52, 300, { selected: 2 })
  expect(motion.frame).toEqual(before)
  expect(motion.active).toBe(true)
  for (const at of [166, 183, 200]) {
    motion.sample(at, false)
    expect(motion.frame.centre).toBeGreaterThan(50)
    expect(motion.frame.centre).toBeLessThan(250)
  }
  motion.sample(1000, false)
  expect(motion.frame.centre).toBe(250)
})

it('retargets changed geometry from the current position and velocity', () => {
  const motion = new TabMotion()
  motion.configure([50, 150, 250], 80, 52, 400, { selected: 0 })
  motion.select(2, 100)
  motion.sample(140, false)
  motion.sample(150, false)
  const centre = motion.frame.centre
  motion.configure([60, 180, 320], 80, 52, 400, { selected: 2 })
  expect(motion.frame.centre).toBe(centre)
  motion.sample(150, false)
  expect(motion.frame.centre).toBeCloseTo(centre, 10)
  motion.sample(166, false)
  expect(motion.frame.centre).toBeGreaterThan(centre)
  expect(motion.frame.centre).toBeLessThan(320)
  motion.sample(1000, false)
  expect(motion.frame.centre).toBe(320)
})

it('keeps a held drag alive through geometry and option reconfiguration', () => {
  const motion = new TabMotion()
  motion.configure([50, 150, 250], 80, 52, 400, { selected: 0 })
  motion.down(50, 0, 100)
  motion.move(180)
  motion.sample(150, false)
  motion.configure([60, 180, 320], 80, 52, 400, { selected: 0, parameters: TAB_INTERACTIVE_MOTION })
  expect(motion.active).toBe(true)
  motion.move(320)
  expect(motion.up(170)).toBe(2)
  motion.sample(1000, false)
  expect(motion.frame.centre).toBe(320)
})

it('lets a late geometry retarget settle on its own clock', () => {
  const motion = new TabMotion()
  motion.configure([50, 150, 250], 96, 52, 360, { selected: 0 })
  motion.select(2, 100)
  motion.sample(700, false)
  const previousCentre = motion.frame.centre
  motion.configure([60, 180, 400], 96, 52, 440, { selected: 2 })
  motion.sample(700, false)
  expect(motion.frame.centre).toBe(previousCentre)
  motion.sample(770, false)
  expect(motion.frame.centre).toBeGreaterThan(previousCentre)
  expect(motion.frame.centre).toBeLessThan(400)
  motion.sample(1400, false)
  expect(motion.frame.centre).toBe(400)
})

it('keeps reduced-motion selection immediate after reconfiguration', () => {
  const motion = new TabMotion()
  motion.configure([50, 150, 250], 96, 52, 360, { selected: 0 })
  motion.select(2, 100)
  motion.sample(150, false)
  motion.configure([60, 180, 320], 96, 52, 400, { selected: 2 })
  motion.sample(166, true)
  expect(motion.frame.centre).toBe(320)
  expect(motion.needsFrame).toBe(false)
})

it('keeps an undragged press alive through geometry reconfiguration', () => {
  const motion = new TabMotion()
  motion.configure([50, 150, 250], 80, 52, 400, { selected: 0 })
  motion.down(250, 2, 100)
  motion.sample(150, false)
  const previousCentre = motion.frame.centre
  motion.configure([60, 180, 320], 80, 52, 400, { selected: 2 })
  motion.sample(150, false)
  expect(motion.frame.centre).toBeCloseTo(previousCentre, 10)
  motion.sample(166, false)
  expect(motion.frame.centre).toBeGreaterThan(previousCentre)
  expect(motion.frame.centre).toBeLessThan(320)
  expect(motion.frame.height).toBeGreaterThan(52)
  expect(motion.up(180)).toBe(2)
})

it('treats equal parameter values from separate config messages as unchanged', () => {
  const motion = new TabMotion()
  const control = new TabMotion()
  for (const current of [motion, control]) {
    current.configure([50, 150, 250], 80, 52, 300, { selected: 0, parameters: { ...TAB_MOTION } })
    current.select(2, 1000)
    current.sample(1080, false)
  }
  motion.configure([50, 150, 250], 80, 52, 300, { selected: 2, parameters: { ...TAB_MOTION } })
  for (const time of [1080, 1120, 1180, 1300]) {
    motion.sample(time, false)
    control.sample(time, false)
    expect(motion.frame.centre).toBeCloseTo(control.frame.centre, 10)
  }
})

it('rests on, and releases a drag into, each tab of an unequal-width iPad top bar', () => {
  // iPad native iPadOS 27 bar: label-width items (83, 85, 77 pt), 36 pt pills, 44 pt bar.
  const motion = new TabMotion(TAB_INTERACTIVE_MOTION)
  const centres = [45.5, 129.5, 210.5]
  const widths = [83, 85, 77]
  motion.configure(centres, 83, 36, 253, {
    selected: 0,
    centerY: 22,
    parameters: TAB_INTERACTIVE_MOTION,
    heldGeometry: NATIVE_HELD_TOP_TAB,
    widths,
  })
  motion.sample(0, false)
  expect(motion.frame).toEqual({ centre: 45.5, width: 83, height: 36 })
  // Native: dragging down off the bar does not cancel; release selects the tab under the lens.
  motion.down(45.5, 0, 100)
  motion.move(210)
  for (let at = 116; at <= 900; at += 16) motion.sample(at, false)
  // Held: the measured 55.5 pt lens, 24.4 pt wider than the 77 pt pill under the finger.
  expect(motion.frame.height).toBeCloseTo(55.5, 0)
  expect(motion.frame.width).toBeCloseTo(77 + 24.4, 0)
  expect(motion.up(900)).toBe(2)
  for (let at = 916; at <= 2500; at += 16) motion.sample(at, false)
  expect(motion.selected).toBe(2)
  expect(motion.frame).toEqual({ centre: 210.5, width: 77, height: 36 })
})
