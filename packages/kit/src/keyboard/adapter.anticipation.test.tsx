// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installKeyboardAdapter, useKeyboardMetrics } from './adapter.ts'

// Installed iPad (1366 x 1024), the alert with a text field, real taps
// (scratch evidence: sheetmat/p1/evidence/alert1, pinned1, preraise1):
// the software keyboard leaves 526 pt, and WebKit reports it 100-120 ms after the tap's focus.
const LAYOUT_HEIGHT = 1024
const KEYBOARD_VIEWPORT = 526
const REPORT_DELAY_MS = 110

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
const advance = (milliseconds: number) =>
  act(() => {
    now += milliseconds
    vi.advanceTimersByTime(milliseconds)
  })
function tap(target: Element) {
  act(() => {
    const point = { bubbles: true, clientX: 20, clientY: 20 }
    target.dispatchEvent(new PointerEvent('pointerdown', point))
    target.dispatchEvent(new PointerEvent('pointerup', point))
  })
}
function reportViewport(height: number) {
  act(() => {
    viewport.height = height
    viewport.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(150)
  })
  flushFrames()
}
const field = (kind = 'alert') =>
  host.querySelector<HTMLInputElement>(`dialog[data-satin-presentation="${kind}"] input`)!
const title = () => host.querySelector<HTMLElement>('dialog[data-satin-presentation="alert"] p')!
/** One whole cycle with the keyboard measured: tap the field, keyboard arrives, tap away, it leaves. */
function measureKeyboardOnce() {
  tap(field())
  advance(REPORT_DELAY_MS)
  reportViewport(KEYBOARD_VIEWPORT)
  expect(metrics).toMatchObject({ visible: true, height: 498, anticipated: false })
  tap(title())
  expect(document.activeElement).not.toBe(field())
  advance(50)
  reportViewport(LAYOUT_HEIGHT)
  expect(metrics.visible).toBe(false)
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  now = 1_000
  frames = new Map()
  let frameId = 0
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
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
    '<dialog open data-satin-presentation="sheet"><input></dialog>'
  document.body.append(host)
  dispose = installKeyboardAdapter(host)
  const mount = document.createElement('div')
  host.append(mount)
  reactRoot = createRoot(mount)
  act(() => reactRoot.render(<Probe />))
})
afterEach(() => {
  act(() => reactRoot.unmount())
  dispose()
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('waits for the viewport report on the first tap focus, when no keyboard has been measured', () => {
  tap(field())
  expect(document.activeElement).toBe(field())
  expect(metrics.visible).toBe(false)
  advance(REPORT_DELAY_MS)
  reportViewport(KEYBOARD_VIEWPORT)
  expect(metrics).toMatchObject({
    visible: true,
    viewportHeight: KEYBOARD_VIEWPORT,
    anticipated: false,
  })
})

it('publishes the measured keyboard at the tap that focuses an alert field again', () => {
  measureKeyboardOnce()
  tap(field())
  // In the tap itself, 110 ms before WebKit reports: the alert can leave for its keyboard place.
  expect(metrics).toMatchObject({
    visible: true,
    anticipated: true,
    height: 498,
    viewportHeight: KEYBOARD_VIEWPORT,
    offsetTop: 0,
    presentation: field().closest('dialog'),
  })
  expect(host.dataset.satinKeyboard).toBe('visible')
  advance(REPORT_DELAY_MS)
  reportViewport(KEYBOARD_VIEWPORT)
  expect(metrics).toMatchObject({
    visible: true,
    anticipated: false,
    viewportHeight: KEYBOARD_VIEWPORT,
  })
  expect(document.activeElement).toBe(field())
})

it('does not end editing when an earlier keyboard reports its departure after the new tap', () => {
  measureKeyboardOnce()
  tap(field())
  expect(metrics.anticipated).toBe(true)
  // The viewport is still the full height: a late resize event must not read as "keyboard hiding".
  reportViewport(LAYOUT_HEIGHT)
  expect(document.activeElement).toBe(field())
  expect(metrics).toMatchObject({ visible: true, anticipated: true })
})

it('withdraws an anticipated keyboard that never arrives, and keeps the field focused', () => {
  measureKeyboardOnce()
  tap(field())
  expect(metrics.anticipated).toBe(true)
  advance(600)
  flushFrames()
  expect(metrics).toMatchObject({ visible: false, anticipated: false, height: 0 })
  expect(document.activeElement).toBe(field())
  // A hardware keyboard is attached: later taps are not anticipated until one is measured again.
  tap(title())
  flushFrames()
  tap(field())
  expect(metrics.visible).toBe(false)
})

it('withdraws the anticipated keyboard when editing ends before the report', () => {
  measureKeyboardOnce()
  tap(field())
  expect(metrics.anticipated).toBe(true)
  advance(40)
  tap(title())
  flushFrames()
  expect(metrics).toMatchObject({ visible: false, anticipated: false })
})

it('anticipates only for an alert: a sheet waits for the report', () => {
  measureKeyboardOnce()
  tap(field('sheet'))
  expect(document.activeElement).toBe(field('sheet'))
  expect(metrics.visible).toBe(false)
})
