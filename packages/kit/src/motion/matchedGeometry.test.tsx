// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Animation } from './animationValue.ts'
import { MatchedGeometryEffect, useNamespace, withAnimation } from './matchedGeometry.tsx'

/* happy-dom has no layout or Web Animations. Frames come from data-rect ("x y width height"),
 * and element.animate records its keyframes on a fake run whose clock the test sets. */
type FakeRun = {
  element: Element
  keyframes: Keyframe[]
  currentTime: number
  cancelled: boolean
  cancel(): void
  finished: Promise<void>
}
let started: FakeRun[] = []
const roots: Root[] = []

beforeEach(() => {
  started = []
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const [x = 0, y = 0, width = 0, height = 0] = (this.dataset.rect ?? '').split(' ').map(Number)
    return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height } as DOMRect
  })
  Element.prototype.animate = function (this: Element, keyframes) {
    const run: FakeRun = {
      element: this,
      keyframes: keyframes as Keyframe[],
      currentTime: 0,
      cancelled: false,
      cancel() {
        run.cancelled = true
      },
      finished: new Promise(() => {}),
    }
    started.push(run)
    return run as unknown as ReturnType<Element['animate']>
  }
})
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

const BIG = '0 100 400 400'
const THUMB = '20 40 72 72'

/** Now Playing: the big artwork, or the queue with the same artwork as a thumbnail. */
function NowPlaying({ onToggle }: { onToggle: (toggle: () => void) => void }) {
  const art = useNamespace()
  const [queue, setQueue] = useState(false)
  onToggle(() => withAnimation(() => setQueue(shown => !shown)))
  // Keys make these two views, as the queue and the artwork slot are two subtrees in the app.
  return queue ? (
    <MatchedGeometryEffect key="queue" id="art" in={art}>
      <img alt="" data-name="thumb" data-rect={THUMB} />
    </MatchedGeometryEffect>
  ) : (
    <MatchedGeometryEffect key="player" id="art" in={art}>
      <img alt="" data-name="big" data-rect={BIG} />
    </MatchedGeometryEffect>
  )
}

async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root: Root = createRoot(host)
  roots.push(root)
  let toggle = () => {}
  await act(() => root.render(<NowPlaying onToggle={next => (toggle = next)} />))
  return { host, toggle: () => act(() => toggle()) }
}

/** The live run of the named view, or of its ghost (a removed view still on screen). */
const runOf = (name: string, { ghost = false } = {}) =>
  started.findLast(
    run =>
      (run.element as HTMLElement).dataset.name === name &&
      !run.cancelled &&
      run.element.hasAttribute('aria-hidden') === ghost,
  )!

function translation(transform: unknown) {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+), (-?[\d.]+)\)/.exec(
    String(transform),
  )!
  return match.slice(1).map(Number)
}

it('moves the inserted view from the removed view’s frame and keeps the old node as a ghost', async () => {
  const { host, toggle } = await mount()
  const big = host.querySelector('[data-name=big]')!
  await toggle()

  const thumb = runOf('thumb')
  // First frame: the thumbnail drawn exactly where the big artwork was.
  const [x, y, scaleX, scaleY] = translation(thumb.keyframes[0]!.transform)
  expect(x).toBeCloseTo(-20)
  expect(y).toBeCloseTo(60)
  expect(scaleX).toBeCloseTo(400 / 72)
  expect(scaleY).toBeCloseTo(400 / 72)
  expect(translation(thumb.keyframes.at(-1)!.transform)).toEqual([0, 0, 1, 1])
  // cross-fades the pair: the new view fades in as the ghost fades out.
  expect(thumb.keyframes[0]!.opacity).toBe(0)
  expect(thumb.keyframes.at(-1)!.opacity).toBe(1)
  // Eased out: more than half the travel is covered in the first quarter of the run.
  const quarter = thumb.keyframes[Math.round(thumb.keyframes.length / 4)]!
  expect(Math.abs(translation(quarter.transform)[1]!)).toBeLessThan(30)

  // The removed artwork is the same node, still decoded, travelling to the thumbnail and fading.
  expect(big.isConnected).toBe(true)
  expect(big.getAttribute('aria-hidden')).toBe('true')
  const ghost = runOf('big', { ghost: true })
  expect(ghost.keyframes[0]!.opacity).toBe(1)
  expect(ghost.keyframes.at(-1)!.opacity).toBe(0)
  const [, , endScale] = translation(ghost.keyframes.at(-1)!.transform)
  expect(endScale).toBeCloseTo(72 / 400)
})

it('reverses mid-flight from the presented frame, keeping the motion’s velocity', async () => {
  const { host, toggle } = await mount()
  await toggle()
  const outbound = runOf('thumb')
  // 80 ms in: the presented thumbnail is part-way up, still moving up and left.
  outbound.currentTime = 80
  const presented = '12 72 180 180'
  ;(host.querySelector('[data-name=thumb]') as HTMLElement).dataset.rect = presented
  await toggle()

  expect(outbound.cancelled).toBe(true)
  const back = runOf('big')
  expect(back.element.isConnected).toBe(true)
  // Starts at the presented pose: no jump back to either end.
  const [x, y, scale] = translation(back.keyframes[0]!.transform)
  expect(x).toBeCloseTo(12)
  expect(y).toBeCloseTo(-28)
  expect(scale).toBeCloseTo(180 / 400)
  // Velocity is kept: the first frame continues upward before the spring turns it around.
  const [, nextY] = translation(back.keyframes[1]!.transform)
  expect(nextY).toBeLessThan(y)
})

it('fades a matched view in when it has no partner', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  let show = () => {}
  function Badge() {
    const space = useNamespace()
    const [visible, setVisible] = useState(false)
    show = () => withAnimation(() => setVisible(true))
    return visible ? (
      <MatchedGeometryEffect id="badge" in={space}>
        <span data-name="badge" data-rect="0 0 20 20" />
      </MatchedGeometryEffect>
    ) : null
  }
  await act(() => root.render(<Badge />))
  await act(() => show())
  const fade = runOf('badge')
  expect(fade.keyframes[0]!.opacity).toBe(0)
  expect(fade.keyframes.at(-1)!.opacity).toBe(1)
  expect(fade.keyframes.every(frame => frame.transform === undefined)).toBe(true)
})

it('returns the synchronous update result with default or explicit timing', () => {
  const selected = { id: 'album' }
  expect(withAnimation(() => selected)).toBe(selected)
  expect(withAnimation(Animation.snappy, () => selected)).toBe(selected)
})

it('rejects non-finite spring options before starting motion', () => {
  expect(() => Animation.spring({ durationMs: Infinity })).toThrow(RangeError)
  expect(() => Animation.spring({ bounce: NaN })).toThrow(RangeError)
})
