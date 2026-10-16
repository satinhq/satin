import { describe, expect, it } from 'vitest'
import {
  MENU_MORPH_DURATION,
  MENU_MORPH_ZERO,
  menuMorphDuration,
  menuMorphEndpoint,
  sampleMenuMorph,
  transitionMenuMorph,
} from './menuMorphMotion.ts'
import { sampleMenuCorner } from './menuCornerMotion.ts'
import { CONTEXT_DISMISSAL_MS, contextDismissal } from './menuContextPresentation.ts'

describe('recorded native menu contour', () => {
  it('settles all axes at the measured open and close endpoints', () => {
    expect(MENU_MORPH_DURATION).toEqual({ open: 550, close: 700 })
    for (const direction of ['open', 'close'] as const) {
      const settled = sampleMenuMorph(direction, MENU_MORPH_DURATION[direction])
      expect(settled.pose).toEqual(menuMorphEndpoint(direction))
      expect(settled.velocity).toEqual(MENU_MORPH_ZERO)
    }
  })
  it('starts from the pressed source without released-trigger correction', () => {
    const start = transitionMenuMorph('open', 0, MENU_MORPH_ZERO)
    expect(start.pose).toEqual(MENU_MORPH_ZERO)
    const opening = transitionMenuMorph('open', 150, MENU_MORPH_ZERO)
    expect(opening.pose.returnX).toBe(0)
    expect(opening.pose.returnWidth).toBe(0)
  })
  it('retains position and velocity when an opening reverses into closing', () => {
    const opening = transitionMenuMorph('open', 150, MENU_MORPH_ZERO)
    const reversed = transitionMenuMorph('close', 0, opening.pose, opening.velocity)
    expect(reversed.pose).toEqual(opening.pose)
    expect(reversed.velocity).toEqual(opening.velocity)
    const next = transitionMenuMorph('close', 0.01, opening.pose, opening.velocity)
    for (const axis of Object.keys(opening.pose) as (keyof typeof opening.pose)[]) {
      expect((next.pose[axis] - opening.pose[axis]) / 0.00001).toBeCloseTo(
        opening.velocity[axis],
        1,
      )
    }
  })
  it('rounds before the final rectangular panel, then removes the extra roundness', () => {
    expect(sampleMenuCorner('open', 200).pose.rounding).toBeGreaterThan(0.5)
    expect(sampleMenuCorner('open', 550).pose.rounding).toBe(0)
    expect(sampleMenuCorner('close', 700).pose.rounding).toBe(0)
  })
})

describe('context menu on content', () => {
  // Native iPad Pro 11 (2nd gen), iOS 27.0.1, SwiftUI `.contextMenu` on a chat bubble
  // (native menu measurements, warm-light-chat-tall, 3 counter-qualified trials). The body's first resolved
  // frame is 115-117 ms after the content settle starts, already ~0.87-0.89 of its settled width,
  // and it overshoots before settling. Satin's epoch is 55 ms before that settle start.
  const settleStart = 55
  const seedWidth = 92 / 236
  const width = (ms: number, idiom: 'context' | 'context-content') =>
    seedWidth + (1 - seedWidth) * sampleMenuMorph('open', ms, idiom, 'light').pose.width
  it('opens on the native content spring: grown at its first resolved frame, then overshoots', () => {
    expect(width(settleStart + 117, 'context-content')).toBeGreaterThan(0.85)
    expect(width(settleStart + 117, 'context-content')).toBeLessThan(0.93)
    const peak = Math.max(
      ...Array.from({ length: 400 }, (_, ms) => width(settleStart + ms, 'context-content')),
    )
    expect(peak).toBeGreaterThan(1.018)
    expect(peak).toBeLessThan(1.04)
  })
  it('keeps row context menus and toolbar menus on their own curves', () => {
    // Rows: the Notes fit is still flat at the same instant.
    expect(width(settleStart + 117, 'context')).toBeLessThan(0.6)
    // Toolbar menus (iPad table, iPhone spring) at the same instant, as before.
    const toolbar = {
      pad: { width: 0.90921, height: 0.95297, centerX: 0.94226, centerY: 1.16463 },
      phone: { width: 0.70833, height: 0.79153, centerX: 0.76274, centerY: 1.3611 },
    }
    for (const [idiom, pose] of Object.entries(toolbar))
      for (const [axis, value] of Object.entries(pose))
        expect(
          sampleMenuMorph('open', 172, idiom as keyof typeof toolbar, 'light').pose[
            axis as keyof typeof pose
          ],
        ).toBeCloseTo(value, 4)
  })
})

describe('context menu dismissal', () => {
  // Owner, Music Home tile (2026-10-14): on the toolbar close springs the body first flew away
  // from its source and a faint ghost drifted back after the fade.
  const profiles = ['context', 'context-content'] as const
  const appearances = ['light', 'dark'] as const
  it('collapses into its source on the dismissal clock and never moves away from it', () => {
    for (const idiom of profiles)
      for (const appearance of appearances) {
        expect(menuMorphDuration('close', idiom)).toBe(Math.ceil(CONTEXT_DISMISSAL_MS))
        expect(sampleMenuMorph('close', 0, idiom, appearance).pose).toEqual(
          menuMorphEndpoint('open'),
        )
        let previous = 1
        for (let ms = 0; ms <= CONTEXT_DISMISSAL_MS; ms += 4) {
          const { pose } = sampleMenuMorph('close', ms, idiom, appearance)
          for (const axis of ['centerX', 'centerY', 'width', 'height'] as const) {
            expect(pose[axis]).toBeLessThanOrEqual(previous + 1e-9)
            expect(pose[axis]).toBeCloseTo(contextDismissal(appearance, ms), 9)
          }
          expect(pose.returnX).toBeCloseTo(1 - pose.centerX, 9)
          previous = pose.centerX
        }
      }
  })
  it('leaves toolbar and label closes on their own curves', () => {
    expect(menuMorphDuration('close', 'phone')).toBeGreaterThan(Math.ceil(CONTEXT_DISMISSAL_MS))
    expect(sampleMenuMorph('close', 40, 'phone').pose.centerY).toBeGreaterThan(1)
  })
})

describe('menu from a List row label', () => {
  // Native (iPad Pro, a stock Menu in a List Section): the panel's width is still easing in at
  // 200 ms, passes it near 270 ms, overshoots about 1% and settles by about 420 ms. The close
  // starts at once and eases out. The owner saw the old contour stop dead at 200 ms.
  const width = (direction: 'open' | 'close', ms: number) =>
    sampleMenuMorph(direction, ms, 'label').pose.width
  it('eases into the panel and settles past it, like native', () => {
    expect(width('open', 200)).toBeGreaterThan(0.95)
    expect(width('open', 200)).toBeLessThan(0.99)
    const peak = Math.max(...Array.from({ length: 300 }, (_, ms) => width('open', 230 + ms)))
    expect(peak).toBeGreaterThan(1.004)
    expect(peak).toBeLessThan(1.015)
    expect(width('open', menuMorphDuration('open', 'label'))).toBe(1)
  })
  it('closes at once and eases out into the label', () => {
    expect(width('close', 33)).toBeLessThan(0.85)
    expect(width('close', 100)).toBeLessThan(0.4)
    expect(menuMorphDuration('close', 'label')).toBeLessThan(200)
  })
})
