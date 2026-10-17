// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { glassPressHighlight } from './pressHighlight.ts'
import { InteractivePress } from './lens/interactivePress.ts'
import { GLASS_CONTACT_PHYSICS } from './contactPhysics.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("grows a glass button's label with its glass and springs it back with the glass", () => {
  // Native iPad: the composer + glyph, "Actions" and the toolbar "Save" grow with their glass.
  const host = document.createElement('div')
  const label = document.createElement('span')
  host.append(label)
  document.body.append(host)
  Object.defineProperty(host, 'offsetWidth', { value: 46 })
  const animations: { element: Element; frames: Keyframe[]; active: boolean }[] = []
  const animate = vi.fn(function (this: Element, frames: Keyframe[]) {
    const playback = { element: this, frames, active: true }
    animations.push(playback)
    return {
      cancel() {
        playback.active = false
      },
    } as Animation
  })
  Object.assign(HTMLElement.prototype, { animate })
  const scales = () =>
    animations
      .filter(({ element, frames }) => element === label && 'scale' in frames[0]!)
      .map(({ frames }) => frames.map(frame => Number(frame.scale)))
  const target = { host, labels: [label] }
  const media = new EventTarget() as MediaQueryList
  Object.defineProperty(media, 'matches', { value: false, configurable: true })
  vi.stubGlobal('matchMedia', () => media)
  glassPressHighlight(target, 'pressed', 1000, 'button')
  const held = scales().at(-1)!
  expect(held[0]).toBe(1)
  expect(held.at(-1)).toBeCloseTo(1 + GLASS_CONTACT_PHYSICS.button.growthPt / 46, 2)
  glassPressHighlight({ host, labels: [label] }, 'releasing', 1600, 'button')
  const released = scales().at(-1)!
  expect(released[0]).toBeCloseTo(held.at(-1)!, 2)
  // It undershoots its rest size and settles at it, as the glass does.
  expect(Math.min(...released)).toBeLessThan(1)
  expect(released.at(-1)).toBeCloseTo(1, 3)
  const renderer = new InteractivePress()
  renderer.down(1000)
  renderer.up(1600)
  renderer.sample(1610)
  renderer.down(1620)
  glassPressHighlight(target, 'pressed', 1620, 'button')
  expect(scales().at(-1)![0]).toBeCloseTo(1 + (16 / 46) * renderer.sample(1620), 4)
  glassPressHighlight(target, 'releasing', 1700)
  glassPressHighlight(target, 'pressed', 86_400_000)
  expect(scales().at(-1)![0]).toBe(1)
  // The same retained trajectory handles a repeat before the growth delay expires.
  glassPressHighlight(target, 'rest', 2000)
  glassPressHighlight(target, 'pressed', 2100)
  glassPressHighlight(target, 'releasing', 2110)
  glassPressHighlight(target, 'pressed', 2120)
  expect(scales().at(-1)![0]).toBe(1)
  Object.defineProperty(media, 'matches', { value: true })
  media.dispatchEvent(new Event('change'))
  expect(animations.some(animation => animation.active && 'scale' in animation.frames[0]!)).toBe(
    false,
  )
  glassPressHighlight(target, 'pressed', 2300)
  expect(
    scales()
      .at(-1)!
      .every(scale => scale === 1),
  ).toBe(true)
  glassPressHighlight(target, 'releasing', 2400)
  expect(
    scales()
      .at(-1)!
      .every(scale => scale === 1),
  ).toBe(true)
  glassPressHighlight(target, 'rest', 2500)
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate
})
