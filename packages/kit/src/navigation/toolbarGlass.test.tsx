// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { act, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ToolbarGlass } from './ToolbarGlass.tsx'
import { ScreenToolbar, ToolbarContext, ToolbarConfirmationContext } from '../public/chrome.tsx'
import { Button } from '../public/controls.tsx'
import { GlassEffect, GlassBackground, ToolbarGroup, GlassButton } from '../glass/GlassEffect.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import {
  toolbarMaterialOwner,
  toolbarMaterialRuns,
  toolbarMaterials,
  toolbarMaterialContent,
  toolbarMenuTrigger,
  ToolbarMaterialPortal,
} from '../glass/toolbarMaterialContext.ts'
import { Glass } from '../glass/regions.ts'
import { Menu } from '../glass/Menu.tsx'
import { Menu as PublicMenu } from '../public/actions.tsx'
import { Label } from '../public/Label.tsx'
import { GlassRegionRegistry } from '../glass/regionRegistry.ts'
import { registerToolbarMotion } from './toolbarMotionOwner.ts'
import { glassShapeTrack } from '../glass/shapeTrackRegistry.ts'
import { shapeTrackFrame } from '../glass/shapeTrack.ts'
import { toolbarCorrespondence } from './toolbarCorrespondence.ts'

it('keeps the trailing action paired when a leading capsule is inserted', () => {
  const action = (symbol: string) => {
    const element = document.createElement('div')
    element.innerHTML = `<svg data-satin-symbol="${symbol}"></svg>`
    return [element]
  }
  const outgoing = action('checkmark')
  const leading = action('magnifyingglass')
  const trailing = action('checkmark')
  const pairs = toolbarCorrespondence([outgoing], [leading, trailing], run => ({
    x: run === leading ? 20 : 360,
    y: 800,
    width: 44,
    height: 44,
  }))
  expect(pairs[0]?.start).toBeUndefined()
  expect(pairs[0]?.splitFrom).toBeUndefined()
  expect(pairs[1]?.start).toBe(outgoing)
  const reverse = toolbarCorrespondence([leading, trailing], [outgoing], run => ({
    x: run === leading ? 20 : 360,
    y: 800,
    width: 44,
    height: 44,
  }))
  expect(reverse[0]?.start).toBe(trailing)
  expect(reverse[1]?.end).toBeUndefined()
})

it('registers one capsule while outgoing and incoming items share a trailing slot', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="old"
              active={false}
              motion="outgoing"
              fallback={
                <ToolbarGroup>
                  <button>Old</button>
                </ToolbarGroup>
              }
            />
            <ScreenToolbar
              entryKey="new"
              motion="incoming"
              fallback={
                <ToolbarGroup>
                  <button>New</button>
                  <button>More</button>
                </ToolbarGroup>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
    expect(regions.size).toBe(1)
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('morphs one capsule on the chrome timeline without motion-time layout writes', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute('data-satin-toolbar-materials')) return new DOMRect(0, 0, 0, 0)
    const old = this.closest('[data-satin-entry-toolbar="old"]')
    const width = old ? 40 : 120
    const left = old ? 360 : 280
    return new DOMRect(left, 66, width, 44)
  })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  const stylesheet = document.createElement('style')
  stylesheet.textContent = '[data-satin-toolbar-motion="incoming"] > div { opacity: 0; }'
  document.head.append(stylesheet)
  document.body.append(host)
  const root = createRoot(host)
  const render = (moving: boolean) =>
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            {moving && (
              <ScreenToolbar
                entryKey="old"
                active={false}
                motion="outgoing"
                fallback={
                  <ToolbarGroup>
                    <button>Old</button>
                  </ToolbarGroup>
                }
              />
            )}
            <ScreenToolbar
              entryKey="new"
              motion={moving ? 'incoming' : undefined}
              fallback={
                <ToolbarGroup>
                  <button>New</button>
                  <button>More</button>
                </ToolbarGroup>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
  const step = () =>
    act(() => {
      const next = callbacks.splice(0)
      for (const callback of next) callback(16)
    })
  try {
    render(true)
    const material = () => host.querySelector<HTMLElement>('[data-satin-toolbar-glass="trailing"]')!
    expect(regions.size).toBe(1)
    expect(material().style.width).toBe('40px')
    const incoming = host.querySelector<HTMLElement>(
      '[data-satin-entry-toolbar="new"] > [data-satin-navigation-toolbar-slot="trailing"]',
    )!
    incoming.style.opacity = '0.5'
    const source = {
      startTime: 100,
      currentTime: 120,
      playState: 'running',
      playbackRate: 1,
      effect: {
        getTiming: () => ({ duration: 240 }),
        getKeyframes: () => [
          { computedOffset: 0, opacity: 0 },
          { computedOffset: 1, opacity: 1 },
        ],
      },
    }
    registerToolbarMotion(incoming, 'opacity', source as unknown as Animation)
    step()
    expect(regions.size).toBe(1)
    expect(material().style.width).toBe('120px')
    expect(material().style.left).toBe('280px')
    const track = glassShapeTrack(material())!
    expect(shapeTrackFrame(track, track.epoch + 120).width).toBe(80)
    const style = material().getAttribute('style')
    for (let at = 121; at < 240; at += 16) {
      source.currentTime = at
      incoming.style.opacity = String(at / 240)
      step()
      expect(material().getAttribute('style')).toBe(style)
      expect(glassShapeTrack(material())).toBe(track)
    }
    // Removing the outgoing page also changes the context and observer binding.
    // The still-mounted capsule must keep its original tail, not start an arrival.
    render(false)
    step()
    expect(glassShapeTrack(material())).toBe(track)
    expect(shapeTrackFrame(glassShapeTrack(material())!, track.epoch + 120).width).toBe(80)
    source.playState = 'idle'
    step()
    expect(regions.size).toBe(1)
    expect(material().style.width).toBe('120px')
  } finally {
    act(() => root.unmount())
    host.remove()
    stylesheet.remove()
    vi.restoreAllMocks()
  }
})

it('keeps the glass of an item both screens show in place while only its symbol dissolves', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  // Both screens show "…" at the same spot; mid-dissolve each symbol is scaled about its centre.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute('data-satin-toolbar-materials')) return new DOMRect(0, 0, 0, 0)
    const scale = Number(this.style.scale) || 1
    return new DOMRect(398 - 22 * scale, 88 - 22 * scale, 44 * scale, 44 * scale)
  })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const toolbar = (entryKey: string, motion: 'incoming' | 'outgoing') => (
    <ScreenToolbar
      entryKey={entryKey}
      active={motion === 'incoming'}
      motion={motion}
      fallback={
        <ToolbarGroup>
          <button>More</button>
        </ToolbarGroup>
      }
    />
  )
  try {
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            {toolbar('root', 'outgoing')}
            {toolbar('list', 'incoming')}
          </header>
        </MaterialEffectContext>,
      ),
    )
    for (const entry of ['root', 'list']) {
      const slot = host.querySelector<HTMLElement>(
        `[data-satin-entry-toolbar="${entry}"] > [data-satin-navigation-toolbar-slot="trailing"]`,
      )!
      slot.style.opacity = '0.5'
      slot.style.filter = 'blur(5px)'
      for (const item of slot.querySelectorAll<HTMLElement>('[data-satin-glass-slot-content]'))
        item.style.scale = '1.1'
    }
    act(() => {
      for (const callback of callbacks.splice(0)) callback(16)
    })
    const material = host.querySelector<HTMLElement>('[data-satin-toolbar-glass="trailing"]')!
    expect(regions.size).toBe(1)
    // Native (iOS 27.0, identical "…" and "+"): the capsule neither moves, swells, fades nor blurs.
    expect(material.style.left).toBe('376px')
    expect(material.style.top).toBe('66px')
    expect(material.style.width).toBe('44px')
    expect(material.style.opacity).toBe('1')
    expect(material.style.filter).toBe('')
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})

it('preserves a slot material and sends the contact on its content to its owner', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  const regions = new GlassRegionRegistry()
  const glass = Glass.regular.tint([0, 0.48, 1, 0.65]).interactive()
  const shape = { kind: 'roundedRectangle' as const, cornerRadius: 14 }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = () =>
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="current"
              fallback={
                <GlassEffect glass={glass} shape={shape}>
                  <button>Custom action</button>
                </GlassEffect>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
  try {
    render()
    act(() => {
      const next = callbacks.splice(0)
      for (const callback of next) callback(16)
    })
    const owner = regions.values()[0]!
    expect(regions.size).toBe(1)
    // A toolbar item presses as a bar button.
    expect(owner.descriptor.material).toEqual({ ...glass.material, press: 'bar' })
    expect(owner.descriptor.shape).toEqual(shape)
    const button = host.querySelector('button')!
    const pointer = (type: string, clientX: number) =>
      act(() => {
        button.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 7,
            isPrimary: true,
            button: 0,
            clientX,
            clientY: 10,
          }),
        )
      })
    pointer('pointerdown', 10)
    expect(regions.interactions.get(owner.id)?.phase).toBe('pressed')
    pointer('pointermove', 30)
    expect(regions.interactions.get(owner.id)?.phase).toBe('dragging')
    pointer('pointerup', 30)
    expect(regions.interactions.get(owner.id)?.phase).toBe('releasing')
    expect(toolbarMaterialOwner(button)).toBe(owner.element)
    expect(toolbarMaterialContent(owner.element).contains(button)).toBe(true)
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})

it('keeps a toolbar menu portal material independently registered', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  const portal = document.createElement('div')
  document.body.append(host, portal)
  const root = createRoot(host)
  try {
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="current"
              fallback={
                <>
                  <ToolbarGroup>
                    <button>Open menu</button>
                  </ToolbarGroup>
                  {createPortal(
                    <GlassEffect>
                      <div role="menu">Menu content</div>
                    </GlassEffect>,
                    portal,
                  )}
                </>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
    expect(regions.size).toBe(2)
    expect(
      regions.values().filter(region => region.element.closest('[data-satin-toolbar-materials]')),
    ).toHaveLength(1)
    expect(regions.values().filter(region => portal.contains(region.element))).toHaveLength(1)
  } finally {
    act(() => root.unmount())
    host.remove()
    portal.remove()
  }
})

it('owns two independent glass items in one placement without filling their gap', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="current"
              fallback={
                <>
                  <GlassEffect glass={Glass.clear.interactive()}>
                    <button>First</button>
                  </GlassEffect>
                  <GlassEffect glass={Glass.regular.tint([1, 0, 0, 1]).interactive()}>
                    <button>More</button>
                  </GlassEffect>
                </>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
    expect(regions.size).toBe(2)
    const first = toolbarMaterialOwner(host.querySelector('button'))!
    const second = toolbarMaterialOwner(host.querySelectorAll('button')[1])!
    expect(second).not.toBe(first)
    expect(toolbarMaterialContent(second).textContent).toBe('More')
    expect(regions.values().map(region => region.descriptor.material.variant)).toEqual([
      'clear',
      'regular',
    ])
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('uses the menu item and hides only its material throughout emergence', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (shown: boolean) =>
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="current"
              fallback={
                <>
                  <GlassEffect glass={Glass.regular.interactive()}>
                    <button>First</button>
                  </GlassEffect>
                  <ToolbarGroup>
                    <button>Group action</button>
                    <span data-satin-menu-emerged={shown || undefined}>
                      <button>More</button>
                    </span>
                  </ToolbarGroup>
                </>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
  try {
    render(false)
    const more = [...host.querySelectorAll('button')].find(button => button.textContent === 'More')!
    const source = toolbarMenuTrigger(more)!
    expect(source.textContent).toBe('Group actionMore')
    const owner = toolbarMaterialOwner(more)!
    render(true)
    expect(owner.style.opacity).toBe('0')
    expect(toolbarMaterialOwner(host.querySelector('button'))!.style.opacity).toBe('1')
    expect(toolbarMaterialContent(owner)).toBe(source)
    render(false)
    expect(owner.style.opacity).toBe('1')
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})

it('pairs item indices, interpolates each radius, and retains registration identity', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute('data-satin-toolbar-materials')) return new DOMRect(0, 0, 0, 0)
    const old = this.closest('[data-satin-entry-toolbar="old"]')
    const second = this.textContent?.includes('second')
    return new DOMRect((second ? 250 : 320) - (old ? 0 : 20), 66, old ? 44 : 64, 44)
  })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const items = (old: boolean) => (
    <>
      <GlassEffect
        glass={Glass.regular.interactive()}
        shape={{ kind: 'roundedRectangle', cornerRadius: old ? 4 : 20 }}
      >
        <button>first</button>
      </GlassEffect>
      <GlassEffect
        glass={Glass.clear.interactive()}
        shape={{ kind: 'roundedRectangle', cornerRadius: old ? 18 : 6 }}
      >
        <button>second</button>
      </GlassEffect>
    </>
  )
  try {
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar entryKey="old" active={false} motion="outgoing" fallback={items(true)} />
            <ScreenToolbar entryKey="new" motion="incoming" fallback={items(false)} />
          </header>
        </MaterialEffectContext>,
      ),
    )
    const ids = regions.values().map(region => region.id)
    expect(regions.size).toBe(2)
    const incoming = host.querySelector<HTMLElement>(
      '[data-satin-entry-toolbar="new"] [data-satin-navigation-toolbar-slot="trailing"]',
    )!
    for (const progress of [0.25, 0.75]) {
      incoming.style.opacity = String(progress)
      act(() => {
        for (const callback of callbacks.splice(0)) callback(16)
      })
      expect(regions.values().map(region => region.id)).toEqual(ids)
      expect(regions.values().map(region => region.descriptor.shape)).toEqual([
        { kind: 'roundedRectangle', cornerRadius: 4 + 16 * progress },
        { kind: 'roundedRectangle', cornerRadius: 18 - 12 * progress },
      ])
      expect(regions.values().map(region => Number.parseFloat(region.element.style.width))).toEqual(
        [44 + 20 * progress, 44 + 20 * progress],
      )
    }
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})

it('does not invalidate unchanged item presentation while a menu is preparing', () => {
  const regions = new GlassRegionRegistry()
  const element = document.createElement('div')
  const material = Glass.regular.interactive().material
  const descriptor = { id: 'persistent', material, shape: 'capsule' as const }
  const unregister = regions.register({
    id: descriptor.id,
    element,
    canvas: document.createElement('canvas'),
    descriptor,
  })
  const invalidated = vi.fn()
  const unsubscribe = regions.subscribe(invalidated)
  regions.updatePresentation(descriptor.id, { material: { ...material }, shape: 'capsule' })
  expect(invalidated).not.toHaveBeenCalled()
  regions.updatePresentation(descriptor.id, {
    material,
    shape: { kind: 'roundedRectangle', cornerRadius: 12 },
  })
  expect(invalidated).toHaveBeenCalledTimes(1)
  expect(regions.values()[0]!.element).toBe(element)
  unregister()
  expect(regions.size).toBe(0)
  unsubscribe()
})

it('mounts a toolbar menu portal canvas before first-show readiness binds', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  const portal = document.createElement('div')
  document.body.append(host, portal)
  const root = createRoot(host)
  let firstCommitCanvases = -1
  function ReadinessProbe() {
    useLayoutEffect(() => {
      firstCommitCanvases = portal.querySelectorAll('canvas[data-satin-glass-region-canvas]').length
    }, [])
    return <GlassEffect>Menu content</GlassEffect>
  }
  try {
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="current"
              fallback={
                <>
                  <ToolbarGroup>
                    <button>More</button>
                  </ToolbarGroup>
                  {createPortal(
                    <ToolbarMaterialPortal>
                      <ReadinessProbe />
                    </ToolbarMaterialPortal>,
                    portal,
                  )}
                </>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
    expect(firstCommitCanvases).toBe(1)
    expect(regions.values().filter(region => portal.contains(region.element))).toHaveLength(1)
  } finally {
    act(() => root.unmount())
    host.remove()
    portal.remove()
  }
})

it('binds both first-show receipts for a real menu inside a toolbar pill', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(300, 62, 80, 44),
  )
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() =>
      root.render(
        <MaterialEffectContext
          value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}
        >
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="current"
              fallback={
                <ToolbarGroup>
                  <Menu
                    label="More"
                    actions={[{ id: 'copy', label: 'Copy', onPress() {} }]}
                    trigger={props => <GlassButton {...props}>More</GlassButton>}
                  />
                </ToolbarGroup>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
    const trigger = host.querySelector<HTMLButtonElement>('button')!
    act(() => {
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      trigger.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    })
    const panel = document.querySelector<HTMLElement>('[data-satin-menu-panel]')!
    const canvas = panel.querySelector<HTMLCanvasElement>('canvas')!
    expect(canvas.dataset.satinGlassShow).toBeTruthy()
    const first = canvas.dataset.satinGlassShow
    await act(async () => {
      canvas.dataset.satinGlassPresentedShow = first
      await Promise.resolve()
    })
    expect(canvas.dataset.satinGlassShow).toBeTruthy()
    expect(canvas.dataset.satinGlassShow).not.toBe(first)
    await act(async () => {
      canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
      await Promise.resolve()
    })
    expect(panel.dataset.satinMenuPhase).toBe('open')
    expect(panel.style.visibility).toBe('')
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})

it('gives an automatic toolbar label body typography and a full-height capsule member', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  document.head.append(style)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const toolbar = (
    <ToolbarContext value="group">
      <ToolbarGroup>
        <Button onPress={() => {}}>Add plant</Button>
      </ToolbarGroup>
    </ToolbarContext>
  )
  try {
    act(() => {
      root.render(
        <MaterialEffectContext
          value={{ regions: new GlassRegionRegistry(), ready: true, registerTabs() {} }}
        >
          <ScreenToolbar fallback={toolbar} />
        </MaterialEffectContext>,
      )
    })
    const button = [...document.querySelectorAll('button')].find(
      item => item.textContent === 'Add plant',
    )!
    const computed = getComputedStyle(button)
    expect(computed.fontSize).toBe('17px')
    expect(computed.fontWeight).toBe('400')
    expect(computed.minHeight).toBe('40px')
    expect(computed.paddingTop).toBe('8px')
    expect(computed.paddingLeft).toBe('14px')
    expect(computed.backgroundColor).toBe('transparent')
  } finally {
    act(() => root.unmount())
    host.remove()
    style.remove()
  }
})

it('gives confirmation labels semibold typography in independent full-height capsules', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  document.head.append(style)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const toolbar = (
    <ToolbarConfirmationContext value={true}>
      <ToolbarContext value={true}>
        <Button onPress={() => {}}>Add plant</Button>
      </ToolbarContext>
    </ToolbarConfirmationContext>
  )
  try {
    act(() => {
      root.render(
        <MaterialEffectContext
          value={{ regions: new GlassRegionRegistry(), ready: true, registerTabs() {} }}
        >
          <ScreenToolbar fallback={toolbar} />
        </MaterialEffectContext>,
      )
    })
    const button = [...document.querySelectorAll('button')].find(
      item => item.textContent === 'Add plant',
    )!
    const computed = getComputedStyle(button)
    expect(computed.fontSize).toBe('17px')
    expect(computed.fontWeight).toBe('600')
    expect(computed.minHeight).toBe('44px')
    expect(computed.paddingLeft).toBe('16px')
  } finally {
    act(() => root.unmount())
    host.remove()
    style.remove()
  }
})

it('keeps toolbar material with its label inside a translated and scaled sheet', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  // Layout supplied by WebKit: 440pt local header scaled to 424pt at the medium detent.
  const scale = 424 / 440
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-satin-toolbar-materials')
      ? new DOMRect(8, 470, 424, 44 * scale)
      : new DOMRect(8 + 20 * scale, 470 + 4 * scale, 84 * scale, 44 * scale)
  })
  const originalStyle = globalThis.getComputedStyle
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(element => {
    const style = originalStyle(element)
    if (element.hasAttribute('data-satin-toolbar-materials')) {
      return { width: '440px', height: '44px' } as CSSStyleDeclaration
    }
    return style
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() =>
      root.render(
        <MaterialEffectContext
          value={{ regions: new GlassRegionRegistry(), ready: true, registerTabs() {} }}
        >
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="sheet"
              fallback={
                <ToolbarGroup>
                  <button>Done</button>
                </ToolbarGroup>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
    const material = host.querySelector<HTMLElement>('[data-satin-toolbar-glass]')!
    expect(parseFloat(material.style.left)).toBeCloseTo(20)
    expect(parseFloat(material.style.top)).toBeCloseTo(4)
    expect(parseFloat(material.style.width)).toBeCloseTo(84)
    expect(parseFloat(material.style.height)).toBeCloseTo(44)
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})

// Owner case (Reminders New Reminder, mid-present): layout inside a moving sheet can settle with no
// mutation or resize the toolbar observes, and WebKit can resample the moving sheet between two
// reads with no write between them (Catalyst: 2.42 pt between consecutive reads). The material
// follows its label every frame, whichever read the resample lands after.
it('remeasures toolbar material every frame while its presentation moves', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let labelTop = 10
  let travel = 0
  let containerReads = 0
  let resampleAfterRead = 0
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (!this.hasAttribute('data-satin-toolbar-materials'))
      return new DOMRect(20, travel + labelTop, 84, 44)
    const rect = new DOMRect(0, travel, 440, 44)
    containerReads += 1
    if (containerReads === resampleAfterRead) travel -= 3
    return rect
  })
  const originalStyle = globalThis.getComputedStyle
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(element => {
    if (!element.hasAttribute('data-satin-toolbar-materials')) return originalStyle(element)
    // Each measuring pass starts by reading its container's style.
    containerReads = 0
    return { width: '440px', height: '44px' } as CSSStyleDeclaration
  })
  const frames: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback))
  const runFrame = (time: number, resampleAfter: number) => {
    resampleAfterRead = resampleAfter
    act(() => frames.splice(0).forEach(frame => frame(time)))
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() =>
      root.render(
        <MaterialEffectContext
          value={{ regions: new GlassRegionRegistry(), ready: true, registerTabs() {} }}
        >
          <dialog data-satin-presentation-moving="entrance">
            <header data-satin-navigation-chrome="true">
              <ToolbarGlass />
              <ScreenToolbar
                entryKey="sheet"
                fallback={
                  <ToolbarGroup>
                    <button>Add</button>
                  </ToolbarGroup>
                }
              />
            </header>
          </dialog>
        </MaterialEffectContext>,
      ),
    )
    const material = () => host.querySelector<HTMLElement>('[data-satin-toolbar-glass]')!
    runFrame(16, 1)
    expect(parseFloat(material().style.top)).toBeCloseTo(10)
    labelTop = 16
    runFrame(32, 2)
    expect(parseFloat(material().style.top)).toBeCloseTo(16)
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})

function renderToolbar(children: ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
        <header data-satin-navigation-chrome="true">
          <ToolbarGlass />
          <ScreenToolbar entryKey="current" fallback={children} />
        </header>
      </MaterialEffectContext>,
    ),
  )
  return {
    regions,
    host,
    done() {
      act(() => root.unmount())
      host.remove()
    },
  }
}

const item = (label: string) => (
  <div data-satin-toolbar-item="item">
    <ToolbarContext value={true}>
      <Button onPress={() => {}}>{label}</Button>
    </ToolbarContext>
  </div>
)

it('merges consecutive toolbar items into one capsule; a spacer splits it (reference, iOS 26+)', () => {
  const merged = renderToolbar(
    <>
      {item('Edit')}
      {item('Add')}
    </>,
  )
  try {
    expect(merged.regions.size).toBe(1)
    const [edit, add] = merged.host.querySelectorAll('button')
    expect(toolbarMaterialOwner(edit)).toBe(toolbarMaterialOwner(add))
  } finally {
    merged.done()
  }
  const split = renderToolbar(
    <>
      {item('Edit')}
      <span data-satin-toolbar-spacer="fixed" />
      {item('Add')}
    </>,
  )
  try {
    expect(split.regions.size).toBe(2)
  } finally {
    split.done()
  }
})

it("gives a toolbar Menu's stable label the glass circle (reference)", () => {
  const toolbar = renderToolbar(
    <ToolbarContext value={true}>
      <PublicMenu
        label={<Label symbol="ellipsis">More</Label>}
        actions={[{ id: 'new', label: 'New List', onPress() {} }]}
      />
    </ToolbarContext>,
  )
  try {
    const trigger = toolbar.host.querySelector<HTMLElement>('[data-satin-toolbar-button]')
    expect(trigger?.dataset.satinIconOnly).toBe('true')
    expect(trigger?.getAttribute('aria-label')).toBe('More')
    expect(toolbar.regions.size).toBe(1)
  } finally {
    toolbar.done()
  }
})

// reference acceptance (iPad, Oct 10): `<Button symbol="plus" aria-label="Add" />` painted a 58.5 pt
// capsule where the control's bare-image toolbar button paints a 44.5 pt circle.
it('draws a bare toolbar symbol as the icon-only circle and keeps its accessible name', () => {
  // happy-dom has no 2D canvas; prominent glass resolves its tint through one.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {},
    getImageData: () => ({ data: [0, 136, 255, 255] }),
  } as never)
  const toolbar = renderToolbar(
    <div data-satin-toolbar-item="item">
      <ToolbarContext value={true}>
        <Button symbol="plus" aria-label="Add" onPress={() => {}} />
        <Button symbol="trash" onPress={() => {}} />
        <Button symbol="star" aria-label=" " onPress={() => {}}>
          {false}
        </Button>
      </ToolbarContext>
      <ToolbarConfirmationContext value={true}>
        <ToolbarContext value={true}>
          <Button symbol="checkmark" aria-label="Done" onPress={() => {}} />
        </ToolbarContext>
      </ToolbarConfirmationContext>
    </div>,
  )
  try {
    const [add, trash, star, done] = toolbar.host.querySelectorAll('button')
    expect(add?.getAttribute('data-satin-icon-only')).toBe('true')
    expect(add?.getAttribute('aria-label')).toBe('Add')
    expect(trash?.getAttribute('data-satin-icon-only')).toBe('true')
    expect(trash?.getAttribute('aria-label')).toBe('trash')
    // A blank label falls back to the symbol name instead of failing the icon-only guard.
    expect(star?.getAttribute('data-satin-icon-only')).toBe('true')
    expect(star?.getAttribute('aria-label')).toBe('star')
    // A confirmation action's bare symbol is prominent, like an explicit iconOnly one.
    expect(done?.getAttribute('data-satin-glass-button')).toBe('glassProminent')
  } finally {
    toolbar.done()
    vi.restoreAllMocks()
  }
})

it('keeps a resting search field in the same material transaction as its toolbar group', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (presented: boolean) =>
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <div data-satin-navigation-toolbar-slot="bottom">
            <div data-satin-toolbar-item="search">
              <div data-testid="field">
                <GlassBackground recipe="searchField" toolbarMaterial={!presented} />
                <input aria-label="Search" />
              </div>
            </div>
          </div>
        </MaterialEffectContext>,
      ),
    )
  try {
    render(false)
    const slot = host.querySelector<HTMLElement>('[data-satin-navigation-toolbar-slot]')!
    const field = host.querySelector<HTMLElement>('[data-testid="field"]')!
    expect(toolbarMaterialRuns(slot)).toEqual([[field]])
    expect(toolbarMaterials.get(field)?.recipe).toBe('searchField')
    expect(regions.size).toBe(0)
    render(true)
    expect(toolbarMaterialRuns(slot)).toEqual([])
    expect(toolbarMaterials.has(field)).toBe(false)
    expect(regions.values()).toHaveLength(1)
    expect(regions.values()[0]?.element).toBe(field)
    expect(regions.values()[0]?.descriptor.material.recipe).toBe('searchField')
    render(false)
    expect(toolbarMaterialRuns(slot)).toEqual([[field]])
    expect(regions.size).toBe(0)
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('pairs search with the destination group without borrowing the trailing button capsule', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="old"
              active={false}
              motion="outgoing"
              fallback={
                <>
                  <div data-satin-toolbar-item="search">
                    <div data-testid="search-origin">
                      <GlassBackground toolbarMaterial recipe="searchField" />
                      <input aria-label="Search" />
                    </div>
                  </div>
                  <GlassButton aria-label="Compose" onPress={() => {}}>
                    Compose
                  </GlassButton>
                </>
              }
            />
            <ScreenToolbar
              entryKey="new"
              motion="incoming"
              fallback={
                <>
                  <ToolbarGroup>
                    <button>Flag</button>
                    <button>Folder</button>
                  </ToolbarGroup>
                  <GlassButton aria-label="Done" onPress={() => {}}>
                    Done
                  </GlassButton>
                </>
              }
            />
          </header>
        </MaterialEffectContext>,
      ),
    )
    const search = host.querySelector<HTMLElement>('[data-testid="search-origin"]')!
    const compose = host.querySelector<HTMLElement>('[aria-label="Compose"]')!
    expect(regions.size).toBe(2)
    const searchOwner = toolbarMaterialOwner(search)
    expect(searchOwner?.dataset.satinToolbarGlassItem).toBe('0')
    expect(toolbarMaterialOwner(compose)?.dataset.satinToolbarGlassItem).toBe('1')
    expect(
      regions.values().every(region => region.element.closest('[data-satin-toolbar-materials]')),
    ).toBe(true)
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('keeps partition membership through split and merge without duplicating ink owners', () => {
  const item = (name: string) => {
    const element = document.createElement('div')
    element.innerHTML = `<svg data-satin-symbol="${name}"></svg>`
    return element
  }
  const grouped = [item('bell'), item('flag')]
  const bell = [item('bell')]
  const flag = [item('flag')]
  const frame = (run: HTMLElement[]) => ({
    x: run === flag ? 60 : 0,
    y: 0,
    width: run === grouped ? 88 : 44,
    height: 44,
  })
  const split = toolbarCorrespondence([grouped], [bell, flag], frame)
  expect(split[0]).toMatchObject({ start: grouped, end: bell, partition: 0, splitting: true })
  expect(split[1]).toMatchObject({ splitFrom: grouped, end: flag, partition: 0 })
  expect(split[1]!.start).toBeUndefined()
  const merge = toolbarCorrespondence([bell, flag], [grouped], frame)
  expect(merge[0]).toMatchObject({ start: bell, end: grouped, partition: 0 })
  expect(merge[0]!.splitting).toBeUndefined()
  expect(merge[1]).toMatchObject({ start: flag, mergeInto: grouped, partition: 0 })
})

it('keeps a departing capsule on the glass that drew it when the transition begins', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute('data-satin-toolbar-materials')) return new DOMRect(0, 0, 0, 0)
    // The incoming item sits where the outgoing "second" did, so the two pair up.
    return new DOMRect(this.textContent?.includes('second') ? 250 : 320, 66, 44, 44)
  })
  const regions = new GlassRegionRegistry()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const item = (label: string) => (
    <GlassEffect glass={Glass.regular.interactive()}>
      <button>{label}</button>
    </GlassEffect>
  )
  const frame = () =>
    act(() => {
      for (const callback of callbacks.splice(0)) callback(16)
    })
  const ownerOf = (label: string) =>
    [...host.querySelectorAll<HTMLElement>('[data-satin-toolbar-glass]')].find(owner =>
      toolbarMaterialContent(owner).textContent?.includes(label),
    )
  const render = (incoming: boolean) =>
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <header data-satin-navigation-chrome="true">
            <ToolbarGlass />
            <ScreenToolbar
              entryKey="old"
              active={!incoming}
              motion={incoming ? 'outgoing' : undefined}
              fallback={
                <>
                  {item('first')}
                  {item('second')}
                </>
              }
            />
            {incoming && (
              <ScreenToolbar entryKey="new" motion="incoming" fallback={item('second again')} />
            )}
          </header>
        </MaterialEffectContext>,
      ),
    )
  try {
    render(false)
    frame()
    const departing = ownerOf('first')
    expect(departing).toBeDefined()
    render(true)
    host.querySelector<HTMLElement>(
      '[data-satin-entry-toolbar="new"] [data-satin-navigation-toolbar-slot="trailing"]',
    )!.style.opacity = '0.25'
    frame()
    frame()
    expect(ownerOf('first')).toBe(departing)
    expect(departing?.isConnected).toBe(true)
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  }
})
