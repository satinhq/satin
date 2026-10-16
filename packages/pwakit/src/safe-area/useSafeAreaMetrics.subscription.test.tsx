// @vitest-environment happy-dom
import { act, Profiler } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useSafeAreaInsets } from '../public/environment.tsx'
import {
  readSafeAreaMetrics,
  useSafeAreaMetrics,
  useSafeAreaLayoutMetrics,
  type SafeAreaMetrics,
} from './useSafeAreaMetrics.ts'

let root: Root | undefined
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
let liveObservers = 0
let viewport: EventTarget & {
  width: number
  height: number
  offsetTop: number
  offsetLeft: number
  scale: number
}
const samples = new Map<number, SafeAreaMetrics>()
function Probe({ id }: { id: number }) {
  samples.set(id, useSafeAreaMetrics())
  return null
}
function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(Array.from({ length: 64 }, (_, id) => <Probe key={id} id={id} />)))
}
function setup() {
  viewport = Object.assign(new EventTarget(), {
    width: 1024,
    height: 1334,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
  })
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor() {
        liveObservers++
      }
      observe() {}
      disconnect() {
        liveObservers--
      }
    },
  )
}
function flush() {
  const pending = [...frames.values()]
  frames.clear()
  act(() => pending.forEach(callback => callback(0)))
}
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  frames.clear()
  samples.clear()
  liveObservers = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-satin-viewport-fit')
})
it('samples the shared sensor once for many consumers and coalesces viewport events', () => {
  setup()
  const reads = vi.spyOn(window, 'getComputedStyle')
  mount()
  expect(liveObservers).toBe(1)
  expect(reads).toHaveBeenCalledTimes(1)
  reads.mockClear()
  viewport.height = 900
  viewport.dispatchEvent(new Event('resize'))
  viewport.dispatchEvent(new Event('scroll'))
  expect(frames.size).toBe(1)
  flush()
  expect(reads).toHaveBeenCalledTimes(1)
  expect(new Set(samples.values()).size).toBe(1)
  expect([...samples.values()].every(sample => sample.visualViewport.height === 900)).toBe(true)
})
it('cancels pending work at the last unsubscribe and samples fresh geometry on remount', () => {
  setup()
  mount()
  viewport.height = 900
  viewport.dispatchEvent(new Event('resize'))
  act(() => root!.unmount())
  root = undefined
  expect(frames.size).toBe(0)
  expect(liveObservers).toBe(0)
  expect(document.querySelector('[data-satin-safe-area-sensor]')).toBeNull()
  viewport.height = 700
  mount()
  expect([...samples.values()].every(sample => sample.visualViewport.height === 700)).toBe(true)
})

it('keeps inset-only content idle when only the visual viewport changes', () => {
  setup()
  const rendered = vi.fn()
  function InsetsContent() {
    const insets = useSafeAreaInsets()
    return <div>{insets.bottom}</div>
  }
  let visualHeight = 0
  function LayoutContent() {
    useSafeAreaLayoutMetrics()
    return null
  }
  function DiagnosticContent() {
    visualHeight = useSafeAreaMetrics().visualViewport.height
    return null
  }
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root!.render(
      <>
        <Profiler id="insets" onRender={rendered}>
          <InsetsContent />
          <LayoutContent />
        </Profiler>
        <DiagnosticContent />
      </>,
    ),
  )
  rendered.mockClear()
  viewport.height = 700
  viewport.dispatchEvent(new Event('resize'))
  flush()
  expect(rendered).not.toHaveBeenCalled()
  expect(host.textContent).toBe('0')
  expect(visualHeight).toBe(700)
})

// Owner iPhone 17 Pro Max: fitted standalone content reaches the physical bottom,
// model the missing env bottom. Native Foundation 00 measures 34 pt.
it('reserves the measured home indicator in a fitted standalone phone, including keyboard occlusion', () => {
  setup()
  vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: true })
  vi.stubGlobal('screen', { width: 440, height: 956 })
  vi.stubGlobal('innerWidth', 440)
  vi.stubGlobal('innerHeight', 894)
  document.documentElement.dataset.satinViewportFit = 'auto'
  const hidden = readSafeAreaMetrics()
  expect(hidden.insets.bottom).toBe(34)
  expect(hidden.safeFrame.height).toBe(860)
  viewport.height = 608
  const shown = readSafeAreaMetrics()
  expect(shown.insets.bottom).toBe(34)
  expect(shown.visualViewport.height).toBe(608)
  vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: false })
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: true })
  vi.stubGlobal('innerWidth', 409)
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  vi.stubGlobal('innerWidth', 440)
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    paddingTop: '0px',
    paddingRight: '0px',
    paddingBottom: '21px',
    paddingLeft: '0px',
  } as CSSStyleDeclaration)
  expect(readSafeAreaMetrics().insets.bottom).toBe(21)
  vi.restoreAllMocks()
  document.documentElement.dataset.satinViewportFit = 'cover'
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  document.documentElement.removeAttribute('data-satin-viewport-fit')
})

// Installed iPad Pro 11-inch and 12.9-inch, iPadOS 27: the fitted viewport starts below a
// 32 pt status band, reaches the screen bottom and reports zero env() insets. Native SwiftUI
// keeps a 25 pt home-indicator boundary in both orientations; without it the composer's
// trailing edge sat in the bottom-right corner, where a first tap raised no keyboard.
it('reserves the measured home indicator in a fitted standalone iPad in both orientations', () => {
  setup()
  vi.stubGlobal('navigator', { userAgent: 'iPad', standalone: true })
  document.documentElement.dataset.satinViewportFit = 'auto'
  const windows = [
    { screen: [834, 1194], window: [834, 1162] },
    { screen: [1024, 1366], window: [1024, 1334] },
    { screen: [1024, 1366], window: [1366, 992] },
    { screen: [1366, 1024], window: [1366, 992] },
  ]
  for (const { screen, window } of windows) {
    vi.stubGlobal('screen', { width: screen[0], height: screen[1] })
    vi.stubGlobal('innerWidth', window[0])
    vi.stubGlobal('innerHeight', window[1])
    expect(readSafeAreaMetrics().insets.bottom, `${window[0]}x${window[1]}`).toBe(25)
  }

  vi.stubGlobal('screen', { width: 834, height: 1194 })
  vi.stubGlobal('innerWidth', 834)
  vi.stubGlobal('innerHeight', 1162)
  viewport.height = 760
  expect(readSafeAreaMetrics().insets.bottom, 'keyboard shown').toBe(25)

  vi.stubGlobal('innerWidth', 507) // Split View: the window is not the whole screen.
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  vi.stubGlobal('innerWidth', 834)
  vi.stubGlobal('innerHeight', 1170) // An unmeasured status band.
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  vi.stubGlobal('innerHeight', 1162)
  vi.stubGlobal('navigator', { userAgent: 'iPad', standalone: false })
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  vi.stubGlobal('navigator', { userAgent: 'iPad', standalone: true })
  document.documentElement.dataset.satinViewportFit = 'cover'
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  document.documentElement.dataset.satinViewportFit = 'auto'
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    paddingTop: '0px',
    paddingRight: '0px',
    paddingBottom: '20px',
    paddingLeft: '0px',
  } as CSSStyleDeclaration)
  expect(readSafeAreaMetrics().insets.bottom, 'reported env() wins').toBe(20)
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-satin-viewport-fit')
})

// This is a policy matrix, not seven newly qualified installed devices.
it('restores the home-indicator boundary across fitted Face ID portrait geometries', () => {
  setup()
  vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: true })
  document.documentElement.dataset.satinViewportFit = 'auto'
  const portraits = [
    [393, 852, 59],
    [402, 874, 62],
    [430, 932, 59],
    [440, 956, 62],
    [420, 912, 62],
    [390, 844, 47],
    [375, 812, 44],
  ]
  for (const [width, height, statusBand] of portraits) {
    document.documentElement.dataset.satinViewportFit = width === 420 ? 'contain' : 'auto'
    vi.stubGlobal('screen', { width, height })
    vi.stubGlobal('innerWidth', width)
    vi.stubGlobal('innerHeight', height - statusBand)
    expect(readSafeAreaMetrics().insets.bottom, `${width}x${height}`).toBe(34)
  }
  vi.stubGlobal('screen', { width: 375, height: 667 })
  vi.stubGlobal('innerWidth', 375)
  vi.stubGlobal('innerHeight', 647)
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  vi.stubGlobal('screen', { width: 440, height: 956 })
  vi.stubGlobal('innerWidth', 440)
  vi.stubGlobal('innerHeight', 860) // Both top 62 and bottom 34 already excluded.
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  vi.stubGlobal('innerHeight', 894)
  vi.stubGlobal('navigator', { userAgent: 'iPad', standalone: true })
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  vi.stubGlobal('navigator', { userAgent: 'unknown', standalone: true })
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
  vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: true })
  vi.stubGlobal('innerWidth', 956)
  vi.stubGlobal('innerHeight', 440)
  expect(readSafeAreaMetrics().insets.bottom).toBe(0)
})
