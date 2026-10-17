import { readFileSync } from 'node:fs'
import { presentationGlassMotion } from './glassMotion.ts'
// @vitest-environment happy-dom
import { RestoredScreenMountContext } from '../public/presentationContext.ts'
import { NavigatorHost } from '../navigation/NavigatorHost.tsx'
import { createNavigator } from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { createScreenChrome, ScreenChromeContext } from '../public/chrome.tsx'
import type { TransitionController } from '../navigation/types.ts'
import { TabRegistrationContext } from '../tabs/context.ts'
import { SheetChromeContext } from './sheetChromeContext.ts'
import {
  act,
  Profiler,
  StrictMode,
  useState,
  useRef,
  useContext,
  useLayoutEffect,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Alert, ConfirmationDialog, FullScreenCover, Sheet } from './Presentation.tsx'
import { useDismiss } from './dismiss.tsx'
import { ScrollSurface } from '../scroll/ScrollSurface.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { NavigationLayoutContext } from '../layout/navigationLayoutContext.ts'
import { hasActivePresentation } from './activity.ts'
import { Toggle } from '../list-form/Toggle.tsx'
import { Slider } from '../list-form/Slider.tsx'
// Focus/layout tests use an already-ready renderer; cold readiness is tested separately.
const coldGlass = vi.hoisted(() => ({ enabled: false }))
vi.mock('./glassReady.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('./glassReady.ts')>()
  return {
    holdPresentationForGlass: (...args: Parameters<typeof actual.holdPresentationForGlass>) => {
      if (coldGlass.enabled) return actual.holdPresentationForGlass(...args)
      args[4]?.()
      return () => {}
    },
  }
})
const viewport = vi.hoisted(() => ({ width: 440, height: 894 }))
const keyboard = vi.hoisted(() => ({
  presentation: null as Element | null,
  visible: false,
  height: 0,
  viewportHeight: 894,
  offsetTop: 0,
  layoutHeight: 894,
}))
vi.mock('../keyboard/adapter.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('../keyboard/adapter.ts')>()),
  useKeyboardMetrics: () => keyboard,
}))
vi.mock('../safe-area/useSafeAreaMetrics.ts', () => ({
  useSafeAreaMetrics: () => ({
    safeFrame: { width: 440, height: 860 },
    layoutViewport: { width: viewport.width, height: viewport.height },
    visualViewport: { height: keyboard.viewportHeight },
    insets: { top: 0, bottom: 34 },
    physicalInsets: { top: 62, bottom: 34 },
  }),
}))
vi.mock('../glass/GlassEffect.tsx', () => ({
  PresentationGlassBoundary: ({ children }: { children: ReactNode }) => children,
  GlassBackground: () => null,
  ToolbarGroup: () => null,
  ToolbarSpacer: () => null,
  GlassEffect: ({
    children,
    style,
    className,
    inert,
    ...handlers
  }: {
    children: ReactNode
    style?: CSSProperties
    className?: string
    inert?: boolean
  } & HTMLAttributes<HTMLDivElement>) => (
    <div
      {...handlers}
      data-test-material
      data-satin-glass-effect
      data-satin-glass-region-id="test-material"
      className={className}
      style={style}
      inert={inert}
    >
      <canvas data-satin-glass-region-canvas />
      {children}
    </div>
  ),
  GlassLayer: ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
    <div data-satin-glass-layer style={style}>
      {children}
    </div>
  ),
}))
vi.mock('../root/runtimeContext.ts', () => ({
  useSatinLayoutRuntime: () => ({
    layoutClass: { horizontal: 'compact' },
    metrics: { layoutViewport: { width: 440 }, screen: { width: 440, height: 894 } },
  }),
}))
vi.mock('../reachability/react.tsx', () => ({
  ReachabilityRoute: ({ children }: { children: ReactNode }) => children,
}))
let root: Root, element: HTMLDivElement
beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
  coldGlass.enabled = false
  viewport.width = 440
  viewport.height = 894
  Object.assign(keyboard, {
    presentation: null,
    visible: false,
    height: 0,
    viewportHeight: 894,
    offsetTop: 0,
    layoutHeight: 894,
  })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(() => {
  act(() => root.unmount())
  element.remove()
  expect(hasActivePresentation()).toBe(false)
})
const invalidateRegions = vi.fn()
const updateRegionShape = vi.fn()
const renderer = {
  regions: { invalidate: invalidateRegions, updateShape: updateRegionShape },
  ready: true,
} as never
const render = (children: ReactNode) =>
  act(() => root.render(<MaterialEffectContext value={renderer}>{children}</MaterialEffectContext>))
const click = (text: string) =>
  act(() =>
    [...element.querySelectorAll('button')].find(button => button.textContent === text)!.click(),
  )
it('cancel, outside dismissal and reopening never accept a destructive action', () => {
  // Reduced motion: the popover leaves at once, so each step sees the settled state.
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  const remove = vi.fn()
  function App() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <ConfirmationDialog
          title="Delete?"
          isPresented={open}
          onPresentedChange={setOpen}
          actions={[
            { id: 'delete', label: 'Delete', role: 'destructive', onPress: remove },
            { id: 'cancel', label: 'Cancel', role: 'cancel' },
          ]}
        />
      </>
    )
  }
  render(<App />)
  const trigger = element.querySelector('button')!
  trigger.focus()
  click('Open')
  // Native's popover opens on its title; Cancel is not drawn but stays for assistive technology.
  expect(document.activeElement?.textContent).toBe('Delete?')
  click('Cancel')
  expect(remove).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(trigger)
  click('Open')
  act(() =>
    element
      .querySelector('dialog')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })),
  )
  expect(element.querySelector('dialog')).toBeNull()
  expect(remove).not.toHaveBeenCalled()
  click('Open')
  click('Delete')
  expect(remove).toHaveBeenCalledOnce()
})
it('accepts an action once even before the controlled owner closes', () => {
  const remove = vi.fn(),
    dismiss = vi.fn()
  render(
    <Alert
      title="Delete?"
      isPresented
      onPresentedChange={dismiss}
      actions={[{ id: 'delete', label: 'Delete', onPress: remove }]}
    />,
  )
  click('Delete')
  click('Delete')
  expect(remove).toHaveBeenCalledOnce()
  expect(dismiss).toHaveBeenCalledOnce()
})
it('protected sheets reject system cancellation, while explicit owner close remains possible', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  const dismiss = vi.fn()
  render(
    <Sheet title="Edit" isPresented onPresentedChange={dismiss} interactiveDismissDisabled>
      <p>Draft</p>
    </Sheet>,
  )
  act(() =>
    element.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })),
  )
  expect(dismiss).not.toHaveBeenCalled()
  render(
    <Sheet title="Edit" isPresented={false} onPresentedChange={dismiss} interactiveDismissDisabled>
      <p>Draft</p>
    </Sheet>,
  )
  expect(hasActivePresentation()).toBe(false)
})
it('an alert focuses its optional field and labels the modal', () => {
  render(
    <Alert
      title="Name workout"
      isPresented
      onPresentedChange={() => {}}
      textField={{ label: 'Name', value: '', onChange: () => {} }}
      actions={[{ id: 'ok', label: 'OK' }]}
    />,
  )
  expect(document.activeElement?.tagName).toBe('INPUT')
  const titleId = element.querySelector('dialog')!.getAttribute('aria-labelledby')!
  expect(document.getElementById(titleId)?.textContent).toBe('Name workout')
})

it('a nested cancel event cannot dismiss its parent sheet', () => {
  const parent = vi.fn(),
    child = vi.fn()
  render(
    <Sheet title="Parent" isPresented onPresentedChange={parent}>
      <Alert
        title="Child"
        isPresented
        onPresentedChange={child}
        actions={[{ id: 'cancel', label: 'Cancel', role: 'cancel' }]}
      />
    </Sheet>,
  )
  act(() =>
    element
      .querySelectorAll('dialog')[1]!
      .dispatchEvent(new Event('cancel', { cancelable: true, bubbles: true })),
  )
  expect(child).toHaveBeenCalledWith(false)
  expect(parent).not.toHaveBeenCalled()
})

it('opening a sheet does not focus its text field and open the software keyboard', () => {
  render(
    <Sheet title="Edit" isPresented onPresentedChange={() => {}}>
      <input aria-label="Draft" />
    </Sheet>,
  )
  expect(document.activeElement?.getAttribute('data-satin-modal-heading')).toBe('true')
})
it('StrictMode setup replay does not report a dismissal', async () => {
  const dismissed = vi.fn()
  render(
    <StrictMode>
      <Alert
        title="Notice"
        isPresented
        onPresentedChange={() => {}}
        onDismiss={dismissed}
        actions={[{ id: 'ok', label: 'OK' }]}
      />
    </StrictMode>,
  )
  await Promise.resolve()
  expect(dismissed).not.toHaveBeenCalled()
})
it('loops backwards from a static heading and forwards from the last action', () => {
  render(
    <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      <button>Done</button>
    </Sheet>,
  )
  const dialog = element.querySelector('dialog')!
  act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    ),
  )
  expect(document.activeElement?.textContent).toBe('Done')
  act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    ),
  )
  expect(dialog.contains(document.activeElement)).toBe(true)
  expect(document.activeElement?.getAttribute('role')).toBe('button')
})

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 210,
    bottom: 54,
    width: 200,
    height: 44,
    toJSON() {},
  }))
})
afterEach(() => vi.restoreAllMocks())
it('opens nested dialogs above their parent and keeps escape focus inside the child', () => {
  render(
    <Sheet title="Parent" isPresented onPresentedChange={() => {}}>
      <Alert
        title="Child"
        isPresented
        onPresentedChange={() => {}}
        actions={[{ id: 'ok', label: 'OK' }]}
      />
    </Sheet>,
  )
  const [parent, child] = element.querySelectorAll('dialog')
  expect(document.activeElement?.textContent).toBe('Child')
  act(() => parent!.querySelector<HTMLElement>('[data-satin-modal-heading]')!.focus())
  expect(child!.contains(document.activeElement)).toBe(true)
})
it('a normal alert starts on its visible title, not an unmeasured action policy', () => {
  render(
    <Alert
      title="Remove entry?"
      message="Your entry will be removed."
      isPresented
      onPresentedChange={() => {}}
      actions={[{ id: 'cancel', label: 'Cancel', role: 'cancel' }]}
    />,
  )
  expect(document.activeElement?.textContent).toBe('Remove entry?')
  expect(document.activeElement?.getBoundingClientRect().width).toBeGreaterThan(1)
})

it('a single-detent sheet focuses its heading and keeps the painted handle decorative', () => {
  render(
    <Sheet title="Edit" isPresented onPresentedChange={() => {}}>
      Content
    </Sheet>,
  )
  const grabber = element.querySelector('.satin-sheet-grabber')!
  expect(grabber.getAttribute('role')).toBe('presentation')
  expect(grabber.hasAttribute('tabindex')).toBe(false)
  expect(grabber.hasAttribute('aria-hidden')).toBe(false)
  expect(grabber.hasAttribute('aria-valuenow')).toBe(false)
})
it('grabber activation expands and collapses, and Enter uses the same action', () => {
  const changed = vi.fn()
  render(
    <Sheet
      title="Edit"
      isPresented
      onPresentedChange={() => {}}
      detents={['medium', 'large']}
      onSelectionChange={changed}
    >
      Content
    </Sheet>,
  )
  const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
  expect(grabber.getAttribute('aria-label')).toBe('Sheet Grabber, Half screen')
  act(() => grabber.click())
  expect(changed).toHaveBeenLastCalledWith('large')
  expect(grabber.getAttribute('aria-description')).toContain('collapse')
  act(() => grabber.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(changed).toHaveBeenLastCalledWith('medium')
})
it('a detent tap and a second tap during motion preserve the visible sheet height', () => {
  let now = 0,
    id = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frame => {
    frames.delete(frame)
  })
  const advance = (time: number) =>
    act(() => {
      now = time
      const batch = [...frames.values()]
      frames.clear()
      for (const frame of batch) frame(now)
    })
  render(
    <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      Content
    </Sheet>,
  )
  const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
  const height = () =>
    Number.parseFloat(element.querySelector<HTMLElement>('[data-test-material]')!.style.height)
  const medium = height()
  act(() => grabber.click())
  expect(height()).toBe(medium)
  advance(150)
  const interrupted = height()
  expect(interrupted).toBeGreaterThan(medium)
  expect(interrupted).toBeLessThan(894)
  act(() => grabber.click())
  expect(height()).toBe(interrupted)
  advance(300)
  expect(height()).toBeLessThan(interrupted)
  expect(height()).toBeGreaterThan(medium)
  advance(900)
  expect(height()).toBe(medium)
  expect(element.querySelector('dialog')!.hasAttribute('data-satin-presentation-moving')).toBe(
    false,
  )
})
it('an ordinary alert has one static title and uses it for autofocus', () => {
  render(
    <Alert
      title="Remove entry?"
      message="Your entry will be removed."
      isPresented
      onPresentedChange={() => {}}
      actions={[{ id: 'cancel', label: 'Cancel', role: 'cancel' }]}
    />,
  )
  expect(document.activeElement?.tagName).toBe('P')
  expect(element.querySelectorAll('[data-satin-modal-heading]')).toHaveLength(1)
  expect(element.querySelector('dialog')?.hasAttribute('autofocus')).toBe(false)
  expect(element.querySelector('dialog')?.hasAttribute('aria-describedby')).toBe(false)
  expect(element.querySelector('.satin-presentation-message')?.textContent).toBe(
    'Your entry will be removed.',
  )
})

it('sets native autofocus before showModal for static and multi-detent targets', () => {
  const targets: Element[] = []
  HTMLDialogElement.prototype.showModal = function () {
    const target = this.querySelector('[autofocus]')
    if (target) targets.push(target)
    this.open = true
  }
  render(
    <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      Content
    </Sheet>,
  )
  expect(targets[0]?.classList.contains('satin-sheet-grabber')).toBe(true)
  render(
    <Alert
      title="Notice"
      isPresented
      onPresentedChange={() => {}}
      actions={[{ id: 'ok', label: 'OK' }]}
    />,
  )
  expect(targets.at(-1)?.tagName).toBe('P')
})

it('focuses an alert editor only through the preventScroll opening step', () => {
  const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
  let nativeTarget: Element | null = null
  HTMLDialogElement.prototype.showModal = function () {
    nativeTarget = this.hasAttribute('autofocus') ? this : this.querySelector('[autofocus]')
    this.open = true
    ;(nativeTarget as HTMLElement | null)?.focus()
  }
  render(
    <Alert
      title="Name"
      isPresented
      onPresentedChange={() => {}}
      textField={{ label: 'Name', value: '', onChange() {} }}
      actions={[{ id: 'ok', label: 'OK' }]}
    />,
  )
  expect(nativeTarget).toBe(element.querySelector('dialog'))
  expect(focus).toHaveBeenCalledTimes(1)
  expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
  expect(document.activeElement).toBe(element.querySelector('input'))
})

it.each(['pointercancel', 'lostpointercapture'])(
  'ending a grabber drag with %s preserves the next independent activation',
  end => {
    for (const activation of ['Enter', ' ', 'click']) {
      const changed = vi.fn()
      render(
        <Sheet
          key={activation}
          title="Edit"
          isPresented
          onPresentedChange={() => {}}
          detents={['medium', 'large']}
          onSelectionChange={changed}
        >
          Content
        </Sheet>,
      )
      const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
      grabber.setPointerCapture = vi.fn()
      act(() => {
        grabber.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            pointerId: 7,
            isPrimary: true,
            button: 0,
            clientY: 100,
          }),
        )
        grabber.dispatchEvent(
          new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 120 }),
        )
        endPointer(grabber, end)
      })
      expect(changed).not.toHaveBeenCalled()
      act(() =>
        activation === 'click'
          ? grabber.click()
          : grabber.dispatchEvent(new KeyboardEvent('keydown', { key: activation, bubbles: true })),
      )
      expect(changed).toHaveBeenCalledExactlyOnceWith('large')
    }
  },
)
it.each([7, 0, 99])(
  'suppresses drag click retargeted to pointer %i, then preserves semantic activation',
  clickPointerId => {
    const changed = vi.fn()
    render(
      <Sheet
        title="Edit"
        isPresented
        onPresentedChange={() => {}}
        detents={['medium', 'large']}
        onSelectionChange={changed}
      >
        Content
      </Sheet>,
    )
    const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
    grabber.setPointerCapture = vi.fn()
    act(() => {
      grabber.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientY: 100,
        }),
      )
      grabber.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 120 }),
      )
      grabber.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientY: 120 }),
      )
      grabber.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 7 }))
      grabber.dispatchEvent(
        new PointerEvent('click', { bubbles: true, pointerId: clickPointerId, detail: 1 }),
      )
    })
    expect(changed).not.toHaveBeenCalled()
    act(() => grabber.click())
    expect(changed).toHaveBeenCalledExactlyOnceWith('large')
  },
)

it.each(['Enter', ' ', 'semantic-click', 'new-sequence'])(
  'a drag without a compatibility click cannot consume %s',
  activation => {
    const changed = vi.fn()
    render(
      <Sheet
        title="Edit"
        isPresented
        onPresentedChange={() => {}}
        detents={['medium', 'large']}
        onSelectionChange={changed}
      >
        Content
      </Sheet>,
    )
    const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
    grabber.setPointerCapture = vi.fn()
    act(() => {
      grabber.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientY: 100,
        }),
      )
      grabber.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 110 }),
      )
      grabber.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientY: 110 }),
      )
    })
    expect(changed).not.toHaveBeenCalled()
    act(() => {
      if (activation === 'new-sequence') {
        grabber.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            pointerId: 7,
            isPrimary: true,
            button: 0,
            clientY: 100,
          }),
        )
        grabber.dispatchEvent(
          new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientY: 100 }),
        )
        grabber.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerId: 7, detail: 1 }))
      } else if (activation === 'semantic-click') grabber.click()
      else grabber.dispatchEvent(new KeyboardEvent('keydown', { key: activation, bubbles: true }))
    })
    expect(changed).toHaveBeenCalledExactlyOnceWith('large')
  },
)

it('scopes sheet navigation by its own width inside a regular iPad window', () => {
  viewport.width = 1366
  function Probe({ id }: { id: string }) {
    return <output data-probe={id}>{useContext(NavigationLayoutContext) ?? 'window'}</output>
  }
  render(
    <>
      <Probe id="outside" />
      <Sheet title="Edit" isPresented onPresentedChange={() => {}}>
        <Probe id="inside" />
      </Sheet>
    </>,
  )
  expect(element.querySelector('[data-probe="outside"]')?.textContent).toBe('window')
  expect(element.querySelector('[data-probe="inside"]')?.textContent).toBe('compact')
})

it('lets navigation own the visible header without losing the dialog label', () => {
  function Navigation() {
    const register = useContext(SheetChromeContext)
    useLayoutEffect(() => register?.(), [register])
    return <p>Navigation</p>
  }
  const sheet = (navigation: boolean) => (
    <StrictMode>
      <Sheet title="Edit" isPresented onPresentedChange={() => {}}>
        {navigation ? <Navigation /> : <p>Content</p>}
      </Sheet>
    </StrictMode>
  )
  render(sheet(true))
  const dialog = element.querySelector('dialog')!
  const title = element.querySelector('[data-satin-modal-heading]')!
  expect(title.id).toBe(dialog.getAttribute('aria-labelledby'))
  expect(title.textContent).toBe('Edit')
  expect(title.getAttribute('data-satin-sheet-label-only')).toBe('true')
  render(sheet(false))
  expect(title.hasAttribute('data-satin-sheet-label-only')).toBe(false)
})

it('does not register a modal navigator as a second primary tab navigator', () => {
  const register = vi.fn()
  function Probe() {
    const value = useContext(TabRegistrationContext)
    useLayoutEffect(() => value?.(() => {}), [value])
    return null
  }
  render(
    <TabRegistrationContext value={register}>
      <Probe />
      <Sheet title="Modal" isPresented onPresentedChange={() => {}}>
        <Probe />
      </Sheet>
    </TabRegistrationContext>,
  )
  expect(register).toHaveBeenCalledOnce()
})

it('lays out detent frames without a React commit for every sample', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0,
    now = 0,
    commits = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => {
    frames.delete(handle)
  })
  render(
    <Profiler
      id="sheet"
      onRender={() => {
        commits++
      }}
    >
      <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
        Content
      </Sheet>
    </Profiler>,
  )
  const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
  const surface = element.querySelector<HTMLElement>('.satin-presentation-surface')!
  const height = Number.parseFloat(surface.style.height)
  act(() => grabber.click())
  const selected = commits
  for (now = 8; now <= 40; now += 8)
    act(() => {
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) callback(now)
    })
  expect(Number.parseFloat(surface.style.height)).toBeGreaterThan(height)
  expect(commits).toBe(selected)
})

it('does not invalidate glass while a drag keeps the same opaque mix', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++id, callback)
    return id
  })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => {
    frames.delete(handle)
  })
  render(
    <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      Content
    </Sheet>,
  )
  const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
  const surface = grabber.closest<HTMLElement>('.satin-presentation-surface')!
  const height = () => Number.parseFloat(surface.style.height)
  const mix = () => surface.style.getPropertyValue('--satin-sheet-opaque-mix')
  const resting = height()
  expect(mix()).toBe('0')
  const invalidations = invalidateRegions.mock.calls.length
  grabber.setPointerCapture = vi.fn()
  const flushNew = () => {
    const pending = [...frames.entries()]
    frames.clear()
    for (const [, callback] of pending) callback(0)
  }
  act(() => {
    grabber.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 7,
        isPrimary: true,
        button: 0,
        clientX: 20,
        clientY: 400,
      }),
    )
  })
  // Drop the entrance sampler scheduled at open. A drag frame is the callback
  // queued by that pointer move.
  frames.clear()
  for (const clientY of [380, 360, 340])
    act(() => {
      grabber.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 7,
          clientX: 20,
          clientY,
        }),
      )
      flushNew()
    })
  expect(height()).toBeGreaterThan(resting)
  expect(mix()).toBe('0')
  expect(invalidateRegions.mock.calls.length).toBe(invalidations)
  request.mockRestore()
  cancel.mockRestore()
})

it('uses current window geometry in an already-running detent animation', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0,
    now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => {
    frames.delete(handle)
  })
  const sheet = () => (
    <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      Content
    </Sheet>
  )
  render(sheet())
  act(() => element.querySelector<HTMLElement>('.satin-sheet-grabber')!.click())
  viewport.width = 600
  render(sheet())
  act(() => {
    now = 40
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(now)
  })
  const width = Number.parseFloat(
    element.querySelector<HTMLElement>('[data-satin-glass-layer]')!.style.width,
  )
  // The old 440 pt window could not produce this width; 580 pt is the native sheet width cap.
  expect(width).toBeGreaterThan(440)
  expect(width).toBeLessThanOrEqual(580)
})

it.each(['pointercancel', 'lostpointercapture'])(
  'restores the exact resting frame after a painted drag ends with %s',
  end => {
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      frame = undefined
    })
    render(
      <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
        Content
      </Sheet>,
    )
    const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
    const surface = grabber.closest<HTMLElement>('.satin-presentation-surface')!
    const layer = surface.closest<HTMLElement>('[data-satin-glass-layer]')!
    const initial = [
      surface.style.height,
      surface.style.getPropertyValue('--satin-sheet-content-scale'),
      layer.style.cssText,
    ]
    grabber.setPointerCapture = vi.fn()
    act(() => {
      grabber.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientY: 100,
        }),
      )
      grabber.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 80 }),
      )
    })
    act(() => frame?.(16))
    expect(surface.style.height).not.toBe(initial[0])
    act(() => endPointer(grabber, end))
    expect([
      surface.style.height,
      surface.style.getPropertyValue('--satin-sheet-content-scale'),
      layer.style.cssText,
    ]).toEqual(initial)
  },
)

it('keeps rejected controlled detent requests at the accepted selection', () => {
  const clock = detentClock(),
    changed = vi.fn()
  render(
    <Sheet
      title="Edit"
      isPresented
      selection="medium"
      onSelectionChange={changed}
      onPresentedChange={() => {}}
      detents={['medium', 'large']}
    >
      Content
    </Sheet>,
  )
  const height = sheetHeight(),
    medium = height()
  act(() => element.querySelector<HTMLElement>('.satin-sheet-grabber')!.click())
  clock(150)
  expect(changed).toHaveBeenCalledWith('large')
  expect(height()).toBe(medium)
})
it('starts delayed controlled acceptance from the current frame and retargets an interrupted external update', () => {
  const clock = detentClock()
  const sheet = (selection: 'medium' | 'large') => (
    <Sheet
      title="Edit"
      isPresented
      selection={selection}
      onPresentedChange={() => {}}
      detents={['medium', 'large']}
    >
      Content
    </Sheet>
  )
  render(sheet('medium'))
  const height = sheetHeight(),
    medium = height()
  act(() => element.querySelector<HTMLElement>('.satin-sheet-grabber')!.click())
  clock(150)
  expect(height()).toBe(medium)
  render(sheet('large'))
  expect(height()).toBe(medium)
  clock(300)
  const interrupted = height()
  expect(interrupted).toBeGreaterThan(medium)
  render(sheet('medium'))
  expect(height()).toBe(interrupted)
  clock(450)
  expect(height()).toBeLessThan(interrupted)
  clock(1100)
  expect(height()).toBe(medium)
})
it('animates an external selection change without a grabber request', () => {
  const clock = detentClock()
  const sheet = (selection: 'medium' | 'large') => (
    <Sheet
      title="Edit"
      isPresented
      selection={selection}
      onPresentedChange={() => {}}
      detents={['medium', 'large']}
    >
      Content
    </Sheet>
  )
  render(sheet('medium'))
  const height = sheetHeight(),
    medium = height()
  render(sheet('large'))
  expect(height()).toBe(medium)
  clock(150)
  expect(height()).toBeGreaterThan(medium)
  expect(height()).toBeLessThan(894)
  clock(800)
  expect(height()).toBe(894)
})
it.each(['delayed acceptance', 'external change'])(
  'defers %s to release while a pointer owns the sheet',
  update => {
    const clock = detentClock(),
      changed = vi.fn()
    const sheet = (selection: 'medium' | 'large') => (
      <Sheet
        title="Edit"
        isPresented
        selection={selection}
        onSelectionChange={changed}
        onPresentedChange={() => {}}
        detents={['medium', 'large']}
      >
        Content
      </Sheet>
    )
    render(sheet('medium'))
    const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!,
      height = sheetHeight()
    grabber.setPointerCapture = vi.fn()
    if (update === 'delayed acceptance') act(() => grabber.click())
    const requests = changed.mock.calls.length
    act(() => {
      grabber.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientY: 100,
        }),
      )
      grabber.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 50 }),
      )
    })
    clock(16)
    const held = height()
    render(sheet('large'))
    clock(166)
    expect(height()).toBe(held)
    // A slow release near medium must not overwrite the accepted large detent.
    act(() =>
      grabber.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientY: 50 }),
      ),
    )
    expect(height()).toBe(held)
    expect(changed).toHaveBeenCalledTimes(requests)
    clock(316)
    expect(height()).toBeGreaterThan(held)
    clock(966)
    expect(height()).toBe(894)
  },
)
it('holds the pointer-down frame when selection changes before the first move', () => {
  const clock = detentClock()
  const sheet = (selection: 'medium' | 'large') => (
    <Sheet
      title="Edit"
      isPresented
      selection={selection}
      onPresentedChange={() => {}}
      detents={['medium', 'large']}
    >
      Content
    </Sheet>
  )
  render(sheet('medium'))
  const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!,
    height = sheetHeight(),
    held = height()
  grabber.setPointerCapture = vi.fn()
  act(() =>
    grabber.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 7,
        isPrimary: true,
        button: 0,
        clientY: 100,
      }),
    ),
  )
  render(sheet('large'))
  clock(150)
  expect(height()).toBe(held)
  act(() =>
    grabber.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientY: 100 }),
    ),
  )
  clock(950)
  expect(height()).toBe(894)
})
it.each(['pointercancel', 'lostpointercapture'])(
  'stops all frame writers on %s after a selection change during a drag',
  end => {
    const clock = detentClock()
    const sheet = (selection: 'medium' | 'large') => (
      <Sheet
        title="Edit"
        isPresented
        selection={selection}
        onPresentedChange={() => {}}
        detents={['medium', 'large']}
      >
        Content
      </Sheet>
    )
    render(sheet('medium'))
    const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!,
      height = sheetHeight()
    grabber.setPointerCapture = vi.fn()
    act(() => {
      grabber.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientY: 100,
        }),
      )
      grabber.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 50 }),
      )
    })
    clock(16)
    render(sheet('large'))
    clock(166)
    act(() => {
      // Leave an unpainted pointer sample pending at cancellation, too.
      grabber.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 40 }),
      )
      endPointer(grabber, end)
    })
    expect(height()).toBe(894)
    clock(316)
    expect(height()).toBe(894)
    clock(966)
    expect(height()).toBe(894)
    expect(element.querySelector('dialog')!.hasAttribute('data-satin-presentation-moving')).toBe(
      false,
    )
  },
)
it.each(['heading', 'button', 'input'])(
  'accepts a vertical pan beginning on a sheet %s',
  targetRole => {
    const clock = detentClock()
    const tapped = vi.fn()
    render(
      <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
        <button onClick={tapped}>Done</button>
        <input aria-label="Weight" />
      </Sheet>,
    )
    const target = element.querySelector<HTMLElement>(
      targetRole === 'heading' ? '[data-satin-modal-heading]' : targetRole,
    )!
    const height = sheetHeight()
    const initialHeight = height()
    act(() => {
      target.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientY: 500,
        }),
      )
      target.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 7,
          clientY: 488,
        }),
      )
    })
    clock(16)
    expect(height()).toBe(initialHeight + 2)
    expect(tapped).not.toHaveBeenCalled()
  },
)

it.each([0, 30])('hands a downward pan to the sheet only at scroll top (%s)', scrollTop => {
  const clock = detentClock()
  render(
    <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      <div data-test-scroll style={{ overflowY: 'auto' }}>
        Scrollable content
      </div>
    </Sheet>,
  )
  const scroller = element.querySelector<HTMLElement>('[data-test-scroll]')!
  Object.defineProperties(scroller, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 200 },
  })
  scroller.scrollTop = scrollTop
  const height = sheetHeight()
  const initialHeight = height()
  act(() => {
    scroller.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 7,
        isPrimary: true,
        button: 0,
        clientY: 500,
      }),
    )
    scroller.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 7,
        clientY: 600,
      }),
    )
  })
  clock(16)
  if (scrollTop === 0) expect(height()).toBeLessThan(initialHeight)
  else expect(height()).toBe(initialHeight)
})

it('does not paint a sub-threshold pan on ordinary release of a single-detent sheet', () => {
  const clock = detentClock()
  render(
    <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium']}>
      Content
    </Sheet>,
  )
  const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!,
    height = sheetHeight(),
    medium = height()
  grabber.setPointerCapture = vi.fn()
  act(() => {
    grabber.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 7,
        isPrimary: true,
        button: 0,
        clientY: 100,
      }),
    )
    grabber.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 98 }),
    )
  })
  clock(16)
  expect(height()).toBe(medium)
  act(() => {
    grabber.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientY: 98 }),
    )
    grabber.click()
  })
  expect(height()).toBe(medium)
  expect(element.querySelector('dialog')!.getAttribute('data-satin-presentation-moving')).toBe(
    'entrance',
  )
})
// After takeover the sheet surface owns the pointer capture, so its loss is reported there.
// A browser pointercancel arrives on the pointer's current target.
function endPointer(grabber: HTMLElement, end: string) {
  const target =
    end === 'lostpointercapture'
      ? grabber.closest<HTMLElement>('.satin-presentation-surface')!
      : grabber
  target.dispatchEvent(new PointerEvent(end, { bubbles: true, pointerId: 7 }))
}
/**
 * Replays one WebKit touch contact as an installed app receives it (recorded on the iPad with
 * real touches, construction update). The down target holds the implicit capture. When a handler moves the
 * capture, nothing is reported inside setPointerCapture: 5 to 9 ms later, before the next
 * pointer event, WebKit fires lostpointercapture on the down target (it bubbles) and
 * gotpointercapture on the new owner. That next pointermove still goes to the down target and
 * later ones go to the owner. Touch events always go to the down target.
 */
function webkitTouch(target: HTMLElement, pointerId = 7) {
  let owner: HTMLElement = target
  let requested: HTMLElement | null = null
  let now = 1000
  let fingers = 1
  let cancelled = false
  HTMLElement.prototype.setPointerCapture = function (this: HTMLElement, id: number) {
    if (id === pointerId) requested = this
  }
  const stamp = <T extends Event>(event: T) => {
    Object.defineProperty(event, 'timeStamp', { value: now })
    return event
  }
  const pointer = (type: string, clientY = 0, clientX = 200) =>
    stamp(
      new PointerEvent(type, {
        bubbles: true,
        pointerId,
        isPrimary: true,
        button: 0,
        pointerType: 'touch',
        clientX,
        clientY,
      }),
    )
  const touch = (type: string, clientY: number, clientX: number, cancelable: boolean) => {
    const first = { clientX, clientY }
    const all = fingers === 2 ? [first, { clientX: clientX + 80, clientY: clientY + 60 }] : [first]
    const touches = type === 'touchend' ? [] : all
    const event = stamp(Object.assign(new Event(type, { bubbles: true, cancelable }), { touches }))
    target.dispatchEvent(event)
    return event
  }
  /** Returns the target of the next pointer event. */
  const settleCapture = () => {
    if (!requested || requested === owner) return owner
    const previous = owner
    previous.dispatchEvent(pointer('lostpointercapture'))
    requested.dispatchEvent(pointer('gotpointercapture'))
    owner = requested
    return previous
  }
  return {
    down(clientY: number, clientX = 200) {
      act(() => {
        target.dispatchEvent(pointer('pointerdown', clientY, clientX))
        touch('touchstart', clientY, clientX, false)
        now += 9
        target.dispatchEvent(pointer('gotpointercapture'))
      })
    },
    /** The finger rests: time passes with no event. */
    wait(milliseconds: number) {
      now += milliseconds
    },
    /** A second finger lands: touch events now carry two touches (the primary pointer is unchanged). */
    secondFinger(clientY: number) {
      fingers = 2
      act(() => {
        touch('touchstart', clientY, 200, false)
      })
    },
    /** Returns the touchmove, so a test can read whether the sheet claimed it. */
    move(clientY: number, clientX = 200) {
      let touchMove!: Event
      now += 8
      act(() => {
        if (!cancelled) settleCapture().dispatchEvent(pointer('pointermove', clientY, clientX))
        touchMove = touch('touchmove', clientY, clientX, !cancelled)
      })
      return touchMove
    },
    up(clientY: number) {
      now += 8
      act(() => {
        if (!cancelled) {
          settleCapture()
          owner.dispatchEvent(pointer('pointerup', clientY))
          owner.dispatchEvent(pointer('lostpointercapture'))
        }
        touch('touchend', clientY, 200, false)
      })
    },
    /** WebKit's own pan took the touch: the pointer is cancelled and later touchmoves are not cancelable. */
    browserCancel() {
      act(() => {
        owner.dispatchEvent(pointer('pointercancel'))
        owner.dispatchEvent(pointer('lostpointercapture'))
      })
      cancelled = true
    },
  }
}
function scrollableSheet(selection: 'medium' | 'large', scrollTop: number, changed = vi.fn()) {
  render(
    <Sheet
      title="Edit"
      isPresented
      selection={selection}
      onPresentedChange={changed}
      detents={['medium', 'large']}
    >
      <div data-test-scroll style={{ overflowY: 'auto' }}>
        Scrollable content
      </div>
    </Sheet>,
  )
  const scroller = element.querySelector<HTMLElement>('[data-test-scroll]')!
  Object.defineProperties(scroller, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 200 },
  })
  scroller.scrollTop = scrollTop
  return scroller
}
it.each(['grabber', 'heading', 'button', 'input'])(
  'keeps a real touch drag from the sheet %s alive when the capture moves to the sheet',
  start => {
    const clock = detentClock()
    const tapped = vi.fn()
    const presented = vi.fn()
    render(
      <Sheet title="Edit" isPresented onPresentedChange={presented} detents={['medium', 'large']}>
        <button onClick={tapped}>Done</button>
        <input aria-label="Weight" />
      </Sheet>,
    )
    const selector = { grabber: '.satin-sheet-grabber', heading: '[data-satin-modal-heading]' }
    const target = element.querySelector<HTMLElement>(
      selector[start as keyof typeof selector] ?? start,
    )!
    const dialog = element.querySelector('dialog')!
    const height = sheetHeight()
    const initialHeight = height()
    const contact = webkitTouch(target)
    contact.down(500)
    contact.move(497)
    contact.move(494)
    // The takeover: the handler moves the capture from the down target to the sheet.
    contact.move(488)
    // WebKit reports that capture change (lostpointercapture on the down target) before this move.
    contact.move(470)
    contact.move(440)
    clock(16)
    expect(height()).toBe(initialHeight + 50)
    expect(dialog.getAttribute('data-satin-presentation-moving')).toBe('drag')
    contact.up(440)
    expect(presented).not.toHaveBeenCalled()
    expect(tapped).not.toHaveBeenCalled()
  },
)
it('ends a drag when the sheet itself loses the pointer capture', () => {
  const clock = detentClock()
  render(
    <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      Content
    </Sheet>,
  )
  const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
  const surface = element.querySelector<HTMLElement>('.satin-presentation-surface')!
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(grabber)
  contact.down(500)
  contact.move(488)
  contact.move(440)
  clock(16)
  expect(height()).toBe(initialHeight + 50)
  act(() => {
    surface.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 7 }))
  })
  expect(height()).toBe(initialHeight)
  expect(element.querySelector('dialog')!.hasAttribute('data-satin-presentation-moving')).toBe(
    false,
  )
})
it('claims a scrolling list at medium on the first vertical move: the sheet expands first', () => {
  // Measured on the iPad: only the first touchmove is always honoured. A start that jumps from
  // 3 pt to 14.5 pt in one sample loses to WebKit's pan when the claim waits for a slop.
  const contact = webkitTouch(scrollableSheet('medium', 0))
  contact.down(500)
  expect(contact.move(499).defaultPrevented).toBe(true)
  expect(contact.move(480).defaultPrevented).toBe(true)
})
it('waits for the slop on selectable text inside a list the sheet owns both ways', () => {
  const scroller = scrollableSheet('medium', 0)
  scroller.setAttribute('data-satin-role', 'content')
  const jitter = webkitTouch(scroller)
  jitter.down(500)
  // The jitter of a press-and-hold stays with the selection loupe.
  expect(jitter.move(499).defaultPrevented).toBe(false)
  jitter.wait(600)
  expect(claimedAlong(jitter, [497, 490, 470])).toBe(false)
  jitter.up(470)
  const quick = webkitTouch(scroller, 8)
  quick.down(500)
  expect(quick.move(498).defaultPrevented).toBe(false)
  expect(quick.move(495).defaultPrevented).toBe(true)
})
it('claims a downward pan on a list at its top only once the direction is clear', () => {
  const clock = detentClock()
  const scroller = scrollableSheet('large', 0)
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(scroller)
  contact.down(500)
  // Finger-settle jitter must not take an upward scroll away from the list.
  expect(contact.move(502).defaultPrevented).toBe(false)
  expect(contact.move(504).defaultPrevented).toBe(true)
  contact.move(540)
  clock(16)
  expect(height()).toBe(initialHeight - 30)
})
it.each([
  ['an upward pan at the top of a large sheet', 0, -1],
  ['a downward pan on a scrolled list', 30, 1],
])('leaves %s to native scrolling', (_name, scrollTop, direction) => {
  const clock = detentClock()
  const changed = vi.fn()
  const scroller = scrollableSheet('large', scrollTop, changed)
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(scroller)
  contact.down(500)
  expect(contact.move(500 + 3 * direction).defaultPrevented).toBe(false)
  expect(contact.move(500 + 9 * direction).defaultPrevented).toBe(false)
  // WebKit's pan begins: the pointer is cancelled while touch events continue.
  contact.browserCancel()
  expect(contact.move(500 + 60 * direction).defaultPrevented).toBe(false)
  contact.up(500 + 60 * direction)
  clock(16)
  expect(height()).toBe(initialHeight)
  expect(changed).not.toHaveBeenCalled()
  expect(element.querySelector('dialog')!.getAttribute('data-satin-presentation-moving')).not.toBe(
    'drag',
  )
})
it('returns to its detent without dismissing when the browser cancels the pointer mid-drag', () => {
  const clock = detentClock()
  const presented = vi.fn()
  render(
    <Sheet title="Edit" isPresented onPresentedChange={presented} detents={['medium', 'large']}>
      <button>Done</button>
    </Sheet>,
  )
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(element.querySelector<HTMLElement>('dialog button')!)
  contact.down(300)
  contact.move(320)
  contact.move(620)
  clock(16)
  expect(height()).toBe(initialHeight - 310)
  contact.browserCancel()
  contact.up(620)
  clock(32)
  expect(height()).toBe(initialHeight)
  expect(presented).not.toHaveBeenCalled()
  // The next contact drags normally.
  const next = webkitTouch(element.querySelector<HTMLElement>('.satin-sheet-grabber')!, 9)
  next.down(500)
  next.move(488)
  next.move(470)
  clock(48)
  expect(height()).toBe(initialHeight + 20)
})
it('useDismiss closes a FullScreenCover, which covers the whole screen without a dim', () => {
  const presented = vi.fn()
  function Close() {
    const dismiss = useDismiss()
    return <button onClick={dismiss}>Close</button>
  }
  render(
    <FullScreenCover title="Now Playing" isPresented onPresentedChange={presented}>
      <Close />
    </FullScreenCover>,
  )
  const cover = element.querySelector<HTMLElement>('dialog[data-satin-presentation="cover"]')!
  const layer = cover.querySelector<HTMLElement>('[data-satin-glass-layer]')!
  expect([layer.style.left, layer.style.width, layer.style.bottom]).toEqual(['0px', '440px', '0px'])
  expect(cover.querySelector('[data-satin-presentation-dimmer]')).toBeNull()
  click('Close')
  expect(presented).toHaveBeenCalledWith(false)
})
// Music FINDINGS #8: a hook error inside Now Playing took the whole app to "App Failed to Start".
it('keeps a render error inside its sheet, which can still be dismissed', () => {
  const presented = vi.fn()
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  function Broken(): ReactNode {
    throw new Error('useNavigation must be called inside NavigatorHost.')
  }
  render(
    <>
      <p>Library</p>
      <Sheet title="Now Playing" isPresented onPresentedChange={presented}>
        <Broken />
      </Sheet>
    </>,
  )
  expect(element.textContent).toContain('Library')
  const dialog = element.querySelector('dialog')!
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('useNavigation must be')
  act(() => {
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
  })
  expect(presented).toHaveBeenCalledWith(false)
  logged.mockRestore()
})
// Owner, Oct 9 (Music Now Playing in iPhone landscape): native sheets fill a compact-height screen.
it('fills an iPhone landscape screen at every detent, without a grabber', () => {
  viewport.width = 956
  viewport.height = 440
  render(
    <Sheet
      title="Now Playing"
      isPresented
      onPresentedChange={() => {}}
      detents={['medium', 'large']}
    >
      Content
    </Sheet>,
  )
  const dialog = element.querySelector<HTMLElement>('dialog')!
  const layer = dialog.querySelector<HTMLElement>('[data-satin-glass-layer]')!
  const surface = dialog.querySelector<HTMLElement>('.satin-presentation-surface')!
  expect([layer.style.left, layer.style.width, layer.style.bottom]).toEqual(['0px', '956px', '0px'])
  expect(surface.style.height).toBe('440px')
  expect(dialog.dataset.satinPresentationFill).toBe('screen')
  expect(dialog.querySelector('.satin-sheet-grabber[role="button"]')).toBeNull()
})
// Owner video, Oct 8 (Music Now Playing): the closing sheet shrank to a small card. Native keeps
// its size and slides down with the finger, then off the screen.
it('resets a stale display-derived bottom contour during a drag on an unknown display', () => {
  const clock = detentClock()
  render(
    <Sheet title="Corners" isPresented onPresentedChange={() => {}}>
      <button>Done</button>
    </Sheet>,
  )
  const surface = element.querySelector<HTMLElement>('.satin-presentation-surface')!
  surface.style.borderBottomLeftRadius = '62px'
  surface.style.borderBottomRightRadius = '62px'
  updateRegionShape.mockClear()
  const contact = webkitTouch(element.querySelector<HTMLElement>('.satin-sheet-grabber')!)
  contact.down(300)
  contact.move(320)
  contact.move(340)
  clock(16)
  expect(surface.style.borderBottomLeftRadius).toBe('38px')
  expect(surface.style.borderBottomRightRadius).toBe('38px')
  expect(updateRegionShape).toHaveBeenCalledWith('test-material', {
    kind: 'roundedRectangle',
    cornerRadius: 38,
    cornerStyle: 'continuous',
  })
  contact.up(340)
})

it('hands a rigid drag release to the compositor and closes a controlled owner once', async () => {
  const clock = detentClock()
  const effects: { frames: Keyframe[]; finish: () => void }[] = []
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(frames => {
    let finish!: () => void
    const finished = new Promise<void>(resolve => {
      finish = resolve
    })
    effects.push({ frames: frames as Keyframe[], finish })
    return { finished, pause: vi.fn(), play: vi.fn(), cancel: vi.fn() } as unknown as Animation
  })
  const requested = vi.fn()
  const dismissed = vi.fn()
  function App() {
    const [open, setOpen] = useState(true)
    return (
      <Sheet
        title="Now Playing"
        isPresented={open}
        onDismiss={dismissed}
        onPresentedChange={value => {
          requested(value)
          setOpen(value)
        }}
      >
        <button>Done</button>
      </Sheet>
    )
  }
  render(<App />)
  const surface = element.querySelector<HTMLElement>('.satin-presentation-surface')!
  const size = () => Number.parseFloat(surface.style.height)
  const height = sheetHeight()
  const large = size()
  const contact = webkitTouch(element.querySelector<HTMLElement>('.satin-sheet-grabber')!)
  contact.down(300)
  contact.move(320)
  contact.move(500)
  clock(16)
  expect(size()).toBe(large)
  expect(height()).toBe(large - 190)
  contact.move(540)
  contact.up(540)
  const tail = effects.slice(-2)
  const offsets = tail[0]!.frames.map(frame =>
    Number(/translateY\(([-.0-9]+)px\)/.exec(String(frame.transform))![1]),
  )
  expect(offsets[0]).toBe(230)
  expect(offsets.every((value, index) => index === 0 || value > offsets[index - 1]!)).toBe(true)
  expect(offsets.at(-1)).toBe(large)
  for (const time of [32, 100, 300]) {
    clock(time)
    // No JS tail geometry writes: the submitted animation owns those frames.
    expect(height()).toBe(large - 230)
    expect(size()).toBe(large)
  }
  const count = effects.length
  // A real WAAPI completion is outside React's event/act flush. Let its promise
  // run, then deliver the restoration rAF before an ordinary concurrent commit.
  tail.forEach(effect => effect.finish())
  await Promise.resolve()
  await Promise.resolve()
  clock(316)
  await act(async () => {
    await Promise.resolve()
  })
  expect(requested).toHaveBeenCalledExactlyOnceWith(false)
  expect(dismissed).toHaveBeenCalledOnce()
  expect(element.querySelector('dialog')).toBeNull()
  expect(effects).toHaveLength(count)
})
it('dismisses a sheet on a tap of the dimmed area, not on a touch that lands there and drags', () => {
  const presented = vi.fn()
  render(
    <Sheet title="Edit" isPresented onPresentedChange={presented} detents={['medium', 'large']}>
      <button>Done</button>
    </Sheet>,
  )
  const dialog = element.querySelector('dialog')!
  const pointer = (type: string) => new PointerEvent(type, { bubbles: true, pointerId: 7 })
  // A finger aimed at the grabber that lands just above the sheet's edge, then drags: no click.
  act(() => {
    dialog.dispatchEvent(pointer('pointerdown'))
    dialog.dispatchEvent(pointer('pointermove'))
    dialog.dispatchEvent(pointer('pointerup'))
  })
  expect(presented).not.toHaveBeenCalled()
  // A press that began on the sheet cannot dismiss through a click that ends on the dimmed area.
  act(() => {
    dialog.querySelector('button')!.dispatchEvent(pointer('pointerdown'))
    dialog.dispatchEvent(pointer('click'))
  })
  expect(presented).not.toHaveBeenCalled()
  act(() => {
    dialog.dispatchEvent(pointer('pointerdown'))
    dialog.dispatchEvent(pointer('pointerup'))
    dialog.dispatchEvent(pointer('click'))
  })
  expect(presented).toHaveBeenCalledExactlyOnceWith(false)
})
it('keeps a protected sheet open when its dimmed area is tapped', () => {
  const presented = vi.fn()
  render(
    <Sheet title="Edit" isPresented onPresentedChange={presented} interactiveDismissDisabled>
      Content
    </Sheet>,
  )
  const dialog = element.querySelector('dialog')!
  act(() => {
    dialog.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 }))
    dialog.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerId: 7 }))
  })
  expect(presented).not.toHaveBeenCalled()
})
// Review round (October 1): gestures the sheet's touch claim must leave alone.
function probeSheet(content: ReactNode, presented = vi.fn()) {
  render(
    <Sheet title="Edit" isPresented onPresentedChange={presented} detents={['medium', 'large']}>
      {content}
    </Sheet>,
  )
  return presented
}
/** Moves a contact down a vertical path and reports whether any touchmove was claimed. */
function claimedAlong(contact: ReturnType<typeof webkitTouch>, positions: number[]) {
  return positions.map(clientY => contact.move(clientY).defaultPrevented).some(Boolean)
}
it.each([
  ['selectable content', <p key="probe">Selectable text</p>, 'p'],
  ['a text field', <input key="probe" aria-label="Reps" />, 'input'],
])('leaves a press-and-hold on %s to the selection loupe', (_name, content, selector) => {
  const clock = detentClock()
  probeSheet(<div data-satin-role={selector === 'p' ? 'content' : undefined}>{content}</div>)
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(element.querySelector<HTMLElement>(`dialog ${selector}`)!)
  contact.down(500)
  contact.wait(600)
  expect(claimedAlong(contact, [503, 508, 520, 560])).toBe(false)
  clock(16)
  expect(height()).toBe(initialHeight)
  expect(element.querySelector('dialog')!.getAttribute('data-satin-presentation-moving')).not.toBe(
    'drag',
  )
})
it('still pans from a text field on a quick vertical drag', () => {
  const clock = detentClock()
  probeSheet(<input aria-label="Reps" />)
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(element.querySelector<HTMLElement>('dialog input')!)
  contact.down(500)
  contact.move(494)
  expect(contact.move(488).defaultPrevented).toBe(true)
  contact.move(470)
  clock(16)
  expect(height()).toBe(initialHeight + 20)
})
it('leaves a field that is being edited without a software keyboard to caret gestures', () => {
  const clock = detentClock()
  probeSheet(<input aria-label="Reps" />)
  const input = element.querySelector<HTMLInputElement>('dialog input')!
  act(() => input.focus())
  expect(document.activeElement).toBe(input)
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(input)
  contact.down(500)
  expect(claimedAlong(contact, [494, 488, 470])).toBe(false)
  clock(16)
  expect(height()).toBe(initialHeight)
})
it('does not latch on a one-point vertical lead: the claim waits for a clear direction', () => {
  probeSheet(<button>Done</button>)
  const button = element.querySelector<HTMLElement>('dialog button')!
  const wobble = webkitTouch(button)
  wobble.down(500, 200)
  expect(wobble.move(502, 201).defaultPrevented).toBe(false)
  // The gesture turns sideways: nothing was latched.
  expect(wobble.move(503, 240).defaultPrevented).toBe(false)
  wobble.up(503)
  // Nothing under a button pans natively, so the sheet claims where its own takeover begins.
  const vertical = webkitTouch(button, 8)
  vertical.down(500, 200)
  expect(vertical.move(505, 200).defaultPrevented).toBe(false)
  expect(vertical.move(510, 200).defaultPrevented).toBe(false)
  expect(vertical.move(511, 200).defaultPrevented).toBe(true)
})
it.each([
  ['a range slider', <input key="probe" type="range" data-test-probe />],
  ['zoomable content', <div key="probe" data-satin-role="zoomable" data-test-probe />],
  ['a menu', <div key="probe" role="menu" data-test-probe style={{ overflowY: 'auto' }} />],
])('never claims a touch on %s', (_name, content) => {
  const clock = detentClock()
  probeSheet(content)
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(element.querySelector<HTMLElement>('[data-test-probe]')!)
  contact.down(500)
  expect(claimedAlong(contact, [506, 512, 530])).toBe(false)
  clock(16)
  expect(height()).toBe(initialHeight)
})
function sidewaysScroller(inVerticalList: boolean) {
  const carousel = <div data-test-probe style={{ overflowX: 'auto' }} />
  probeSheet(
    inVerticalList ? (
      <div data-test-scroll style={{ overflowY: 'auto' }}>
        {carousel}
      </div>
    ) : (
      carousel
    ),
  )
  const scroller = element.querySelector<HTMLElement>('[data-test-probe]')!
  Object.defineProperties(scroller, {
    scrollWidth: { value: 1600 },
    clientWidth: { value: 400 },
  })
  const list = element.querySelector<HTMLElement>('[data-test-scroll]')
  if (list) {
    Object.defineProperties(list, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 },
    })
  }
  return scroller
}
it.each([false, true])(
  'gives a sideways scroller its pan after a vertical lead (inside a scrolling list: %s)',
  inVerticalList => {
    const clock = detentClock()
    const scroller = sidewaysScroller(inVerticalList)
    const height = sheetHeight()
    const initialHeight = height()
    const contact = webkitTouch(scroller)
    contact.down(500, 200)
    // Native (iOS 27): a 5 pt vertical lead, then sideways, scrolls the carousel.
    expect(contact.move(495, 199).defaultPrevented).toBe(false)
    expect(contact.move(494, 150).defaultPrevented).toBe(false)
    clock(16)
    expect(height()).toBe(initialHeight)
  },
)
it('moves the sheet on a vertical drag that starts on a sideways scroller', () => {
  const clock = detentClock()
  const scroller = sidewaysScroller(true)
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(scroller)
  contact.down(500, 200)
  // Native (iOS 27) moves the sheet here. The direction is judged at the full 10 pt.
  expect(contact.move(494, 200).defaultPrevented).toBe(false)
  expect(contact.move(488, 200).defaultPrevented).toBe(true)
  contact.move(470, 200)
  clock(16)
  expect(height()).toBe(initialHeight + 20)
})
it('stops claiming when a second finger lands', () => {
  probeSheet(<button>Done</button>)
  const contact = webkitTouch(element.querySelector<HTMLElement>('dialog button')!)
  contact.down(500)
  contact.secondFinger(560)
  expect(claimedAlong(contact, [506, 512, 530])).toBe(false)
})
it('leaves a sheet stacked on top of it alone', () => {
  render(
    <Sheet title="Outer" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      <Sheet title="Inner" isPresented onPresentedChange={() => {}} detents={['large']}>
        <div data-test-scroll style={{ overflowY: 'auto' }}>
          Inner list
        </div>
      </Sheet>
    </Sheet>,
  )
  const scroller = element.querySelector<HTMLElement>('[data-test-scroll]')!
  Object.defineProperties(scroller, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 200 },
  })
  const dialogs = element.querySelectorAll('dialog')
  expect(dialogs).toHaveLength(2)
  const outerHeight = () =>
    Number.parseFloat(
      dialogs[0]!.querySelector<HTMLElement>('.satin-presentation-surface')!.style.height,
    )
  const initialHeight = outerHeight()
  // An upward pan on the inner list: the inner sheet is at its only detent, so the list scrolls.
  const contact = webkitTouch(scroller)
  contact.down(500)
  expect(claimedAlong(contact, [494, 488, 470])).toBe(false)
  // A touch on the inner sheet's dimmed area is not the outer sheet's either.
  const dimmed = webkitTouch(dialogs[1] as HTMLElement, 8)
  dimmed.down(100)
  expect(claimedAlong(dimmed, [94, 88, 70])).toBe(false)
  expect(outerHeight()).toBe(initialHeight)
})
it('does not pan the sheet from content portaled out of it', () => {
  const clock = detentClock()
  probeSheet(createPortal(<div data-test-portal>Menu</div>, document.body))
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(document.querySelector<HTMLElement>('[data-test-portal]')!)
  contact.down(500)
  contact.move(488)
  contact.move(460)
  clock(16)
  expect(height()).toBe(initialHeight)
})
it('a keyboard height left behind with nothing focused does not freeze the sheet', () => {
  const clock = detentClock()
  probeSheet(<input aria-label="Reps" />)
  const input = element.querySelector<HTMLInputElement>('dialog input')!
  const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
  const height = sheetHeight()
  const initialHeight = height()
  // While a field is being edited the keyboard owns the frame: no pan.
  act(() => input.focus())
  Object.assign(keyboard, { visible: true, height: 443, viewportHeight: 451 })
  const editing = webkitTouch(grabber)
  editing.down(500)
  expect(claimedAlong(editing, [494, 488, 470])).toBe(false)
  editing.up(470)
  clock(16)
  expect(height()).toBe(initialHeight)
  // Measured on the iPad: the field is blurred and the keyboard is gone, yet WebKit still
  // reports the keyboard-height visual viewport. The sheet must drag again.
  act(() => input.blur())
  const stale = webkitTouch(grabber, 8)
  stale.down(500)
  stale.move(488)
  stale.move(470)
  clock(32)
  expect(height()).toBe(initialHeight + 20)
})
it.each(['mouse', 'pen'])(
  'keeps the sheet when a %s drags across the dimmed area and releases there',
  pointerType => {
    const presented = probeSheet(<button>Done</button>)
    const dialog = element.querySelector('dialog')!
    const pointer = (type: string, clientX: number, clientY: number) =>
      new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType, clientX, clientY })
    // Unlike a touch drag, this ends with a click on the dimmed area.
    act(() => {
      dialog.dispatchEvent(pointer('pointerdown', 100, 100))
      dialog.dispatchEvent(pointer('pointermove', 104, 140))
      dialog.dispatchEvent(pointer('pointerup', 104, 180))
      dialog.dispatchEvent(pointer('click', 104, 180))
    })
    expect(presented).not.toHaveBeenCalled()
    // A click with ordinary hand jitter still dismisses.
    act(() => {
      dialog.dispatchEvent(pointer('pointerdown', 100, 100))
      dialog.dispatchEvent(pointer('pointermove', 102, 101))
      dialog.dispatchEvent(pointer('pointerup', 102, 101))
      dialog.dispatchEvent(pointer('click', 102, 101))
    })
    expect(presented).toHaveBeenCalledExactlyOnceWith(false)
  },
)
// Grabber reach (October 1). Native iOS 27: a touch up to 13 pt above the sheet's top edge,
// within about 28 pt of its centre, is the grabber's: a drag pans the sheet and a tap changes the
// detent (or dismisses a single-detent sheet). The reach element's size is CSS (styles.css).
function grabberReach() {
  return element.querySelector<HTMLElement>('[data-satin-sheet-grabber-reach]')!
}
it('pans the sheet from the grabber reach above its edge, and does not dismiss', () => {
  const clock = detentClock()
  const presented = probeSheet(<button>Done</button>)
  const reach = grabberReach()
  expect(reach.closest('.satin-presentation-surface')).toBeNull()
  expect(reach.closest('dialog')).toBe(element.querySelector('dialog'))
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(reach)
  contact.down(440)
  contact.move(434)
  contact.move(428)
  contact.move(400)
  clock(16)
  expect(height()).toBe(initialHeight + 30)
  expect(element.querySelector('dialog')!.getAttribute('data-satin-presentation-moving')).toBe(
    'drag',
  )
  contact.up(400)
  expect(presented).not.toHaveBeenCalled()
})
it('pans from the grabber reach whatever the screen behind the sheet has scrolled to', () => {
  const clock = detentClock()
  render(
    <div data-test-behind style={{ overflowY: 'auto' }}>
      <Sheet title="Edit" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
        Content
      </Sheet>
    </div>,
  )
  const behind = element.querySelector<HTMLElement>('[data-test-behind]')!
  Object.defineProperties(behind, {
    scrollHeight: { value: 3000 },
    clientHeight: { value: 800 },
  })
  behind.scrollTop = 400
  const height = sheetHeight()
  const initialHeight = height()
  const contact = webkitTouch(grabberReach())
  contact.down(440)
  contact.move(452)
  contact.move(480)
  clock(16)
  expect(height()).toBe(initialHeight - 30)
})
it.each([
  ['medium', 'large'],
  ['large', 'medium'],
] as const)('a tap in the grabber reach at %s changes the detent to %s', (selection, next) => {
  const presented = vi.fn()
  const changed = vi.fn()
  render(
    <Sheet
      title="Edit"
      isPresented
      selection={selection}
      onSelectionChange={changed}
      onPresentedChange={presented}
      detents={['medium', 'large']}
      interactiveDismissDisabled={selection === 'large'}
    >
      Content
    </Sheet>,
  )
  const reach = grabberReach()
  const contact = webkitTouch(reach)
  contact.down(440)
  contact.up(440)
  act(() => {
    reach.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerId: 7, detail: 1 }))
  })
  expect(changed).toHaveBeenCalledExactlyOnceWith(next)
  expect(presented).not.toHaveBeenCalled()
})
it.each([
  [false, 1],
  [true, 0],
])(
  'a tap in the grabber reach of a single-detent sheet dismisses it unless dismissal is disabled (%s)',
  (locked, dismissals) => {
    const presented = vi.fn()
    render(
      <Sheet
        title="Edit"
        isPresented
        onPresentedChange={presented}
        detents={['medium']}
        interactiveDismissDisabled={locked}
      >
        Content
      </Sheet>,
    )
    const reach = grabberReach()
    const contact = webkitTouch(reach)
    contact.down(440)
    contact.up(440)
    act(() => {
      reach.dispatchEvent(new PointerEvent('click', { bubbles: true, pointerId: 7, detail: 1 }))
    })
    expect(presented).toHaveBeenCalledTimes(dismissals)
    if (dismissals) expect(presented).toHaveBeenCalledWith(false)
  },
)
it('a tap that went down on the dimmed area dismisses even when WebKit lands its click on the grabber reach', () => {
  // Recorded on the iPad, 16 pt above the sheet's edge: pointerdown and pointerup on the dialog,
  // then the click on the reach element 3 pt below.
  const presented = vi.fn()
  const changed = vi.fn()
  render(
    <Sheet
      title="Edit"
      isPresented
      onSelectionChange={changed}
      onPresentedChange={presented}
      detents={['medium', 'large']}
    >
      Content
    </Sheet>,
  )
  const dialog = element.querySelector('dialog')!
  const pointer = (type: string) =>
    new PointerEvent(type, { bubbles: true, pointerId: 7, detail: type === 'click' ? 1 : 0 })
  act(() => {
    dialog.dispatchEvent(pointer('pointerdown'))
    dialog.dispatchEvent(pointer('pointerup'))
    grabberReach().dispatchEvent(pointer('click'))
  })
  expect(changed).not.toHaveBeenCalled()
  expect(presented).toHaveBeenCalledExactlyOnceWith(false)
})
it('a mouse drag from the grabber reach does not also count as a tap on release', () => {
  const clock = detentClock()
  const changed = vi.fn()
  render(
    <Sheet
      title="Edit"
      isPresented
      onSelectionChange={changed}
      onPresentedChange={() => {}}
      detents={['medium', 'large']}
    >
      Content
    </Sheet>,
  )
  const reach = grabberReach()
  const height = sheetHeight()
  const initialHeight = height()
  const pointer = (type: string, clientY: number, detail = 0) =>
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      pointerType: 'mouse',
      clientX: 200,
      clientY,
      detail,
    })
  act(() => {
    reach.dispatchEvent(pointer('pointerdown', 440))
    reach.dispatchEvent(pointer('pointermove', 460))
  })
  clock(16)
  expect(height()).toBe(initialHeight - 10)
  act(() => {
    reach.dispatchEvent(pointer('pointerup', 460))
    reach.dispatchEvent(pointer('click', 460, 1))
  })
  // The release settles back at medium; a tap would have asked for large.
  expect(changed).not.toHaveBeenCalledWith('large')
})
it('alerts and confirmation dialogs have no grabber reach', () => {
  render(
    <Alert
      title="Name"
      isPresented
      onPresentedChange={() => {}}
      actions={[{ id: 'ok', label: 'OK' }]}
    />,
  )
  expect(element.querySelector('[data-satin-sheet-grabber-reach]')).toBeNull()
})
/** The painted height above the sheet's resting bottom edge: its size less any slide below its
 * smallest detent. */
function sheetHeight() {
  return () => {
    const surface = element.querySelector<HTMLElement>('.satin-presentation-surface')!
    const layer = surface.closest<HTMLElement>('[data-satin-glass-layer]')!
    const slide = Number(/translateY\((-?[\d.]+)px\)/.exec(layer.style.transform)?.[1] ?? 0)
    return Number.parseFloat(surface.style.height) - slide
  }
}
function detentClock() {
  let now = 0,
    id = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frame => {
    frames.delete(frame)
  })
  return (time: number) =>
    act(() => {
      now = time
      const batch = [...frames.values()]
      frames.clear()
      for (const frame of batch) frame(now)
    })
}

// Music FINDINGS #9: Now Playing hid the required title with the framework's own visually-hidden rule.
it('keeps a hidden sheet title as the dialog label without drawing it', () => {
  render(
    <Sheet title="Now Playing" titleVisibility="hidden" isPresented onPresentedChange={() => {}}>
      Content
    </Sheet>,
  )
  const dialog = element.querySelector('dialog')!
  const title = dialog.querySelector<HTMLElement>(`#${dialog.getAttribute('aria-labelledby')}`)!
  expect(title.textContent).toBe('Now Playing')
  expect(title.dataset.satinSheetLabelOnly).toBe('true')
})
it('keeps the sheet title for a real titleless navigator and follows active visible titles', () => {
  const registry = createScreenRegistry(
    defineScreen('bare', { component: () => <p>Bare screen</p> }),
    defineScreen('hidden', {
      component: () => <p>Hidden chrome</p>,
      navigation: { title: 'Hidden', display: 'none' },
    }),
    defineScreen('titled', {
      component: () => <p>Titled screen</p>,
      navigation: { title: 'Details' },
    }),
    defineScreen('empty', { component: () => <p>No title</p>, navigation: { title: '' } }),
  )
  const controllers: TransitionController[] = []
  const navigator = createNavigator({
    registry,
    initial: { id: 'bare' },
    transitionControllerFactory: completion => {
      const controller = { progress: 0, finish: completion.finish, cancel: completion.cancel }
      controllers.push(controller)
      return controller
    },
  })
  const chrome = createScreenChrome()
  render(
    <ScreenChromeContext value={chrome}>
      <Sheet title="Edit" isPresented onPresentedChange={() => {}}>
        <NavigatorHost navigator={navigator} />
      </Sheet>
    </ScreenChromeContext>,
  )
  const hidden = () =>
    element.querySelector('[data-satin-modal-heading]')!.hasAttribute('data-satin-sheet-label-only')
  expect(hidden()).toBe(false)
  act(() => navigator.push('hidden'))
  act(() => controllers.at(-1)!.finish())
  expect(hidden()).toBe(false)
  act(() => navigator.push('titled'))
  act(() => controllers.at(-1)!.finish())
  expect(hidden()).toBe(true)
  const key = navigator.getState().entries.at(-1)!.key
  act(() => chrome.set(key, { titleDisplay: 'none' }))
  expect(hidden()).toBe(false)
  act(() => chrome.set(key, { title: 'Live title' }))
  expect(hidden()).toBe(true)
  act(() => navigator.push('empty'))
  act(() => controllers.at(-1)!.finish())
  expect(hidden()).toBe(false)
  act(() => navigator.pop())
  act(() => controllers.at(-1)!.finish())
  expect(hidden()).toBe(true)
})

it.each([true, false])(
  'settles a drag at the accepted controlled=%s detent without replaying a second spring',
  controlled => {
    const clock = detentClock(),
      changed = vi.fn()
    render(
      <Sheet
        title="Edit"
        isPresented
        selection={controlled ? 'medium' : undefined}
        onSelectionChange={changed}
        onPresentedChange={() => {}}
        detents={['medium', 'large']}
      >
        Content
      </Sheet>,
    )
    const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!,
      height = sheetHeight(),
      medium = height()
    grabber.setPointerCapture = vi.fn()
    act(() => {
      grabber.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientY: 500,
        }),
      )
      grabber.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 100 }),
      )
    })
    clock(16)
    act(() =>
      grabber.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientY: 100 }),
      ),
    )
    expect(changed).toHaveBeenCalledWith('large')
    clock(816)
    expect(height()).toBe(controlled ? medium : 894)
    clock(832)
    expect(height()).toBe(controlled ? medium : 894)
  },
)

it('keeps alert contents and modal ownership until the dismissal animation finishes', async () => {
  const finishers: (() => void)[] = []
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(
    () =>
      ({
        pause: vi.fn(),
        play: vi.fn(),
        cancel: vi.fn(),
        finished: new Promise<void>(resolve => finishers.push(resolve)),
      }) as unknown as Animation,
  )
  const dismissed = vi.fn()
  function App() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Alert
          title="Name"
          isPresented={open}
          onPresentedChange={setOpen}
          onDismiss={dismissed}
          textField={{ label: 'Name', value: 'Last workout', onChange: () => {} }}
          actions={[{ id: 'cancel', label: 'Cancel', role: 'cancel' }]}
        />
      </>
    )
  }
  render(<App />)
  const trigger = element.querySelector('button')!
  trigger.focus()
  click('Open')
  await act(async () => {
    finishers.splice(0).forEach(finish => finish())
    await Promise.resolve()
  })
  const editor = element.querySelector<HTMLInputElement>('input')!
  editor.focus()
  click('Cancel')
  expect(document.activeElement).not.toBe(editor)
  expect(element.querySelector('dialog')?.open).toBe(true)
  expect(element.querySelector('input')?.value).toBe('Last workout')
  expect(element.querySelector('.satin-presentation-actions')?.textContent).toBe('Cancel')
  expect(dismissed).not.toHaveBeenCalled()
  expect(hasActivePresentation()).toBe(true)
  await act(async () => {
    finishers.splice(0).forEach(finish => finish())
    await Promise.resolve()
  })
  expect(element.querySelector('dialog')).toBeNull()
  expect(hasActivePresentation()).toBe(false)
  expect(document.activeElement).toBe(trigger)
  expect(dismissed).toHaveBeenCalledOnce()
})
it('animates alert opacity as well as scale on entry', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const animate = vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(
    () =>
      ({
        pause: vi.fn(),
        play: vi.fn(),
        cancel: vi.fn(),
        finished: new Promise(() => {}),
      }) as unknown as Animation,
  )
  render(
    <Alert
      title="Notice"
      isPresented
      onPresentedChange={() => {}}
      actions={[{ id: 'ok', label: 'OK' }]}
    />,
  )
  const frames = animate.mock.calls
    .map(([frames]) => frames)
    .find(
      frames => Array.isArray(frames) && frames.some(frame => 'transform' in frame),
    ) as Keyframe[]
  expect(Number(frames[0]!.opacity)).toBeLessThan(1)
  expect(Number(frames.at(-1)!.opacity)).toBe(1)
})

it('expands the focused sheet over the keyboard without lifting its bottom edge', () => {
  const clock = detentClock()
  const sheet = () => (
    <Sheet title="Log a set" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      <input aria-label="Exercise" />
    </Sheet>
  )
  render(sheet())
  const surface = element.querySelector<HTMLElement>('.satin-presentation-surface')!
  const layer = element.querySelector<HTMLElement>('[data-satin-glass-layer]')!
  const medium = surface.style.height
  Object.assign(keyboard, {
    presentation: element.querySelector('dialog'),
    visible: true,
    height: 344,
    viewportHeight: 550,
  })
  render(sheet())
  expect(surface.style.height).toBe(medium)
  clock(70)
  expect(parseFloat(surface.style.height)).toBeGreaterThan(parseFloat(medium))
  expect(parseFloat(surface.style.height)).toBeLessThan(894)
  clock(800)
  expect(surface.style.height).toBe('894px')
  expect(layer.style.bottom).toBe('0px')
  expect(layer.style.width).toBe('440px')
  Object.assign(keyboard, { presentation: null, visible: false, height: 0, viewportHeight: 894 })
  render(sheet())
  clock(1600)
  expect(surface.style.height).toBe(medium)
})

it('shrinks a confirmation popover back into its arrow tip before removing it', async () => {
  const finishers: (() => void)[] = []
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const animate = vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(
    () =>
      ({
        pause: vi.fn(),
        play: vi.fn(),
        cancel: vi.fn(),
        finished: new Promise<void>(resolve => finishers.push(resolve)),
      }) as unknown as Animation,
  )
  function App() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <ConfirmationDialog
          title="Delete?"
          isPresented={open}
          onPresentedChange={setOpen}
          actions={[
            { id: 'delete', label: 'Delete', role: 'destructive', onPress: () => {} },
            { id: 'cancel', label: 'Cancel', role: 'cancel' },
          ]}
        />
      </>
    )
  }
  render(<App />)
  click('Open')
  await act(async () => {
    finishers.splice(0).forEach(finish => finish())
    await Promise.resolve()
  })
  animate.mockClear()
  click('Cancel')
  // Native (native reference reference): it shrinks and fades over ~210 ms rather than vanishing.
  expect(element.querySelector('dialog')?.open).toBe(true)
  const frames = animate.mock.calls.at(-1)![0] as Keyframe[]
  expect(frames.at(0)).toMatchObject({ transform: 'scale(1)', opacity: 1 })
  expect(frames.at(-1)).toMatchObject({ transform: 'scale(0.2)', opacity: 0 })
  expect(animate.mock.calls.at(-1)![1]).toMatchObject({ duration: 210 })
  await act(async () => {
    finishers.splice(0).forEach(finish => finish())
    await Promise.resolve()
  })
  expect(element.querySelector('dialog')).toBeNull()
})
it('cancels a pending alert dismissal when the owner reopens it', async () => {
  const finishers: (() => void)[] = []
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(
    () =>
      ({
        pause: vi.fn(),
        play: vi.fn(),
        cancel: vi.fn(),
        finished: new Promise<void>(resolve => finishers.push(resolve)),
      }) as unknown as Animation,
  )
  const dismissed = vi.fn(),
    accepted = vi.fn()
  const alert = (open: boolean) => (
    <Alert
      title="Notice"
      isPresented={open}
      onPresentedChange={() => {}}
      onDismiss={dismissed}
      actions={[{ id: 'ok', label: 'OK', onPress: accepted }]}
    />
  )
  render(alert(true))
  await act(async () => {
    finishers.splice(0).forEach(finish => finish())
    await Promise.resolve()
  })
  click('OK')
  render(alert(false))
  const closing = finishers.splice(0)
  render(alert(true))
  await act(async () => {
    closing.forEach(finish => finish())
    await Promise.resolve()
  })
  expect(element.querySelector('dialog')?.open).toBe(true)
  expect(dismissed).not.toHaveBeenCalled()
  click('OK')
  expect(accepted).toHaveBeenCalledTimes(2)
})

it('keeps a presenting sheet in place when its child alert owns the keyboard', () => {
  const content = () => (
    <Sheet title="Log a set" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      <Alert
        title="Name"
        isPresented
        onPresentedChange={() => {}}
        textField={{ label: 'Name', value: '', onChange() {} }}
        actions={[{ id: 'ok', label: 'OK' }]}
      />
    </Sheet>
  )
  render(content())
  const surface = element.querySelector<HTMLElement>('.satin-presentation-surface')!
  const before = surface.style.height
  Object.assign(keyboard, {
    presentation: element.querySelectorAll('dialog')[1],
    visible: true,
    height: 344,
    viewportHeight: 550,
  })
  render(content())
  expect(surface.style.height).toBe(before)
})

it('freezes only presenting scroll surfaces before the dialog user-agent focus step', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  const content = (open: boolean) => (
    <div data-satin-scroll-axis="vertical">
      <Alert
        title="Name"
        isPresented={open}
        onPresentedChange={() => {}}
        textField={{ label: 'Name', value: '', onChange() {} }}
        actions={[{ id: 'ok', label: 'OK' }]}
      />
    </div>
  )
  render(content(false))
  const page = element.querySelector<HTMLElement>('[data-satin-scroll-axis]')!
  page.scrollTop = 84
  page.scrollLeft = 7
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
    page.scrollTop = 203
    page.dispatchEvent(new Event('scroll'))
  }
  render(content(true))
  expect(page.scrollTop).toBe(84)
  expect(page.scrollLeft).toBe(7)
  const field = element.querySelector('input')!
  field.scrollLeft = 12
  field.dispatchEvent(new Event('scroll', { bubbles: true }))
  expect(field.scrollLeft).toBe(12)
  page.scrollTop = 250
  page.dispatchEvent(new Event('scroll'))
  expect(page.scrollTop).toBe(84)
  render(content(false))
  page.scrollTop = 99
  page.dispatchEvent(new Event('scroll'))
  expect(page.scrollTop).toBe(99)
})

it('preserves the alert value and native caret selection through viewport updates', () => {
  const alert = () => (
    <Alert
      title="Name workout"
      isPresented
      onPresentedChange={() => {}}
      textField={{ label: 'Name', value: 'Last workout', onChange() {} }}
      actions={[{ id: 'ok', label: 'OK' }]}
    />
  )
  render(alert())
  const field = element.querySelector('input')!
  field.focus()
  field.setSelectionRange(4, 4)
  const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
  const up = new MouseEvent('pointerup', { bubbles: true, cancelable: true })
  act(() => {
    field.dispatchEvent(down)
    field.dispatchEvent(up)
  })
  expect(down.defaultPrevented).toBe(false)
  expect(up.defaultPrevented).toBe(false)
  Object.assign(keyboard, {
    presentation: element.querySelector('dialog'),
    visible: true,
    height: 344,
    viewportHeight: 550,
  })
  render(alert())
  expect(field.value).toBe('Last workout')
  expect([field.selectionStart, field.selectionEnd]).toEqual([4, 4])
})

it('disables closing alert editors and restores editing when that alert reopens', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(
    () =>
      ({
        pause: vi.fn(),
        play: vi.fn(),
        cancel: vi.fn(),
        finished: new Promise(() => {}),
      }) as unknown as Animation,
  )
  const alert = (open: boolean) => (
    <Alert
      title="Name"
      isPresented={open}
      onPresentedChange={() => {}}
      textField={{ label: 'Name', value: 'Last workout', onChange() {} }}
      actions={[{ id: 'ok', label: 'OK' }]}
    />
  )
  render(alert(true))
  const field = element.querySelector('input')!,
    surface = element.querySelector<HTMLElement>('.satin-presentation-surface')!
  render(alert(false))
  expect(surface.inert).toBe(true)
  expect(document.activeElement).toBe(element.querySelector('dialog'))
  render(alert(true))
  expect(surface.inert).toBe(false)
  expect(document.activeElement).toBe(field)
})

it('keeps the stored detent when the grabber is activated while the keyboard owns the sheet', () => {
  const changed = vi.fn()
  const sheet = () => (
    <Sheet
      title="Log a set"
      isPresented
      onPresentedChange={() => {}}
      detents={['medium', 'large']}
      selection="large"
      onSelectionChange={changed}
    >
      <input aria-label="Exercise" />
    </Sheet>
  )
  render(sheet())
  Object.assign(keyboard, {
    presentation: element.querySelector('dialog'),
    visible: true,
    height: 344,
    viewportHeight: 550,
  })
  render(sheet())
  const grabber = element.querySelector<HTMLElement>('.satin-sheet-grabber')!
  act(() => {
    grabber.click()
  })
  act(() => {
    grabber.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  })
  act(() => {
    grabber.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(changed).not.toHaveBeenCalled()
})

it('a hardware-keyboard accessory bar does not expand the sheet to full height', () => {
  const clock = detentClock()
  const sheet = () => (
    <Sheet title="Log a set" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      <input aria-label="Exercise" />
    </Sheet>
  )
  render(sheet())
  const surface = element.querySelector<HTMLElement>('.satin-presentation-surface')!
  const medium = surface.style.height
  Object.assign(keyboard, {
    presentation: element.querySelector('dialog'),
    visible: true,
    height: 56,
    viewportHeight: 838,
  })
  render(sheet())
  clock(1600)
  expect(surface.style.height).toBe(medium)
})

it('keeps an alert material canvas outside the content scrollport', () => {
  render(
    <Alert
      title="Remove download?"
      isPresented
      onPresentedChange={() => {}}
      actions={[{ id: 'remove', label: 'Remove' }]}
    />,
  )
  const surface = element.querySelector('.satin-presentation-surface')!
  const scroll = surface.querySelector('.satin-presentation-scroll')
  expect(scroll).not.toBeNull()
  expect(scroll!.querySelector('.satin-presentation-title')?.textContent).toBe('Remove download?')
  expect(scroll!.querySelector('button')?.textContent).toBe('Remove')
  expect(scroll!.querySelector('canvas')).toBeNull()
  expect(surface.querySelector('canvas')?.parentElement).toBe(surface)
})

it('blurs a contained editor before cancelling presentation motion on unmount', () => {
  render(
    <Alert
      title="Edit"
      isPresented
      onPresentedChange={() => {}}
      actions={[{ id: 'cancel', label: 'Cancel', role: 'cancel' }]}
      textField={{ label: 'Name', value: 'Test', onChange: () => {} }}
    />,
  )
  const editor = element.querySelector<HTMLInputElement>('input')!
  editor.focus()
  const blur = vi.spyOn(editor, 'blur')
  const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame')
  act(() => root.unmount())
  expect(blur).toHaveBeenCalledOnce()
  expect(blur.mock.invocationCallOrder[0]).toBeLessThan(cancelFrame.mock.invocationCallOrder[0]!)
})

it('the real alert holds its text field and buttons until first-show glass is acknowledged', async () => {
  coldGlass.enabled = true
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const play = vi.fn()
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(
    () =>
      ({
        pause: vi.fn(),
        play,
        cancel: vi.fn(),
        finished: new Promise(() => {}),
      }) as unknown as Animation,
  )
  render(
    <Alert
      title="Name workout"
      isPresented
      onPresentedChange={() => {}}
      textField={{ label: 'Name', value: 'Workout', onChange() {} }}
      actions={[{ id: 'save', label: 'Save' }]}
    />,
  )
  const layer = element.querySelector<HTMLElement>('[data-satin-glass-layer]')!
  const canvas = layer.querySelector('canvas')!
  expect(layer.hasAttribute('data-satin-glass-hold')).toBe(true)
  expect(play).not.toHaveBeenCalled()
  expect(element.querySelector('dialog')!.hasAttribute('data-satin-presentation-moving')).toBe(
    false,
  )
  expect(element.querySelector('input')).not.toBeNull()
  expect(element.querySelector('button')).not.toBeNull()
  canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(layer.hasAttribute('data-satin-glass-hold')).toBe(false)
  expect(play).toHaveBeenCalledTimes(2)
})

// reference: glass on a sheet first showed the screen below (white discs, Done tinted by the page) because
// the sheet revealed before a backdrop of its own content was installed.
it('holds a fresh sheet and its dimmer until its glass is drawn over its own content', async () => {
  coldGlass.enabled = true
  render(
    <Sheet isPresented onPresentedChange={() => {}} title="Fresh sheet">
      <button>Sheet action</button>
    </Sheet>,
  )
  const layer = element.querySelector<HTMLElement>('[data-satin-glass-layer]')!
  const dimmer = element.querySelector<HTMLElement>('[data-satin-presentation-dimmer]')!
  const canvas = layer.querySelector('canvas')!
  expect(layer.hasAttribute('data-satin-glass-hold')).toBe(true)
  expect(dimmer.hasAttribute('data-satin-glass-hold')).toBe(true)
  await act(async () => {
    canvas.dataset.satinGlassPresentedShow = 'stale'
    await Promise.resolve()
  })
  expect(layer.hasAttribute('data-satin-glass-hold')).toBe(true)
  // Drawn before the renderer held this sheet's content: still the screen below.
  await act(async () => {
    canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
    await Promise.resolve()
  })
  expect(layer.hasAttribute('data-satin-glass-hold')).toBe(true)
  await act(async () => {
    layer.setAttribute('data-satin-glass-source', layer.getAttribute('data-satin-glass-hold')!)
    await Promise.resolve()
  })
  expect(layer.hasAttribute('data-satin-glass-hold')).toBe(true)
  await act(async () => {
    canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
    await Promise.resolve()
  })
  // First prepare the swept material, then acknowledge its running clock before revealing.
  await act(async () => {
    const material = layer.querySelector<HTMLElement>('.satin-presentation-surface')!
    const motion = presentationGlassMotion(material)
    if (motion) motion.acknowledge(motion.track)
    await Promise.resolve()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
  await act(async () => {
    const material = layer.querySelector<HTMLElement>('.satin-presentation-surface')!
    const motion = presentationGlassMotion(material)
    if (motion) motion.acknowledge(motion.track)
    await Promise.resolve()
  })
  expect(layer.hasAttribute('data-satin-glass-hold')).toBe(false)
  expect(dimmer.hasAttribute('data-satin-glass-hold')).toBe(false)
})

it('does not revive a retained alert dismissed before its first glass receipt', async () => {
  coldGlass.enabled = true
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const play = vi.fn()
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(
    () =>
      ({
        pause: vi.fn(),
        play,
        cancel: vi.fn(),
        finished: new Promise(() => {}),
      }) as unknown as Animation,
  )
  const alert = (isPresented: boolean) => (
    <Alert
      title="Late glass"
      isPresented={isPresented}
      onPresentedChange={() => {}}
      actions={[{ id: 'ok', label: 'OK' }]}
    />
  )
  render(alert(true))
  const layer = element.querySelector<HTMLElement>('[data-satin-glass-layer]')!
  const canvas = layer.querySelector('canvas')!
  render(alert(false))
  await act(async () => {
    canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
    await Promise.resolve()
  })
  expect(layer.hasAttribute('data-satin-glass-hold')).toBe(true)
  expect(play).not.toHaveBeenCalled()
})

it('publishes the final material sample to glass after detent geometry stops, including reversal', () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const clock = detentClock()
  const sheet = (selection: 'medium' | 'large') => (
    <Sheet
      title="Edit"
      isPresented
      detents={['medium', 'large']}
      selection={selection}
      onPresentedChange={() => {}}
    >
      Content
    </Sheet>
  )
  const samples: string[] = []
  invalidateRegions.mockImplementation(() => {
    const surface = element.querySelector<HTMLElement>('.satin-presentation-surface')
    if (surface) samples.push(surface.style.getPropertyValue('--satin-sheet-opaque-mix'))
  })
  render(sheet('medium'))
  render(sheet('large'))
  clock(100)
  clock(300)
  clock(800)
  expect(samples.at(-1)).toBe('1')
  render(sheet('medium'))
  clock(900)
  expect(Number(samples.at(-1))).toBeGreaterThan(0)
  expect(Number(samples.at(-1))).toBeLessThan(1)
  render(sheet('large'))
  clock(1200)
  clock(1700)
  expect(samples.at(-1)).toBe('1')
  render(sheet('medium'))
  clock(2500)
  clock(3000)
  expect(samples.at(-1)).toBe('0')
  invalidateRegions.mockReset()
})

for (const selection of ['medium', 'large'] as const) {
  it(`retains ${selection} sheet glass and content through Done dismissal`, async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    const finishers: (() => void)[] = []
    vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(
      () =>
        ({
          pause: vi.fn(),
          play: vi.fn(),
          cancel: vi.fn(),
          finished: new Promise<void>(resolve => finishers.push(resolve)),
        }) as unknown as Animation,
    )
    const dismissed = vi.fn()
    const view = (open: boolean) => (
      <Sheet
        title="Log a set"
        isPresented={open}
        detents={['medium', 'large']}
        selection={selection}
        onPresentedChange={() => {}}
        onDismiss={dismissed}
      >
        <button>Done</button>
      </Sheet>
    )
    render(view(true))
    render(view(false))
    expect(hasActivePresentation()).toBe(true)
    const layer = element.querySelector<HTMLElement>('[data-satin-glass-layer]')!
    expect(layer.textContent).toContain('Done')
    expect(dismissed).not.toHaveBeenCalled()
    await act(async () => {
      finishers.splice(0).forEach(finish => finish())
      await Promise.resolve()
    })
    expect(hasActivePresentation()).toBe(false)
    expect(dismissed).toHaveBeenCalledOnce()
  })
}

it('reopening an interrupted dismissal keeps its painted position and rejects stale completion', async () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const effects: { frames: Keyframe[]; finish: () => void }[] = []
  let active = true
  vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(frames => {
    active = true
    let finish!: () => void
    const finished = new Promise<void>(resolve => {
      finish = resolve
    })
    effects.push({ frames: frames as Keyframe[], finish })
    return {
      pause: vi.fn(),
      play: vi.fn(),
      cancel: () => {
        active = false
      },
      finished,
    } as unknown as Animation
  })
  const view = (open: boolean) => (
    <Sheet title="Edit" isPresented={open} onPresentedChange={() => {}}>
      <button>Done</button>
    </Sheet>
  )
  render(view(true))
  const layer = element.querySelector<HTMLElement>('[data-satin-glass-layer]')!
  const computedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((target, pseudo) => {
    const style = computedStyle(target, pseudo)
    if (target === layer)
      return new Proxy(style, {
        get: (value, property) =>
          property === 'transform'
            ? `matrix(1, 0, 0, 1, 0, ${active ? 120 : 0})`
            : Reflect.get(value, property),
      })
    return style
  })
  render(view(false))
  const closing = effects.slice(-2)
  expect(closing[0]!.frames[0]!.transform).toBe('translateY(120px)')
  render(view(true))
  expect(effects.at(-2)!.frames[0]!.transform).toBe('translateY(120px)')
  await act(async () => {
    closing.forEach(effect => effect.finish())
    await Promise.resolve()
  })
  expect(element.querySelector('dialog')?.open).toBe(true)
  expect(layer.textContent).toContain('Done')
  render(view(false))
  expect(effects.at(-2)!.frames[0]!.transform).toBe('translateY(120px)')
})

// A restored binding must never reach the dialog or animation layer, even for
// legacy apps that persisted presentation flags with useSceneStorage.
it.each(['sheet', 'alert', 'confirmation', 'popover'] as const)(
  'cold launch closes a previously open %s before first render',
  kind => {
    const presentedChange = vi.fn()
    const dismissed = vi.fn()
    const action = vi.fn()
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    const animate = vi.spyOn(HTMLElement.prototype, 'animate')
    function App() {
      const [open, setOpen] = useState(true)
      const anchor = useRef<HTMLButtonElement>(null)
      const props = {
        title: 'Previously open',
        isPresented: open,
        onPresentedChange: (value: boolean) => {
          presentedChange(value)
          setOpen(value)
        },
        onDismiss: dismissed,
      }
      const actions = [{ id: 'accept', label: 'Accept', onPress: action }]
      return (
        <>
          <button ref={anchor} onClick={() => setOpen(true)}>
            Reopen
          </button>
          {kind === 'sheet' ? (
            <Sheet {...props}>Draft</Sheet>
          ) : kind === 'alert' ? (
            <Alert {...props} actions={actions} />
          ) : (
            <ConfirmationDialog
              {...props}
              actions={actions}
              anchor={kind === 'popover' ? anchor : undefined}
            />
          )}
        </>
      )
    }
    render(
      <StrictMode>
        <RestoredScreenMountContext value={true}>
          <App />
        </RestoredScreenMountContext>
      </StrictMode>,
    )
    expect(element.querySelector('dialog')).toBeNull()
    expect(showModal).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
    expect(presentedChange.mock.calls).toEqual([[false]])
    expect(dismissed).not.toHaveBeenCalled()
    expect(action).not.toHaveBeenCalled()
    click('Reopen')
    expect(element.querySelector('dialog')?.open).toBe(true)
    showModal.mockRestore()
    animate.mockRestore()
  },
)

// Characterisation before D2: presentation kinds keep their opening targets and teardown.
it.each(['sheet', 'alert', 'confirmation'] as const)(
  'keeps the %s modal focus and close contract',
  kind => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const props = { title: 'Modal lifecycle', isPresented: true, onPresentedChange: vi.fn() }
    render(
      kind === 'sheet' ? (
        <Sheet {...props}>
          <button>Inside</button>
        </Sheet>
      ) : kind === 'alert' ? (
        <Alert {...props} actions={[{ id: 'ok', label: 'OK' }]} />
      ) : (
        <ConfirmationDialog
          {...props}
          actions={[{ id: 'cancel', label: 'Cancel', role: 'cancel' }]}
        />
      ),
    )
    const dialog = element.querySelector('dialog')!
    expect(dialog.open).toBe(true)
    expect(document.activeElement).toBe(dialog.querySelector('[data-satin-modal-heading]'))
    render(null)
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  },
)
it('a ScrollView inside a Sheet belongs to the sheet and becomes its primary scroll view', () => {
  // reference: a sheet's scroll view threw "ScrollSurface must be rendered inside a NavigatorHost screen".
  render(
    <Sheet title="Queue" isPresented onPresentedChange={() => {}}>
      <ScrollSurface id="tracks" axis="vertical">
        <p>Track 1</p>
      </ScrollSurface>
    </Sheet>,
  )
  const scroller = element.querySelector<HTMLElement>('[data-satin-scroll="tracks"]')
  expect(scroller?.textContent).toBe('Track 1')
  expect(scroller?.dataset.satinPrimary).toBe('true')
})

it('a control contact belongs to the control while ordinary sheet content still pans', () => {
  const clock = detentClock()
  render(
    <Sheet title="Controls" isPresented onPresentedChange={() => {}} detents={['medium', 'large']}>
      <div data-test-scroll style={{ overflowY: 'auto' }}>
        <Toggle label="Pin" checked={false} onChange={() => {}} />
        <Slider label="Volume" value={0.5} onChange={() => {}} />
        <div data-test-ordinary>Content</div>
      </div>
    </Sheet>,
  )
  const scroller = element.querySelector<HTMLElement>('[data-test-scroll]')!
  Object.defineProperties(scroller, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } })
  const height = sheetHeight()
  const initial = height()
  for (const selector of [
    '[data-satin-toggle-thumb]',
    '[data-satin-slider-thumb-hit]',
    '[data-test-ordinary]',
  ]) {
    const target = element.querySelector<HTMLElement>(selector)!
    act(() => {
      target.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientY: 500,
        }),
      )
      target.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientY: 600 }),
      )
    })
    clock(16)
    if (selector === '[data-test-ordinary]') expect(height()).toBeLessThan(initial)
    else expect(height()).toBe(initial)
    act(() =>
      target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 7 })),
    )
    clock(1000)
  }
})

// Docs preview exposed inherited left alignment on every Alert action role.
it('centres alert action labels without changing ordinary pressables', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  const host = document.createElement('div')
  host.style.textAlign = 'left'
  host.innerHTML = `<div data-satin-presentation="alert"><div class="satin-presentation-actions">
    <button data-satin-pressable="true">Continue with Download</button>
    <button data-satin-pressable="true" data-role="cancel">Cancel</button>
    <button data-satin-pressable="true" data-role="destructive">Remove</button>
  </div></div><button data-satin-pressable="true">Ordinary control</button>`
  document.head.append(style)
  document.body.append(host)
  try {
    for (const action of host.querySelectorAll('.satin-presentation-actions > button')) {
      expect(getComputedStyle(action).textAlign).toBe('center')
    }
    expect(getComputedStyle(host.lastElementChild!).textAlign).not.toBe('center')
  } finally {
    host.remove()
    style.remove()
  }
})
