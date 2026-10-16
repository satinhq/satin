// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  KEYBOARD_CARRIER_MOTION,
  setKeyboardCarrierPose,
  clearKeyboardCarrierPose,
} from '../../safe-area/keyboardCarrierGeometry.ts'
import { observePresenterViewport } from './presenterViewport.ts'
import { registerZoomGlass } from '../../navigation/zoomGlass.ts'
import { publishNavigationGlass } from '../../navigation/glassTransition.ts'
vi.mock('../../presentation/glassMotion.ts', () => ({ presentationGlassFollowing: () => false }))
vi.mock('./accessoryMorph.ts', () => ({ accessoryGlassMotion: () => false }))
vi.mock('../presentationFrame.ts', () => ({
  atRest: (rect: DOMRect) => rect,
  presentationTravel: () => ({ x: 0, y: 0 }),
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})
it('follows a keyboard carrier in the same frame from its compositor geometry', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const accessory = document.createElement('div')
  const canvas = document.createElement('canvas')
  accessory.append(canvas)
  document.body.append(accessory)
  let offsetY = 0
  let moving = false
  setKeyboardCarrierPose(accessory, () => ({ offsetY, moving }))
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    width: '100px',
    height: '50px',
  } as CSSStyleDeclaration)
  canvas.getBoundingClientRect = () => new DOMRect(10, 900, 100, 50)
  const rectangles: number[][] = []
  const observer = observePresenterViewport(canvas, (_viewport, rect) => rectangles.push([...rect]))
  observer.sample()
  expect(rectangles.at(-1)).toEqual([10, 900, 100, 50])
  offsetY = -120
  moving = true
  window.dispatchEvent(new Event(KEYBOARD_CARRIER_MOTION))
  await Promise.resolve()
  expect(rectangles.at(-1)).toEqual([10, 780, 100, 50])
  observer.dispose()
  clearKeyboardCarrierPose(accessory)
})

it('keeps content glass on its route artwork through zoom push, pop and reversal', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const host = document.createElement('div')
  host.dataset.satinNavigatorHost = 'true'
  const page = document.createElement('div')
  host.append(page)
  const canvas = document.createElement('canvas')
  page.append(canvas)
  document.body.append(host)
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    width: '200px',
    height: '80px',
  } as CSSStyleDeclaration)
  let scale = 1
  let x = 0
  let y = 0
  let contentY = 453
  const release = registerZoomGlass(page, {
    layout: { x: 0, y: 0, width: 440, height: 956 },
    carriers: [page],
    read: at => ({
      end: at,
      sample: () => ({
        x,
        y,
        scale,
        origin: [0, 0],
        clip: [x, y, 440 * scale, 956 * scale],
        radius: 20,
      }),
    }),
  })
  canvas.getBoundingClientRect = () =>
    new DOMRect(x + 20 * scale, y + contentY * scale, 200 * scale, 80 * scale)
  const samples: number[][] = []
  const observer = observePresenterViewport(canvas, viewport => {
    samples.push([viewport.x, viewport.y, viewport.scaleX, viewport.scaleY])
  })
  // A route-local atlas keeps the same artwork under Play/Shuffle while the CSS
  // page grows, dismisses and reverses. Screen-space sampling would drift into Home.
  for (const nextScale of [0.4, 0.8, 1, 0.52, 0.75, 1]) {
    scale = nextScale
    x = 160 * (1 - scale)
    y = 200 * (1 - scale)
    observer.sample()
    const sample = samples.at(-1)!
    expect(sample[0]).toBeCloseTo(20)
    expect(sample[1]).toBeCloseTo(453)
    expect(sample[2]).toBeCloseTo(1)
    expect(sample[3]).toBeCloseTo(1)
  }
  contentY = 420
  observer.sample()
  expect(samples.at(-1)).toEqual([20, 420, 1, 1])
  contentY = 453
  observer.sample()
  release()
  void publishNavigationGlass(host, {
    active: true,
    zoom: true,
    width: 440,
    routes: [{ key: 'album', source: page, screen: page, motion: page, dim: page }],
    top: 'album',
  })
  canvas.getBoundingClientRect = () => new DOMRect(460, 453, 200, 80)
  observer.sample()
  expect(samples.at(-1)).toEqual([20, 453, 1, 1])
  // Another pane's active zoom must not retain this route's settled viewport.
  void publishNavigationGlass(host, {
    active: true,
    zoom: true,
    width: 440,
    routes: [],
    top: 'other',
  })
  observer.sample()
  expect(samples.at(-1)).toEqual([460, 453, 1, 1])
  void publishNavigationGlass(host, { active: false, width: 440, routes: [], top: 'album' })
  canvas.getBoundingClientRect = () => new DOMRect(24, 460, 196, 78.4)
  observer.sample()
  expect(samples.at(-1)).toEqual([24, 460, expect.closeTo(0.98), expect.closeTo(0.98)])
  observer.dispose()
})
