import { expect, it } from 'vitest'
import {
  ancestorScale,
  chevronKeyframes,
  padSubmenuFrame,
  phoneSubmenuFrame,
  submenuContentAt,
  submenuGlassFrames,
  titleOnRow,
} from './submenuMotion.ts'

it('places submenus where stock SwiftUI does: stacked on iPhone, cascaded on iPad', () => {
  const screen = { x: -1000, y: -1000, width: 3000, height: 3000 }
  // iPhone 17 Pro Max Simulator, iOS 27.0, in the root platter's coordinates: a 250 x 146 pt root
  // with its second row at 52 pt; the 250 x 208 pt child settles 38.44 pt below the root's top.
  const phone = phoneSubmenuFrame(
    { x: 0, y: 0, width: 250, height: 146 },
    { x: 10, y: 52, width: 230, height: 42 },
    ancestorScale(1),
    { width: 250, height: 208 },
    screen,
  )
  expect(phone.x).toBe(0)
  expect(phone.y).toBeCloseTo(354.77 - 316.33, 2)
  // iPad accessibility frames span each platter's width: the parent's x 394..630 and the
  // child's x 618..853 (12 pt overlap). The opening row starts at y 329, the child's first at 328.
  const pad = padSubmenuFrame(
    { x: 394, y: 300, width: 236, height: 130 },
    { x: 402, y: 329, width: 220, height: 36 },
    { width: 235, height: 122, firstRowOffset: 7 },
    screen,
  )
  expect(pad.x).toBe(618)
  expect(pad.y + 7).toBe(328)
  expect(ancestorScale(2)).toBeCloseTo(0.94, 5)
})

it('collapses a phone submenu so its title lands exactly on the row that opened it', () => {
  // Owner, Oct 13: the React row shrank, landed about 8 pt low, then snapped up and swapped its
  // chevron. Native (iOS 27.0 Simulator trace) keeps the child's rows at full size: the glass
  // shrinks around the title row and the rows drift until the title covers the parent's row.
  const row = { x: 10, y: 114.8, width: 230, height: 42 }
  const titleOffset = { x: 10, y: 10 }
  const expanded = { x: 0, y: 45.2, width: 250, height: 334 }
  const end = titleOnRow(row, titleOffset)
  const landed = submenuContentAt(expanded, end, 'back', 5000)
  expect(landed.x + titleOffset.x).toBeCloseTo(row.x, 3)
  expect(landed.y + titleOffset.y).toBeCloseTo(row.y, 3)
  // The glass collapses to the row itself, so the platter can leave without anything moving.
  const glass = submenuGlassFrames(expanded, row, 'back').frames
  expect(glass.at(-1)).toEqual(row)
  // Opening starts from that same place: the title does not jump when the platter appears.
  const opening = submenuContentAt(end, expanded, 'open', 0)
  expect(opening.y + titleOffset.y).toBeCloseTo(row.y, 3)
})

it('grows the submenu glass continuously inside a still envelope', () => {
  const from = { x: 10, y: 114.8, width: 230, height: 42 }
  const to = { x: 0, y: 45.2, width: 250, height: 334 }
  const { frames, duration } = submenuGlassFrames(from, to, 'open')
  expect(frames[0]).toEqual(from)
  expect(frames.at(-1)).toEqual(to)
  expect(duration).toBeGreaterThan(200)
  for (let index = 1; index < frames.length; index++) {
    // No step larger than the springs allow at 120 Hz: the edge never jumps.
    expect(Math.abs(frames[index]!.height - frames[index - 1]!.height)).toBeLessThan(25)
  }
})

it('turns the title chevron instead of swapping it (native trace: down to forward on back)', () => {
  const back = chevronKeyframes('back').keyframes
  expect(back[0]!.transform).toBe('rotate(0deg)')
  expect(back.at(-1)!.transform).toBe('rotate(-90deg)')
  const open = chevronKeyframes('open').keyframes
  expect(open[0]!.transform).toBe('rotate(-90deg)')
  expect(open.at(-1)!.transform).toBe('rotate(0deg)')
  const angles = back.map(frame => Number.parseFloat(String(frame.transform).slice(7)))
  for (let index = 1; index < angles.length; index++)
    expect(Math.abs(angles[index]! - angles[index - 1]!)).toBeLessThan(15)
})
