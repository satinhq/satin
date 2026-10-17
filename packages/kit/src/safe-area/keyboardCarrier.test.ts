// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBottomInsetGeometry } from './bottomInsetGeometry.ts'
import {
  keyboardFrameTranslation,
  keyboardCarrierPose,
  keyboardBackdropPose,
} from './keyboardCarrierGeometry.ts'
import { sampleKeyboardTranslation } from '../keyboard/translation.ts'
import type { KeyboardMotion } from '../keyboard/adapter.ts'

let keyboardListener: ((motion: KeyboardMotion) => void) | undefined
vi.mock('../keyboard/adapter.ts', () => ({
  currentKeyboardHeight: () => 0,
  onKeyboardMotion: (listener: (motion: KeyboardMotion) => void) => {
    keyboardListener = listener
    return () => {
      keyboardListener = undefined
    }
  },
}))
const { installKeyboardCarrier } = await import('./keyboardCarrier.ts')

/**
 * A 1000 pt screen: the boundary's bottom padding is its committed keyboard room, the composer
 * (60 pt) sits on that padding, and a 3000 pt transcript scrolls in the space above it.
 */
const SCREEN = 1000
const COMPOSER = 60
const TRANSCRIPT = 3000

type FakeAnimation = {
  element: Element
  from: number
  to: number
  settle: () => void
  handle: { startTime: number }
}
let animations: FakeAnimation[] = []

function chat(withOverlay = false, transcriptHeight = TRANSCRIPT) {
  let composerHeight = COMPOSER
  let notifyGeometry = () => {}
  vi.spyOn(globalThis, 'ResizeObserver').mockImplementation(function (callback) {
    const observer: ResizeObserver = {
      observe() {},
      unobserve() {},
      disconnect() {},
    }
    notifyGeometry = () => callback([], observer)
    return observer
  })
  const boundary = document.createElement('div')
  const surface = document.createElement('div')
  const content = document.createElement('div')
  const firstRow = document.createElement('div')
  const lastRow = document.createElement('div')
  const accessory = document.createElement('div')
  surface.dataset.satinScrollAxis = 'vertical'
  content.dataset.satinScrollContent = ''
  content.dataset.satinScrollAlignment = 'bottom'
  content.append(firstRow, lastRow)
  surface.append(content)
  const overlay = document.createElement('div')
  const overlayLayer = document.createElement('div')
  overlayLayer.dataset.satinOverlayLayer = 'bottom'
  overlay.dataset.satinOverlayContent = 'true'
  overlayLayer.append(overlay)
  boundary.append(surface, overlayLayer, accessory)
  document.body.append(boundary)

  const room = () =>
    Number.parseFloat(boundary.style.getPropertyValue('--satin-keyboard-committed')) || 0
  const shownOffset = new Map<Element, number>()
  let scrollTop = 0
  const clientHeight = () => SCREEN - room()
  Object.defineProperties(surface, {
    clientHeight: { get: clientHeight },
    scrollHeight: { get: () => Math.max(transcriptHeight, clientHeight()) },
    scrollTop: {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, Math.min(transcriptHeight - clientHeight(), value))
      },
    },
  })
  const rect = (top: number) => ({ top }) as DOMRect
  accessory.getBoundingClientRect = () =>
    rect(SCREEN - room() - composerHeight + (shownOffset.get(accessory) ?? 0))
  overlay.getBoundingClientRect = () =>
    rect(SCREEN - room() - composerHeight - 8 - 44 + (shownOffset.get(overlay) ?? 0))
  firstRow.getBoundingClientRect = () =>
    rect(
      Math.max(0, clientHeight() - transcriptHeight) - scrollTop + (shownOffset.get(content) ?? 0),
    )
  lastRow.getBoundingClientRect = () =>
    rect(
      Math.max(transcriptHeight, clientHeight()) -
        100 -
        scrollTop +
        (shownOffset.get(content) ?? 0),
    )
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    element =>
      ({ paddingBottom: element === boundary ? `${room()}px` : '0px' }) as CSSStyleDeclaration,
  )
  Element.prototype.animate = function (this: Element, frames: Keyframe[] | null) {
    const translate = (frame: Keyframe | undefined) =>
      Number(/translateY\((-?[\d.]+)px\)/.exec(String(frame?.transform))?.[1])
    const from = translate(frames?.[0])
    const to = translate(frames?.at(-1))
    let finish!: () => void
    const finished = new Promise<void>(resolve => (finish = resolve))
    shownOffset.set(this, from)
    const handle = {
      startTime: 0,
      finished,
      cancel: () => {
        shownOffset.delete(this)
        animations = animations.filter(entry => entry !== animation)
      },
    }
    const animation: FakeAnimation = {
      element: this,
      from,
      to,
      settle: () => {
        shownOffset.set(this, to)
        finish()
      },
      handle,
    }
    animations.push(animation)
    return handle as unknown as Animation
  }
  surface.scrollTop = TRANSCRIPT
  const geometry = createBottomInsetGeometry()
  geometry.attach(surface)
  if (withOverlay) geometry.attach(overlayLayer)
  const dispose = installKeyboardCarrier(boundary, accessory, geometry, () => ({
    systemInset: 0,
    coveredRows: 0,
    accessoryHeight: composerHeight,
  }))
  return {
    boundary,
    accessory,
    content,
    surface,
    room,
    dispose,
    overlay,
    growComposer: (points: number) => {
      composerHeight += points
      notifyGeometry()
    },
    appendTranscript: (points: number) => {
      transcriptHeight += points
      surface.scrollTop = transcriptHeight
    },
    overlayBottom: () => overlay.getBoundingClientRect().top + 44,
    composerTop: () => accessory.getBoundingClientRect().top,
    lastRowTop: () => lastRow.getBoundingClientRect().top,
  }
}

/** The compositor reaches the end pose; the page then commits from its next frame. */
async function settle() {
  for (const animation of [...animations]) animation.settle()
  await vi.advanceTimersByTimeAsync(1000)
}

beforeEach(() => {
  animations = []
  vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame', 'performance'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('keeps the taller scrollport while a rising keyboard carries the composer and transcript', async () => {
  const thread = chat()
  const composerAtRest = thread.composerTop()
  const lastRowAtRest = thread.lastRowTop()
  keyboardListener!({ height: 400, leadMs: 36 })

  // Nothing is clipped or moved at the start: the layout keeps the keyboard-hidden room and the
  // composer and the transcript leave from where they were, on one shared curve.
  expect(thread.room()).toBe(0)
  expect(thread.composerTop()).toBe(composerAtRest)
  expect(thread.lastRowTop()).toBe(lastRowAtRest)
  expect(animations.map(({ from, to }) => [from, to])).toEqual([
    [0, -400],
    [0, -400],
  ])

  await settle()
  // At the endpoint the room is committed, the pinned transcript scrolled, and the transforms gone.
  expect(thread.room()).toBe(400)
  expect(animations).toEqual([])
  expect(thread.composerTop()).toBe(composerAtRest - 400)
  expect(thread.lastRowTop()).toBe(lastRowAtRest - 400)
  thread.dispose()
})

it('commits a falling keyboard first and leaves from the pose on screen, also mid-run', async () => {
  const thread = chat()
  keyboardListener!({ height: 400, leadMs: 36 })
  await settle()
  const composerRaised = thread.composerTop()
  const lastRowRaised = thread.lastRowTop()

  keyboardListener!({ height: 0, leadMs: 23 })
  // The taller scrollport is committed at once; the composer and transcript start where they were.
  expect(thread.room()).toBe(0)
  expect(thread.composerTop()).toBe(composerRaised)
  expect(thread.lastRowTop()).toBe(lastRowRaised)

  // The keyboard comes back before it has gone: the new run starts from the shown pose, not rest.
  keyboardListener!({ height: 400, leadMs: 36 })
  expect(thread.composerTop()).toBe(composerRaised)
  expect(thread.lastRowTop()).toBe(lastRowRaised)
  await settle()
  expect(thread.composerTop()).toBe(composerRaised)
  expect(thread.lastRowTop()).toBe(lastRowRaised)
  thread.dispose()
})

it('moves a running carry onto the keyboard clock of a later, earlier-stamped report', async () => {
  const thread = chat()
  await vi.advanceTimersByTimeAsync(1000)
  const reported = performance.now()
  keyboardListener!({ height: 400, leadMs: 41 })
  const started = animations.map(({ handle }) => handle)
  expect(started.map(({ startTime }) => reported - startTime)).toEqual([41, 41])

  // The visual viewport's own report of the same keyboard arrives: it started 236 ms ago.
  keyboardListener!({ height: 400, leadMs: 236 })
  expect(animations.map(({ handle }) => handle)).toEqual(started)
  expect(started.map(({ startTime }) => reported - startTime)).toEqual([236, 236])
  // The layout is committed when the keyboard's curve ends, not 383 ms after the first report.
  await vi.advanceTimersByTimeAsync(383 - 236 + 20)
  expect(thread.room()).toBe(400)
  expect(animations).toEqual([])
  thread.dispose()
})

it('carries to the reported room when WebKit retains a stale computed padding', async () => {
  const thread = chat()
  vi.mocked(window.getComputedStyle).mockImplementation(
    () => ({ paddingBottom: '0px' }) as CSSStyleDeclaration,
  )
  keyboardListener!({ height: 400, leadMs: 36 })
  expect(animations.map(({ from, to }) => [from, to])).toEqual([
    [0, -400],
    [0, -400],
  ])
  await settle()
  expect(thread.composerTop()).toBe(SCREEN - COMPOSER - 400)
  expect(thread.lastRowTop()).toBe(SCREEN - 100 - 400)
  thread.dispose()
})

it('keeps a bottom overlay above the composer on keyboard rise, dismissal and reversal', async () => {
  const thread = chat(true)
  const gap = () => thread.composerTop() - thread.overlayBottom()
  expect(gap()).toBe(8)
  keyboardListener!({ height: 400, leadMs: 36 })
  expect(gap()).toBe(8)
  expect(animations.find(entry => entry.element === thread.overlay)?.to).toBe(-400)
  await settle()
  expect(gap()).toBe(8)
  keyboardListener!({ height: 0, leadMs: 23 })
  expect(gap()).toBe(8)
  keyboardListener!({ height: 400, leadMs: 36 })
  expect(gap()).toBe(8)
  await settle()
  expect(gap()).toBe(8)
  // A new keyboard run begins, the composer grows, and dismissal reverses it before it settles.
  keyboardListener!({ height: 0, leadMs: 23 })
  await settle()
  keyboardListener!({ height: 400, leadMs: 36 })
  thread.growComposer(32)
  expect(gap()).toBe(8)
  keyboardListener!({ height: 0, leadMs: 23 })
  expect(gap()).toBe(8)
  await settle()
  expect(gap()).toBe(8)
  thread.dispose()
})

/** Model committed layout plus each compositor transform, including inherited transforms. */
function floatingControls() {
  const boundary = document.createElement('div')
  const accessory = document.createElement('div')
  boundary.append(accessory)
  document.body.append(boundary)
  const geometry = createBottomInsetGeometry()
  const motions = new Map<Element, { frames: Keyframe[]; startTime: number; duration: number }>()
  const translation = (element: Element) => {
    let offset = 0
    for (let node: Element | null = element; node; node = node.parentElement) {
      const motion = motions.get(node)
      if (motion)
        offset += keyboardFrameTranslation(
          motion.frames,
          performance.now() - motion.startTime,
          motion.duration,
        )
    }
    return offset
  }
  const layoutTop = () =>
    940 - Number.parseFloat(boundary.style.getPropertyValue('--satin-keyboard-committed'))
  accessory.getBoundingClientRect = () =>
    new DOMRect(0, layoutTop() + translation(accessory), 100, 60)
  Element.prototype.animate = function (frames, options) {
    const motion = {
      frames: frames as Keyframe[],
      startTime: 0,
      duration: Number((options as KeyframeAnimationOptions).duration),
    }
    motions.set(this, motion)
    return Object.assign(motion, {
      cancel: () => {
        motions.delete(this)
      },
    }) as unknown as Animation
  }
  const add = (parent: Element, store = geometry, alignment = 'bottom') => {
    const layer = document.createElement('div')
    const content = document.createElement('div')
    layer.dataset.satinOverlayLayer = alignment
    content.dataset.satinOverlayContent = 'true'
    content.getBoundingClientRect = () =>
      new DOMRect(0, layoutTop() - 52 + translation(content), 100, 44)
    layer.append(content)
    parent.append(layer)
    const detach = store.attach(layer)
    return {
      content,
      remove: () => {
        detach()
        layer.remove()
      },
    }
  }
  const dispose = installKeyboardCarrier(boundary, accessory, geometry, () => ({
    systemInset: 0,
    coveredRows: 0,
    accessoryHeight: 60,
  }))
  const gap = (content: HTMLElement) =>
    accessory.getBoundingClientRect().top - content.getBoundingClientRect().bottom
  return { boundary, accessory, geometry, add, dispose, gap }
}

it('nested overlay and accessory content inherit one keyboard displacement', async () => {
  const fixture = floatingControls()
  fixture.accessory.dataset.satinInsetAccessory = 'true'
  const outer = fixture.add(fixture.boundary)
  const inner = fixture.add(outer.content)
  const accessoryChild = fixture.add(fixture.accessory)
  for (const height of [400, 0, 300]) {
    keyboardListener!({ height, leadMs: 36 })
    await vi.advanceTimersByTimeAsync(90)
    expect(fixture.gap(outer.content)).toBeCloseTo(8)
    expect(fixture.gap(inner.content)).toBeCloseTo(8)
    expect(fixture.gap(accessoryChild.content)).toBeCloseTo(8)
  }
  await vi.advanceTimersByTimeAsync(1000)
  expect(fixture.gap(inner.content)).toBeCloseTo(8)
  fixture.dispose()
})

it('late overlays join rise, dismissal and reversal at the current keyboard pose and detach cleanly', async () => {
  const fixture = floatingControls()
  const nested = createBottomInsetGeometry()
  const nestedBoundary = document.createElement('div')
  fixture.boundary.append(nestedBoundary)
  fixture.geometry.attach(nestedBoundary, undefined, nested)
  // Each mount is after the first keyboard frame, including a changed keyboard timestamp.
  for (const height of [400, 0, 300]) {
    keyboardListener!({ height, leadMs: 36 })
    await vi.advanceTimersByTimeAsync(90)
    keyboardListener!({ height, leadMs: 140 })
    const overlay = fixture.add(nestedBoundary, nested)
    expect(fixture.gap(overlay.content)).toBeCloseTo(8)
    await vi.advanceTimersByTimeAsync(30)
    expect(fixture.gap(overlay.content)).toBeCloseTo(8)
    overlay.remove()
    // Reusing the detached control must not leave a carrier animation on it.
    fixture.boundary.append(overlay.content)
    expect(overlay.content.getBoundingClientRect().top).toBeCloseTo(
      888 -
        Number.parseFloat(fixture.boundary.style.getPropertyValue('--satin-keyboard-committed')),
    )
    overlay.content.remove()
  }
  await vi.advanceTimersByTimeAsync(1000)
  fixture.dispose()
})

it('publishes the exact carried source and lens trajectory through raise, commit and lower', async () => {
  const thread = chat()
  const initialScroll = thread.surface.scrollTop
  keyboardListener!({ height: 400, leadMs: 36 })
  const lens = keyboardCarrierPose(thread.accessory)!
  const source = keyboardBackdropPose(thread.surface)!
  expect(lens.motion).toBeDefined()
  expect(source.motion).toBeDefined()
  // The worker can sample all these frames without another document callback.
  for (const elapsed of [0, 36, 62, 100, 180, 300, 383, 900]) {
    const at = lens.motion!.epoch + elapsed
    expect(sampleKeyboardTranslation(source.motion!, at)).toBeCloseTo(
      sampleKeyboardTranslation(lens.motion!, at),
      6,
    )
  }
  await settle()
  // Commit replaces the transform with native scroll. Never apply both displacements.
  expect(thread.surface.scrollTop).toBe(initialScroll + 400)
  expect(keyboardBackdropPose(thread.surface)!.offsetY).toBe(0)
  keyboardListener!({ height: 0, leadMs: 23 })
  const lowering = keyboardBackdropPose(thread.surface)!
  expect(thread.surface.scrollTop).toBe(initialScroll)
  expect(sampleKeyboardTranslation(lowering.motion!, lowering.motion!.epoch)).toBe(-400)
  expect(sampleKeyboardTranslation(lowering.motion!, lowering.motion!.epoch + 383)).toBe(0)
  await settle()
  expect(keyboardBackdropPose(thread.surface)!.offsetY).toBe(0)
  thread.dispose()
  expect(keyboardBackdropPose(thread.surface)).toBeUndefined()
})

it('retains a short transcript displacement after layout commit and reverses from that capture', async () => {
  const thread = chat(false, 200)
  keyboardListener!({ height: 400, leadMs: 36 })
  await settle()
  expect(thread.surface.scrollTop).toBe(0)
  const captured = keyboardBackdropPose(thread.surface)!.offsetY
  expect(captured).toBe(-400)
  keyboardListener!({ height: 0, leadMs: 23 })
  const motion = keyboardBackdropPose(thread.surface)!.motion!
  expect(sampleKeyboardTranslation(motion, motion.epoch) - captured).toBe(0)
  expect(sampleKeyboardTranslation(motion, motion.epoch + 383) - captured).toBe(400)
  // A retimed report changes the epoch, never the captured pixels or curve.
  keyboardListener!({ height: 0, leadMs: 60 })
  expect(keyboardBackdropPose(thread.surface)!.motion!.epoch).toBe(motion.epoch - 37)
  await settle()
  expect(keyboardBackdropPose(thread.surface)!.offsetY).toBe(0)
  thread.dispose()
})

it('keeps the captured origin stable when a long transcript appends rows between keyboard runs', async () => {
  const thread = chat()
  keyboardListener!({ height: 400, leadMs: 36 })
  await settle()
  keyboardListener!({ height: 0, leadMs: 23 })
  await settle()
  thread.appendTranscript(500)
  const captured = keyboardBackdropPose(thread.surface)!.offsetY
  expect(captured).toBe(0)
  keyboardListener!({ height: 400, leadMs: 36 })
  const motion = keyboardBackdropPose(thread.surface)!.motion!
  expect(sampleKeyboardTranslation(motion, motion.epoch) - captured).toBe(0)
  expect(sampleKeyboardTranslation(motion, motion.epoch + 383) - captured).toBe(-400)
  thread.dispose()
})
