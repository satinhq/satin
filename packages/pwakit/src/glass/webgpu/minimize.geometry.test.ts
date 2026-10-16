// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { glassDockWidth } from '../lens/Scene.tsx'
import { WorkerMinimize } from './minimize.ts'
import type { RuntimeOptions, SurfaceRenderSpec } from '../renderSpecs.ts'

vi.mock('../../motionProbe.ts', () => ({
  beginMotionProbe: () => undefined,
  recordMotionEventCost: () => undefined,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it.each([false, true])(
  'keeps the regular shortcut centred after resize with Search selected %s',
  searchSelected => {
    class Effect {
      frames: Keyframe[]
      constructor(frames: Keyframe[]) {
        this.frames = frames
      }
      setKeyframes(frames: Keyframe[]) {
        this.frames = frames
      }
    }
    vi.stubGlobal('KeyframeEffect', Effect)
    const effects = new Map<Element, Effect>()
    vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, frames) {
      const effect = new Effect(frames as Keyframe[])
      effects.set(this, effect)
      return {
        effect,
        cancel() {},
        finished: new Promise(() => {}),
        startTime: 0,
      } as unknown as Animation
    })
    const dock = document.createElement('div')
    dock.innerHTML =
      '<div class="satin-lens-tab-ink-clip"></div><div class="satin-lens-tab-ink-plane"></div><button role="tab"><small>Home</small></button>'
    if (searchSelected)
      dock.insertAdjacentHTML(
        'beforeend',
        '<button role="tab" data-satin-tab-role="search"><small>Search</small></button>',
      )
    document.body.append(dock)
    const options = (width: number, centre: number) =>
      ({
        geometry: {
          dockWidth: width,
          dockHeight: 62,
          dockX: 21,
          dockY: 840,
          tabBarCentres: searchSelected ? [centre, centre + 100] : [centre],
          tabBarSelectedIndex: searchSelected ? 1 : 0,
        },
        elements: { chrome: { dock } },
      }) as unknown as RuntimeOptions
    const controller = new WorkerMinimize(options(398, 58), () => {}, {
      begin() {},
      move() {},
      end() {},
    })
    controller.start('collapse', { shape: { first: {} } } as SurfaceRenderSpec)
    const tab = dock.querySelector('[role="tab"]')!
    const before = effects.get(tab)!.frames.at(-1)!.transform
    controller.update(options(360, 53))
    const after = effects.get(tab)!.frames.at(-1)!.transform
    expect(before).toContain('translate3d(-27px,')
    expect(after).toContain('translate3d(-22px,')
    controller.update(options(398, 58))
    expect(effects.get(tab)!.frames.at(-1)!.transform).toBe(before)
  },
)

it('fits the measured landscape tab row inside the two horizontal safe areas', () => {
  const screen = { width: 440, height: 956 }
  expect(glassDockWidth(440, screen)).toBe(398)
  expect(glassDockWidth(956, screen, { left: 62, right: 62 })).toBe(642)
  expect(glassDockWidth(500, screen, { left: 62, right: 0 })).toBe(396)
})

it('collapses a narrow platter at the full dock leading edge and expands under the committed tab', () => {
  vi.spyOn(Element.prototype, 'animate').mockReturnValue({
    cancel() {},
    finished: new Promise(() => {}),
    startTime: 0,
  } as unknown as Animation)
  const dock = document.createElement('div')
  dock.innerHTML = '<div class="satin-lens-tab-ink-clip"></div>'
  document.body.append(dock)
  const options = {
    geometry: {
      dockWidth: 274,
      dockHeight: 62,
      dockX: 83,
      dockY: 874,
      tabBarMinimizedOffsetX: -55,
      tabBarCentres: [51, 137, 223],
      tabBarSelectedIndex: 2,
    },
    elements: { chrome: { dock } },
  } as unknown as RuntimeOptions
  const controller = new WorkerMinimize(options, () => {}, { begin() {}, move() {}, end() {} })
  const spec = {
    shape: { first: {} },
    tabSelection: {
      materialMix: 1,
      capsule: { centerX: 51, centerY: 31, halfWidth: 47, halfHeight: 27, radius: 27 },
    },
  } as SurfaceRenderSpec
  const collapse = controller.start('collapse', spec)
  const last = collapse.specs.at(-1)!
  expect(options.geometry.dockX + last.shape.first.centerX - last.shape.first.halfWidth).toBe(28)
  expect(
    parseFloat(
      dock.parentElement!.querySelector<HTMLButtonElement>('[aria-label="Show tab bar"]')!.style
        .left,
    ),
  ).toBe(28)
  const restore = controller.start('restore', spec)
  expect(restore.specs.at(-1)!.tabSelection!.capsule.centerX).toBe(223)
  controller.update({ ...options, geometry: { ...options.geometry, tabBarSelectedIndex: 1 } })
  expect(restore.specs.at(-1)!.tabSelection!.capsule.centerX).toBe(137)
})

describe('Search-role split', () => {
  // Native endpoints on the 440 pt iPhone (search-tab-split): the 398 pt bar at x = 21 parts
  // into the leading shortcut [28, 76] and the Search circle [364, 412], both 48 pt tall.
  function searchBar(withSearch = true, intrinsic = false) {
    const animations = new Map<Element, Keyframe[]>()
    vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, frames) {
      animations.set(this, frames as Keyframe[])
      return { cancel() {}, finished: new Promise(() => {}), startTime: 0 } as unknown as Animation
    })
    const dock = document.createElement('div')
    dock.innerHTML =
      '<div class="satin-lens-tab-ink-clip"></div><div class="satin-lens-tab-ink-plane"></div>' +
      '<button role="tab"><small>Home</small></button>' +
      '<button role="tab"><small>Library</small></button>' +
      (withSearch
        ? '<button role="tab" data-satin-tab-role="search"><small>Search</small></button>'
        : '')
    document.body.append(dock)
    const options = {
      geometry: {
        dockWidth: intrinsic ? 274 : 398,
        dockHeight: 62,
        dockX: intrinsic ? 83 : 21,
        dockY: 873,
        tabBarMinimizedOffsetX: intrinsic ? -55 : 7,
        tabBarCentres: intrinsic ? [51, 137, 223] : withSearch ? [47, 246, 312] : [47, 246],
        tabBarSelectedIndex: 1,
      },
      elements: { chrome: { dock } },
    } as unknown as RuntimeOptions
    const controller = new WorkerMinimize(options, () => {}, { begin() {}, move() {}, end() {} })
    const spec = { shape: { first: {}, blendRadius: 0 } } as unknown as SurfaceRenderSpec
    return { controller, spec, dock, animations }
  }
  const screenEdges = (shape: { centerX: number; halfWidth: number }) => [
    21 + shape.centerX - shape.halfWidth,
    21 + shape.centerX + shape.halfWidth,
  ]

  it('parts the bar into the leading shortcut and the Search circle', () => {
    const { controller, spec } = searchBar()
    const collapse = controller.start('collapse', spec)
    const members = collapse.specs.at(-1)!.shape.members!
    expect(members).toHaveLength(2)
    expect(screenEdges(members[0]!)).toEqual([28, 76])
    expect(screenEdges(members[1]!).map(Math.round)).toEqual([364, 412])
    expect(members[1]!.halfHeight).toBe(24)
    // A three-tab Search platter starts at x=83, but both compact circles retain the
    // full phone dock's endpoints and the Search button's existing trailing hit target.
    const compact = searchBar(true, true)
    const compactMembers = compact.controller.start('collapse', compact.spec).specs.at(-1)!.shape
      .members!
    expect(
      compactMembers.map(member => [
        Math.round(83 + member.centerX - member.halfWidth),
        Math.round(83 + member.centerX + member.halfWidth),
      ]),
    ).toEqual([
      [28, 76],
      [364, 412],
    ])
    // Mid-transaction the two members are separate capsules with a gap between them.
    const middle = collapse.specs[Math.round(collapse.specs.length * 0.12)]!.shape.members!
    expect(screenEdges(middle[1]!)[0]! - screenEdges(middle[0]!)[1]!).toBeGreaterThan(20)
  })

  it('merges the Search circle back into the full bar', () => {
    const { controller, spec } = searchBar()
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    controller.start('collapse', spec)
    now.mockReturnValue(3000)
    const restore = controller.start('restore', spec)
    expect(restore.specs[0]!.shape.members).toHaveLength(2)
    const settled = restore.specs.at(-1)!
    expect(settled.shape.members).toBeUndefined()
    // While they approach, the Search member never leaves the bar's trailing end.
    for (const frame of restore.specs) {
      const search = frame.shape.members?.[1]
      if (search) expect(screenEdges(search)[1]!).toBeLessThanOrEqual(419.0001)
    }
  })

  it('carries the Search glyph into the centre of its circle', () => {
    const { controller, spec, dock, animations } = searchBar()
    controller.start('collapse', spec)
    const search = dock.querySelector('[data-satin-tab-role="search"]')!
    const last = animations.get(search)!.at(-1)!
    // Circle centre 388 − slot centre (21 + 312) = 55 pt.
    expect(last.transform).toContain('translate3d(55px,')
    expect(last.opacity).toBe(1)
  })

  it('keeps one member without a Search role', () => {
    const { controller, spec } = searchBar(false)
    const collapse = controller.start('collapse', spec)
    expect(collapse.specs.at(-1)!.shape.members).toBeUndefined()
  })
})

it('settles a running collapse at its compact end when the page hides', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const finished: (() => void)[] = []
  vi.spyOn(Element.prototype, 'animate').mockImplementation(() => {
    let done!: () => void
    const animation = {
      cancel() {},
      finish() {
        done()
      },
      finished: new Promise<void>(resolve => (done = resolve)),
      startTime: 0,
    }
    finished.push(() => animation.finish())
    return animation as unknown as Animation
  })
  const dock = document.createElement('div')
  dock.innerHTML =
    '<div class="satin-lens-tab-ink-clip"></div><div class="satin-lens-tab-ink-plane"></div><button role="tab"><small>Home</small></button>'
  document.body.append(dock)
  const options = {
    geometry: { dockWidth: 398, dockHeight: 62, dockX: 21, dockY: 840, tabBarCentres: [58] },
    elements: { chrome: { dock } },
  } as unknown as RuntimeOptions
  const controller = new WorkerMinimize(options, () => {}, { begin() {}, move() {}, end() {} })
  const spec = { shape: { first: {} } } as SurfaceRenderSpec
  const track = controller.start('collapse', spec)
  expect(controller.active).toBe(true)
  controller.settle()
  expect(controller.active).toBe(false)
  await Promise.resolve()
  await Promise.resolve()
  // The finished animations commit the compact chrome's state.
  expect(dock.inert).toBe(true)
  // The page's pose is the track's end, the pose the renderer settles at when it hides.
  const now = controller.current(spec)
  expect(now.shape.first).toEqual(track.specs.at(-1)!.shape.first)
  expect(controller.readout()).toMatchObject({ active: false, direction: 'collapse' })
})
