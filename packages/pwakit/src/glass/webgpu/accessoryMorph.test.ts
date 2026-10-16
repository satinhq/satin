// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { AccessoryMorph, accessoryGlassMotion, accessoryInkReady } from './accessoryMorph.ts'
import { accessoryOffset } from './accessoryTrack.ts'
import {
  ACCESSORY_PROFILES,
  sampleAccessory,
  RESTING_ACCESSORY_VELOCITY,
} from '../lens/tabAccessoryMotion.ts'

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-satin-experimental-accessory-morph')
  vi.unstubAllGlobals()
})

it('shares the measured edge trajectory with a fixed glass envelope without scaling live ink', async () => {
  document.documentElement.setAttribute('data-satin-experimental-accessory-morph', '')
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const root = document.createElement('div')
  root.dataset.satinRoot = ''
  const chrome = document.createElement('div')
  chrome.dataset.satinTabBottomChrome = 'phone'
  const accessory = document.createElement('div')
  accessory.dataset.satinTabBottomAccessory = ''
  const clip = document.createElement('div')
  clip.dataset.satinAccessoryClip = ''
  const content = document.createElement('div')
  content.dataset.satinAccessoryContent = ''
  const material = document.createElement('div')
  material.dataset.satinGlassRegionId = 'player'
  material.style.borderRadius = '24px'
  content.append(material)
  clip.append(content)
  accessory.append(clip)
  chrome.append(accessory)
  root.append(chrome)
  document.body.append(root)
  let compact = false
  chrome.getBoundingClientRect = () => new DOMRect(0, 700, 400, 200)
  accessory.getBoundingClientRect = material.getBoundingClientRect = () =>
    compact ? new DOMRect(68, 845, 325, 48) : new DOMRect(0, 796, 400, 48)
  let frames: Keyframe[] = []
  let clipFrames: Keyframe[] = []
  let contentFrames: Keyframe[] = []
  let done!: () => void
  const animation = {
    cancel() {},
    playState: 'running',
    startTime: 0,
    finished: new Promise<void>(resolve => {
      done = resolve
    }),
  }
  accessory.animate = ((value: Keyframe[]) => {
    frames = value
    return animation
  }) as unknown as typeof accessory.animate
  clip.animate = ((value: Keyframe[]) => {
    clipFrames = value
    return animation
  }) as unknown as typeof clip.animate
  content.animate = ((value: Keyframe[]) => {
    contentFrames = value
    return animation
  }) as unknown as typeof content.animate
  const owner = new AccessoryMorph(accessory)
  const start = performance.now()
  owner.move('collapse', start, () => {
    compact = true
  })
  const motion = accessoryGlassMotion(material)!
  expect(motion.rect.width).toBeGreaterThanOrEqual(400)
  expect(motion.widths).toHaveLength(frames.length)
  const spec = {
    from: { left: 0, right: 0, bottom: 56 },
    to: { left: 68, right: 7, bottom: 7 },
    velocity: RESTING_ACCESSORY_VELOCITY,
    profile: ACCESSORY_PROFILES.collapse,
  }
  for (const [index, frame] of frames.entries()) {
    const value =
      index === frames.length - 1
        ? spec.to
        : sampleAccessory(spec, Number(frame.offset) * motion.duration).value
    const translation = String(frame.transform).match(
      /translate3d\(([-\d.e]+)px, ([-\d.e]+)px, 0\)/,
    )!
    expect(Number(translation[1])).toBeCloseTo(value.left - 68, 8)
    expect(Number(translation[2])).toBeCloseTo(7 - value.bottom, 8)
    // Normalized epoch arithmetic has sub-millisecond floating-point precision.
    const sampling = accessoryOffset(
      motion.viewportTrack,
      motion.viewportTrack.epoch + Number(frame.offset) * motion.duration,
    )
    expect(sampling.x).toBeCloseTo(Number(translation[1]), 3)
    expect(sampling.y).toBeCloseTo(Number(translation[2]), 3)
    // Every raster sample must be covered before the compositor starts moving,
    // including the expanded row above the compact endpoint and spring overshoot.
    expect(motion.sampleRect.x).toBeLessThanOrEqual(motion.rect.x + sampling.x + 0.001)
    expect(motion.sampleRect.y).toBeLessThanOrEqual(motion.rect.y + sampling.y + 0.001)
    expect(motion.sampleRect.x + motion.sampleRect.width).toBeGreaterThanOrEqual(
      motion.rect.x + sampling.x + motion.rect.width - 0.001,
    )
    expect(motion.sampleRect.y + motion.sampleRect.height).toBeGreaterThanOrEqual(
      motion.rect.y + sampling.y + motion.rect.height - 0.001,
    )
    expect(frame).not.toHaveProperty('clipPath')
    expect(frame).not.toHaveProperty('width')
    const inset = -Number(
      String(clipFrames[index]!.transform).match(/translate3d\(([-\d.e]+)px/)![1],
    )
    expect(motion.rect.width - inset).toBeCloseTo(400 - value.left - value.right, 8)
    expect(motion.widths[index]).toBeCloseTo(motion.rect.width - inset, 8)
    const counterTranslation = Number(
      String(contentFrames[index]!.transform).match(/translate3d\(([-\d.e]+)px/)![1],
    )
    expect(counterTranslation).toBeCloseTo(inset, 8)
  }
  done()
  await animation.finished
  await Promise.resolve()
  expect(accessoryGlassMotion(material)).toBeUndefined()
  expect(accessory.dataset.satinAccessoryMotion).toBeUndefined()
  // The tap restore must bring the same player back above the bar on the measured
  // expand spring, rather than leave it in the compact tab picker's row.
  owner.move('restore', performance.now(), () => {
    compact = false
  })
  const restoreMotion = accessoryGlassMotion(material)!
  const restoreSpec = {
    from: spec.to,
    to: spec.from,
    velocity: RESTING_ACCESSORY_VELOCITY,
    profile: ACCESSORY_PROFILES.restore,
  }
  for (const [index, frame] of frames.entries()) {
    const value =
      index === frames.length - 1
        ? restoreSpec.to
        : sampleAccessory(restoreSpec, Number(frame.offset) * restoreMotion.duration).value
    const translation = String(frame.transform).match(
      /translate3d\(([-\d.e]+)px, ([-\d.e]+)px, 0\)/,
    )!
    expect(Number(translation[1])).toBeCloseTo(value.left, 8)
    expect(Number(translation[2])).toBeCloseTo(56 - value.bottom, 8)
    expect(frame).not.toHaveProperty('width')
  }
  owner.dispose()
})

it('reports where the moving capsule is at any instant of its run, for the bar to leave uncovered; held, nothing above its canvas moves', () => {
  document.documentElement.setAttribute('data-satin-experimental-accessory-morph', '')
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const root = document.createElement('div')
  root.dataset.satinRoot = ''
  const chrome = document.createElement('div')
  chrome.dataset.satinTabBottomChrome = 'phone'
  const accessory = document.createElement('div')
  accessory.dataset.satinTabBottomAccessory = ''
  const clip = document.createElement('div')
  clip.dataset.satinAccessoryClip = ''
  const content = document.createElement('div')
  content.dataset.satinAccessoryContent = ''
  // One material with its canvas and one control, whose ink the worker holds at both widths.
  const material = document.createElement('div')
  material.dataset.satinGlassRegionId = 'player'
  const canvas = document.createElement('canvas')
  const control = document.createElement('button')
  material.append(canvas, control)
  content.append(material)
  clip.append(content)
  accessory.append(clip)
  chrome.append(accessory)
  root.append(chrome)
  document.body.append(root)
  let expanded = false
  chrome.getBoundingClientRect = () => new DOMRect(0, 700, 400, 200)
  accessory.getBoundingClientRect = material.getBoundingClientRect = () =>
    expanded ? new DOMRect(0, 796, 400, 48) : new DOMRect(68, 845, 325, 48)
  canvas.getBoundingClientRect = () => new DOMRect(-20, 776, 440, 88)
  control.getBoundingClientRect = () => new DOMRect(300, 800, 40, 40)
  accessoryInkReady(material, 400)
  const animation = { cancel() {}, startTime: 0, finished: new Promise<void>(() => {}) }
  const animated = new Map<Element, Keyframe[]>()
  for (const element of [accessory, clip, content, material, canvas, control])
    element.animate = ((frames: Keyframe[]) => {
      animated.set(element, frames)
      return animation
    }) as unknown as typeof element.animate
  const owner = new AccessoryMorph(accessory)
  expect(owner.capsuleAt(performance.now())).toBeUndefined()
  const start = performance.now()
  owner.move('restore', start, () => {
    expanded = true
  })
  const spec = {
    from: { left: 68, right: 7, bottom: 7 },
    to: { left: 0, right: 0, bottom: 56 },
    velocity: RESTING_ACCESSORY_VELOCITY,
    profile: ACCESSORY_PROFILES.restore,
  }
  for (const elapsed of [0, 30, 90, 400]) {
    const box = sampleAccessory(spec, elapsed).value
    const capsule = owner.capsuleAt(start + elapsed)!
    expect(capsule.x).toBeCloseTo(box.left, 6)
    expect(capsule.width).toBeCloseTo(400 - box.left - box.right, 6)
    expect(capsule.y + capsule.height).toBeCloseTo(900 - box.bottom, 6)
    expect(capsule.height).toBe(48)
  }
  // Held: the accessory keeps its committed row, the masks and the canvas never move (a carrier
  // cancelled on the canvas left the canvas off its place on the compositor during a scroll),
  // and the control carries the travel.
  expect(accessoryGlassMotion(material)?.track?.held).toBe(true)
  expect(animated.get(accessory)!.every(frame => frame.transform === 'none')).toBe(true)
  for (const still of [clip, content, canvas]) expect(animated.has(still)).toBe(false)
  const first = sampleAccessory(spec, 0).value
  expect(animated.get(control)![0]!.transform).toMatch(
    new RegExp(`^translate3d\\(${first.left - spec.to.left}px, ${spec.to.bottom - first.bottom}px`),
  )
  owner.dispose()
  expect(owner.capsuleAt(start + 30)).toBeUndefined()
})
