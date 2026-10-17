// @vitest-environment happy-dom
import { act, Profiler, useState, type ProfilerOnRenderCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Menu } from './Menu.tsx'
import { PickerRow } from '../list-form/ListForm.tsx'
import { GlassButton } from './GlassEffect.tsx'
import { MaterialEffectContext } from './liquidContext.ts'
import { GlassRegionRegistry } from './regionRegistry.ts'
import { getGlassErrors } from './errors.ts'
import { openModal } from '../modal/lifecycle.ts'
import * as safeAreaMetrics from '../safe-area/useSafeAreaMetrics.ts'
import { ContextMenu } from '../actions/RowActions.tsx'
import { menuMorphDuration } from './lens/menuMorphMotion.ts'

const mounted: Array<() => void> = []
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 20,
    y: 200,
    left: 20,
    top: 200,
    right: 100,
    bottom: 240,
    width: 80,
    height: 40,
    toJSON() {},
  } as DOMRect)
  vi.useFakeTimers()
})
afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount(
  picker = false,
  owner: 'sheet' | 'list' | undefined = undefined,
  onPress?: () => void,
  onRender: ProfilerOnRenderCallback = () => {},
  contextSubmenu = false,
) {
  const element = document.createElement('div'),
    root = createRoot(element),
    regions = new GlassRegionRegistry()
  const container = document.createElement(owner === 'sheet' ? 'dialog' : 'div')
  if (owner === 'sheet') container.setAttribute('open', '')
  if (owner === 'list') {
    container.dataset.satinScroll = 'picker-list'
    container.style.overflow = 'auto'
    container.scrollTop = 240
  }
  container.append(element)
  document.body.append(container)
  mounted.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  const change = vi.fn()
  let setDisabled: (value: boolean) => void = () => {}
  function Fixture() {
    const [disabled, updateDisabled] = useState(false)
    setDisabled = updateDisabled
    return (
      <Profiler id="menu" onRender={onRender}>
        <MaterialEffectContext
          value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}
        >
          {picker ? (
            <PickerRow
              label="Folder"
              value="unfiled"
              disabled={disabled}
              onChange={change}
              options={[
                { id: 'unfiled', label: 'Unfiled' },
                { id: 'work', label: 'Work' },
              ]}
            />
          ) : contextSubmenu ? (
            <ContextMenu
              actions={[
                { id: 'react', label: 'React', submenu: [{ id: 'heart', label: 'Heart' }] },
              ]}
            >
              <button data-test-context-source>Message</button>
            </ContextMenu>
          ) : (
            <Menu
              label="Actions"
              actions={[{ id: 'copy', label: 'Copy', onPress: onPress ?? (() => {}) }]}
              trigger={props => <GlassButton {...props}>Actions</GlassButton>}
            />
          )}
        </MaterialEffectContext>
      </Profiler>
    )
  }
  act(() => root.render(<Fixture />))
  const trigger = element.querySelector<HTMLButtonElement>(
    contextSubmenu
      ? '[data-test-context-source]'
      : picker
        ? '[data-satin-picker-trigger]'
        : '[data-satin-glass-button]',
  )!
  const panel = () => document.querySelector('[data-satin-general-menu]')
  const open = async (admit = true) => {
    act(() => {
      if (contextSubmenu) {
        trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
      } else {
        trigger.focus()
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        trigger.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
      }
    })
    if (!admit) return
    // The renderer presents the panel glass at the trigger (the bridge marks its canvas).
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
  const escape = () =>
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
  const panelEntry = () => regions.values().find(entry => entry.descriptor.emerge)
  const generation = () => panelEntry()?.descriptor.emerge?.generation
  /** The renderer's report for a transition (the current one unless given). */
  const settle = (reported = generation(), regionId = panelEntry()?.id) =>
    act(() => {
      const entry = panelEntry()
      if (entry && regionId) regions.emergeSettled(regionId, reported)
    })
  const reopen = () =>
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      trigger.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    })
  const ink = (id: string, phase: 'open-settled' | 'close-started', reported = generation()) =>
    act(() => regions.emergeInk({ type: 'emerge-ink', regionId: id, phase, generation: reported }))
  return {
    trigger,
    panelEntry,
    panel,
    open,
    escape,
    settle,
    generation,
    reopen,
    ink,
    change,
    setDisabled: (value: boolean) => act(() => setDisabled(value)),
    dispose: mounted.at(-1)!,
  }
}

it('dismisses an unadmitted menu and permits a fresh opening after readiness fails', async () => {
  const menu = mount()
  await menu.open(false)
  expect(menu.panel()).not.toBeNull()
  act(() => vi.advanceTimersByTime(10_000))
  expect(menu.panel()).toBeNull()
  await menu.open()
  expect(menu.panel()).not.toBeNull()
})

it('keeps the panel until the renderer reports its return morph finished (review P4)', async () => {
  let visibility: DocumentVisibilityState = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  const menu = mount()
  await menu.open()
  expect(menu.panel()).not.toBeNull()
  menu.escape()
  act(() => {
    vi.advanceTimersByTime(400)
  })
  expect(menu.panel()).not.toBeNull()
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  act(() => vi.advanceTimersByTime(60_000))
  expect(menu.panel()).not.toBeNull()
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  menu.settle()
  expect(menu.panel()).toBeNull()
})

it('allows the measured context close and scene admission after a submenu retap', async () => {
  const animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
  const getAnimations = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getAnimations')
  Object.assign(HTMLElement.prototype, {
    animate: () => ({ finished: new Promise(() => {}), cancel() {}, pause() {}, play() {} }),
    getAnimations: () => [],
  })
  const menu = mount(false, undefined, undefined, undefined, true)
  mounted.push(() => {
    for (const [name, descriptor] of [
      ['animate', animate],
      ['getAnimations', getAnimations],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor)
      else Reflect.deleteProperty(HTMLElement.prototype, name)
    }
  })
  const errorsBefore = getGlassErrors().length
  await menu.open()
  const region = menu.panelEntry()!
  menu.ink(region.id, 'open-settled')
  const react = menu.panel()!.querySelector<HTMLButtonElement>('[data-satin-action-id="react"]')!
  act(() => react.click())
  act(() => react.click())
  expect(document.querySelector('[data-satin-submenu-leaving]')).not.toBeNull()
  menu.escape()
  const closeGeneration = menu.generation()
  // A 650 ms scene admission is inside the existing 700 ms safety margin. The context
  // renderer then runs its measured close, which is longer than the shared 700 ms allowance.
  const reportedAt = 650 + menuMorphDuration('close', 'context-content')
  act(() => vi.advanceTimersByTime(reportedAt))
  expect(getGlassErrors().slice(errorsBefore)).toEqual([])
  expect(menu.panel()).not.toBeNull()
  menu.settle(closeGeneration, region.id)
  expect(menu.panel()).toBeNull()
})

it('only spends visible time waiting for close acknowledgement, then reports a foreground failure', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  let visibility: DocumentVisibilityState = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  const menu = mount(),
    before = getGlassErrors().length
  await menu.open()
  menu.escape()
  act(() => vi.advanceTimersByTime(500))
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  act(() => vi.advanceTimersByTime(60_000))
  expect(menu.panel()).not.toBeNull()
  expect(getGlassErrors().slice(before)).toEqual([])
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  act(() => vi.advanceTimersByTime(1000))
  expect(menu.panel()).toBeNull()
  const errors = getGlassErrors().slice(before)
  expect(errors.map(error => error.stage)).toEqual(['menu close'])
})

it('a late report from an earlier close does not end a newer close (review construction update, item 1)', async () => {
  const menu = mount()
  await menu.open()
  menu.escape()
  const first = menu.generation()
  await menu.open()
  menu.escape()
  expect(menu.generation()).not.toBe(first)
  menu.settle(first)
  expect(menu.panel()).not.toBeNull()
  menu.settle()
  expect(menu.panel()).toBeNull()
})

it('returns focus to the trigger only once it is visible again after Escape (review P5; construction update, item 6)', async () => {
  const menu = mount()
  await menu.open()
  expect(menu.trigger.closest('[data-satin-menu-emerged]')).not.toBeNull()
  // happy-dom lets a visibility:hidden element take focus, so record whether the trigger was
  // still hidden (emerged) at every focus call: focusing it then loses focus on a real device.
  const hiddenAtFocus: boolean[] = []
  const focus = HTMLElement.prototype.focus
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
    this: HTMLElement,
    options?: FocusOptions,
  ) {
    if (this === menu.trigger)
      hiddenAtFocus.push(this.closest('[data-satin-menu-emerged]') !== null)
    return focus.call(this, options)
  })
  menu.escape()
  menu.settle()
  expect(menu.trigger.closest('[data-satin-menu-emerged]')).toBeNull()
  expect(hiddenAtFocus).toEqual([false])
  expect(document.activeElement).toBe(menu.trigger)
})

it('holds first-show content for its receipt but reverses a closing menu without hiding', async () => {
  const menu = mount()
  menu.reopen()
  const panel = menu.panel()!.parentElement!
  const canvas = panel.querySelector('canvas')!
  const foreground = panel.querySelector<HTMLElement>('[data-satin-menu-scroll]')!
  // The glass draws the rows while it morphs; the page never clips or scales them.
  expect(foreground.style.clipPath).toBe('')
  expect(panel.dataset.satinMenuRows).toBe('glass')
  expect(canvas.style.clipPath).toBe('')
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(true)
  const first = canvas.dataset.satinGlassShow
  expect(first).toBeTruthy()
  await act(async () => {
    canvas.dataset.satinGlassPresentedShow = 'stale'
    await Promise.resolve()
  })
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(true)
  await act(async () => {
    canvas.dataset.satinGlassPresentedShow = first
    await Promise.resolve()
  })
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(true)
  expect(canvas.dataset.satinGlassShow).not.toBe(first)
  expect(panel.dataset.satinMenuPhase).toBe('pending')
  await act(async () => {
    canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
    await Promise.resolve()
  })
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(false)
  menu.escape()
  menu.reopen()
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(false)
  expect(panel.dataset.satinMenuPhase).toBe('open')
  await act(async () => {
    canvas.dataset.satinGlassPresentedShow = first
    await Promise.resolve()
  })
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(false)
})
it('hands the rows between glass ink and the live DOM only on the current transition', async () => {
  const menu = mount()
  await menu.open()
  const panel = menu.panel()!.parentElement!
  const regions = [...document.querySelectorAll('[data-satin-general-menu]')]
  expect(regions).toHaveLength(1)
  const id = (regions[0] as HTMLElement).dataset.satinGlassRegionId!
  expect(panel.dataset.satinMenuRows).toBe('glass')
  menu.ink(id, 'open-settled', menu.generation()! - 1)
  expect(panel.dataset.satinMenuRows).toBe('glass')
  menu.ink(id, 'open-settled')
  expect(panel.dataset.satinMenuRows).toBe('dom')
  menu.escape()
  // The live rows stay until the glass draws the closing rows: no blank panel frame.
  expect(panel.dataset.satinMenuRows).toBe('dom')
  menu.ink(id, 'close-started')
  expect(panel.dataset.satinMenuRows).toBe('glass')
})
it('keeps glass-drawn rows out of reach until the live rows take over, then focuses them', async () => {
  const menu = mount()
  await menu.open()
  const ink = document.querySelector<HTMLElement>('[data-satin-menu-ink]')!
  const id = document.querySelector<HTMLElement>('[data-satin-general-menu]')!.dataset
    .satinGlassRegionId!
  // Invisible rows are neither tap targets nor focus/VoiceOver targets while the glass draws them.
  expect(ink.inert).toBe(true)
  expect(document.activeElement?.getAttribute('role')).not.toBe('menuitem')
  menu.ink(id, 'open-settled')
  expect(ink.inert).toBe(false)
  expect(document.activeElement?.getAttribute('role')).toBe('menuitem')
})
it('shows the live rows even if the renderer never reports the open settled', async () => {
  const menu = mount()
  await menu.open()
  const panel = menu.panel()!.parentElement!
  expect(panel.dataset.satinMenuRows).toBe('glass')
  act(() => vi.advanceTimersByTime(1500))
  expect(panel.dataset.satinMenuRows).toBe('dom')
  expect(document.querySelector<HTMLElement>('[data-satin-menu-ink]')!.inert).toBe(false)
  expect(document.activeElement?.getAttribute('role')).toBe('menuitem')
})
it('dismisses an unrevealed menu without starting a visible return morph', () => {
  const menu = mount()
  menu.reopen()
  expect(menu.panel()!.parentElement!.hasAttribute('data-satin-glass-hold')).toBe(true)
  menu.escape()
  expect(menu.panel()).toBeNull()
  expect(menu.trigger.closest('[data-satin-menu-emerged]')).toBeNull()
  expect(document.activeElement).toBe(menu.trigger)
})

it('hides only the glass source so its descendant label remains capturable', async () => {
  const menu = mount()
  await menu.open()
  const label = menu.trigger.closest('[data-satin-menu-label]')!
  expect(label.hasAttribute('data-satin-menu-emerged')).toBe(false)
})

it('reopens during return and hands settled rows back before a later close', async () => {
  const menu = mount()
  await menu.open()
  menu.escape()
  act(() => vi.advanceTimersByTime(100))
  menu.reopen()
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('true')
  const id = menu.panel()!.getAttribute('data-satin-glass-region-id')!
  menu.ink(id, 'open-settled')
  expect(document.querySelector<HTMLElement>('[data-satin-menu-ink]')!.inert).toBe(false)
  menu.escape()
  menu.settle()
  expect(menu.panel()).toBeNull()
})

it('cold launch starts a previously open menu closed without a return morph', async () => {
  const previous = mount()
  await previous.open()
  expect(previous.panel()).not.toBeNull()
  previous.dispose()
  mounted.pop()
  const cold = mount()
  expect(cold.panel()).toBeNull()
  expect(cold.generation()).toBeUndefined()
  expect(cold.trigger.getAttribute('aria-expanded')).toBe('false')
})

it('presents the menu-style Picker in the shared glass region with radio choices', async () => {
  const picker = mount(true)
  await picker.open()
  const menu = document.querySelector('[data-satin-general-menu]')
  expect(menu).not.toBeNull()
  expect(menu?.querySelector('[data-satin-glass-region-canvas]')).not.toBeNull()
  const choices = menu?.querySelectorAll('[role="menuitemradio"]')
  expect(choices).toHaveLength(2)
  expect(choices?.[0]?.getAttribute('aria-checked')).toBe('true')
  expect(choices?.[1]?.getAttribute('aria-checked')).toBe('false')
  expect(choices?.[0]?.querySelector('[data-satin-action-check]')?.textContent).toBe('✓')
  expect(document.querySelector('[data-satin-picker-menu]')).toBeNull()
})

it('dismisses an open Picker when it becomes disabled and prevents selection', async () => {
  const picker = mount(true)
  await picker.open()
  picker.setDisabled(true)
  expect(picker.panel()).toBeNull()
  expect(picker.trigger.disabled).toBe(true)
  expect(picker.change).not.toHaveBeenCalled()
})

it('navigates Picker radio items and activates the selected option once by keyboard', async () => {
  const picker = mount(true)
  await picker.open()
  const menu = picker.panel()!
  picker.ink((menu as HTMLElement).dataset.satinGlassRegionId!, 'open-settled')
  const choices = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
  act(() => {
    choices[0]!.focus()
    choices[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  })
  expect(document.activeElement).toBe(choices[1])
  act(() => {
    choices[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    choices[1]!.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    choices[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  expect(picker.change).toHaveBeenCalledTimes(1)
  expect(picker.change).toHaveBeenCalledWith('work')
})

for (const owner of ['sheet', 'list'] as const) {
  it(`presents a Picker in a ${owner} through an unclipped top-layer host`, async () => {
    const showPopover = vi.fn()
    const hidePopover = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: showPopover,
    })
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
      configurable: true,
      value: hidePopover,
    })
    const fixture = mount(true, owner)
    await fixture.open()
    const menu = document.querySelector('[data-satin-menu-panel]')!
    const host = menu.closest('[popover="manual"]')
    expect(host).not.toBeNull()
    expect(showPopover).toHaveBeenCalledOnce()
    if (owner === 'sheet') {
      expect(host!.parentElement?.tagName).toBe('DIALOG')
    } else {
      expect(host!.parentElement).toBe(document.body)
      expect(menu.closest('[data-satin-scroll]')).toBeNull()
      expect(document.querySelector<HTMLElement>('[data-satin-scroll]')!.scrollTop).toBe(240)
    }
    fixture.escape()
    act(() => vi.advanceTimersByTime(2000))
    expect(hidePopover).toHaveBeenCalledOnce()
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover
    delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover
  })
}

it('places a low scrolled Picker upward from its live value-label rectangle', async () => {
  const insets = { top: 62, right: 0, bottom: 34, left: 0 }
  vi.stubGlobal('navigator', {
    ...navigator,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0)',
  })
  vi.spyOn(safeAreaMetrics, 'useObservedSafeAreaMetrics').mockReturnValue({
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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const box = this.closest('[data-satin-menu-panel]')
      ? { x: 0, y: 0, width: 250, height: 188 }
      : { x: 330, y: 850, width: 80, height: 40 }
    return {
      ...box,
      left: box.x,
      top: box.y,
      right: box.x + box.width,
      bottom: box.y + box.height,
      toJSON() {},
    } as DOMRect
  })
  const fixture = mount(true, 'list')
  await fixture.open()
  const layer = document
    .querySelector<HTMLElement>('[data-satin-menu-panel]')!
    .closest<HTMLElement>('[data-satin-glass-layer]')!
  expect(layer.style.left).toBe('160px')
  expect(layer.style.top).toBe('702px')
  expect(document.querySelector<HTMLElement>('[data-satin-scroll]')!.scrollTop).toBe(240)
})

it('decides placement before registering the first menu glass frame', async () => {
  const registered: string[] = []
  const register = GlassRegionRegistry.prototype.register
  vi.spyOn(GlassRegionRegistry.prototype, 'register').mockImplementation(function (
    this: GlassRegionRegistry,
    entry,
  ) {
    if (entry.element.matches('[data-satin-general-menu]')) {
      registered.push(entry.element.closest<HTMLElement>('[data-satin-glass-layer]')!.style.top)
    }
    return register.call(this, entry)
  })
  const fixture = mount(true)
  await fixture.open()
  expect(registered.length).toBeGreaterThan(0)
  expect(registered).not.toContain('0px')
})

it('opens a sheet Picker during a held contact and selects the release row without another tap', () => {
  const menu = mount(true, 'sheet')
  const pointer = Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), {
    pointerId: 73,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: 40,
    clientY: 220,
  })
  const touch = (type: string, y: number) =>
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      touches: type === 'touchend' ? [] : [{ identifier: 19, clientX: 40, clientY: y }],
      changedTouches: [{ identifier: 19, clientX: 40, clientY: y }],
    })
  act(() => {
    menu.trigger.dispatchEvent(pointer)
    menu.trigger.dispatchEvent(touch('touchstart', 220))
    menu.trigger.dispatchEvent(
      Object.assign(new Event('pointerdown', { bubbles: true }), {
        pointerId: 74,
        pointerType: 'touch',
        isPrimary: false,
        button: 0,
        clientX: 50,
        clientY: 220,
      }),
    )
    vi.advanceTimersByTime(400)
  })
  expect(menu.trigger.getAttribute('aria-expanded')).toBe('true')
  const work = document.querySelector<HTMLButtonElement>('[data-satin-action-id="work"]')!
  expect(work).not.toBeNull()
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => work })
  const move = touch('touchmove', 300)
  act(() => {
    menu.trigger.dispatchEvent(move)
    menu.trigger.dispatchEvent(touch('touchend', 300))
  })
  expect(move.defaultPrevented).toBe(true)
  expect(menu.change).toHaveBeenCalledWith('work')
})

it('finishes the original menu close while its action presents an About sheet', async () => {
  const dialog = document.createElement('dialog')
  dialog.dataset.satinPresentation = 'sheet'
  dialog.innerHTML = '<h2>About Reminders</h2>'
  document.body.append(dialog)
  let dismiss: (() => void) | undefined
  mounted.push(() => {
    dismiss?.()
    dialog.remove()
  })
  const menu = mount(false, undefined, () => {
    dismiss = openModal(dialog)
  })
  const before = getGlassErrors().length
  await menu.open()
  const original = menu.panel()!
  const entry = menu.panelEntry()!
  menu.ink(entry.id, 'open-settled')
  act(() => {
    original
      .querySelector('[role="menuitem"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  expect(dialog.open).toBe(true)
  expect(menu.panel()).toBe(original)
  const closeGeneration = menu.generation()
  menu.ink(entry.id, 'close-started', closeGeneration)
  menu.settle(closeGeneration, entry.id)
  expect(menu.panel()).toBeNull()
  act(() => vi.advanceTimersByTime(1500))
  expect(getGlassErrors().slice(before)).toEqual([])
})

it('keeps closed menus idle during viewport updates and opens with fresh available geometry', async () => {
  const viewport = Object.assign(new EventTarget(), {
    width: 440,
    height: 956,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
  })
  vi.stubGlobal('visualViewport', viewport)
  const rendered = vi.fn()
  const menu = mount(false, undefined, undefined, rendered)
  rendered.mockClear()
  await act(async () => {
    viewport.height = 700
    viewport.dispatchEvent(new Event('resize'))
    await vi.advanceTimersByTimeAsync(40)
  })
  expect(rendered).not.toHaveBeenCalled()
  // Opening can beat the scheduled resize sample, so its first placement must read now.
  vi.stubGlobal('innerHeight', 400)
  viewport.height = 400
  viewport.dispatchEvent(new Event('resize'))
  await menu.open()
  const scroll = document.querySelector<HTMLElement>('[data-satin-menu-scroll]')!
  expect(Number.parseFloat(scroll.style.maxHeight)).toBeLessThan(400)
})
