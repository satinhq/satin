// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { GlassRegionRegistry } from '../regionRegistry.ts'
import { Glass } from '../regions.ts'
import type { WebGPUClient } from './client.ts'
import { RegionBridge } from './regionBridge.ts'
import { observePresenterViewport } from './presenterViewport.ts'
import {
  KEYBOARD_CARRIER_MOTION,
  setKeyboardCarrierPose,
  clearKeyboardCarrierPose,
} from '../../safe-area/keyboardCarrierGeometry.ts'
import { animateElement, animateLayout } from '../../motion/animate.ts'

vi.mock('./foreground.ts', () => ({
  captureRegionForeground: vi.fn(async () => document.createElement('canvas')),
}))

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('tracks a retained canvas through ancestor drag and framework animation', async () => {
  const panel = document.createElement('div')
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'width:200px;height:100px'
  panel.append(canvas)
  document.body.append(panel)
  let rect = { x: 100, y: 200, width: 200, height: 100 }
  vi.spyOn(canvas, 'getBoundingClientRect').mockImplementation(() => rect as DOMRect)
  const update = vi.fn()
  const observer = observePresenterViewport(canvas, update)
  try {
    await vi.waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        { x: 100, y: 200, scaleX: 1, scaleY: 1 },
        expect.any(Array),
        undefined,
      ),
    )
    rect = { x: 120, y: 190, width: 220, height: 80 }
    panel.style.transform = 'translate(20px,-10px) scale(1.1,.8)'
    await vi.waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        { x: 120, y: 190, scaleX: 1.1, scaleY: 0.8 },
        expect.any(Array),
        undefined,
      ),
    )
    // A simultaneous keyboard carry must not hide a same-frame framework gesture/layout move.
    setKeyboardCarrierPose(panel, () => ({ offsetY: 0, moving: true }))
    // WAAPI does not mutate style/class or dispatch a CSS animationstart event.
    Object.defineProperty(panel, 'animate', { value: () => ({ playState: 'finished' }) })
    rect = { x: 130, y: 180, width: 200, height: 100 }
    animateElement(panel, [{ transform: 'translate(30px,-20px)' }], { duration: 100 })
    expect(update).toHaveBeenLastCalledWith(
      { x: 130, y: 180, scaleX: 1, scaleY: 1 },
      expect.any(Array),
      undefined,
    )
    const sibling = document.createElement('div')
    panel.before(sibling)
    let finish!: () => void
    const animation = {
      playState: 'running',
      finished: new Promise<void>(resolve => {
        finish = resolve
      }),
    }
    Object.defineProperty(sibling, 'animate', { value: () => animation })
    rect = { x: 130, y: 170, width: 200, height: 100 }
    animateLayout(sibling, [{ height: '0px' }], { duration: 100 })
    expect(update).toHaveBeenLastCalledWith(
      { x: 130, y: 170, scaleX: 1, scaleY: 1 },
      expect.any(Array),
      undefined,
    )
    animation.playState = 'finished'
    rect = { x: 130, y: 160, width: 200, height: 100 }
    finish()
    await vi.waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        { x: 130, y: 160, scaleX: 1, scaleY: 1 },
        expect.any(Array),
        undefined,
      ),
    )
    // A font/composer height change keeps the same origin and scale but samples new rows.
    canvas.style.height = '160px'
    rect = { x: 130, y: 160, width: 200, height: 160 }
    observer.sample()
    expect(update).toHaveBeenLastCalledWith(
      { x: 130, y: 160, scaleX: 1, scaleY: 1 },
      [130, 160, 200, 160],
      undefined,
    )
  } finally {
    clearKeyboardCarrierPose(panel)
    observer.dispose()
  }
})

// Installed iPad (1366 x 1024), a real finger resizing the sheet between its detents: the sheet
// surface's top edge and the gap under its bottom edge in consecutive painted frames
// (scratch evidence: sheetmat/p1/evidence/probe2/resize-a.frames.tsv).
const RECORDED = [
  { top: 474.1, gap: 7.9 },
  { top: 439.2, gap: 7.3 },
  { top: 399.4, gap: 6.6 },
  { top: 356.7, gap: 5.8 },
  { top: 313, gap: 5 },
  { top: 268.3, gap: 4.2 },
  { top: 224.1, gap: 3.4 },
  { top: 180.8, gap: 2.7 },
  { top: 139.1, gap: 1.9 },
  { top: 100.8, gap: 1.2 },
  { top: 67.4, gap: 0.6 },
  { top: 45.8, gap: 0.2 },
  { top: 74.3, gap: 0.7 },
  { top: 108.6, gap: 1.4 },
  { top: 146.5, gap: 2 },
  { top: 185.8, gap: 2.7 },
]
const SCREEN_HEIGHT = 1024
const frameOf = ({ top, gap }: { top: number; gap: number }) => ({
  x: 373,
  y: top,
  left: 373,
  top,
  width: 620,
  height: SCREEN_HEIGHT - gap - top,
  right: 993,
  bottom: SCREEN_HEIGHT - gap,
  toJSON: () => ({}),
})
/** The canvas's edges as layout resolves its inline box inside the holder's current frame. */
function resolvedBox(canvas: HTMLCanvasElement, holder: { top: number; height: number }) {
  const relative = /^calc\(100% \+ (-?[\d.]+)px\)$/.exec(canvas.style.height)
  const height = relative ? holder.height + Number(relative[1]) : parseFloat(canvas.style.height)
  const top = holder.top + parseFloat(canvas.style.top)
  return { top, bottom: top + height }
}
function sheetRegion(style: Partial<CSSStyleDeclaration> = {}) {
  const client = {
    request: vi.fn(async () => {}),
    onEvent: () => () => {},
  } as unknown as WebGPUClient
  const registry = new GlassRegionRegistry(),
    source = document.createElement('div'),
    surface = document.createElement('div'),
    canvas = document.createElement('canvas')
  Object.assign(surface.style, { position: 'relative', ...style })
  surface.append(canvas)
  source.append(surface)
  document.body.append(source)
  Object.defineProperty(canvas, 'transferControlToOffscreen', { value: () => ({}) })
  let measuredFrame = frameOf(RECORDED[0]!)
  vi.spyOn(surface, 'getBoundingClientRect').mockImplementation(() => measuredFrame as DOMRect)
  registry.register({
    id: 'sheet',
    element: surface,
    canvas,
    descriptor: {
      id: 'sheet',
      material: Glass.sheet.material,
      shape: { kind: 'roundedRectangle', cornerRadius: 48, cornerStyle: 'continuous' },
      layer: { id: 'presentation', depth: 1000, attachment: { kind: 'fixed' } },
    },
  })
  const bridge = new RegionBridge(client, 'dark')
  bridge.bind(registry, source)
  return {
    bridge,
    canvas,
    measure(frame: ReturnType<typeof frameOf>) {
      measuredFrame = frame
    },
  }
}

it('keeps the glass on a sheet whose height changes after the bridge has measured it', async () => {
  const { bridge, canvas, measure } = sheetRegion()
  await bridge.refresh()
  const resting = frameOf(RECORDED[0]!)
  const restingBox = resolvedBox(canvas, resting)
  const margin = restingBox.bottom - resting.bottom
  expect(margin).toBeGreaterThan(0)
  expect(resting.top - restingBox.top).toBeCloseTo(margin, 6)
  for (let index = 1; index < RECORDED.length; index++) {
    // In a drag frame the bridge's refresh runs first and measures the previous frame...
    measure(frameOf(RECORDED[index - 1]!))
    await bridge.refresh()
    // ...and then the sheet writes this frame's height. What is painted is this frame's layout.
    const painted = frameOf(RECORDED[index]!)
    const box = resolvedBox(canvas, painted)
    // No page shows under the sheet's bottom edge, and no glass hangs below it.
    expect(box.bottom - painted.bottom).toBeCloseTo(margin, 6)
    expect(painted.top - box.top).toBeCloseTo(margin, 6)
  }
  bridge.unbind()
})

it.each([
  ['a border', { borderTopWidth: '1px', borderTopStyle: 'solid' }],
  ['no containing block of its own', { position: 'static' }],
])('keeps the measured size for a holder with %s', async (_label, style) => {
  const { bridge, canvas } = sheetRegion(style)
  await bridge.refresh()
  expect(canvas.style.height).toMatch(/^[\d.]+px$/)
  expect(canvas.style.width).toMatch(/^[\d.]+px$/)
  bridge.unbind()
})

it('publishes one keyboard trajectory, retimes it, and restores ordinary viewport updates at rest', async () => {
  const panel = document.createElement('div')
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'width:200px;height:44px'
  panel.append(canvas)
  document.body.append(panel)
  let offsetY = 0
  let moving = true
  let motion = {
    epoch: 1000,
    duration: 1000,
    end: 1400,
    offset: 0,
    stops: [
      [0, 0],
      [0.4, -300],
      [1, -300],
    ] as const,
  }
  setKeyboardCarrierPose(panel, () => ({ offsetY, moving, motion: moving ? motion : undefined }))
  const read = vi
    .spyOn(canvas, 'getBoundingClientRect')
    .mockImplementation(() => ({ x: 30, y: 800 + offsetY, width: 200, height: 44 }) as DOMRect)
  let nextFrame: FrameRequestCallback | undefined
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    nextFrame = callback
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  const update = vi.fn()
  const observer = observePresenterViewport(canvas, update)
  try {
    await Promise.resolve()
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.lastCall![2]).toEqual({ ...motion, offset: 800 })
    const measurements = read.mock.calls.length
    for (const value of [-20.123456, -100.333333, -250.111111, -300]) {
      offsetY = value
      nextFrame!(0)
    }
    expect(read).toHaveBeenCalledTimes(measurements)
    expect(update).toHaveBeenCalledTimes(1)
    motion = { ...motion, epoch: 950, end: 1350 }
    window.dispatchEvent(new Event(KEYBOARD_CARRIER_MOTION))
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.lastCall![2]).toEqual({ ...motion, offset: 800 })
    moving = false
    window.dispatchEvent(new Event(KEYBOARD_CARRIER_MOTION))
    await Promise.resolve()
    expect(update.mock.lastCall).toEqual([
      { x: 30, y: 500, scaleX: 1, scaleY: 1 },
      [30, 500, 200, 44],
      undefined,
    ])
  } finally {
    observer.dispose()
    clearKeyboardCarrierPose(panel)
  }
})

// The root sheet material samples the page. Its own child canvas is not a
// nested material; only glass owned by content inside the sheet is sheet-local.
it('keeps the root sheet backdrop registered to the page through drag reversals', () => {
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
  const dialog = document.createElement('dialog')
  dialog.setAttribute('data-satin-presentation', 'sheet')
  dialog.innerHTML = `<div data-satin-glass-layer>
    <div class="satin-presentation-surface"><canvas></canvas>
      <div data-nested><canvas></canvas></div>
    </div></div>`
  document.body.append(dialog)
  const layer = dialog.firstElementChild as HTMLElement
  const surface = layer.firstElementChild as HTMLElement
  const nested = surface.querySelector<HTMLElement>('[data-nested]')!
  const rootCanvas = surface.querySelector('canvas')!
  const nestedCanvas = nested.querySelector('canvas')!
  let offset = 0
  for (const [canvas, top] of [
    [rootCanvas, 480],
    [nestedCanvas, 550],
  ] as const) {
    canvas.style.cssText = 'width:400px;height:100px'
    vi.spyOn(canvas, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(20, top + offset, 400, 100),
    )
  }
  const rootUpdate = vi.fn(),
    nestedUpdate = vi.fn()
  const rootObserver = observePresenterViewport(rootCanvas, rootUpdate)
  const nestedObserver = observePresenterViewport(nestedCanvas, nestedUpdate)
  try {
    for (offset of [0, 100, 220, 100, -40, 0]) {
      layer.style.transform = `translateY(${offset}px)`
      rootObserver.sample()
      nestedObserver.sample()
      expect(rootUpdate).toHaveBeenLastCalledWith(
        { x: 20, y: 480 + offset, scaleX: 1, scaleY: 1 },
        [20, 480 + offset, 400, 100],
        undefined,
      )
      expect(nestedUpdate).toHaveBeenLastCalledWith(
        { x: 20, y: 550, scaleX: 1, scaleY: 1 },
        [20, 550, 400, 100],
        undefined,
      )
    }
  } finally {
    rootObserver.dispose()
    nestedObserver.dispose()
  }
})
