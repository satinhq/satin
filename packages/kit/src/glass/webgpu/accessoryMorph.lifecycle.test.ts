// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  AccessoryMorph,
  accessoryGlassMotion,
  accessoryInkReady,
  accessoryMorphReadout,
} from './accessoryMorph.ts'

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-satin-experimental-accessory-morph')
  vi.unstubAllGlobals()
})

/** The Music player accessory: one glass material holding the run's ink (a held run). */
function fixture() {
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
  const title = document.createElement('span')
  title.textContent = 'Grid Runner'
  const canvas = document.createElement('canvas')
  material.append(canvas, title)
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
  title.getBoundingClientRect = () =>
    compact ? new DOMRect(130, 855, 120, 28) : new DOMRect(60, 806, 120, 28)
  canvas.getBoundingClientRect = () => new DOMRect(0, 796, 400, 48)
  // Every animation this run starts, so a test can end or cancel them.
  const animations: { cancel: () => void; reject: (error: Error) => void; done: () => void }[] = []
  const stub = (element: Element) => {
    element.animate = (() => {
      let done!: () => void, reject!: (error: Error) => void
      const animation = {
        cancelled: false,
        cancel() {
          animation.cancelled = true
        },
        playState: 'running',
        startTime: 0 as number | null,
        effect: null,
        finished: new Promise<void>((resolve, fail) => {
          done = resolve
          reject = fail
        }),
      }
      animations.push({ cancel: () => animation.cancel(), reject, done })
      return animation
    }) as unknown as typeof element.animate
  }
  for (const element of [accessory, clip, content, title]) stub(element)
  accessoryInkReady(material, 400)
  return {
    accessory,
    material,
    animations,
    collapse(owner: AccessoryMorph) {
      owner.move('collapse', performance.now(), () => {
        compact = true
      })
    },
  }
}

it('restores the committed row when something other than the owner cancels the run', async () => {
  const { accessory, material, animations, collapse } = fixture()
  const owner = new AccessoryMorph(accessory)
  collapse(owner)
  const motion = accessoryGlassMotion(material)!
  expect(motion.track?.held).toBe(true)
  motion.takeInk!()
  expect(accessory.style.width).not.toBe('')
  expect(material.dataset.satinAccessoryInk).toBe('true')
  // The carrier is the last animation the run starts. A cancelled animation rejects `finished`.
  animations.at(-1)!.reject(new DOMException('cancelled', 'AbortError'))
  await Promise.resolve()
  await Promise.resolve()
  expect(accessoryGlassMotion(material)).toBeUndefined()
  expect(accessory.style.width).toBe('')
  expect(accessory.dataset.satinAccessoryMotion).toBeUndefined()
  expect(material.dataset.satinAccessoryInk).not.toBe('true')
  expect(owner.capsuleAt(performance.now())).toBeUndefined()
})

it('settles a live run at its committed row at once (the page is being hidden)', () => {
  const { accessory, material, collapse } = fixture()
  const owner = new AccessoryMorph(accessory)
  collapse(owner)
  accessoryGlassMotion(material)!.takeInk!()
  expect(accessoryMorphReadout(accessory).run).toBe(true)
  owner.settle()
  // No animation frame runs while hidden: the page's ink must return now, not two frames later.
  expect(material.dataset.satinAccessoryInk).toBeUndefined()
  expect(accessoryGlassMotion(material)).toBeUndefined()
  expect(accessory.style.width).toBe('')
  expect(accessory.style.overflow).toBe('')
  expect(accessory.dataset.satinAccessoryMotion).toBeUndefined()
  expect(owner.capsuleAt(performance.now())).toBeUndefined()
  expect(accessoryMorphReadout(accessory)).toMatchObject({ run: false, motion: false, ink: null })
})
