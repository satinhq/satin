// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  createRowScrub,
  primaryTransform,
  rowSwipePosition,
  swipeActionPose,
  swipeContentTrack,
  fullSwipeThreshold,
  rowSwipeRaw,
  rowSwipeShouldClose,
  updateRowCorners,
} from './rowScrub.ts'
import { createFullSwipeContact } from './fullSwipeContact.ts'
import type { SwipeActions } from './types.ts'
afterEach(() => vi.unstubAllGlobals())
const swipeContact = (configuration?: SwipeActions, width = 400) =>
  createFullSwipeContact({
    width,
    configuration,
    widths: { leading: 60, trailing: 60 },
    inline: false,
    now: performance.now(),
  })
const actions = [{ id: 'a', label: 'Archive', onPress() {} }]
it('keeps no-action edges still and preserves the bounded rubber band', () => {
  const configuration = { edge: 'trailing' as const, allowsFullSwipe: false, actions }
  expect(rowSwipePosition(200, 400, configuration)).toBe(0)
  expect(rowSwipePosition(-100, 400, configuration)).toBeLessThan(-80)
  expect(rowSwipePosition(-10000, 400, configuration)).toBeGreaterThan(-480)
})
it('keeps capsule ends circular while extending the center with transforms', () => {
  const part = document.createElement('span')
  part.dataset.satinSwipeFill = 'end'
  expect(primaryTransform(part, 16)).toBe('translate3d(16px,0,0)')
  part.dataset.satinSwipeFill = 'middle'
  expect(primaryTransform(part, 16)).toBe('scaleX(2)')
})
it('presents the row and pills from the same scroll sample, including a caught reverse drag', () => {
  let nextFrame: FrameRequestCallback | undefined
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const host = document.createElement('div')
  host.innerHTML =
    '<div data-satin-swipe-tray="leading"></div>' +
    '<div data-satin-swipe-tray="trailing"><button data-satin-swipe-action style="width:60px"></button></div>'
  const source = document.createElement('div')
  Object.defineProperties(source, { scrollWidth: { value: 2000 }, clientWidth: { value: 400 } })
  source.scrollLeft = 800
  const content = document.createElement('div')
  const pill = host.querySelector('button')!
  const configuration = { edge: 'trailing' as const, allowsFullSwipe: false, actions }
  const scrub = createRowScrub(
    host,
    source,
    content,
    -80,
    400,
    configuration,
    swipeContact(configuration),
  )!
  const openedPill = pill.style.transform
  source.scrollLeft = 760
  expect(content.style.transform).toBe('translate3d(-80px,0,0)')
  expect(pill.style.transform).toBe(openedPill)
  nextFrame!(performance.now())
  expect(content.style.transform).toBe('translate3d(-40px,0,0)')
  expect(pill.style.transform).not.toBe(openedPill)
  source.scrollLeft = 720
  // Release can precede the next callback; its handoff presents the final sample.
  expect(scrub.flush()).toEqual({ raw: 0, position: 0 })
  expect(content.style.transform).toBe('translate3d(0px,0,0)')
  expect(host.querySelector<HTMLElement>('[data-satin-swipe-tray="trailing"]')!.style.opacity).toBe(
    '0',
  )
  scrub.cancel()
})
it('permits native panning so the back owner can inherit the row source', async () => {
  const { rowBlocksNativeBack } = await import('./recognizers.ts')
  const row = document.createElement('div')
  row.dataset.satinRowSwipe = 'true'
  row.dataset.satinRowCompositor = 'true'
  row.style.touchAction = 'auto'
  document.body.append(row)
  expect(rowBlocksNativeBack(row)).toBe(false)
  row.remove()
})

it('matches the native sequential capsule reveal and full-swipe bounds', () => {
  // Tall stock rows fade and scale together; enough room completes both.
  for (const [distance, expected] of [
    [40, 0],
    [60, 2 / 3],
    [80, 1],
  ]) {
    const pose = swipeActionPose(distance!, 0, 3, 0, 0, 50)
    expect(pose.scale).toBeCloseTo(expected!)
    expect(pose.opacity).toBeCloseTo(expected!)
  }
  expect(swipeActionPose(250, 0, 3, 0, 0, 50).scale).toBe(1)
  expect(swipeActionPose(120, 1, 3, 0, 0, 50).scale).toBeCloseTo(2 / 3)
  expect(swipeActionPose(85, 1, 3).scale).toBe(0)
  expect(swipeActionPose(250, 0, 3, 1).growth).toBe(170)
  expect(swipeActionPose(250, 1, 3, 1).opacity).toBe(0)
  // Native leading three cancels at 300pt of recognized pan and commits at
  // 325pt. The former count rule incorrectly committed at 265pt.
  expect(fullSwipeThreshold(400, 3, 'leading', 84)).toBeGreaterThan(300)
  expect(fullSwipeThreshold(400, 3, 'leading', 84)).toBeLessThan(325)
  expect(fullSwipeThreshold(400, 3, 'trailing', 96)).toBeGreaterThan(195)
  expect(fullSwipeThreshold(400, 3, 'trailing', 96)).toBeLessThan(220)
})

it('does not apply rubber resistance twice when catching a spring', () => {
  const configuration = { edge: 'trailing' as const, allowsFullSwipe: false, actions }
  const pose = rowSwipePosition(-380, 400, configuration)
  expect(rowSwipePosition(rowSwipeRaw(pose, 400, configuration), 400, configuration)).toBeCloseTo(
    pose,
  )
})

it('reveals the full width of inline action labels before applying resistance', () => {
  const configuration = {
    edge: 'trailing' as const,
    allowsFullSwipe: false,
    actions: [...actions, ...actions, ...actions],
  }
  const widths = { leading: 84, trailing: 96 }
  expect(rowSwipePosition(-328, 400, configuration, widths)).toBe(-328)
  expect(rowSwipeRaw(-328, 400, configuration, widths)).toBe(-328)
  const middle = document.createElement('span')
  middle.dataset.satinSwipeFill = 'middle'
  expect(primaryTransform(middle, 52, 52)).toBe('scaleX(2)')
})

it('keeps short-row actions small and faint until their own reveal interval', () => {
  // Native reference: Read at 85pt is 25pt tall including the antialiased fringe,
  // at approximately 0.69 opacity. Archive is 21pt tall at about 0.57 opacity.
  const read = swipeActionPose(85, 0, 3, 0, 0, 84, true)
  const archive = swipeActionPose(-85, 0, 3, 0, 0, 96, true)
  expect(read.scale * 44).toBeCloseTo(24.06, 1)
  expect(read.opacity).toBeCloseTo(0.69, 1)
  expect(archive.scale * 44).toBeCloseTo(20.17, 1)
  expect(archive.opacity).toBeCloseTo(0.57, 1)
  expect(swipeActionPose(85, 1, 3, 0, 0, 84, true).opacity).toBe(0)
  // The third More pill must retain the native 37pt mask at full reveal.
  expect(swipeActionPose(292, 2, 3, 0, 0, 84, true).scale * 44).toBeGreaterThan(38)
})

it('preserves a section end cap until its first short-row action enters', () => {
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  host.dataset.satinSwipeLabelLayout = 'inline'
  host.style.borderRadius = '25px 25px 0px 0px'
  host.innerHTML =
    '<div data-satin-swipe-tray="leading" style="--satin-swipe-button-width:84px"></div><div data-satin-row-action-content></div>'
  document.body.append(host)
  try {
    const content = host.lastElementChild as HTMLElement
    Object.defineProperty(content, 'offsetHeight', { value: 52 })
    Object.defineProperty(content, 'offsetWidth', { value: 400 })
    const frame = swipeContentTrack(content)
    expect(frame(50).clipPath).toBe(frame(104).clipPath)
    expect(frame(114).clipPath).not.toBe(frame(104).clipPath)
    frame(114)
    updateRowCorners(content, 400, 100)
    expect(content.style.clipPath).toBe(frame(114).clipPath)
    expect(content.style.clipPath).not.toBe(frame(114, 1).clipPath)
    expect(frame(124).clipPath).toBe(frame(104, 1).clipPath)
    expect(frame(0, 1).clipPath).toBe('none')
  } finally {
    host.remove()
  }
})

it('keeps the native default corner as a swiped row grows, while allowing deliberate capsules and ellipses', () => {
  const content = document.createElement('div')
  updateRowCorners(content, 400, 52)
  const frame = swipeContentTrack(content)
  const short = frame(-160).clipPath
  updateRowCorners(content, 400, 100)
  const tall = frame(-160).clipPath
  // Native continuous radius 26 starts its top-right curve 39.7453pt from
  // the right edge at both heights. A half-height capsule changes this edge.
  expect(short).toContain('M 360.2547 0 C')
  expect(tall).toContain('M 360.2547 0 C')
  expect(tall).not.toBe(short)
  updateRowCorners(content, 400, 100, { actions, shape: 'capsule' })
  expect(frame(-160).clipPath).toContain('M 350 0 A 50 50')
  updateRowCorners(content, 400, 100, { actions, shape: 'ellipse' })
  expect(frame(-160).clipPath).toBe('ellipse(50% 50% at 50% 50%)')
  const triangle = 'polygon(50% 0, 100% 100%, 0 100%)'
  updateRowCorners(content, 400, 100, {
    actions,
    shape: { kind: 'custom', clipPath: triangle },
  })
  expect(frame(-160).clipPath).toBe(triangle)
})

it('closes a revealed tray after reversal without demanding full travel', () => {
  expect(rowSwipeShouldClose(-198, -178, 20)).toBe(false)
  expect(rowSwipeShouldClose(-198, -174, 40)).toBe(true)
  expect(rowSwipeShouldClose(198, 174, -40)).toBe(true)
  expect(rowSwipeShouldClose(-198, -220, -40)).toBe(false)
  expect(rowSwipeShouldClose(0, -40, -40)).toBe(false)
  expect(rowSwipeShouldClose(0, -35, -35)).toBe(true)
})

it('presents a destructive takeover from the scroll source on frames, and never on release', () => {
  let nextFrame: FrameRequestCallback | undefined
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const configuration: SwipeActions = {
    edge: 'trailing',
    actions: [
      { id: 'delete', label: 'Delete', role: 'destructive' },
      { id: 'more', label: 'More' },
    ],
  }
  const scrubbed = (finger: number) => {
    const host = document.createElement('div')
    host.innerHTML =
      '<div data-satin-swipe-tray="leading"></div>' +
      '<div data-satin-swipe-tray="trailing"><button data-satin-swipe-action style="width:60px"></button></div>'
    const source = document.createElement('div')
    Object.defineProperties(source, { scrollWidth: { value: 2000 }, clientWidth: { value: 400 } })
    source.scrollLeft = 800
    const content = document.createElement('div')
    const contact = swipeContact(configuration)
    const scrub = createRowScrub(host, source, content, 0, 400, configuration, contact)!
    // The finger reaches the zone with 290pt of scroll travel.
    contact.track(finger)
    source.scrollLeft = 1090
    return { scrub, contact, content }
  }
  // Released before any frame presents the zone: no takeover, no anchor.
  const lifted = scrubbed(65)
  expect(lifted.scrub.flush(performance.now(), false).position).toBeCloseTo(
    rowSwipePosition(-290, 400, configuration),
  )
  expect(lifted.contact.anchored()).toBe(false)
  lifted.scrub.cancel()
  // A presented frame takes over; later frames keep moving the row with the
  // scroll offset unchanged, until it reaches the anchor.
  const held = scrubbed(65)
  const start = performance.now()
  nextFrame!(start)
  expect(held.contact.anchored()).toBe(true)
  const jumping = held.content.style.transform
  nextFrame!(start + 50)
  expect(held.content.style.transform).not.toBe(jumping)
  nextFrame!(start + 500)
  expect(held.content.style.transform).toBe('translate3d(-371px,0,0)')
  expect(held.contact.armed(-290)).toBe(true)
  held.scrub.cancel()
})

it('keeps the other actions visible and packed against the row through a destructive takeover', () => {
  // Native tall Delete row at the anchor: 371pt revealed, primary = revealed - 80
  // (growth 241 on a 50pt button), More beside the row at alpha 0.32.
  const primary = swipeActionPose(-371, 0, 2, 1, 0, 50, false, true, true)
  const secondary = swipeActionPose(-371, 1, 2, 1, 0, 50, false, true, true)
  expect(primary.growth).toBeCloseTo(241)
  expect(secondary.spread).toBeCloseTo(241)
  expect(secondary.opacity).toBeCloseTo(0.32, 2)
  // r3 reversal back to 142pt revealed: More is brighter again (native 0.73).
  expect(swipeActionPose(-142, 1, 2, 1, 0, 50, false, true, true).opacity).toBeCloseTo(0.73, 2)
  // Non-destructive takeover still hands the secondary's slot to the primary.
  expect(swipeActionPose(-371, 1, 2, 1, 0, 50, false, true).opacity).toBe(0)
})
