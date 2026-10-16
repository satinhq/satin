// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { TabActivityContext } from '../tabs/context.ts'
import { NavigatorContext, ScreenContext } from '../navigation/navigationContext.tsx'
import { createNavigator } from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import type { TransitionController } from '../navigation/types.ts'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Menu } from './Menu.tsx'
import { ToolbarGlass } from '../navigation/ToolbarGlass.tsx'
import { ScreenToolbar, ToolbarContext } from '../public/chrome.tsx'
import { toolbarMaterialOwner } from './toolbarMaterialContext.ts'
import { installKeyboardAdapter } from '../keyboard/adapter.ts'
import { GlassButton, ToolbarGroup } from './GlassEffect.tsx'
import { MaterialEffectContext } from './liquidContext.ts'
import { GlassRegionRegistry } from './regionRegistry.ts'
import { menuTriggerSource } from './menuTriggerGeometry.ts'
import { setGlassShapeTrack } from './shapeTrackRegistry.ts'
import { shapeTrackFrame } from './shapeTrack.ts'
import type { MenuEntry } from './menuTypes.ts'
import { menuFieldFrame } from './lens/menuField.ts'
import { cancelPointerPressForOwnedGesture } from '../press/gestureArbitration.ts'
import { installScrollPressOwnership } from '../scroll/pressOwnership.ts'
import { Pressable } from '../press/Pressable.tsx'
import * as safeAreaMetrics from '../safe-area/useSafeAreaMetrics.ts'

// Trigger rectangles of the stock SwiftUI reference (iPhone 17 Pro Max, points).
const GROUP = { x: 268, y: 62, width: 152, height: 44 }
const MEMBER = { x: 368.67, y: 64, width: 49.33, height: 40 }
const CAPSULE = { x: 155.67, y: 158, width: 129, height: 50.33 }
const LOW_CAPSULE = { x: 155.67, y: 700, width: 129, height: 50.33 }
const PANEL = { x: 0, y: 0, width: 250, height: 188 }
/** An icon-only plain button, like Now Playing's ellipsis. */
const GLYPH = { x: 330, y: 158, width: 36, height: 36 }
const rect = (box: typeof GROUP) =>
  ({
    ...box,
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
    toJSON() {},
  }) as DOMRect

const mounted: Array<() => void> = []
const sizeObservers: Array<{ callback: ResizeObserverCallback; targets: Element[] }> = []
beforeEach(() => {
  sizeObservers.length = 0
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      targets: Element[] = []
      constructor(callback: ResizeObserverCallback) {
        sizeObservers.push({ callback, targets: this.targets })
      }
      observe(target: Element) {
        this.targets.push(target)
      }
      disconnect() {}
    },
  )
  vi.stubGlobal('navigator', {
    ...navigator,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0)',
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.matches('[data-satin-toolbar-group], [data-satin-toolbar-glass]')) return rect(GROUP)
    if (this.matches('[data-test-member]')) return rect(MEMBER)
    if (this.closest('[data-satin-menu-panel]')) return rect(PANEL)
    if (this.closest('[data-test-low]')) return rect(LOW_CAPSULE)
    if (this.closest('[data-test-glyph]')) return rect(GLYPH)
    return rect(CAPSULE)
  })
  vi.useFakeTimers()
})

it('makes emerged source members inert, then restores source state and focus after close', async () => {
  const menu = mount('group')
  const group = menu.element.querySelector<HTMLElement>('[data-satin-toolbar-group]')!
  menu.press()
  await menu.present()
  expect(group.hasAttribute('inert')).toBe(true)
  menu.dismiss()
  expect(group.hasAttribute('inert')).toBe(false)
  menu.close()
  expect(group.hasAttribute('inert')).toBe(false)
  expect(document.activeElement).toBe(menu.trigger)
})

it('preserves a source inert attribute that existed before emergence', async () => {
  const menu = mount('group')
  const group = menu.element.querySelector<HTMLElement>('[data-satin-toolbar-group]')!
  group.setAttribute('inert', 'owner-value')
  menu.press()
  await menu.present()
  menu.close()
  expect(group.getAttribute('inert')).toBe('owner-value')
})

it('returns to current source geometry when ancestor scrolling dismisses the menu', async () => {
  const menu = mount('capsule')
  menu.press()
  await menu.present()
  const glass = menu.trigger.closest<HTMLElement>('[data-satin-glass-effect]')!
  const moved = { ...CAPSULE, y: 300 }
  vi.spyOn(glass, 'getBoundingClientRect').mockReturnValue(rect(moved))
  act(() => menu.element.dispatchEvent(new Event('scroll')))
  expect(menu.emerge()!.descriptor.emerge!.closing).toBe(true)
  expect(menu.emerge()!.descriptor.emerge!.returnTo).toMatchObject(moved)
})

it('opens and returns to a sampled moving aperture instead of its canvas envelope', async () => {
  const menu = mount('group')
  const group = menu.element.querySelector<HTMLElement>('[data-satin-toolbar-group]')!
  group.style.width = `${GROUP.width}px`
  group.style.height = `${GROUP.height}px`
  vi.spyOn(performance, 'now').mockReturnValue(120)
  const track = {
    epoch: performance.timeOrigin,
    duration: 240,
    frames: [
      { x: 80, y: 0, width: 40, height: 44 },
      { x: 0, y: 0, width: 120, height: 44 },
    ],
    radii: [8, 20],
  }
  setGlassShapeTrack(group, track)
  menu.press()
  const expected = shapeTrackFrame(track, performance.timeOrigin + 120)
  expect(menu.emerge()!.descriptor.emerge!.returnTo!.width - expected.width).toBe(0)
  expect(menu.emerge()!.descriptor.emerge!.sourceSnapshot).toBeTypeOf('number')
  await menu.present()
  vi.mocked(performance.now).mockReturnValue(180)
  menu.dismiss()
  const returned = shapeTrackFrame(track, performance.timeOrigin + 180)
  expect(menu.emerge()!.descriptor.emerge!.returnTo!.width - returned.width).toBe(0)
  expect(menu.emerge()!.descriptor.emerge!.returnTo!.radius).toBe(17)
  setGlassShapeTrack(group, undefined)
})

it('keeps a menu through native navigation projection but dismisses an owning List scroll', async () => {
  const menu = mount('capsule', children => (
    <div data-satin-native-scrub="true">
      <div data-satin-scroll="sheet-list">{children}</div>
    </div>
  ))
  menu.press()
  await menu.present()
  const track = menu.element.querySelector('[data-satin-native-scrub]')!
  act(() => track.dispatchEvent(new Event('scroll')))
  expect(menu.panel()).not.toBeNull()
  expect(menu.emerge()!.descriptor.emerge!.closing).toBe(false)

  const list = menu.element.querySelector('[data-satin-scroll]')!
  act(() => list.dispatchEvent(new Event('scroll')))
  expect(menu.emerge()!.descriptor.emerge!.closing).toBe(true)
})

it('keeps following the source during a close and switches to fade if it leaves the viewport', async () => {
  const menu = mount('capsule')
  menu.press()
  await menu.present()
  const glass = menu.trigger.closest<HTMLElement>('[data-satin-glass-effect]')!
  const bounds = vi.spyOn(glass, 'getBoundingClientRect')
  menu.dismiss()
  bounds.mockReturnValue(rect({ ...CAPSULE, x: 180 }))
  act(() => vi.advanceTimersByTime(32))
  expect(menu.emerge()!.descriptor.emerge!.returnTo!.x).toBe(180)
  bounds.mockReturnValue(rect({ ...CAPSULE, y: -500 }))
  act(() => vi.advanceTimersByTime(32))
  expect(menu.emerge()!.descriptor.emerge).toMatchObject({
    fading: true,
    closing: true,
    returnTo: { ...CAPSULE, x: 180 },
  })
  expect(menu.panel()!.querySelector('[data-satin-menu-ink]')!.hasAttribute('inert')).toBe(true)
  expect(document.querySelector('[data-satin-menu-fading]')).not.toBeNull()
  act(() => vi.advanceTimersByTime(1000))
  expect(menu.panel()).toBeNull()
})

it('returns to the live member of a horizontally moving multi-member toolbar', async () => {
  const menu = mount('group')
  menu.press()
  await menu.present()
  const group = menu.element.querySelector<HTMLElement>('[data-satin-toolbar-group]')!
  const groupBounds = vi.fn(() => rect(GROUP))
  const memberBounds = vi.fn(() => rect(MEMBER))
  group.getBoundingClientRect = groupBounds
  menu.trigger.getBoundingClientRect = memberBounds
  groupBounds.mockReturnValue(rect({ ...GROUP, x: GROUP.x - 100 }))
  memberBounds.mockReturnValue(rect({ ...MEMBER, x: MEMBER.x - 100 }))
  menu.dismiss()
  expect(menu.emerge()!.descriptor.emerge!.anchor).toEqual({
    x: MEMBER.x - 100 + MEMBER.width / 2,
    y: MEMBER.y + MEMBER.height / 2,
  })
  groupBounds.mockReturnValue(rect({ ...GROUP, x: GROUP.x - 160 }))
  memberBounds.mockReturnValue(rect({ ...MEMBER, x: MEMBER.x - 160 }))
  act(() => vi.advanceTimersByTime(32))
  expect(menu.emerge()!.descriptor.emerge!.returnTo!.x).toBe(GROUP.x - 160)
  expect(menu.emerge()!.descriptor.emerge!.anchor!.x).toBe(MEMBER.x - 160 + MEMBER.width / 2)
})

it.each(['offscreen', 'detached'] as const)(
  'preserves the presented morph through a fade when the source is %s',
  async kind => {
    const menu = mount('capsule')
    menu.press()
    await menu.present()
    const glass = menu.trigger.closest<HTMLElement>('[data-satin-glass-effect]')!
    if (kind === 'offscreen') {
      vi.spyOn(glass, 'getBoundingClientRect').mockReturnValue(rect({ ...CAPSULE, y: -500 }))
    } else {
      menu.element.remove()
    }
    menu.dismiss()
    expect(menu.emerge()!.descriptor.emerge).toMatchObject({ fading: true })
    expect(document.querySelector('[data-satin-menu-fading]')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1000))
    expect(menu.panel()).toBeNull()
  },
)

it('recomputes safe placement and upward row direction when the panel grows', async () => {
  const insets = { top: 62, right: 0, bottom: 34, left: 0 }
  vi.spyOn(safeAreaMetrics, 'useSafeAreaMetrics').mockReturnValue({
    insets,
    physicalCoordinateSpace: 'calibrated-screen',
    physicalInsets: insets,
    layoutViewport: { width: 440, height: 956 },
    visualViewport: { width: 440, height: 956, offsetTop: 0, offsetLeft: 0, scale: 1 },
    screen: { width: 440, height: 956 },
    safeFrame: { width: 440, height: 860 },
    physicalSafeFrame: { width: 440, height: 860 },
    coordinateSpacesReconcile: true,
    standalone: true,
  })
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(440)
  const menu = mount('capsule')
  menu.press()
  await menu.present()
  const panel = menu.panel()!.closest<HTMLElement>('[data-satin-menu-panel]')!
  const glass = menu.trigger.closest<HTMLElement>('[data-satin-glass-effect]')!
  // Own methods keep these two rectangles separate from the inherited DOM geometry mock.
  glass.getBoundingClientRect = () => rect({ ...CAPSULE, y: 600 })
  panel.getBoundingClientRect = () => rect({ ...PANEL, height: 400 })
  const observer = sizeObservers.find(entry => entry.targets.includes(panel))
  expect(observer).toBeDefined()
  act(() => observer!.callback([], {} as ResizeObserver))
  const layer = panel.closest<HTMLElement>('[data-satin-glass-layer]')!
  expect(parseFloat(layer.style.top)).toBeCloseTo(600 + CAPSULE.height - 400)
  expect(
    [...menu.panel()!.querySelectorAll('[role="menuitem"]')].map(row => row.textContent),
  ).toEqual(['Paste', 'Cut', 'Copy'])
})
afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount(
  kind: 'group' | 'run' | 'capsule' | 'low' | 'plain',
  wrap: (children: ReactNode) => ReactNode = children => children,
  registryBound = true,
  entries?: MenuEntry[],
  triggerContents: ReactNode = 'Options',
) {
  const Trigger = kind === 'plain' ? Pressable : GlassButton
  const element = document.createElement('div'),
    root = createRoot(element),
    regions = new GlassRegionRegistry()
  document.body.append(element)
  mounted.push(() => {
    act(() => root.unmount())
    element.remove()
  })
  const siblingPress = vi.fn()
  const actions = entries ?? [
    { id: 'copy', label: 'Copy', onPress() {} },
    {
      section: [
        { id: 'cut', label: 'Cut', onPress() {} },
        { id: 'paste', label: 'Paste', onPress() {} },
      ],
    },
  ]
  const render = () =>
    act(() =>
      root.render(
        wrap(
          <MaterialEffectContext
            value={{
              backend: 'webgpu',
              regions: registryBound ? regions : undefined,
              ready: true,
              registerTabs() {},
            }}
          >
            {kind === 'run' ? (
              <header data-satin-navigation-chrome="true">
                <ToolbarGlass />
                <ScreenToolbar
                  entryKey="current"
                  fallback={
                    <ToolbarContext value={true}>
                      <div data-satin-toolbar-item="item">
                        <GlassButton onPress={siblingPress}>Love</GlassButton>
                      </div>
                      <div data-satin-toolbar-item="item">
                        <Menu
                          label="More"
                          actions={actions}
                          trigger={props => (
                            <GlassButton {...props} data-test-member>
                              More
                            </GlassButton>
                          )}
                        />
                      </div>
                    </ToolbarContext>
                  }
                />
              </header>
            ) : kind === 'group' ? (
              <ToolbarGroup>
                <Pressable onPress={siblingPress}>Add</Pressable>
                <Pressable onPress={siblingPress}>Edit</Pressable>
                <Menu
                  label="More"
                  actions={actions}
                  trigger={props => (
                    <Pressable {...props} data-test-member>
                      More
                    </Pressable>
                  )}
                />
              </ToolbarGroup>
            ) : (
              <div data-test-low={kind === 'low' ? '' : undefined}>
                <Menu
                  label="Options"
                  actions={actions}
                  trigger={props => (
                    <Trigger {...props} data-test-capsule>
                      {triggerContents}
                    </Trigger>
                  )}
                />
              </div>
            )}
          </MaterialEffectContext>,
        ),
      ),
    )
  render()
  const trigger = element.querySelector<HTMLButtonElement>(
    kind === 'group' || kind === 'run' ? '[data-test-member]' : '[data-test-capsule]',
  )!
  const panel = () => document.querySelector<HTMLElement>('[data-satin-general-menu]')
  const press = () =>
    act(() => {
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      trigger.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    })
  /** The renderer presents the panel glass at the trigger (the bridge marks its canvas). */
  const present = async () => {
    for (let phase = 0; phase < 2; phase++)
      await act(async () => {
        const canvas = panel()!.querySelector<HTMLCanvasElement>(
          '[data-satin-glass-region-canvas]',
        )!
        canvas.dataset.satinGlassPresented = 'true'
        canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
        await Promise.resolve()
      })
  }
  const emerge = () => regions.values().find(entry => entry.descriptor.emerge)
  const dismiss = () =>
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
  const close = () => {
    dismiss()
    act(() => {
      const entry = emerge()
      if (entry) regions.emergeSettled(entry.id, entry.descriptor.emerge?.generation)
    })
  }
  return {
    element,
    trigger,
    panel,
    press,
    present,
    emerge,
    dismiss,
    close,
    regions,
    render,
    siblingPress,
  }
}

it('finds the glass a menu morphs out of: the button itself, or the toolbar group around it', () => {
  const group = mount('group')
  const anchor = group.trigger.closest<HTMLElement>('[data-satin-menu-label]')
  const source = menuTriggerSource(anchor)
  expect(source.glass?.matches('[data-satin-toolbar-group]')).toBe(true)
  expect(source.member).toBe(group.trigger)
  const capsule = mount('capsule')
  const own = menuTriggerSource(capsule.trigger.closest<HTMLElement>('[data-satin-menu-label]'))
  expect(own.glass?.matches('[data-satin-glass-effect]')).toBe(true)
  expect(own.glass?.contains(capsule.trigger)).toBe(true)
  expect(own.member).toBeUndefined()
  expect(menuTriggerSource(null)).toEqual({ glass: undefined, member: undefined })
})

it('morphs a toolbar group’s whole glass, with the drop under the member that opened the menu', async () => {
  const menu = mount('group')
  const group = menu.element.querySelector<HTMLElement>('[data-satin-toolbar-group]')!
  menu.press()
  const emerge = menu.emerge()!.descriptor.emerge!
  expect(emerge.returnTo).toMatchObject(GROUP)
  expect(emerge.from.width).toBeGreaterThanOrEqual(GROUP.width)
  expect(emerge.anchor).toEqual({
    x: MEMBER.x + MEMBER.width / 2,
    y: MEMBER.y + MEMBER.height / 2,
  })
  expect(emerge.sourceRegionId).toBe(group.dataset.satinGlassRegionId)
  // The group stays until the panel's glass presents at it; then the whole group is the menu.
  expect(group.dataset.satinMenuEmerged).toBeUndefined()
  await menu.present()
  expect(group.dataset.satinMenuEmerged).toBe('true')
  // The panel is placed from the group's glass (its top here; menuPanelPlacement's own tests
  // cover the edges), not from the member's smaller rectangle two points lower.
  const layer = menu.panel()!.closest<HTMLElement>('[data-satin-glass-layer]')!
  expect(parseFloat(layer.style.top)).toBeCloseTo(GROUP.y)
  menu.close()
  expect(menu.panel()).toBeNull()
  expect(group.dataset.satinMenuEmerged).toBeUndefined()
})

it('morphs a labelled glass button from its own glass, with no member anchor', async () => {
  const menu = mount('capsule')
  menu.press()
  const emerge = menu.emerge()!.descriptor.emerge!
  expect(emerge.returnTo).toMatchObject(CAPSULE)
  expect(emerge.anchor).toBeUndefined()
  await menu.present()
  expect(menu.trigger.closest('[data-satin-menu-emerged]')).not.toBeNull()
  const layer = menu.panel()!.closest<HTMLElement>('[data-satin-glass-layer]')!
  // Centred on a trigger in the middle of the screen, at the trigger's top.
  expect(parseFloat(layer.style.top)).toBeCloseTo(CAPSULE.y)
  menu.close()
  expect(menu.trigger.closest('[data-satin-menu-emerged]')).toBeNull()
})

it('lists an upward phone menu from its trigger outward, as native does', async () => {
  const rows = () =>
    [...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())
  const below = mount('capsule')
  below.press()
  await below.present()
  expect(rows()).toEqual(['Copy', 'Cut', 'Paste'])
  below.close()
  // A trigger with no room below: the panel's bottom is the trigger's bottom, and the first
  // action is the row nearest the trigger (sections reversed with their rows).
  const low = mount('low')
  low.press()
  await low.present()
  expect(rows()).toEqual(['Paste', 'Cut', 'Copy'])
  const layer = low.panel()!.closest<HTMLElement>('[data-satin-glass-layer]')!
  expect(parseFloat(layer.style.top)).toBeCloseTo(LOW_CAPSULE.y + LOW_CAPSULE.height - PANEL.height)
})

// happy-dom does not implement native inert hit testing. Model that browser boundary
// here; the installed-iPad job exercises actual HID targeting and CSS hit testing.
function tap(element: HTMLElement) {
  if (element.closest('[inert]')) return
  act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

it.each([0, 100, 300])(
  'only reopens from the trigger at %i ms into a toolbar close',
  async elapsed => {
    const menu = mount('group')
    const sibling = menu.element.querySelector<HTMLButtonElement>('button')!
    menu.press()
    await menu.present()
    menu.dismiss()
    act(() => vi.advanceTimersByTime(elapsed))
    tap(sibling)
    expect(menu.siblingPress).not.toHaveBeenCalled()
    expect(menu.trigger.getAttribute('aria-expanded')).toBe('false')
    tap(menu.trigger)
    expect(menu.trigger.getAttribute('aria-expanded')).toBe('true')
    menu.close()
    tap(sibling)
    expect(menu.siblingPress).toHaveBeenCalledOnce()
  },
)

it('passes taps to visible content after dismissal while the closing rows stay inert', async () => {
  const menu = mount('group')
  const content = document.createElement('button')
  const receive = vi.fn()
  content.addEventListener('click', receive)
  document.body.append(content)
  menu.press()
  await menu.present()
  menu.dismiss()
  act(() => vi.advanceTimersByTime(100))
  tap(content)
  expect(receive).toHaveBeenCalledOnce()
  expect(menu.panel()).not.toBeNull()
  expect(menu.panel()!.closest('[inert]')).not.toBeNull()
  content.remove()
})

it.each([false, true])('cuts a retained tab menu immediately, closing=%s', async closing => {
  let active = true
  const menu = mount('group', children => (
    <TabActivityContext value={active}>{children}</TabActivityContext>
  ))
  menu.press()
  await menu.present()
  if (closing) menu.dismiss()
  active = false
  menu.render()
  expect(menu.panel()).toBeNull()
  active = true
  menu.render()
  expect(menu.panel()).toBeNull()
  menu.press()
  expect(menu.panel()).not.toBeNull()
})

it.each(['entering', 'exiting', 'covered'] as const)(
  'cuts and refuses menus on a %s screen',
  async state => {
    let lifecycle = { isCovered: false, phase: 'settled' as 'settled' | 'entering' | 'exiting' }
    const scrollRegistry = createScrollSurfaceRegistry()
    const menu = mount('capsule', children => (
      <ScreenContext value={{ key: 'screen', params: {}, lifecycle, scrollRegistry }}>
        {children}
      </ScreenContext>
    ))
    menu.press()
    await menu.present()
    lifecycle = { isCovered: state === 'covered', phase: state === 'covered' ? 'settled' : state }
    menu.render()
    expect(menu.panel()).toBeNull()
    menu.press()
    expect(menu.panel()).toBeNull()
    lifecycle = { isCovered: false, phase: 'settled' }
    menu.render()
    menu.press()
    expect(menu.panel()).not.toBeNull()
  },
)

it('consumes a tab tap through React dismissal, then permits the next tap', async () => {
  const menu = mount('capsule')
  menu.press()
  await menu.present()
  const tab = document.createElement('button')
  tab.setAttribute('role', 'tab')
  document.body.append(tab)
  const activate = vi.fn()
  tab.addEventListener('click', activate)
  const contact = (id: number) => {
    for (const type of ['pointerdown', 'pointerup']) {
      act(() => {
        tab.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: id,
            isPrimary: true,
            button: 0,
            clientX: 320,
            clientY: 900,
          }),
        )
      })
    }
    act(() => {
      tab.dispatchEvent(
        new PointerEvent('click', {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          detail: 1,
        }),
      )
    })
  }
  contact(1)
  expect(menu.emerge()!.descriptor.emerge!.closing).toBe(true)
  expect(activate).not.toHaveBeenCalled()
  contact(2)
  expect(activate).toHaveBeenCalledTimes(1)
  tab.remove()
})

it('reopens after the return source recovers from a fade and settles live rows', async () => {
  const menu = mount('capsule')
  menu.press()
  await menu.present()
  const source = menu.trigger.closest<HTMLElement>('[data-satin-glass-effect]')!
  const bounds = vi.spyOn(source, 'getBoundingClientRect')
  bounds.mockReturnValue(rect({ ...CAPSULE, y: -500 }))
  menu.dismiss()
  expect(menu.emerge()!.descriptor.emerge!.fading).toBe(true)
  bounds.mockReturnValue(rect(CAPSULE))
  menu.press()
  expect(menu.emerge()!.descriptor.emerge!.fading).not.toBe(true)
  const entry = menu.emerge()!
  act(() =>
    menu.regions.emergeInk({
      type: 'emerge-ink',
      regionId: entry.id,
      generation: entry.descriptor.emerge!.generation,
      phase: 'open-settled',
    }),
  )
  expect(menu.panel()!.querySelector<HTMLElement>('[data-satin-menu-ink]')!.inert).toBe(false)
  act(() => vi.advanceTimersByTime(1000))
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('true')
  menu.close()
  expect(menu.panel()).toBeNull()
})

it('cuts toolbar menus on push and pop and ignores presses until navigation settles', async () => {
  const controllers: TransitionController[] = []
  const navigator = createNavigator({
    registry: createScreenRegistry(
      defineScreen('home', { component: () => null }),
      defineScreen('detail', { component: () => null }),
    ),
    initial: { id: 'home' },
    transitionControllerFactory: completion => {
      const controller = { progress: 0, finish: completion.finish, cancel: completion.cancel }
      controllers.push(controller)
      return controller
    },
  })
  const menu = mount('group', children => (
    <NavigatorContext value={navigator}>{children}</NavigatorContext>
  ))
  menu.press()
  await menu.present()
  act(() => navigator.push('detail'))
  expect(menu.panel()).toBeNull()
  menu.press()
  expect(menu.panel()).toBeNull()
  act(() => controllers.at(-1)!.finish())
  menu.press()
  await menu.present()
  menu.dismiss()
  act(() => navigator.pop())
  expect(menu.panel()).toBeNull()
  menu.press()
  expect(menu.panel()).toBeNull()
  act(() => controllers.at(-1)!.finish())
  menu.press()
  expect(menu.panel()).not.toBeNull()
})

it('keeps a menu open through a height-only viewport resize but dismisses on rotation', async () => {
  const viewport = new EventTarget()
  Object.assign(viewport, { width: 440, height: 520, offsetLeft: 0, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  const menu = mount('capsule')
  menu.press()
  await menu.present()
  act(() => {
    Object.assign(viewport, { height: 956 })
    viewport.dispatchEvent(new Event('resize'))
  })
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('true')
  act(() => {
    Object.assign(viewport, { width: 956 })
    viewport.dispatchEvent(new Event('resize'))
  })
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('false')
})

it('a pointer-opened menu preserves an editing field through presentation and dismissal', async () => {
  const editor = document.createElement('input')
  document.body.append(editor)
  const menu = mount('capsule')
  menu.element.append(editor)
  const disposeKeyboard = installKeyboardAdapter(menu.element)
  mounted.push(disposeKeyboard)
  const blur = vi.spyOn(editor, 'blur')
  editor.focus()
  act(() => {
    menu.trigger.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        clientX: 200,
        clientY: 180,
        pointerType: 'touch',
        isPrimary: true,
      }),
    )
    menu.trigger.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        clientX: 200,
        clientY: 180,
        pointerType: 'touch',
        isPrimary: true,
      }),
    )
  })
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('true')
  await menu.present()
  expect(blur).not.toHaveBeenCalled()
  const entry = menu.emerge()!
  act(() =>
    menu.regions.emergeInk({
      type: 'emerge-ink',
      regionId: entry.id,
      phase: 'open-settled',
      generation: entry.descriptor.emerge?.generation,
    }),
  )
  expect(document.activeElement).toBe(editor)
  menu.close()
  expect(document.activeElement).toBe(editor)
  editor.remove()
})

it('opens plain text and glyph triggers without requiring source glass', () => {
  // Native menu-style Picker: the drop leaves the value label itself (picker-glass-sheet), the
  // same field as a glass button, not a separate point aperture with its own look.
  for (const content of [
    'Options',
    <svg key="ellipsis" aria-hidden="true">
      <circle cx="5" cy="5" r="2" />
    </svg>,
  ]) {
    const menu = mount('plain', undefined, true, undefined, content)
    expect(menu.element.querySelector('[data-satin-glass-effect]')).toBeNull()
    menu.press()
    const emerge = menu.emerge()!.descriptor.emerge!
    const virtual = { ...CAPSULE, radius: CAPSULE.height / 2 }
    expect(emerge.from).toMatchObject(virtual)
    expect(emerge.returnTo).toMatchObject(virtual)
    expect(emerge.sourceKind).toBe('label')
    expect(emerge.sourceRegionId).toBeUndefined()
    menu.close()
  }
})

it('grows a plain glyph menu as one drop and brings the glyph back as the drop dissolves', async () => {
  // Native (stock SwiftUI, iOS 27): no glass bubble forms at a plain glyph; one drop grows from
  // it. On close the glyph fades back in while the drop dissolves into it, not after the
  // renderer's settle (owner, plain-menu-morph-2026-10-11).
  const glyph = (
    <svg aria-hidden="true">
      <circle cx="5" cy="5" r="2" />
    </svg>
  )
  const menu = mount(
    'plain',
    children => <div data-test-glyph="">{children}</div>,
    true,
    undefined,
    glyph,
  )
  menu.press()
  const emerge = menu.emerge()!.descriptor.emerge!
  expect(emerge.sourceKind).toBe('glyph')
  expect(emerge.from).toMatchObject({ ...GLYPH, radius: GLYPH.height / 2 })
  expect(emerge.sourceRegionId).toBeUndefined()
  const home = { centerX: 18, centerY: 18, halfWidth: 18, halfHeight: 18, radius: 18 }
  for (let ms = 0; ms <= 300; ms += 17) {
    const frame = menuFieldFrame({
      sourceKind: 'glyph',
      direction: 'open',
      ms,
      panel: { ...home, halfWidth: 4 + ms / 3, halfHeight: 4 + ms / 4, radius: 4 },
      home,
      panelFrame: { x: 0, y: 40, width: 250, height: 188 },
    })
    expect(frame.members).toHaveLength(1)
  }
  await menu.present()
  const returning = () => document.querySelector('[data-satin-menu-glyph-return="true"]')
  expect(returning()).toBeNull()
  // Closed and settled, the glyph is still mid-fade rather than snapped back.
  menu.close()
  expect(returning()).not.toBeNull()
})

it('draws symbols and destructive roles inside sections and submenus as at the top level', async () => {
  const menu = mount('capsule', undefined, true, [
    { section: [{ id: 'share', label: 'Share', symbol: 'square.and.arrow.up', onPress() {} }] },
    {
      id: 'more',
      label: 'More',
      submenu: [
        { id: 'delete', label: 'Delete', symbol: 'trash', destructive: true, onPress() {} },
      ],
    },
  ])
  menu.press()
  await menu.present()
  const row = (label: string) =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item =>
      item.textContent?.includes(label),
    )!
  expect(
    row('Share').querySelector('[data-satin-menu-symbol="square.and.arrow.up"]'),
  ).not.toBeNull()
  act(() => row('More').click())
  expect(row('Delete').querySelector('[data-satin-menu-symbol="trash"]')).not.toBeNull()
  expect(row('Delete').dataset.destructive).toBe('true')
})

it('reveals a plain drop when its held source is ready, before releasing the opening timeline', async () => {
  const menu = mount('plain')
  menu.press()
  expect(menu.element.querySelector('[data-satin-menu-label]')).not.toBeNull()
  await act(async () => {
    const canvas = menu
      .panel()!
      .querySelector<HTMLCanvasElement>('[data-satin-glass-region-canvas]')!
    canvas.dataset.satinGlassPresented = 'true'
    canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
    await Promise.resolve()
  })
  const panel = menu.panel()!.closest<HTMLElement>('[data-satin-menu-panel]')!
  expect(panel.dataset.satinMenuPhase).toBe('open')
  expect(panel.style.visibility).not.toBe('hidden')
  expect(menu.emerge()!.descriptor.emerge?.ready).toBe(true)
})

it('prepares a hidden plain menu on contact and discards it when the contact is cancelled', () => {
  const menu = mount('plain')
  act(() =>
    menu.trigger.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 9,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        clientX: 200,
        clientY: 180,
      }),
    ),
  )
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('false')
  expect(menu.panel()).not.toBeNull()
  expect(menu.emerge()?.descriptor.emerge?.ready).toBe(false)
  expect(menu.panel()?.closest('[inert]')).not.toBeNull()
  act(() =>
    menu.trigger.dispatchEvent(
      new PointerEvent('pointercancel', {
        bubbles: true,
        pointerId: 9,
      }),
    ),
  )
  expect(menu.panel()).toBeNull()
  expect(menu.regions.values().some(entry => entry.descriptor.emerge)).toBe(false)
})

it.each(['pointerup', 'pointercancel', 'lostpointercapture'])(
  'retires hidden preparation when %s ends outside the trigger',
  type => {
    const menu = mount('plain')
    act(() =>
      menu.trigger.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 9,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          clientX: 200,
          clientY: 180,
        }),
      ),
    )
    expect(menu.panel()).not.toBeNull()
    act(() => document.dispatchEvent(new PointerEvent(type, { pointerId: 99 })))
    act(() => vi.advanceTimersByTime(1))
    expect(menu.panel()).not.toBeNull()
    act(() => document.dispatchEvent(new PointerEvent(type, { pointerId: 9 })))
    act(() => vi.advanceTimersByTime(1))
    expect(menu.panel()).toBeNull()
    expect(menu.trigger.getAttribute('aria-expanded')).toBe('false')
  },
)

it('reuses prepared glass on release and keeps rows inside the glass until settled', async () => {
  const menu = mount('plain')
  const contact = (type: string) =>
    act(() =>
      menu.trigger.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 11,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          clientX: 200,
          clientY: 180,
        }),
      ),
    )
  contact('pointerdown')
  const canvas = menu.panel()!.querySelector('canvas')
  await menu.present()
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('false')
  expect(menu.emerge()?.descriptor.emerge?.ready).toBe(false)
  contact('pointerup')
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('true')
  expect(menu.panel()!.querySelector('canvas')).toBe(canvas)
  expect(menu.emerge()?.descriptor.emerge?.ready).toBe(true)
  expect(menu.panel()!.closest<HTMLElement>('[data-satin-menu-panel]')!.dataset.satinMenuRows).toBe(
    'glass',
  )
})

function preparationContact(target: EventTarget, type: string, pointerId = 41, x = 200, y = 180) {
  act(() =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: pointerId === 41,
        button: 0,
        clientX: x,
        clientY: y,
      }),
    ),
  )
}
it.each(['arbitration', 'scroll-pan'] as const)(
  'retires preparation during %s before lift',
  path => {
    const menu = mount('plain')
    const removeScroll = installScrollPressOwnership(menu.element, 'vertical')
    preparationContact(menu.trigger, 'pointerdown')
    expect(menu.emerge()).toBeDefined()
    expect(menu.panel()?.querySelector('canvas')).not.toBeNull()
    if (path === 'arbitration')
      act(() => {
        cancelPointerPressForOwnedGesture(41)
      })
    else preparationContact(menu.trigger, 'pointermove', 41, 200, 196)
    expect(menu.panel()).toBeNull()
    expect(document.querySelector('[data-satin-menu-top-layer]')).toBeNull()
    expect(menu.regions.values().some(entry => entry.descriptor.emerge)).toBe(false)
    preparationContact(document, 'pointerup', 41, 200, 196)
    expect(menu.trigger.getAttribute('aria-expanded')).toBe('false')
    removeScroll()
  },
)
it.each(['pointerup', 'pointercancel'])('ignores a secondary %s on the preparing trigger', type => {
  const menu = mount('plain')
  preparationContact(menu.trigger, 'pointerdown')
  const canvas = menu.panel()!.querySelector('canvas')
  preparationContact(menu.trigger, 'pointerdown', 42)
  preparationContact(menu.trigger, type, 42)
  expect(menu.panel()?.querySelector('canvas')).toBe(canvas)
  expect(menu.emerge()?.descriptor.emerge?.ready).toBe(false)
  preparationContact(menu.trigger, 'pointerup')
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('true')
})
it('rejects an actual outside release after leaving the trigger bounds', () => {
  const menu = mount('plain')
  preparationContact(menu.trigger, 'pointerdown')
  preparationContact(menu.trigger, 'pointermove', 41, 10, 500)
  preparationContact(document.body, 'pointerup', 41, 10, 500)
  act(() => vi.advanceTimersByTime(1))
  expect(menu.panel()).toBeNull()
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('false')
})
it('never focuses hidden preparation before the region registry binds', () => {
  const menu = mount('plain', children => children, false)
  menu.trigger.focus()
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  preparationContact(menu.trigger, 'pointerdown')
  expect(menu.panel()?.closest('[inert]')).not.toBeNull()
  expect(document.activeElement).toBe(menu.trigger)
  expect(
    focus.mock.contexts.some(
      element =>
        element instanceof HTMLElement && element.matches('[role=menuitem], [role=menuitemradio]'),
    ),
  ).toBe(false)
  preparationContact(menu.trigger, 'pointerup')
  expect(
    focus.mock.contexts.some(
      element =>
        element instanceof HTMLElement && element.matches('[role=menuitem], [role=menuitemradio]'),
    ),
  ).toBe(false)
})

it('morphs adjacent toolbar items as their shared capsule and restores every symbol', async () => {
  const menu = mount('run')
  const owner = toolbarMaterialOwner(menu.trigger)!
  const love = [...menu.element.querySelectorAll('button')].find(
    button => button.textContent === 'Love',
  )!
  menu.press()
  const emerge = menu.emerge()!.descriptor.emerge!
  expect(emerge.from.width).toBeGreaterThanOrEqual(GROUP.width)
  expect(emerge.returnTo).toMatchObject(GROUP)
  expect(emerge.sourceRegionId).toBe(owner.dataset.satinGlassRegionId)
  await menu.present()
  expect(love.closest('[data-satin-menu-emerged="true"]')).not.toBeNull()
  expect(love.closest('[inert]')).not.toBeNull()
  menu.dismiss()
  expect(love.closest('[inert]')).not.toBeNull()
  expect(menu.trigger.closest('[inert]')).toBeNull()
  menu.close()
  expect(love.closest('[data-satin-menu-emerged="true"]')).toBeNull()
  expect(love.closest('[inert]')).toBeNull()
})
