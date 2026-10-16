// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  preparePresentationGlassMotion,
  presentationGlassContentEpoch,
  holdPresentationGlassMotion,
  retargetPresentationGlassMotion,
  PRESENTATION_TRACK_EVENT,
} from './glassMotion.ts'

const timeline = Object.getOwnPropertyDescriptor(document, 'timeline')
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (timeline) Object.defineProperty(document, 'timeline', timeline)
  else Reflect.deleteProperty(document, 'timeline')
})

function sheet(retain = false) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      e = 0
      f: number
      constructor(transform: string) {
        this.f = Number(/translateY\(([-.0-9]+)px\)/.exec(transform)?.[1] ?? 0)
      }
    },
  )
  const layer = document.createElement('div')
  layer.setAttribute('data-satin-glass-layer', '')
  layer.innerHTML =
    '<div class="satin-presentation-surface" data-satin-glass-region-id="sheet"><button>Done</button></div>'
  document.body.append(layer)
  const material = layer.firstElementChild!
  vi.spyOn(material, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 62, 440, 894))
  const animation = {
    effect: {
      getKeyframes: () =>
        [902, 0].map((y, computedOffset) => ({
          computedOffset,
          transform: `translateY(${y}px)`,
        })),
      getTiming: () => ({ duration: 700 }),
    },
    finished: new Promise(() => {}),
  } as unknown as Animation
  return {
    layer,
    nested: layer.querySelector('button')!,
    animation,
    motion: preparePresentationGlassMotion(layer, animation, { retain })!,
  }
}

it('releases pending GPU admission when the material demotes to CSS fallback', async () => {
  const { layer, motion } = sheet(true)
  let frame: FrameRequestCallback | undefined
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frame = callback
    return 1
  })
  const running = motion.start()
  const fallback = document.createElement('div')
  fallback.setAttribute('data-satin-fallback-material', '')
  layer.firstElementChild!.append(fallback)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(frame).toBeDefined()
  frame!(performance.now())
  expect(Number.isFinite(await running)).toBe(true)
  expect(motion.admitted).toBe(true)
  motion.dispose()
})

it('retargets admitted coverage without another content generation or admission wait', () => {
  const { layer, motion, animation } = sheet()
  const identity = motion.contentEpoch
  const event = vi.fn()
  window.addEventListener(PRESENTATION_TRACK_EVENT, event)
  expect(retargetPresentationGlassMotion(layer, animation, 100)).toBeUndefined()
  motion.admitted = true
  holdPresentationGlassMotion(layer, 300)
  expect(motion.track.offsets).toEqual([
    { x: 0, y: 300 },
    { x: 0, y: 300 },
  ])
  expect(motion.contentEpoch).toBe(identity)
  expect(retargetPresentationGlassMotion(layer, animation, 100)).toBeTypeOf('number')
  expect(motion.track.epoch).toBe(performance.timeOrigin + 100)
  expect(motion.contentEpoch).toBe(identity)
  expect(event).toHaveBeenCalledTimes(2)
  window.removeEventListener(PRESENTATION_TRACK_EVENT, event)
  motion.dispose()
})

it('retires an envelope when live contact leaves its admitted source bounds', () => {
  const { layer, motion, animation } = sheet()
  motion.admitted = true
  holdPresentationGlassMotion(layer, 1200)
  expect(motion.current()).toBe(false)
  expect(retargetPresentationGlassMotion(layer, animation, 100)).toBeUndefined()
})

it.each([300, 1800])('prepares glass before starting after a %s ms stall', async stall => {
  const { motion, nested } = sheet()
  let now = 100
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  Object.defineProperty(document, 'timeline', { configurable: true, value: { currentTime: 100 } })
  const preparedTrack = motion.track
  const contentEpoch = presentationGlassContentEpoch(nested)
  expect(contentEpoch).toBeDefined()
  let frame: FrameRequestCallback | undefined
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frame = callback
    return 1
  })
  const running = motion.start()
  expect(motion.start()).toBe(running)
  // Coverage and GPU completion arrive 300 ms later; the document timeline still has its
  // pre-task frame time. Neither delay may enter the running clock.
  now += stall
  expect(motion.track).toBe(preparedTrack)
  expect(motion.track.epoch).toBe(Number.MAX_VALUE)
  motion.acknowledge(preparedTrack)
  await Promise.resolve()
  expect(motion.track.epoch).toBe(Number.MAX_VALUE)
  // WebKit updates the document timeline before invoking the requested frame.
  Object.defineProperty(document, 'timeline', { configurable: true, value: { currentTime: now } })
  frame!(now)
  expect(motion.track.epoch).toBe(performance.timeOrigin + now)
  expect(presentationGlassContentEpoch(nested)).toBe(contentEpoch)
  expect(motion.admitted).toBe(false)
  motion.acknowledge(preparedTrack)
  expect(motion.admitted).toBe(false)
  motion.acknowledge(motion.track)
  expect(await running).toBe(now)
  expect(motion.admitted).toBe(true)
  motion.dispose()
})

it('does not start a disposed run when its preparation finishes', async () => {
  const { motion } = sheet()
  const preparedTrack = motion.track
  const running = motion.start()
  motion.dispose()
  motion.acknowledge(preparedTrack)
  await Promise.resolve()
  expect(Number.isFinite(await running)).toBe(true)
  expect(motion.track).toBe(preparedTrack)
  expect(motion.current()).toBe(false)
  expect(motion.admitted).toBe(false)
})

it('retires a prepared run before its clock frame can start', async () => {
  const { motion } = sheet()
  let frame: FrameRequestCallback | undefined
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frame = callback
    return 42
  })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame')
  const preparedTrack = motion.track
  const running = motion.start()
  motion.acknowledge(preparedTrack)
  await Promise.resolve()
  expect(frame).toBeDefined()
  motion.dispose()
  frame!(performance.now())
  expect(cancel).toHaveBeenCalledWith(42)
  expect(motion.track).toBe(preparedTrack)
  expect(motion.current()).toBe(false)
  expect(Number.isFinite(await running)).toBe(true)
})
