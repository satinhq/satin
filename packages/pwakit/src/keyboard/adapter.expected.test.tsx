// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installKeyboardAdapter, useKeyboardMetrics } from './adapter.ts'

// Installed iPad (1366 x 1024, iOS 27.0), real touches (scratch evidence kb6/evidence/c1a, c1b):
// - the alert field's keyboard is reported in two steps, 564 pt of viewport and 13-16 ms later
//   526 pt (the predictive bar): 460 pt, then 498 pt of keyboard;
// - the first typed character collapses the bar again: 564 pt of viewport 40 ms after the key.
const LAYOUT_HEIGHT = 1024
const FIRST_STEP_VIEWPORT = 564
const FULL_KEYBOARD_VIEWPORT = 526

let now: number
let frames: Map<number, FrameRequestCallback>
let viewport: EventTarget & { height: number; offsetTop: number; scale: number }
let host: HTMLDivElement
let reactRoot: Root
let dispose: () => void
let metrics: ReturnType<typeof useKeyboardMetrics>

function Probe() {
  metrics = useKeyboardMetrics()
  return null
}
const flushFrames = () =>
  act(() => {
    const queued = [...frames.values()]
    frames.clear()
    for (const callback of queued) callback(now)
  })
function reportViewport(height: number) {
  act(() => {
    viewport.height = height
    viewport.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(150)
  })
  flushFrames()
}
function install() {
  dispose = installKeyboardAdapter(host)
  const mount = document.createElement('div')
  host.append(mount)
  reactRoot = createRoot(mount)
  act(() => reactRoot.render(<Probe />))
}
function uninstall() {
  act(() => reactRoot.unmount())
  dispose()
}
const alertField = () =>
  host.querySelector<HTMLInputElement>('dialog[data-satin-presentation="alert"] input')!
const sheetField = () =>
  host.querySelector<HTMLInputElement>('dialog[data-satin-presentation="sheet"] input')!
const sheetSurface = () => host.querySelector<HTMLElement>('[data-satin-scroll-axis="vertical"]')!
function focus(field: HTMLElement) {
  act(() => field.focus())
  flushFrames()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPad')
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  now = 1_000
  frames = new Map()
  let frameId = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
    frames.delete(id)
  })
  viewport = Object.assign(new EventTarget(), { height: LAYOUT_HEIGHT, offsetTop: 0, scale: 1 })
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
  Object.defineProperty(window, 'innerWidth', { value: 1366, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: LAYOUT_HEIGHT, configurable: true })
  host = document.createElement('div')
  host.innerHTML =
    '<dialog open data-satin-presentation="alert"><p>Name workout</p><input></dialog>' +
    '<dialog open data-satin-presentation="sheet">' +
    '<div data-satin-scroll-axis="vertical"><input></div></dialog>'
  document.body.append(host)
  install()
})
afterEach(() => {
  vi.useRealTimers()
  uninstall()
  host.remove()
  vi.restoreAllMocks()
})

it.each([
  { device: 'narrow iPad', userAgent: 'iPad', width: 440, height: 956, expectedHeight: 296 },
  { device: 'wide phone', userAgent: 'iPhone', width: 700, height: 800, expectedHeight: 391 },
])(
  'publishes the $device identity default before a keyboard report',
  ({ userAgent, width, height, expectedHeight }) => {
    uninstall()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
    viewport.height = height
    install()
    expect(metrics).toMatchObject({ visible: false, expectedHeight })
  },
)

it('plans for the device default before any report, then for the tallest keyboard measured', () => {
  expect(metrics).toMatchObject({ visible: false, expectedHeight: 498 })
  focus(alertField())
  reportViewport(500)
  // A taller keyboard than the default (another language, a larger bar) replaces it.
  expect(metrics).toMatchObject({ visible: true, height: 524, expectedHeight: 524 })
  now += 100
  reportViewport(FIRST_STEP_VIEWPORT)
  // A shorter keyboard afterwards does not lower what to plan for.
  expect(metrics).toMatchObject({ height: 460, expectedHeight: 524 })
})

it('knows the measured height at the first focus after the next launch', () => {
  focus(alertField())
  reportViewport(500)
  act(() => alertField().blur())
  reportViewport(LAYOUT_HEIGHT)
  uninstall()
  install()
  expect(metrics).toMatchObject({ visible: false, expectedHeight: 524 })
})

it('keeps editing when typing collapses the predictive bar', () => {
  focus(alertField())
  reportViewport(FIRST_STEP_VIEWPORT)
  now += 15
  reportViewport(FULL_KEYBOARD_VIEWPORT)
  expect(metrics).toMatchObject({ visible: true, height: 498 })
  now += 2_000
  act(() => {
    alertField().dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }))
    alertField().dispatchEvent(new Event('input', { bubbles: true }))
  })
  now += 40
  reportViewport(FIRST_STEP_VIEWPORT)
  expect(document.activeElement).toBe(alertField())
  expect(metrics).toMatchObject({ visible: true, height: 460 })
})

it('preserves focus when viewport growth could be keyboard dismissal or rotation', () => {
  focus(alertField())
  reportViewport(FULL_KEYBOARD_VIEWPORT)
  act(() => {
    alertField().dispatchEvent(new Event('input', { bubbles: true }))
  })
  now += 40
  // The keyboard's own dismiss key: the whole viewport comes back in one report.
  reportViewport(LAYOUT_HEIGHT)
  expect(document.activeElement).toBe(alertField())
  expect(metrics.visible).toBe(false)
})

it('reveals a sheet field above the tallest keyboard measured, not only the one on screen', () => {
  const surface = sheetSurface()
  const field = sheetField()
  vi.spyOn(surface, 'getBoundingClientRect').mockImplementation(
    () => ({ top: 80, bottom: LAYOUT_HEIGHT }) as DOMRect,
  )
  vi.spyOn(field, 'getBoundingClientRect').mockImplementation(
    () => ({ top: 500 - surface.scrollTop, bottom: 544 - surface.scrollTop }) as DOMRect,
  )
  focus(field)
  reportViewport(FIRST_STEP_VIEWPORT)
  flushFrames()
  // 544 pt is clear of the first step's keyboard (564 pt less the 12 pt gap).
  expect(surface.scrollTop).toBe(0)
  expect(surface.style.paddingBottom).toBe('460px')
  now += 15
  reportViewport(FULL_KEYBOARD_VIEWPORT)
  flushFrames()
  expect(surface.scrollTop).toBe(30)
  expect(surface.style.paddingBottom).toBe('498px')
  // The next focus meets the short keyboard first: the field is already placed for the tall one,
  // so the bar's arrival covers nothing WebKit could see.
  act(() => field.blur())
  reportViewport(LAYOUT_HEIGHT)
  surface.scrollTop = 0
  focus(field)
  reportViewport(FIRST_STEP_VIEWPORT)
  flushFrames()
  expect(surface.scrollTop).toBe(30)
  expect(surface.style.paddingBottom).toBe('498px')
  expect(metrics).toMatchObject({ height: 460, viewportHeight: 564 })
})

it('keeps the last keyboard geometry through an implausible viewport report and accepts recovery', () => {
  uninstall()
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 1334, configurable: true })
  viewport.height = 1334
  install()
  focus(sheetField())
  reportViewport(967)
  expect(metrics).toMatchObject({ height: 367, viewportHeight: 967, expectedHeight: 367 })

  // Installed iPad failure: the layout and native keyboard stayed put, but WebKit
  // briefly reported a 310 pt viewport. It must not lift the composer by 1024 pt
  // or poison the keyboard height used for the next focus.
  reportViewport(310)
  expect(metrics).toMatchObject({ height: 367, viewportHeight: 967, expectedHeight: 367 })
  expect(host.style.getPropertyValue('--satin-keyboard-height')).toBe('367px')
  expect(document.activeElement).toBe(sheetField())

  reportViewport(967)
  reportViewport(1264)
  expect(metrics).toMatchObject({ height: 70, viewportHeight: 1264, expectedHeight: 367 })
  reportViewport(1334)
  expect(metrics).toMatchObject({ height: 0, viewportHeight: 1334, visible: false })

  // A resumed app can meet the bad report before receiving any valid live
  // geometry. Use only the stored measurement for this exact window size.
  uninstall()
  install()
  focus(sheetField())
  reportViewport(310)
  expect(metrics).toMatchObject({ height: 367, viewportHeight: 967, anticipated: true })
  reportViewport(967)
  expect(metrics).toMatchObject({ height: 367, viewportHeight: 967, anticipated: false })

  // A short phone landscape window must still accept the existing 250 pt default.
  uninstall()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  Object.defineProperty(window, 'innerWidth', { value: 844, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 320, configurable: true })
  viewport.height = 320
  install()
  focus(sheetField())
  reportViewport(70)
  expect(metrics).toMatchObject({ height: 250, viewportHeight: 70, visible: true })
})
