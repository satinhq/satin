// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  createRowScrub,
  primaryTransform,
  presentedTakeover,
  presentedPillResponse,
  retainPillRelease,
  rowSwipePosition,
  swipeActionPose,
  swipeActionTracks,
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
it('recovers destructive takeover from the content independently of the growing fill', () => {
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      a: number
      m41: number
      constructor(transform: string) {
        const values = transform
          .match(/matrix\(([^)]+)\)/)?.[1]
          ?.split(',')
          .map(Number)
        this.a = values?.[0] ?? 1
        this.m41 = values?.[4] ?? 0
      }
    },
  )
  for (const inline of [true, false]) {
    const host = document.createElement('div')
    host.dataset.satinRowActions = 'true'
    host.dataset.satinSwipeLabelLayout = inline ? 'inline' : 'below'
    host.innerHTML = `<button data-satin-swipe-role="destructive" style="width:${inline ? 84 : 50}px"><span data-satin-swipe-fill="middle" style="transform:matrix(${inline ? 6 : 201},0,0,1,0,0)"></span><span data-satin-swipe-label><svg></svg></span></button>`
    document.body.append(host)
    try {
      const primary = host.firstElementChild as HTMLElement
      const part = primary.querySelector(inline ? '[data-satin-swipe-label]' : 'svg')!
      for (const anchor of [0, 0.25, 0.5, 1]) {
        part.setAttribute(
          'style',
          `transform:matrix(1,0,0,1,${-100 * (anchor + (inline ? 1 : 0))},0)`,
        )
        expect(presentedTakeover(primary, -398)).toBeCloseTo(anchor, 10)
      }
    } finally {
      host.remove()
    }
  }
})
it('recovers a single inline action held past the tray as a full takeover', () => {
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      a: number
      constructor(transform: string) {
        this.a = Number(transform.match(/matrix\(([^,]+)/)?.[1] ?? 1)
      }
    },
  )
  // iPad o1 leading commit: one 82.5pt "Read" capsule held at 572pt. Its
  // overscroll and its takeover give the same fill width; the pose treats a
  // single non-destructive action as taken over, so its release must too.
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  host.dataset.satinSwipeLabelLayout = 'inline'
  host.innerHTML =
    '<div data-satin-swipe-tray="leading"><button style="width:82.5px">' +
    '<span data-satin-swipe-fill="middle" style="transform:matrix(13.5,0,0,1,0,0)"></span></button></div>'
  document.body.append(host)
  try {
    const primary = host.querySelector('button')!
    expect(presentedTakeover(primary, 572)).toBe(1)
    primary.querySelector('span')!.setAttribute('style', 'transform:matrix(1,0,0,1,0,0)')
    expect(presentedTakeover(primary, 102.5)).toBe(0)
  } finally {
    host.remove()
  }
})
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
  // Retargeting preserves the presented size at this instant; the spring then
  // advances even though the scroll sample is unchanged.
  expect(pill.style.transform).toBe(openedPill)
  nextFrame!(performance.now() + 16)
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
    contact.track(finger, performance.now())
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
  // (growth 241 on a 50pt button). r31 separates target alpha 0.30 from the
  // transient presentation alpha 0.32 in the older r3 frame.
  const primary = swipeActionPose(-371, 0, 2, 1, 0, 50, false, true, true)
  const secondary = swipeActionPose(-371, 1, 2, 1, 0, 50, false, true, true)
  expect(primary.growth).toBeCloseTo(241)
  expect(secondary.spread).toBeCloseTo(241)
  expect(secondary.opacity).toBeCloseTo(0.3, 2)
  // r3 reversal back to 142pt revealed: More is brighter again (native 0.73).
  expect(swipeActionPose(-142, 1, 2, 1, 0, 50, false, true, true).opacity).toBeCloseTo(0.73, 2)
  // Non-destructive takeover still hands the secondary's slot to the primary.
  expect(swipeActionPose(-371, 1, 2, 1, 0, 50, false, true).opacity).toBe(0)
})

it('keeps inline Delete at the outer edge and carries its content to the leading inset', () => {
  // Physical iPad native r6: fixed outer mask edge F383–498; trash moves from
  // centered F484 to a 17pt leading inset F493. This checks anchoring independently
  // of any one button width, so resizing cannot put the content back at center.
  const label = document.createElement('span')
  label.dataset.satinSwipeDirection = 'trailing'
  for (const width of [88, 104]) {
    const first = swipeActionPose(-400, 0, 2, 0, 0, width, true, true, true)
    const expanded = swipeActionPose(-950, 0, 2, 1, 0, width, true, true, true)
    expect(first.spread).toBe(0)
    expect(expanded.spread).toBe(0)
    const contentShift = Number(
      primaryTransform(label, expanded.growth, width - 44, expanded.contentAnchor).match(
        /translate3d\(([-\d.]+)/,
      )![1],
    )
    // The pill's leading cap and the label translate by the same amount.
    expect(contentShift + expanded.growth).toBe(0)
    const middle = swipeActionPose(-700, 0, 2, 0.5, 0, width, true, true, true)
    const middleShift = Number(
      primaryTransform(label, middle.growth, width - 44, middle.contentAnchor).match(
        /translate3d\(([-\d.]+)/,
      )![1],
    )
    expect(middleShift).toBeLessThan(-middle.growth / 2)
    expect(middleShift).toBeGreaterThan(-middle.growth)
  }
})

it('moves the tall destructive icon to the leading cap while fading its centered caption', () => {
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  host.dataset.satinSwipeLabelLayout = 'below'
  host.innerHTML =
    '<div data-satin-swipe-tray="trailing"><button data-satin-swipe-action data-satin-swipe-role="destructive" style="width:50px"><span data-satin-swipe-direction="trailing" data-satin-swipe-fill="start"></span><span data-satin-swipe-direction="trailing" data-satin-swipe-label><svg></svg><span data-satin-swipe-caption>Delete</span></span></button><button data-satin-swipe-action style="width:50px"></button></div>'
  document.body.append(host)
  try {
    const primary = host.querySelector('button')!
    const tracks = swipeActionTracks(primary, 2, 984, true)
    const frame = (selector: string, takeover: number) =>
      tracks.find(track => track.element.matches(selector))!.frame(-950, -950, 0, takeover)
    const x = (value: Keyframe) =>
      Number(String(value.transform).match(/translate3d\(([-\d.]+)/)![1])
    const label = x(frame('[data-satin-swipe-label]', 1))
    const icon = x(frame('svg', 1))
    const cap = x(frame('[data-satin-swipe-fill="start"]', 1))
    expect(label + icon).toBe(cap)
    expect(label).toBe(cap / 2)
    expect(frame('[data-satin-swipe-caption]', 0).opacity).toBe(1)
    expect(frame('[data-satin-swipe-caption]', 0.5).opacity).toBe(0.5)
    expect(frame('[data-satin-swipe-caption]', 1).opacity).toBe(0)
    // Reversal retains the expanded geometry; resting again restores the caption.
    expect(frame('[data-satin-swipe-caption]', 0).opacity).toBe(1)
  } finally {
    host.remove()
  }
})

it('tracks full-swipe travel beyond half-width before the contact reaches its edge anchor', () => {
  const configuration: SwipeActions = [
    {
      edge: 'trailing',
      actions: [{ id: 'delete', label: 'Delete', role: 'destructive' }, ...actions],
      allowsFullSwipe: true,
    },
    { edge: 'leading', actions, allowsFullSwipe: true },
  ]
  // r28 native short/tall model positions, before any destructive anchor.
  for (const travel of [-301.5, -472, -639.5]) {
    expect(rowSwipePosition(travel, 984, configuration)).toBe(travel)
    expect(rowSwipeRaw(travel, 984, configuration)).toBe(travel)
  }
  const resisted = rowSwipePosition(-1200, 984, configuration)
  expect(resisted).toBeGreaterThan(-1200)
  expect(rowSwipeRaw(resisted, 984, configuration)).toBeCloseTo(-1200)
  // Native Read has resistance after its threshold; destructive geometry must
  // not change that separate mapping.
  expect(rowSwipePosition(815, 984, configuration)).toBeLessThan(815)
})

it('grows Delete and packs More before takeover on both short and tall rows', () => {
  // r28 at recognized 301.5pt: native widths 186 (inline 85.5pt slot) and
  // 221.5 (tall 50pt slot). The outer edge stays fixed before the anchor fires.
  for (const [width, inline, expectedWidth] of [
    [85.5, true, 186],
    [50, false, 221.5],
  ] as const) {
    const primary = swipeActionPose(-301.5, 0, 2, 0, 0, width, inline, true, true)
    const secondary = swipeActionPose(-301.5, 1, 2, 0, 0, width, inline, true, true)
    expect(primary.growth + width).toBe(expectedWidth)
    expect(primary.spread).toBe(0)
    expect(secondary.spread).toBe(primary.growth)
    expect(primary.contentAnchor).toBe(0)
  }
})

it('dims the secondary destructive action before takeover using native width-relative alpha', () => {
  for (const [distance, expected] of [
    [301.5, 0.779],
    [472, 0.654],
    [639.5, 0.5313],
    [966.8, 0.3],
  ]) {
    const pose = swipeActionPose(-distance!, 1, 2, 0, 0, 85.5, true, true, true, 984)
    expect(pose.opacity).toBeCloseTo(expected!, 4)
  }
  // Releasing to the ordinary open tray restores both actions to full opacity.
  expect(swipeActionPose(-201, 1, 2, 0, 1, 85.5, true, true, true, 984).opacity).toBe(1)
})

it('extends the pill by the same distance for each measured row height', () => {
  for (const height of [33.5, 39.5, 49.5, 50]) {
    const host = document.createElement('div')
    host.dataset.satinRowActions = 'true'
    host.dataset.satinSwipeLabelLayout = 'below'
    host.innerHTML = `<div data-satin-swipe-tray="trailing" style="--satin-swipe-capsule-height:${height}px"><button data-satin-swipe-action data-satin-swipe-role="destructive" style="width:60px"><span data-satin-swipe-fill="middle"></span></button></div>`
    document.body.append(host)
    try {
      const tracks = swipeActionTracks(host.querySelector('button')!, 1, 984, true)
      const middle = tracks.find(track =>
        track.element.matches('[data-satin-swipe-fill="middle"]'),
      )!
      const transform = String(middle.frame(-300, -300, 0, 1).transform)
      const scale = Number(transform.match(/scaleX\(([^)]+)\)/)![1])
      // One 60pt pill plus 10pt gap and outer padding opens at 80pt.
      expect((scale - 1) * (60 - height)).toBeCloseTo(220, 10)
    } finally {
      host.remove()
    }
  }
})

it('does not hide a lone destructive caption before takeover in fallback tracks', () => {
  const host = document.createElement('div')
  host.dataset.satinRowActions = 'true'
  host.dataset.satinSwipeLabelLayout = 'below'
  host.innerHTML =
    '<div data-satin-swipe-tray="trailing"><button data-satin-swipe-action data-satin-swipe-role="destructive" style="width:60px"><span data-satin-swipe-label><svg></svg><span data-satin-swipe-caption>Delete</span></span></button></div>'
  document.body.append(host)
  try {
    const tracks = swipeActionTracks(host.querySelector('button')!, 1, 984, true)
    const caption = tracks.find(track => track.element.hasAttribute('data-satin-swipe-caption'))!
    expect(caption.frame(-140).opacity).toBe(1)
    expect(caption.frame(-950, Infinity).opacity).toBe(0)
  } finally {
    host.remove()
  }
})

it('grows a revealed pill after the finger stops and retains its release velocity', () => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const host = document.createElement('div')
  host.innerHTML =
    '<div data-satin-swipe-tray="leading"></div>' +
    '<div data-satin-swipe-tray="trailing"><button data-satin-swipe-action style="width:60px"></button></div>'
  const source = document.createElement('div')
  Object.defineProperties(source, { scrollWidth: { value: 2000 }, clientWidth: { value: 400 } })
  source.scrollLeft = 800
  const configuration = { edge: 'trailing' as const, allowsFullSwipe: false, actions }
  const scrub = createRowScrub(
    host,
    source,
    document.createElement('div'),
    0,
    400,
    configuration,
    swipeContact(configuration),
  )!
  const pill = host.querySelector('button')!
  const scale = () => Number(pill.style.transform.match(/scale\(([^)]+)\)/)?.[1])
  const now = performance.now()
  source.scrollLeft = 880
  scrub.flush(now + 16)
  expect(scale()).toBe(0)
  scrub.flush(now + 100)
  expect(scale()).toBeGreaterThan(0)
  expect(scale()).toBeLessThan(0.8)
  expect(presentedPillResponse(pill)?.velocity).toBeGreaterThan(0)
  const growing = scale()
  scrub.flush(now + 150)
  expect(scale()).toBeGreaterThan(growing)
  scrub.flush(now + 850)
  expect(scale()).toBeCloseTo(1, 2)
  scrub.cancel()
})

it('samples a caught close with the same continuous scale and velocity', () => {
  const pill = document.createElement('button')
  retainPillRelease(pill, { position: 1, velocity: 0 }, 0, 100, 750)
  expect(presentedPillResponse(pill, 90)).toEqual({ position: 1, velocity: 0 })
  const caught = presentedPillResponse(pill, 200)!
  expect(caught.position).toBeGreaterThan(0)
  expect(caught.position).toBeLessThan(1)
  expect(caught.velocity).toBeLessThan(0)
  expect(presentedPillResponse(pill, 850)).toEqual({ position: 0, velocity: 0 })
})

it('uses the travel pose immediately when reduced motion is enabled', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const host = document.createElement('div')
  host.innerHTML =
    '<div data-satin-swipe-tray="leading"></div>' +
    '<div data-satin-swipe-tray="trailing"><button data-satin-swipe-action style="width:60px"></button></div>'
  const source = document.createElement('div')
  Object.defineProperties(source, { scrollWidth: { value: 2000 }, clientWidth: { value: 400 } })
  source.scrollLeft = 800
  const configuration = { edge: 'trailing' as const, allowsFullSwipe: false, actions }
  const scrub = createRowScrub(
    host,
    source,
    document.createElement('div'),
    0,
    400,
    configuration,
    swipeContact(configuration),
  )!
  source.scrollLeft = 880
  scrub.flush()
  expect(host.querySelector('button')!.style.transform).toContain('scale(1)')
  scrub.cancel()
})

it('computes each painted frame for its presentation, one refresh after the frame starts', () => {
  let paint: FrameRequestCallback | undefined
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    paint = callback
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
  const configuration = { edge: 'trailing' as const, allowsFullSwipe: true, actions }
  const contact = swipeContact(configuration)
  const present = vi.spyOn(contact, 'present')
  const scrub = createRowScrub(
    host,
    source,
    document.createElement('div'),
    0,
    400,
    configuration,
    contact,
  )!
  const frameTime = performance.now() + 100
  paint!(frameTime)
  expect(present.mock.calls.at(-1)![1]).toBeCloseTo(frameTime + 1000 / 60, 6)
  // A release read between frames starts from the pose that was last on screen.
  scrub.flush(frameTime + 5, false)
  expect(present.mock.calls.at(-1)![1]).toBeCloseTo(frameTime + 1000 / 60, 6)
  scrub.cancel()
})
