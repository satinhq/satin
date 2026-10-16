import { expect, it } from 'vitest'
import { roundedRectDistance } from '../fieldGeometry.ts'
import { closeButtonCenter, keyed, menuFieldFrame, MENU_FIELD } from './menuField.ts'
import { menuMorphDuration, sampleMenuMorph } from './menuMorphMotion.ts'

const home = { centerX: 398, centerY: 84, halfWidth: 22, halfHeight: 22, radius: 22 }
const panelFrame = { x: 172, y: 62, width: 250, height: 188 }
const settledPanel = { centerX: 297, centerY: 156, halfWidth: 125, halfHeight: 94, radius: 32 }
const rows = {
  source: { x: 0, y: 0, width: 254, height: 172 },
  frame: { x: 170, y: 70, width: 254, height: 172 },
}
const glyph = {
  source: { x: 254, y: 0, width: 48, height: 48 },
  frame: { x: 374, y: 60, width: 48, height: 48 },
}

it('interpolates keys with a monotone cubic and holds their ends', () => {
  const keys = [
    [10, 0],
    [20, 1],
  ] as const
  expect(keyed(keys, 0)).toBe(0)
  expect(keyed(keys, 15)).toBeCloseTo(0.5)
  expect(keyed(keys, 99)).toBe(1)
})

it('opens as the pressed trigger, then absorbs the trigger member into the drop', () => {
  const pressed = { ...home, halfWidth: 24, halfHeight: 24, radius: 24 }
  const start = menuFieldFrame({
    direction: 'open',
    ms: 0,
    panel: pressed,
    home,
    pressedScale: 48 / 44,
    pressHighlight: 0.4,
    panelFrame,
    rows,
    glyph,
  })
  expect(start.members).toHaveLength(2)
  expect(start.members[0].halfWidth).toBeCloseTo(24)
  expect(start.highlight).toBeCloseTo(0.4)
  // The glyph is drawn in the glass from the first frame; the rows are not yet.
  expect(start.ink.map(layer => layer.source)).toEqual([glyph.source])
  const absorbed = menuFieldFrame({
    direction: 'open',
    ms: 150,
    panel: settledPanel,
    home,
    panelFrame,
    rows,
    glyph,
  })
  expect(absorbed.members).toEqual([settledPanel])
  expect(absorbed.highlight).toBe(0)
})

it('settles to the live rows exactly, with no lens or blur', () => {
  const settled = menuFieldFrame({
    direction: 'open',
    ms: 460,
    panel: settledPanel,
    home,
    panelFrame,
    rows,
    glyph,
    settled: true,
  })
  expect(settled.ink).toEqual([
    { source: rows.source, frame: rows.frame, opacity: 1, blur: 0, lens: 0, lensWidth: 14 },
  ])
})

/** The travelling member the scene passes in: the close pose between the trigger and the panel. */
function travelling(ms: number) {
  const { pose } = sampleMenuMorph('close', ms, 'phone')
  const mix = (trigger: number, panel: number, share: number) => trigger + (panel - trigger) * share
  return {
    centerX: mix(home.centerX, settledPanel.centerX, pose.centerX),
    centerY: mix(home.centerY, settledPanel.centerY, pose.centerY),
    halfWidth: mix(home.halfWidth, settledPanel.halfWidth, pose.width),
    halfHeight: mix(home.halfHeight, settledPanel.halfHeight, pose.height),
    radius: 22,
  }
}
const closing = (ms: number) =>
  menuFieldFrame({ direction: 'close', ms, panel: travelling(ms), home, panelFrame, glyph })

it('closes as native: the button forms on the body, carries its dots past home and settles back', () => {
  // The first frame is the panel alone, with the panel's corner share.
  const early = closing(0)
  expect(early.members).toHaveLength(1)
  expect(early.members[0].radius).toBeCloseTo(0.34 * 94)
  // +207 ms after the close tap (ms 166): native's dots are 6.7 pt short of home and 12.2 pt
  // above it, on a pear whose body is still pouring in.
  const pear = closing(166)
  expect(pear.members).toHaveLength(2)
  expect(Math.abs(pear.members[0].centerX - (home.centerX - 6.7))).toBeLessThan(1)
  expect(Math.abs(pear.members[0].centerY - (home.centerY - 12.2))).toBeLessThan(1)
  expect(pear.members[1].radius).toBeCloseTo(
    Math.min(pear.members[1].halfWidth, pear.members[1].halfHeight),
  )
  // The dots ride the button.
  expect(pear.ink[0].frame.y - glyph.frame.y).toBeCloseTo(pear.members[0].centerY - home.centerY)
  // By +360 ms the body has collapsed inside the button: one round member remains.
  expect(closing(380).members).toHaveLength(1)
  const settled = menuFieldFrame({
    direction: 'close',
    ms: 0,
    panel: travelling(9999),
    home,
    panelFrame,
    settled: true,
  })
  expect(settled.members).toEqual([home])
})

it('never detaches the forming button from the body', () => {
  for (let ms = 0; ms < 400; ms += 4) {
    const { members } = closing(ms)
    if (members.length < 2) continue
    const [button, body] = members
    const gap = roundedRectDistance(button.centerX, button.centerY, body)
    expect(gap).toBeLessThanOrEqual(MENU_FIELD.closeEmbed * button.radius + 1e-6)
  }
})

it('passes the button only as momentum: once, on the travel axis, then home without a second swing', () => {
  const duration = menuMorphDuration('close', 'phone')
  const track = []
  for (let ms = 148; ms <= duration; ms += 4) track.push(closeButtonCenter(home, panelFrame, ms))
  const ys = track.map(point => point.y - home.centerY),
    xs = track.map(point => point.x - home.centerX)
  // Native: 13.5 pt past home (above, for a menu that hangs below), about +242 ms of the tap.
  const peak = ys.indexOf(Math.min(...ys))
  expect(ys[peak]).toBeCloseTo(-13.5, 0)
  expect(148 + peak * 4).toBeGreaterThan(180)
  expect(148 + peak * 4).toBeLessThan(220)
  // After the peak it only returns; the far side of home stays within a quarter point.
  for (let i = peak + 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - 0.02)
  expect(Math.max(...ys)).toBeLessThan(0.25)
  // Sideways it approaches from the body's side and stays within half a point of home.
  expect(xs[0]).toBeLessThan(-8)
  expect(Math.max(...xs)).toBeLessThan(0.5)
  expect(Math.abs(xs.at(-1)!)).toBeLessThan(0.1)
  expect(Math.abs(ys.at(-1)!)).toBeLessThan(0.15)
})

it('keeps the button on the trigger axis for a menu centred on its trigger', () => {
  const centred = { x: home.centerX - 125, y: 62, width: 250, height: 188 }
  for (const ms of [150, 200, 300])
    expect(closeButtonCenter(home, centred, ms).x).toBe(home.centerX)
  expect(MENU_FIELD.blendRadius).toBeGreaterThan(0)
})

it('opens a plain label drop with its rows sharp and bent by the rim from about 50 ms, as native', () => {
  // picker-glass-sheet: the rows show inside the growing lens, not as a blurred crossfade.
  const early = menuFieldFrame({
    direction: 'open',
    ms: 52,
    panel: { ...home, halfWidth: 40, halfHeight: 40, radius: 40 },
    home,
    panelFrame,
    rows,
    sourceKind: 'label',
  })
  const [ink] = early.ink
  expect(ink.opacity).toBeGreaterThan(0.25)
  expect(ink.blur).toBe(0)
  expect(ink.lens).toBeGreaterThan(0)
})

it('a plain label drop closes as one fading body without reforming a toolbar button', () => {
  const frame = menuFieldFrame({
    direction: 'close',
    ms: 80,
    panel: settledPanel,
    home,
    panelFrame,
    rows,
    sourceKind: 'label',
  })
  expect(frame.members).toHaveLength(1)
  expect(frame.members[0]).toEqual(settledPanel)
  expect(frame.ink[0]?.opacity ?? 0).toBeLessThan(0.2)
})
