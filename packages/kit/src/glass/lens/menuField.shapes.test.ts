import { describe, expect, it } from 'vitest'
import { glassFieldDistance, roundedRectDistance, type GlassFieldMember } from '../fieldGeometry.ts'
import {
  MENU_FIELD,
  MENU_FIELD_CURVES,
  keyed,
  menuFieldFrame,
  menuSeed,
  scaledMenuTrigger,
  triggerElongation,
} from './menuField.ts'
import { menuMorphDuration, sampleMenuMorph } from './menuMorphMotion.ts'

// Triggers of the native controls reference (iPhone 17 Pro Max Simulator, iOS 27.0, points):
// phase-morph-shapes-notes.md.
type Rect = { x: number; y: number; width: number; height: number }
const member = (rect: Rect, radius = Math.min(rect.width, rect.height) / 2): GlassFieldMember => ({
  centerX: rect.x + rect.width / 2,
  centerY: rect.y + rect.height / 2,
  halfWidth: rect.width / 2,
  halfHeight: rect.height / 2,
  radius,
})
const panelBelow = (centerX: number, top: number) => ({
  x: centerX - 125,
  y: top,
  width: 250,
  height: 188,
})
const TRIGGERS = {
  circle: {
    home: member({ x: 376, y: 62, width: 44, height: 44 }),
    panelFrame: { x: 170, y: 62, width: 250, height: 188 },
    anchor: undefined,
  },
  capsule: {
    home: member({ x: 155.67, y: 158, width: 129, height: 50.33 }),
    panelFrame: panelBelow(220.17, 158),
    anchor: undefined,
  },
  wide: {
    home: member({ x: 20, y: 158, width: 400, height: 50.33 }),
    panelFrame: panelBelow(220, 158),
    anchor: undefined,
  },
  groupLast: {
    home: member({ x: 268, y: 62, width: 152, height: 44 }),
    panelFrame: { x: 170, y: 62, width: 250, height: 188 },
    anchor: { x: 394.7, y: 84 },
  },
  groupFirst: {
    home: member({ x: 268, y: 62, width: 152, height: 44 }),
    panelFrame: { x: 170, y: 62, width: 250, height: 188 },
    anchor: { x: 293.3, y: 84 },
  },
} as const
type Trigger = (typeof TRIGGERS)[keyof typeof TRIGGERS]

/** The travelling member the scene passes in (regionScene.ts): between the seed and the panel. */
function travelling(trigger: Trigger, direction: 'open' | 'close', ms: number) {
  const { pose } = sampleMenuMorph(direction, ms, 'phone')
  const seed = menuSeed(trigger.home, trigger.anchor),
    panel = member(trigger.panelFrame, 32)
  const mix = (from: number, to: number, share: number) => from + (to - from) * share
  const halfWidth = mix(seed.halfWidth, panel.halfWidth, pose.width),
    halfHeight = mix(seed.halfHeight, panel.halfHeight, pose.height)
  return {
    centerX: mix(seed.centerX, panel.centerX, pose.centerX),
    centerY: mix(seed.centerY, panel.centerY, pose.centerY),
    halfWidth,
    halfHeight,
    radius: Math.min(mix(seed.radius, panel.radius, pose.width), halfWidth, halfHeight),
  }
}
const glyphOf = (trigger: Trigger) => {
  const { home } = trigger
  const frame = {
    x: home.centerX - home.halfWidth,
    y: home.centerY - home.halfHeight,
    width: home.halfWidth * 2,
    height: home.halfHeight * 2,
  }
  return { source: { ...frame, x: 0, y: 0 }, frame }
}
const frameAt = (trigger: Trigger, direction: 'open' | 'close', ms: number) =>
  menuFieldFrame({
    direction,
    ms,
    panel: travelling(trigger, direction, ms),
    home: trigger.home,
    anchor: trigger.anchor,
    panelFrame: trigger.panelFrame,
    glyph: glyphOf(trigger),
  })

/** Horizontal and vertical extent of the field's interior, on a half-point grid. */
function outline(members: readonly GlassFieldMember[], blendRadius: number) {
  const reach = (side: 'halfWidth' | 'halfHeight', center: 'centerX' | 'centerY', sign: number) =>
    sign > 0
      ? Math.max(...members.map(m => m[center] + m[side])) + blendRadius
      : Math.min(...members.map(m => m[center] - m[side])) - blendRadius
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
  // The scan bounds are constant; recomputing them at every grid point allocates millions of arrays.
  const minimumX = reach('halfWidth', 'centerX', -1)
  const maximumX = reach('halfWidth', 'centerX', 1)
  const minimumY = reach('halfHeight', 'centerY', -1)
  const maximumY = reach('halfHeight', 'centerY', 1)
  for (let y = minimumY; y <= maximumY; y += 0.5)
    for (let x = minimumX; x <= maximumX; x += 0.5)
      if (glassFieldDistance(x, y, members, blendRadius) <= 0) {
        bounds.left = Math.min(bounds.left, x)
        bounds.right = Math.max(bounds.right, x)
        bounds.top = Math.min(bounds.top, y)
        bounds.bottom = Math.max(bounds.bottom, y)
      }
  return { ...bounds, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }
}

/** Same half-point grid as outline(), but only the occupied columns determine width. */
function outlineWidth(members: readonly GlassFieldMember[], blendRadius: number) {
  const axis = (side: 'halfWidth' | 'halfHeight', center: 'centerX' | 'centerY') => {
    const minimum = Math.min(...members.map(member => member[center] - member[side])) - blendRadius
    const maximum = Math.max(...members.map(member => member[center] + member[side])) + blendRadius
    const values: number[] = []
    for (let value = minimum; value <= maximum; value += 0.5) values.push(value)
    return values
  }
  const columns = axis('halfWidth', 'centerX')
  const rows = axis('halfHeight', 'centerY')
  const occupiedColumn = (x: number) =>
    rows.some(y => glassFieldDistance(x, y, members, blendRadius) <= 0)
  // The first occupied column is exactly the exhaustive grid's minimum. Reverse
  // the same coordinates for its maximum; this also covers disconnected fields.
  const left = columns.find(occupiedColumn) ?? Infinity
  const right = [...columns].reverse().find(occupiedColumn) ?? -Infinity
  return right - left
}

describe('the round part of a trigger', () => {
  it('measures how far a trigger is from round', () => {
    expect(triggerElongation(TRIGGERS.circle.home)).toBe(0)
    expect(triggerElongation(TRIGGERS.capsule.home)).toBe(1)
    expect(triggerElongation(TRIGGERS.wide.home)).toBe(1)
    expect(triggerElongation(TRIGGERS.groupLast.home)).toBe(1)
    // A nearly round member (58 x 47: one of three blended glass buttons) counts as round, as
    // does anything at least two thirds as thick as it is long.
    expect(triggerElongation({ halfWidth: 29, halfHeight: 23.5 })).toBe(0)
    expect(triggerElongation({ halfWidth: 30, halfHeight: 20 })).toBe(0)
    // Between the measured shapes the two behaviours blend.
    const between = triggerElongation({ halfWidth: 40, halfHeight: 22 })
    expect(between).toBeGreaterThan(0)
    expect(between).toBeLessThan(1)
    expect(menuSeed(member({ x: 0, y: 0, width: 80, height: 44 })).halfWidth).toBeGreaterThan(22)
    expect(menuSeed(member({ x: 0, y: 0, width: 80, height: 44 })).halfWidth).toBeLessThan(40)
    expect(triggerElongation({ halfWidth: 0, halfHeight: 0 })).toBe(0)
  })

  it('is the circle itself, and a circle as thick as a longer trigger at its menu button', () => {
    expect(menuSeed(TRIGGERS.circle.home)).toBe(TRIGGERS.circle.home)
    // A mildly oblong trigger keeps the circle's model: its whole glass is the drop.
    const oblong = member({ x: 70, y: 180, width: 60, height: 40 })
    expect(menuSeed(oblong, { x: 75, y: 200 })).toBe(oblong)
    const capsule = menuSeed(TRIGGERS.capsule.home)
    expect(capsule).toEqual({
      centerX: TRIGGERS.capsule.home.centerX,
      centerY: TRIGGERS.capsule.home.centerY,
      halfWidth: 50.33 / 2,
      halfHeight: 50.33 / 2,
      radius: 50.33 / 2,
    })
    // A toolbar group's seed is under the member that opened the menu, inside the group.
    expect(menuSeed(TRIGGERS.groupLast.home, TRIGGERS.groupLast.anchor).centerX).toBeCloseTo(394.7)
    expect(menuSeed(TRIGGERS.groupFirst.home, TRIGGERS.groupFirst.anchor).centerX).toBeCloseTo(
      293.3,
    )
    expect(menuSeed(TRIGGERS.groupLast.home, { x: 9999, y: 84 }).centerX).toBe(420 - 22)
    expect(menuSeed(TRIGGERS.groupLast.home, { x: -9999, y: 84 }).centerX).toBe(268 + 22)
  })
})

describe('a scaled trigger', () => {
  it('scales a circle uniformly about its centre at every scale', () => {
    const { home } = TRIGGERS.circle
    for (const scale of [0.01, 0.3, 0.6, 0.93, 1, 1.09])
      expect(scaledMenuTrigger(home, scale)).toEqual({
        centerX: home.centerX,
        centerY: home.centerY,
        halfWidth: home.halfWidth * scale,
        halfHeight: home.halfHeight * scale,
        radius: Math.min(home.radius * scale, home.halfWidth * scale, home.halfHeight * scale),
      })
  })

  it('shortens a long trigger faster than it thins, as native does', () => {
    const { home } = TRIGGERS.wide
    // Native's full-width button at 3x: re-forming, it is back to 0.50, 0.67, 0.80 and 0.90 of
    // its width when its height is at 0.75, 0.84, 0.91 and 0.95; contracting, at 0.71 and 0.47 of
    // its width at 0.90 and 0.74 of its height.
    for (const [heightShare, widthShare] of [
      [0.75, 0.5],
      [0.84, 0.67],
      [0.91, 0.8],
      [0.95, 0.9],
      [0.9, 0.71],
      [0.74, 0.47],
    ]) {
      const scaled = scaledMenuTrigger(home, heightShare)
      expect(scaled.halfHeight / home.halfHeight).toBeCloseTo(heightShare)
      expect(Math.abs(scaled.halfWidth / home.halfWidth - widthShare)).toBeLessThan(0.08)
      expect(scaled.radius).toBeCloseTo(scaled.halfHeight)
      expect(scaled.centerX).toBeCloseTo(home.centerX)
    }
    // The pressed growth is uniform, and rest is exactly the trigger.
    expect(scaledMenuTrigger(home, 1)).toEqual(home)
    expect(scaledMenuTrigger(home, 1.02).halfWidth).toBeCloseTo(home.halfWidth * 1.02)
  })

  it('contracts a toolbar group toward the member that opened the menu', () => {
    const { home } = TRIGGERS.groupLast
    const toLast = scaledMenuTrigger(home, 0.7, menuSeed(home, TRIGGERS.groupLast.anchor))
    const toFirst = scaledMenuTrigger(home, 0.7, menuSeed(home, TRIGGERS.groupFirst.anchor))
    // Native at about this stage: 301...403 (menu last) and 275...383 (menu first) of 268...420.
    expect(toLast.centerX - toLast.halfWidth).toBeGreaterThan(300)
    expect(toLast.centerX + toLast.halfWidth).toBeGreaterThan(410)
    expect(toFirst.centerX - toFirst.halfWidth).toBeLessThan(280)
    expect(toFirst.centerX + toFirst.halfWidth).toBeLessThan(385)
    expect(toLast.halfHeight).toBeCloseTo(home.halfHeight * 0.7)
  })
})

describe.each(Object.entries(TRIGGERS))('button → menu from a %s trigger', (name, trigger) => {
  it('opens as the trigger, gathers into a round drop and ends as the panel', () => {
    const start = frameAt(trigger, 'open', 0)
    const first = outline(start.members, start.blendRadius)
    // (The outline is sampled on a half-point grid.)
    expect(Math.abs(first.width - trigger.home.halfWidth * 2)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(first.height - trigger.home.halfHeight * 2)).toBeLessThanOrEqual(1.5)
    // Once the trigger is absorbed one member is left: the drop, far narrower than the panel
    // (a full-width button must not slide straight into the panel's width).
    const absorbed = MENU_FIELD_CURVES.open.trigger.at(-1)![0]
    const drop = frameAt(trigger, 'open', absorbed + 1)
    expect(drop.members).toHaveLength(1)
    expect(drop.members[0].halfWidth * 2).toBeLessThan(150)
    expect(drop.members[0].halfWidth / drop.members[0].halfHeight).toBeGreaterThan(0.8)
    expect(drop.members[0].halfWidth / drop.members[0].halfHeight).toBeLessThan(1.25)
    const end = frameAt(trigger, 'open', menuMorphDuration('open', 'phone'))
    expect(end.members).toHaveLength(1)
    expect(end.members[0].halfWidth * 2).toBeCloseTo(250, 0)
    expect(end.members[0].halfHeight * 2).toBeCloseTo(188, 0)
  })

  it('never leaves a detached droplet while the trigger is absorbed', () => {
    for (let ms = 0; ms <= 140; ms += 4) {
      const { members, blendRadius } = frameAt(trigger, 'open', ms)
      if (members.length < 2) continue
      const [button, drop] = members
      // The two members overlap or touch: the field between their centres stays inside.
      for (let share = 0; share <= 1; share += 0.1) {
        const x = button.centerX + (drop.centerX - button.centerX) * share,
          y = button.centerY + (drop.centerY - button.centerY) * share
        expect(glassFieldDistance(x, y, members, blendRadius)).toBeLessThanOrEqual(0.5)
      }
    }
  })

  it('closes back into the trigger: the button re-forms on the body and ends at home', () => {
    const early = frameAt(trigger, 'close', 0)
    expect(early.members).toHaveLength(1)
    expect(early.members[0].halfWidth * 2).toBeCloseTo(250, 0)
    for (let ms = 0; ms < 420; ms += 4) {
      const { members } = frameAt(trigger, 'close', ms)
      if (members.length < 2) continue
      const [button, body] = members
      expect(
        roundedRectDistance(button.centerX, button.centerY, body),
        `${name} at ${ms} ms`,
      ).toBeLessThanOrEqual(MENU_FIELD.closeEmbed * button.radius + 1e-6)
    }
    // Late in the close only the button is left, within its settle of home.
    const late = frameAt(trigger, 'close', 520)
    expect(late.members).toHaveLength(1)
    expect(Math.abs(late.members[0].centerX - trigger.home.centerX)).toBeLessThan(1)
    expect(Math.abs(late.members[0].centerY - trigger.home.centerY)).toBeLessThan(1.5)
    expect(late.members[0].halfWidth / trigger.home.halfWidth).toBeGreaterThan(0.99)
    // Native's full-width button passes its width by 5 pt a side (1.025) before it rests.
    expect(late.members[0].halfWidth / trigger.home.halfWidth).toBeLessThan(1.03)
    const settled = menuFieldFrame({
      direction: 'close',
      ms: 0,
      panel: travelling(trigger, 'close', 9999),
      home: trigger.home,
      anchor: trigger.anchor,
      panelFrame: trigger.panelFrame,
      settled: true,
    })
    expect(settled.members).toEqual([trigger.home])
  })

  it('passes home by the same share of the travel as the circle, on the side away from the menu', () => {
    let past = 0
    for (let ms = 150; ms < 500; ms += 4) {
      const { members } = frameAt(trigger, 'close', ms)
      past = Math.min(past, members[0].centerY - trigger.home.centerY)
    }
    const travel = trigger.panelFrame.y + 94 - trigger.home.centerY
    // Native: 11 to 13.5 pt above home for a menu that hangs 69 to 72 pt below it.
    expect(-past / travel).toBeGreaterThan(0.14)
    expect(-past / travel).toBeLessThan(0.2)
  })
})

it('carries a long trigger’s label at the scale of its round part; a circle’s glyph keeps its size', () => {
  const head = (trigger: Trigger, ms: number) => {
    const frame = frameAt(trigger, 'close', ms)
    return { button: frame.members[0], glyph: frame.ink[0]?.frame }
  }
  // +180 ms of the close: the button is about three quarters grown.
  const wide = head(TRIGGERS.wide, 180)
  const share = wide.button.halfHeight / TRIGGERS.wide.home.halfHeight
  expect(share).toBeGreaterThan(0.5)
  expect(share).toBeLessThan(0.95)
  expect(wide.glyph!.height / 50.33).toBeCloseTo(share)
  expect(wide.glyph!.width / 400).toBeCloseTo(share)
  // The label stays centred on the re-forming button.
  expect(wide.glyph!.x + wide.glyph!.width / 2).toBeCloseTo(wide.button.centerX)
  expect(wide.glyph!.y + wide.glyph!.height / 2).toBeCloseTo(wide.button.centerY)
  const circle = head(TRIGGERS.circle, 180)
  expect(circle.glyph!.width).toBe(44)
  expect(circle.glyph!.height).toBe(44)
  expect(circle.glyph!.x + 22).toBeCloseTo(circle.button.centerX)
})

// Native outline widths (points) at ms after the touch that starts the transition,
// mapped to the model's clock (open: +4 ms; close: the dismissing touch-up - 44 ms).
// Keep every measured frame and every +/- two-frame sample, with separate failure locations.
it.each([
  ['open', 85, 375],
  ['open', 98, 287],
  ['open', 118, 188],
  ['open', 136, 126],
  ['open', 162, 154],
  ['open', 205, 199],
  ['open', 293, 255],
  ['close', 95, 192],
  ['close', 145, 160],
  ['close', 180, 237],
  ['close', 209, 298],
  ['close', 260, 360],
  ['close', 305, 392],
  ['close', 394, 408],
] as const)('follows the native full-width outline on %s at %i ms', (direction, ms, native) => {
  const widths = [-34, -17, 0, 17, 34].map(shift => {
    const { members, blendRadius } = frameAt(TRIGGERS.wide, direction, ms + shift)
    return outlineWidth(members, blendRadius)
  })
  expect(Math.min(...widths), `${direction} ${ms}`).toBeLessThanOrEqual(native + 6)
  expect(Math.max(...widths), `${direction} ${ms}`).toBeGreaterThanOrEqual(native - 6)
})

it('pours a toolbar group’s menu back into the group’s centre, not into one member', () => {
  const trigger = TRIGGERS.groupLast
  // On open the drop leaves from under the pressed member.
  const leaving = frameAt(trigger, 'open', 80)
  expect(leaving.members.at(-1)!.centerX).toBeGreaterThan(385)
  // On close the last of the body is at the group's centre (with its settle), not at the member.
  let lastBody: GlassFieldMember | undefined
  for (let ms = 0; ms < 500; ms += 2) {
    const { members } = frameAt(trigger, 'close', ms)
    if (members.length === 2) lastBody = members[1]
  }
  expect(Math.abs(lastBody!.centerX - trigger.home.centerX)).toBeLessThan(6)
})

it('keeps a body when the trigger is as wide as its panel', () => {
  const trigger = {
    home: member({ x: 95, y: 158, width: 250, height: 50.33 }),
    panelFrame: panelBelow(220, 158),
    anchor: undefined,
  }
  const early = frameAt(trigger, 'close', 0)
  expect(early.members).toHaveLength(1)
  expect(early.members[0].halfWidth * 2).toBeCloseTo(250, 0)
  expect(early.members[0].halfHeight * 2).toBeCloseTo(188, 0)
  const drop = frameAt(trigger, 'open', 136)
  expect(drop.members[0].halfWidth * 2).toBeLessThan(150)
})

it('absorbs a circle on the curve itself, and a long trigger so that its length follows the curve', () => {
  const scale = keyed([[0, 1], ...MENU_FIELD_CURVES.open.trigger], 100)
  const circle = frameAt(TRIGGERS.circle, 'open', 100).members[0]
  expect(circle.halfWidth).toBeCloseTo(22 * scale)
  expect(circle.halfHeight).toBeCloseTo(22 * scale)
  const wide = frameAt(TRIGGERS.wide, 'open', 100).members[0]
  // Its length follows the curve itself (native: 0.71 of its width where the curve is at 0.74).
  expect(Math.abs(wide.halfWidth / 200 - scale)).toBeLessThan(0.05)
})
