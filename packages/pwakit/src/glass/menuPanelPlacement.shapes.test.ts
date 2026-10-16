import { expect, it } from 'vitest'
import {
  contextContentScale,
  contextLiftBox,
  MENU_CENTER_BAND,
  menuOpensUpward,
  menuPanelPlacement,
} from './menuPanelPlacement.ts'

// iPhone 17 Pro Max (440 x 956 pt, safe area 62 / 34), the Menu's phone margins (Menu.tsx).
const available = { x: 18, y: 62, width: 404, height: 852 }
const panel = { x: 0, y: 0, width: 250, height: 188 }
const place = (trigger: { x: number; y: number; width: number; height: number }) =>
  menuPanelPlacement(trigger, panel, undefined, available, true)
const capsule = (x: number, y = 158) => ({ x, y, width: 129, height: 50.33 })

it('places a phone panel where stock SwiftUI rests it, for each trigger shape', () => {
  // Native rest positions (panel left, top), measured at 3x from the settled open menu.
  const measured: [string, Parameters<typeof place>[0], number, number][] = [
    ['capsule at the leading margin', capsule(24), 24, 158],
    ['capsule in the middle', capsule(155.67), 95.17, 158],
    ['capsule at the trailing margin', capsule(287), 166, 158],
    ['capsule near the bottom', capsule(155.67, 775.67), 95.17, 638],
    ['full-width button', { x: 20, y: 158, width: 400, height: 50.33 }, 95, 158],
    ['full-width button near the bottom', { x: 20, y: 775.67, width: 400, height: 50.33 }, 95, 638],
    ['toolbar group', { x: 268, y: 62, width: 152, height: 44 }, 170, 62],
    ['toolbar circle', { x: 376, y: 62, width: 44, height: 44 }, 170, 62],
    [
      'three blended glass buttons, the middle one',
      { x: 191.2, y: 158, width: 57.9, height: 46.67 },
      95.15,
      158,
    ],
  ]
  for (const [name, trigger, left, top] of measured) {
    const placed = place(trigger)
    // The settled native panel wanders about 1.5 pt (93.7 to 95.3 for the same centred trigger).
    expect(Math.abs(placed.left - left), name).toBeLessThan(1.6)
    expect(Math.abs(placed.top - top), name).toBeLessThan(0.5)
  }
})

it('centres the panel only on a trigger near the middle of the screen', () => {
  // Leading edge of a 129 pt capsule -> measured panel left edge.
  const centred = [135, 140, 150, 160, 175]
  for (const x of centred) expect(place(capsule(x)).left).toBeCloseTo(x + 64.5 - 125)
  // Further out, the panel's edge is the trigger's edge on its side of the screen.
  for (const x of [24, 100, 120, 125, 130]) expect(place(capsule(x)).left).toBe(x)
  for (const x of [185, 195, 210, 287]) expect(place(capsule(x)).left).toBe(x + 129 - 250)
  expect(MENU_CENTER_BAND).toBeGreaterThan(20.5)
  expect(MENU_CENTER_BAND).toBeLessThan(25.5)
})

it('opens upward from the trigger’s bottom edge when the panel does not fit below', () => {
  expect(menuOpensUpward(capsule(155.67), panel, available)).toBe(false)
  expect(menuOpensUpward(capsule(155.67, 775.67), panel, available)).toBe(true)
  expect(place(capsule(155.67, 775.67)).top).toBeCloseTo(775.67 + 50.33 - 188)
  // No room either way: the panel stays inside the screen.
  const tall = { x: 0, y: 0, width: 250, height: 900 }
  expect(menuOpensUpward(capsule(155.67, 400), tall, available)).toBe(false)
  expect(menuPanelPlacement(capsule(155.67, 400), tall, undefined, available, true).top).toBe(62)
})

it('keeps the panel inside the screen margins when its trigger is nearer an edge', () => {
  expect(place(capsule(4)).left).toBe(18)
  expect(place(capsule(307)).left).toBe(440 - 18 - 250)
})

it('leaves the iPad rule as it was: first row over the trigger, panel centred', () => {
  const row = { x: 8, y: 7, width: 208, height: 36 }
  const pad = menuPanelPlacement(capsule(24), { ...panel, width: 224 }, row, available)
  expect(pad.left).toBe(18)
  expect(pad.top).toBeCloseTo(158 + 50.33 / 2 + 3 - 25)
})

it('keeps a context menu below its preview with the measured iPad gap', () => {
  const preview = { x: 20, y: 362, width: 984, height: 68 }
  const menu = { x: 0, y: 0, width: 224, height: 146 }
  const viewport = { x: 16, y: 24, width: 992, height: 1320 }
  const placed = menuPanelPlacement(preview, menu, undefined, viewport, false, 'context')
  expect(placed).toEqual({ left: 400, top: 447 })
})

// Same full-width Notes row as the touch-clocked iPhone reference.
it('centers a phone context menu under its full-width preview', () => {
  expect(
    menuPanelPlacement(
      { x: 20, y: 170, width: 400, height: 68 },
      { x: 0, y: 0, width: 250, height: 104 },
      undefined,
      { x: 16, y: 62, width: 408, height: 860 },
      true,
      'context',
    ),
  ).toEqual({ left: 95, top: 250 })
})

// iPhone 17 Pro Max Simulator, stock .contextMenu on a 192 pt grid tile (artwork and labels,
// 20,168 192x230), menu 250x208 (native menu measurements native-iphone stills).
it('lifts content and a custom preview where native does, with the menu 20 pt away', () => {
  const tile = { x: 20, y: 168, width: 192, height: 230 }
  const right = { ...tile, x: 228 }
  const phone = { x: 20, y: 62, width: 400, height: 852 }
  const menu = { x: 0, y: 0, width: 250, height: 208 }
  const scale = contextContentScale(tile.width, tile.height)
  expect(scale).toBeCloseTo(1.115, 2)
  const lifted = contextLiftBox(
    tile,
    { width: tile.width * scale, height: tile.height * scale },
    menu.height,
    phone,
  )
  expect(lifted.x).toBe(20)
  expect(lifted.y).toBeCloseTo(154.8, 0)
  expect(menuPanelPlacement(lifted, menu, undefined, phone, true, 'context-content')).toEqual({
    left: 20,
    top: expect.closeTo(431, 0),
  })
  // The second-row tile (native menu at 20,176, 209 pt tall, above the tile lifted to y 405.3).
  const lower = contextLiftBox(
    { ...tile, y: 418 },
    { width: tile.width * scale, height: tile.height * scale },
    menu.height,
    phone,
  )
  const upward = menuPanelPlacement(lower, menu, undefined, phone, true, 'context-content')
  expect(Math.abs(upward.top + menu.height - 385)).toBeLessThanOrEqual(1)
  const preview = contextLiftBox(right, { width: 280, height: 280 }, menu.height, phone)
  expect(preview).toEqual({ x: 140, y: 143, width: 280, height: 280 })
  expect(menuPanelPlacement(preview, menu, undefined, phone, true, 'context-content')).toEqual({
    left: 170,
    top: 443,
  })
})

// iPhone 17 Pro Max Simulator, stock .contextMenu on 348 pt wide bubbles (Reply / Copy / React,
// menu 250 x 146); lifted content stops 20 pt inside the safe area (native menu measurements native-tall).
it('keeps a tall bubble and its menu apart, and puts the menu over content with no room', () => {
  const area = { x: 20, y: 82, width: 400, height: 820 }
  const menu = { x: 0, y: 0, width: 250, height: 146 }
  const lift = (y: number, height: number) => {
    const scale = contextContentScale(348, height)
    return contextLiftBox(
      { x: 16, y, width: 348, height },
      { width: 348 * scale, height: height * scale },
      menu.height,
      area,
    )
  }
  const place = (box: ReturnType<typeof lift>) =>
    menuPanelPlacement(box, menu, undefined, area, true, 'context-content').top
  // 588 pt bubble: moves the shorter way to free its menu's side (native y 122 / 248 / 248).
  for (const [restY, liftedY, menuTop] of [
    [168, 122, 756],
    [218, 248, 82],
    [248, 248, 82],
  ]) {
    const box = lift(restY, 588.3)
    expect(box.y).toBeCloseTo(liftedY, 0)
    expect(place(box)).toBeCloseTo(menuTop, 0)
  }
  // 698 pt bubble: no room for the menu on either side; native pins it to the bottom (y 177.7)
  // and puts the menu over its top at 82.
  const tall = lift(168, 698.3)
  expect(tall.y).toBeCloseTo(177.7, 0)
  expect(menuPanelPlacement(tall, menu, undefined, area, true, 'context-content')).toEqual({
    left: 20,
    top: 82,
  })
  // Taller than the screen, shrunk to the area's height (native 210 x 820 at 85,82).
  const huge = contextLiftBox(
    { x: 16, y: 168, width: 348, height: 1359 },
    { width: 210.3, height: 820 },
    menu.height,
    area,
  )
  expect(huge).toEqual({ x: expect.closeTo(84.8, 0), y: 82, width: 210.3, height: 820 })
  expect(menuPanelPlacement(huge, menu, undefined, area, true, 'context-content')).toEqual({
    left: expect.closeTo(84.8, 0),
    top: 82,
  })
})

it('lifts iPad content 20 pt inside the screen and puts a custom preview’s menu beside it', () => {
  // iPad Pro 11-inch (834 x 1194 pt, safe area 24 / 20) inside the 20 pt context margin;
  // native menu measurements native iPad recordings, held frames.
  const area = { x: 20, y: 44, width: 794, height: 1110 }
  const lift = (
    rest: { x: number; y: number; width: number; height: number },
    menuHeight = 131,
  ) => {
    const scale = contextContentScale(rest.width, rest.height)
    return contextLiftBox(
      rest,
      { width: rest.width * scale, height: rest.height * scale },
      menuHeight,
      area,
    )
  }
  const menu = { x: 0, y: 0, width: 236, height: 131 }
  // Tall bubble: 16,138 740 x 545 settles at 20,128 766 x 565, menu 20,712 (leading, below).
  const tall = lift({ x: 16, y: 138, width: 740, height: 545 })
  expect(tall).toEqual({
    x: 20,
    y: expect.closeTo(128.4, 0),
    width: expect.closeTo(766, 0),
    height: expect.closeTo(564.1, 0),
  })
  const tallMenu = menuPanelPlacement(tall, menu, undefined, area, false, 'context-content')
  expect(tallMenu.left).toBe(20)
  // Native contours resolve 1 pt (light 712, dark 711).
  expect(Math.abs(tallMenu.top - 712)).toBeLessThan(1)
  // Short trailing bubble: settles 631,195 183 x 45 against the 814 pt edge; menu trailing at 578.
  const short = lift({ x: 643, y: 198, width: 159, height: 39 })
  expect(short.x + short.width).toBeCloseTo(814, 0)
  const shortMenu = menuPanelPlacement(short, menu, undefined, area, false, 'context-content')
  expect(shortMenu.left).toBeCloseTo(578, 0)
  expect(Math.abs(shortMenu.top - 259)).toBeLessThan(1.5)
  // A right-column tile's 280 pt preview at 480,212: its 225 x 187 menu sits to its left, top-aligned.
  const preview = { x: 480, y: 212, width: 280, height: 280 }
  expect(
    menuPanelPlacement(
      preview,
      { ...menu, width: 225, height: 187 },
      undefined,
      area,
      false,
      'context-preview',
    ),
  ).toEqual({ left: 235, top: 212 })
})
