// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Row, NavigationRow, ButtonRow, ValueRow } from '../list-form/ListForm.tsx'
import { setFocusVisibleOptionSupportForTesting } from '../focus/programmaticFocus.ts'
import { resetPointerClickSuppression } from '../press/activation.ts'
import { ContextMenu } from './RowActions.tsx'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { GlassRegionRegistry } from '../glass/regionRegistry.ts'
import { MenuStack } from '../glass/MenuStack.tsx'
import { createMenuContact, SUBMENU_DWELL_MS } from '../menu/menuContact.ts'
import type { Action } from './types.ts'

/** A menu with its submenus, as the presenter draws it (glass/MenuStack.tsx). */
function NestedMenu({ actions, select }: { actions: readonly Action[]; select: () => void }) {
  return (
    <MenuStack
      actions={actions}
      select={select}
      idiom="phone"
      closing={false}
      cornerRadius={32}
      readBounds={() => ({ x: 0, y: 0, width: 440, height: 900 })}
      backRef={{ current: undefined }}
    >
      {rows => <div data-satin-glass-effect="true">{rows}</div>}
    </MenuStack>
  )
}
/** jsdom has no Web Animations; the stack's motion only needs handles it can cancel. */
function stubAnimations() {
  const animate = vi.fn((_frames?: Keyframe[], _options?: KeyframeAnimationOptions) => ({
    finished: new Promise(() => {}),
    cancel() {},
  }))
  Object.assign(HTMLElement.prototype, { animate, getAnimations: () => [] })
  onTestFinished(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate
    delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations
  })
  return animate
}
let root: Root | undefined
let node: HTMLDivElement
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  act(() => root?.unmount())
  node?.remove()
  resetPointerClickSuppression()
  vi.restoreAllMocks()
})
function render(content: React.ReactNode) {
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
  act(() => root!.render(content))
}
describe('action semantics', () => {
  it('supports icon-only swipe commands with an accessible name and no caption', () => {
    const select = vi.fn()
    render(
      <Row
        label="Conversation"
        swipeActions={{
          actions: [
            {
              id: 'mute',
              symbol: 'bell.slash',
              accessibilityLabel: 'Mute conversation',
              onPress: select,
            },
            { id: 'read', symbol: 'envelope', label: 'Read' },
          ],
        }}
      />,
    )
    const buttons = node.querySelectorAll<HTMLElement>('[data-satin-swipe-action]')
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Mute conversation')
    expect(buttons[0]!.querySelector('[data-satin-swipe-label]')!.textContent).toBe('')
    expect(buttons[0]!.dataset.satinSwipeTitle).toBe('false')
    expect(buttons[1]!.querySelector('[data-satin-swipe-label]')!.textContent).toBe('Read')
    act(() => node.querySelector<HTMLButtonElement>('[data-satin-action-access] button')!.click())
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('carries action props on all current row types without nested buttons', () => {
    const select = vi.fn(),
      actions = {
        edge: 'trailing' as const,
        actions: [{ id: 'delete', label: 'Delete', onPress: select }],
      }
    render(
      <>
        <Row label="Row" swipeActions={actions} />
        <NavigationRow label="Nav" swipeActions={actions} />
        <ButtonRow onPress={() => {}} swipeActions={actions}>
          Button
        </ButtonRow>
        <ValueRow label="Value" value="42" swipeActions={actions} />
      </>,
    )
    expect(node.querySelectorAll('[data-satin-row-actions]')).toHaveLength(4)
    expect(node.querySelector('button button')).toBeNull()
    act(() => node.querySelector<HTMLButtonElement>('[data-satin-action-access] button')!.click())
    expect(select).toHaveBeenCalledTimes(1)
  })
  it('does not dispatch disabled menu actions and can enter and leave a submenu', () => {
    stubAnimations()
    const select = vi.fn()
    render(
      <NestedMenu
        actions={[
          { id: 'disabled', label: 'Disabled', disabled: true, onPress() {} },
          { id: 'more', label: 'More', submenu: [{ id: 'child', label: 'Child', onPress() {} }] },
        ]}
        select={select}
      />,
    )
    act(() => node.querySelector<HTMLButtonElement>('[data-satin-action-id="disabled"]')!.click())
    expect(select).not.toHaveBeenCalled()
    act(() => node.querySelector<HTMLButtonElement>('[data-satin-action-id="more"]')!.click())
    // The submenu is a platter of its own above a parent that stays (submenus/SPEC.md).
    const child = node.querySelector('[data-satin-submenu-platter] [data-satin-action-id="child"]')
    expect(child).not.toBeNull()
    expect(node.querySelector('[data-satin-action-id="more"]')?.getAttribute('aria-expanded')).toBe(
      'true',
    )
    act(() => node.querySelector<HTMLButtonElement>('[data-satin-action-id="child"]')!.click())
    expect(select).toHaveBeenCalledTimes(1)
  })
})

it('fires a full swipe on release and springs a surviving row back to rest', () => {
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  vi.stubGlobal('PointerEvent', class extends Event {})
  const animate = stubAnimations()
  let releasing = false
  const select = vi.fn(() => {
    expect(releasing).toBe(true)
    // Activation-gated APIs must be called before release returns or any settle starts.
    expect(animate).not.toHaveBeenCalled()
  })
  render(
    <Row
      label="Set"
      swipeActions={{
        edge: 'trailing',
        actions: [{ id: 'flag', label: 'Flag', onPress: select }],
      }}
    />,
  )
  const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
  const content = host.querySelector<HTMLElement>('[data-satin-row-action-content]')!
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 400,
    bottom: 52,
    width: 400,
    height: 52,
  } as DOMRect)
  const send = (type: string, x: number) =>
    act(() => {
      releasing = type === 'touchend'
      try {
        host.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
            changedTouches: [{ identifier: 9, clientX: x, clientY: 26 }],
            touches: type === 'touchend' ? [] : [{}],
          }),
        )
      } finally {
        releasing = false
      }
    })
  send('touchstart', 390)
  send('touchmove', 10)
  expect(select).not.toHaveBeenCalled()
  animate.mockClear()
  send('touchend', 10)
  expect(select).toHaveBeenCalledTimes(1)
  const index = animate.mock.contexts.findIndex(element => element === content)
  const frames = animate.mock.calls[index][0] as Keyframe[]
  expect(frames.length).toBeGreaterThan(2)
  expect(frames[0].transform).not.toBe(frames.at(-1)!.transform)
  expect(frames.at(-1)!.transform).toContain('translate3d(0px')
})

it.each([205, 210])('uses the native tall-row leading commit boundary at %ipt', distance => {
  vi.stubGlobal('PointerEvent', class extends Event {})
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  stubAnimations()
  const read = vi.fn()
  render(
    <Row
      label="Conversation"
      swipeActions={{
        edge: 'leading',
        actions: [
          { id: 'read', label: 'Read', onPress: read },
          { id: 'pin', label: 'Pin', onPress() {} },
        ],
      }}
    />,
  )
  const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
  const contact = phoneRow(host)
  host.dataset.satinSwipeLabelLayout = 'below'
  host
    .querySelector<HTMLElement>('[data-satin-swipe-tray="leading"]')!
    .style.setProperty('--satin-swipe-button-width', '50')
  // The native boundary is recognized translation; delivered travel also
  // includes the stock recognizer's 25pt origin offset.
  contact([20, 20 + distance + 25])
  expect(read).toHaveBeenCalledTimes(distance === 210 ? 1 : 0)
})

it('applies the shared focus modality policy when entering a submenu after touch', () => {
  stubAnimations()
  setFocusVisibleOptionSupportForTesting(false)
  try {
    render(
      <NestedMenu
        actions={[
          {
            id: 'more',
            label: 'More',
            submenu: [
              { id: 'child', label: 'Child', onPress() {} },
              { id: 'second', label: 'Second', onPress() {} },
            ],
          },
        ]}
        select={() => {}}
      />,
    )
    act(() => {
      node.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      node.querySelector<HTMLButtonElement>('[data-satin-action-id="more"]')!.click()
    })
    expect(document.activeElement?.textContent).toBe('Child')
    expect(document.activeElement?.hasAttribute('data-satin-focus-quiet')).toBe(true)
    act(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      ),
    )
    expect(document.activeElement?.textContent).toBe('Second')
    expect(document.activeElement?.hasAttribute('data-satin-focus-quiet')).toBe(false)
  } finally {
    setFocusVisibleOptionSupportForTesting(undefined)
  }
})

it('traverses all menu sections once and keeps submenu traversal separate', () => {
  stubAnimations()
  const leaf = (id: string) => ({ id, label: id, onPress() {} })
  render(
    <NestedMenu
      actions={[
        leaf('First'),
        {
          section: [
            leaf('Second'),
            { section: [{ ...leaf('Disabled'), disabled: true }, leaf('Third')] },
          ],
        },
        { id: 'More', label: 'More', submenu: [leaf('Child')] },
        leaf('Last'),
      ]}
      select={() => {}}
    />,
  )
  const key = (value: string) =>
    act(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: value, bubbles: true }),
      ),
    )
  act(() => node.querySelector<HTMLButtonElement>('[data-satin-action-id="Second"]')!.focus())
  const sequence = []
  for (let i = 0; i < 6; i++) {
    key('ArrowDown')
    sequence.push(document.activeElement?.textContent)
  }
  expect(sequence).toEqual(['Third', 'More›', 'Last', 'First', 'Second', 'Third'])
  key('End')
  expect(document.activeElement?.textContent).toBe('Last')
  key('Home')
  expect(document.activeElement?.textContent).toBe('First')
  act(() => node.querySelector<HTMLButtonElement>('[data-satin-action-id="More"]')!.click())
  key('End')
  expect(document.activeElement?.textContent).toBe('Child')
  // The submenu's title row leads its traversal; Left leaves the submenu for its row.
  key('ArrowDown')
  expect(document.activeElement?.hasAttribute('data-satin-submenu-title')).toBe(true)
  key('ArrowLeft')
  expect(document.activeElement?.getAttribute('data-satin-action-id')).toBe('More')
  expect(
    node.querySelector('[data-satin-menu-level="0"] [aria-hidden]:not(input[type="checkbox"])'),
  ).toBeNull()
})

it('inherits disabled submenu state in both swipe and accessible action buttons', () => {
  const select = vi.fn()
  render(
    <Row
      label="Set"
      swipeActions={{
        edge: 'trailing' as const,
        actions: [
          {
            id: 'group',
            label: 'Unavailable',
            disabled: true,
            submenu: [
              {
                section: [{ id: 'delete', label: 'Delete', role: 'destructive', onPress: select }],
              },
            ],
          },
        ],
      }}
    />,
  )
  for (const button of node.querySelectorAll<HTMLButtonElement>(
    '[data-satin-swipe-action], [data-satin-action-access] button',
  )) {
    expect(button.disabled).toBe(true)
    act(() => button.click())
  }
  expect(select).not.toHaveBeenCalled()
})

it.each(['pointerleave', 'lostpointercapture', 'pointercancel', 'pointerup'])(
  'ends a pending arbitrary-content hold on %s',
  eventName => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    try {
      render(
        <ContextMenu actions={[{ id: 'a', label: 'A', onPress() {} }]}>
          <span>Arbitrary card</span>
        </ContextMenu>,
      )
      const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
      host.setPointerCapture = vi.fn()
      const send = (type: string) =>
        act(() =>
          host.dispatchEvent(
            Object.assign(new Event(type, { bubbles: true }), {
              pointerId: 4,
              pointerType: 'mouse',
              isPrimary: true,
              button: 0,
              clientX: 5,
              clientY: 5,
            }),
          ),
        )
      send('pointerdown')
      expect(host.setPointerCapture).toHaveBeenCalledWith(4)
      send(eventName)
      act(() => {
        vi.advanceTimersByTime(800)
      })
      expect(document.querySelector('[data-satin-context-panel]')).toBeNull()
      expect(host.querySelector('[aria-expanded="true"]')).toBeNull()
      expect(host.hasAttribute('data-satin-row-swipe')).toBe(false)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  },
)

it('does not full-swipe execute a leaf inherited from a disabled submenu', () => {
  vi.stubGlobal('PointerEvent', class extends Event {})
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const select = vi.fn()
  try {
    render(
      <Row
        label="Set"
        swipeActions={{
          edge: 'trailing' as const,
          actions: [
            {
              id: 'group',
              label: 'Unavailable',
              disabled: true,
              submenu: [{ id: 'delete', label: 'Delete', role: 'destructive', onPress: select }],
            },
          ],
        }}
      />,
    )
    const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
    host.querySelector<HTMLElement>('[data-satin-row-action-content]')!.getAnimations = () => []
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 400,
      bottom: 52,
      width: 400,
      height: 52,
    } as DOMRect)
    const send = (type: string, x: number) =>
      act(() =>
        host.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
            changedTouches: [{ identifier: 9, clientX: x, clientY: 26 }],
            touches: type === 'touchend' ? [] : [{}],
          }),
        ),
      )
    send('touchstart', 390)
    send('touchmove', 10)
    send('touchend', 10)
    expect(select).not.toHaveBeenCalled()
    expect(host.inert).not.toBe(true)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('hands mouse capture from the row Button to its swipe owner without canceling the swipe', () => {
  class TestPointer extends Event {
    pointerId = 9
    pointerType = 'mouse'
    isPrimary = true
    button = 0
    clientX: number
    clientY: number
    constructor(type: string, clientX: number, clientY = 26) {
      super(type, { bubbles: true, cancelable: true })
      this.clientX = clientX
      this.clientY = clientY
    }
  }
  vi.stubGlobal('PointerEvent', TestPointer)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const original = HTMLElement.prototype.setPointerCapture,
    originalHas = HTMLElement.prototype.hasPointerCapture
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.setPointerCapture = vi.fn()
  try {
    render(
      <ButtonRow
        onPress={() => {}}
        swipeActions={{
          edge: 'trailing' as const,
          actions: [{ id: 'delete', label: 'Delete', onPress() {} }],
        }}
      >
        Set
      </ButtonRow>,
    )
    const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
    host.querySelector<HTMLElement>('[data-satin-row-action-content]')!.getAnimations = () => []
    const button = host.querySelector<HTMLButtonElement>(
      '[data-satin-row-action-content] [data-satin-pressable]',
    )!
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 400,
      bottom: 52,
      width: 400,
      height: 52,
    } as DOMRect)
    act(() => button.dispatchEvent(new TestPointer('pointerdown', 300)))
    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalledWith(9)
    act(() => button.dispatchEvent(new TestPointer('pointermove', 240)))
    act(() => button.dispatchEvent(new TestPointer('lostpointercapture', 240)))
    act(() => host.dispatchEvent(new TestPointer('pointermove', 160)))
    act(() => host.dispatchEvent(new TestPointer('pointerup', 160)))
    expect(host.dataset.satinSwipeActive).toBe('true')
    expect(
      host.querySelector<HTMLElement>('[data-satin-row-action-content]')!.style.transform,
    ).toContain('-80px')
  } finally {
    HTMLElement.prototype.setPointerCapture = original
    HTMLElement.prototype.hasPointerCapture = originalHas
    vi.unstubAllGlobals()
  }
})

it('keeps a horizontal drag from mounting an unused context menu', () => {
  vi.useFakeTimers()
  vi.stubGlobal('PointerEvent', class extends Event {})
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  try {
    const action = { id: 'pin', label: 'Pin', onPress() {} }
    render(
      <Row
        label="Note"
        contextMenu={[action]}
        swipeActions={{ edge: 'trailing' as const, actions: [action] }}
      />,
    )
    const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
    host.querySelector<HTMLElement>('[data-satin-row-action-content]')!.getAnimations = () => []
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 400,
      bottom: 70,
      width: 400,
      height: 70,
    } as DOMRect)
    const send = (type: string, x: number) =>
      act(() =>
        host.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
            changedTouches: [{ identifier: 9, clientX: x, clientY: 35 }],
            touches: type === 'touchend' ? [] : [{}],
          }),
        ),
      )
    send('touchstart', 300)
    expect(host.dataset.satinContextPending).toBe('true')
    expect(document.querySelector('[role=menu]')).toBeNull()
    send('touchmove', 220)
    act(() => vi.advanceTimersByTime(200))
    expect(document.querySelector('[role=menu]')).toBeNull()
    expect(host.hasAttribute('data-satin-context-pending')).toBe(false)
    expect(host.querySelector('[data-satin-context-lift]')).toBeNull()
    send('touchend', 220)
    expect(host.hasAttribute('data-satin-context-pending')).toBe(false)
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})

it('regrabs the presented row and pill poses instead of the old spring destination', () => {
  vi.stubGlobal('PointerEvent', class extends Event {})
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  try {
    render(
      <Row
        label="Note"
        swipeActions={{
          edge: 'trailing' as const,
          actions: [{ id: 'a', label: 'A', onPress() {} }],
        }}
      />,
    )
    const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
    const body = host.querySelector<HTMLElement>('[data-satin-row-action-content]')!
    const pill = host.querySelector<HTMLElement>('[data-satin-swipe-action]')!
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      left: 20,
      top: 0,
      width: 400,
      height: 70,
    } as DOMRect)
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({ left: -130 } as DOMRect)
    vi.spyOn(pill, 'getBoundingClientRect').mockReturnValue({ width: 130 } as DOMRect)
    const cancelRow = vi.fn()
    const cancelPill = vi.fn()
    body.getAnimations = () => [{ cancel: cancelRow } as unknown as Animation]
    const end = pill.querySelector<HTMLElement>('[data-satin-swipe-fill="end"]')!
    end.getAnimations = () => [{ cancel: cancelPill } as unknown as Animation]
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      transform: 'matrix(1, 0, 0, 1, 34, 0)',
      opacity: '0.6',
    } as CSSStyleDeclaration)
    act(() =>
      host.dispatchEvent(
        Object.assign(new Event('touchstart', { bubbles: true }), {
          changedTouches: [{ identifier: 9, clientX: 200, clientY: 35 }],
          touches: [{}],
        }),
      ),
    )
    expect(body.style.transform).toBe('translate3d(-150px,0,0)')
    expect(end.style.transform).toBe('matrix(1, 0, 0, 1, 34, 0)')
    expect(end.style.opacity).toBe('0.6')
    expect(cancelRow).toHaveBeenCalledOnce()
    expect(cancelPill).toHaveBeenCalledOnce()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('keeps a recognized context hold selecting when WebKit cancels its pointer stream', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
  class TouchPointer extends Event {
    pointerId = 17
    pointerType = 'touch'
    isPrimary = true
    button = 0
    clientX = 80
    clientY = 220
  }
  vi.stubGlobal('PointerEvent', TouchPointer)
  const select = vi.fn()
  try {
    render(<Row label="Note" contextMenu={[{ id: 'pin', label: 'Pin', onPress: select }]} />)
    const row = node.querySelector<HTMLElement>('[data-satin-row]')!
    const touch = (type: string, y = 220) => {
      act(() =>
        row.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
            changedTouches: [{ identifier: 9, clientX: 80, clientY: y }],
            touches: type === 'touchend' ? [] : [{ identifier: 9, clientX: 80, clientY: y }],
          }),
        ),
      )
    }
    act(() => row.dispatchEvent(new TouchPointer('pointerdown', { bubbles: true })))
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => document.querySelector('[data-satin-action-id="pin"]'),
    })
    touch('touchstart')
    // The native phone threshold sweep opens a hold at 400 ms (and cancels at 300 ms).
    act(() => vi.advanceTimersByTime(400))
    const action = document.querySelector<HTMLButtonElement>('[data-satin-action-id="pin"]')!
    expect(action?.textContent).toContain('Pin')
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => action })
    act(() => row.dispatchEvent(new TouchPointer('pointercancel', { bubbles: true })))
    touch('touchmove', 310)
    touch('touchend', 310)
    expect(select).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})

function phoneRow(host: HTMLElement) {
  host.querySelector<HTMLElement>('[data-satin-row-action-content]')!.getAnimations = () => []
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 400,
    bottom: 52,
    width: 400,
    height: 52,
  } as DOMRect)
  let identifier = 0
  return (path: number[]) => {
    identifier++
    path.forEach((x, index) =>
      act(() =>
        host.dispatchEvent(
          Object.assign(
            new Event(index === 0 ? 'touchstart' : 'touchmove', {
              bubbles: true,
              cancelable: true,
            }),
            { changedTouches: [{ identifier, clientX: x, clientY: 26 }], touches: [{}] },
          ),
        ),
      ),
    )
    act(() =>
      host.dispatchEvent(
        Object.assign(new Event('touchend', { bubbles: true, cancelable: true }), {
          changedTouches: [{ identifier, clientX: path.at(-1), clientY: 26 }],
          touches: [],
        }),
      ),
    )
  }
}

it('closes an open phone-width row from a fresh touch at the native reverse bracket', () => {
  vi.stubGlobal('PointerEvent', class extends Event {})
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const select = vi.fn()
  try {
    render(
      <Row
        label="Note"
        swipeActions={{
          edge: 'leading' as const,
          actions: ['Read', 'Flag', 'More'].map(label => ({ id: label, label, onPress: select })),
        }}
      />,
    )
    const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
    const contact = phoneRow(host)
    contact([20, 170])
    expect(host.dataset.satinSwipeActive).toBe('true')
    // Native closes this 220pt three-action tray when dragged back; it is not a full swipe.
    contact([300, 288])
    expect(select).not.toHaveBeenCalled()
    expect(host.dataset.satinSwipeActive).toBe('true')
    // iPhone HID: 20pt reverse reopens, 40pt closes (WebKit reports 39.5pt).
    contact([300, 265])
    expect(host.dataset.satinSwipeActive).toBe('false')
    expect(select).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('stops native momentum after release so the next contact starts from a centred source', () => {
  vi.stubGlobal('PointerEvent', class extends Event {})
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal('ScrollTimeline', class {})
  vi.stubGlobal('CSS', { supports: () => true })
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  try {
    render(
      <Row
        label="Note"
        swipeActions={{
          edge: 'trailing' as const,
          actions: [{ id: 'archive', label: 'Archive', onPress() {} }],
        }}
      />,
    )
    const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
    const source = host.querySelector<HTMLElement>('[data-satin-row-scrub]')!
    Object.defineProperties(source, { scrollWidth: { value: 2000 }, clientWidth: { value: 400 } })
    source.scrollLeft = 800
    phoneRow(host)([300, 200])
    // UIKit deceleration keeps scrolling after lift (owner phone: up to the 1760pt range edge).
    source.scrollLeft = 1600
    source.dispatchEvent(new Event('scroll'))
    expect(source.scrollLeft).toBe(800)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('returns a scrolled-away preview to its source at once, while the menu still closes', async () => {
  vi.useFakeTimers()
  const regions = new GlassRegionRegistry()
  try {
    render(
      <div data-satin-scroll="library">
        <MaterialEffectContext
          value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}
        >
          <ContextMenu actions={[{ id: 'play', label: 'Play', onPress() {} }]}>
            <button className="album-card">Tidewater</button>
          </ContextMenu>
        </MaterialEffectContext>
      </div>,
    )
    const card = node.querySelector<HTMLElement>('.album-card')!
    act(() => {
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }))
    })
    const panel = () => document.querySelector('[data-satin-general-menu]')
    for (let phase = 0; phase < 2; phase++)
      await act(async () => {
        const canvas = panel()!.querySelector<HTMLCanvasElement>(
          '[data-satin-glass-region-canvas]',
        )!
        canvas.dataset.satinGlassPresented = 'true'
        canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
        await Promise.resolve()
      })
    // The card itself lifts (no list cell around it) above the page.
    expect(card.dataset.satinContextLift).toBe('content')
    expect(card.style.position).toBe('fixed')
    const placeholder = card.previousElementSibling as HTMLElement
    vi.spyOn(placeholder, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: -120,
    } as DOMRect)
    const scroller = node.querySelector<HTMLElement>('[data-satin-scroll]')!
    act(() => {
      scroller.dispatchEvent(new Event('scroll'))
    })
    expect(panel()?.closest('[data-satin-menu-panel]')?.getAttribute('data-satin-menu-phase')).toBe(
      'closing',
    )
    expect(card.style.position).toBe('')
    expect(card.hasAttribute('popover')).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

it('shows a custom preview in place of its source, as stock contextMenu(preview:) does', async () => {
  const regions = new GlassRegionRegistry()
  render(
    <MaterialEffectContext value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}>
      <ContextMenu
        actions={[{ id: 'play', label: 'Play', onPress() {} }]}
        preview={<img className="large-artwork" alt="" />}
      >
        <button className="album-card">Paper Lanterns</button>
      </ContextMenu>
    </MaterialEffectContext>,
  )
  const card = node.querySelector<HTMLElement>('.album-card')!
  // Context-only content renders no swipe trays: a 1200-message transcript paid for them in
  // every rendering update of a keyboard dismissal.
  expect(node.querySelector('[data-satin-swipe-tray]')).toBeNull()
  act(() => {
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }))
  })
  const preview = document.querySelector<HTMLElement>('[data-satin-context-preview]')
  expect(preview?.querySelector('.large-artwork')).not.toBeNull()
  expect(preview?.style.visibility).toBe('visible')
  // The source is not lifted: the preview takes its place above the dimmed page.
  expect(card.dataset.satinContextLift).toBeUndefined()
})

it('draws the menu over its lifted content and the dim under it, as native does for a tall bubble', async () => {
  // The browser top layer paints in the order elements enter it.
  const layer: Element[] = []
  const leave = (element: Element) => {
    if (layer.includes(element)) layer.splice(layer.indexOf(element), 1)
  }
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: {
      configurable: true,
      value(this: HTMLElement) {
        leave(this)
        layer.push(this)
      },
    },
    hidePopover: {
      configurable: true,
      value(this: HTMLElement) {
        leave(this)
      },
    },
  })
  onTestFinished(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover
    delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover
  })
  const regions = new GlassRegionRegistry()
  render(
    <MaterialEffectContext value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}>
      <ContextMenu actions={[{ id: 'reply', label: 'Reply', onPress() {} }]}>
        <p className="bubble">Thursday light is best from the Miradouro.</p>
      </ContextMenu>
    </MaterialEffectContext>,
  )
  const bubble = node.querySelector<HTMLElement>('.bubble')!
  act(() => {
    bubble.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }))
  })
  for (let phase = 0; phase < 2; phase++)
    await act(async () => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-satin-general-menu] [data-satin-glass-region-canvas]',
      )!
      canvas.dataset.satinGlassPresented = 'true'
      canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
      await Promise.resolve()
    })
  expect(bubble.dataset.satinContextLift).toBe('content')
  const menu = document.querySelector('[data-satin-menu-panel]')!.closest('[popover]')!
  const dim = document.querySelector('[data-satin-context-backdrop]')!.closest('[popover]')!
  expect(layer.indexOf(dim)).toBeGreaterThanOrEqual(0)
  expect(layer.indexOf(dim)).toBeLessThan(layer.indexOf(bubble))
  expect(layer.indexOf(bubble)).toBeLessThan(layer.indexOf(menu))
})

it('lifts a bubble again, from its hold, when it is pressed during the last dismissal', async () => {
  // Owner, Oct 13: back-to-back presses lifted less, late, or not at all. Native lifts every press
  // the same way. The hold during a dismissal must grow the bubble and lift it again.
  const entered: Element[] = []
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: {
      configurable: true,
      value(this: HTMLElement) {
        entered.push(this)
      },
    },
    hidePopover: { configurable: true, value() {} },
  })
  const grown: Element[] = []
  const animate = vi.fn(function (this: HTMLElement, frames: Keyframe[]) {
    if (frames.some(frame => frame.transform === 'scale(1.035)')) grown.push(this)
    return { finished: new Promise(() => {}), cancel() {}, startTime: 0 }
  })
  Object.assign(HTMLElement.prototype, { animate, getAnimations: () => [] })
  onTestFinished(() => {
    for (const name of ['showPopover', 'hidePopover', 'animate', 'getAnimations'])
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
  })
  class TouchPointer extends Event {
    pointerId = 21
    pointerType = 'touch'
    isPrimary = true
    button = 0
    clientX = 80
    clientY = 220
  }
  vi.stubGlobal('PointerEvent', TouchPointer)
  // jsdom has no hit testing.
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null })
  onTestFinished(() => {
    delete (document as Partial<Document>).elementFromPoint
  })
  const regions = new GlassRegionRegistry()
  render(
    <MaterialEffectContext value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}>
      <ContextMenu actions={[{ id: 'reply', label: 'Reply', onPress() {} }]}>
        <span className="bubble-wrap">
          <span className="bubble">Good question.</span>
        </span>
      </ContextMenu>
    </MaterialEffectContext>,
  )
  const wrap = node.querySelector<HTMLElement>('.bubble-wrap')!
  const bubble = node.querySelector<HTMLElement>('.bubble')!
  const present = async () => {
    for (let phase = 0; phase < 2; phase++)
      await act(async () => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          '[data-satin-general-menu] [data-satin-glass-region-canvas]',
        )!
        canvas.dataset.satinGlassPresented = 'true'
        canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
        await Promise.resolve()
      })
  }
  act(() => {
    bubble.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }))
  })
  await present()
  expect(wrap.dataset.satinContextLift).toBe('content')
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  // The dismissal is under way: the bubble is still up while it returns.
  expect(wrap.dataset.satinContextLift).toBe('content')
  vi.useFakeTimers()
  try {
    act(() => bubble.dispatchEvent(new TouchPointer('pointerdown', { bubbles: true })))
    act(() =>
      bubble.dispatchEvent(
        Object.assign(new Event('touchstart', { bubbles: true, cancelable: true }), {
          changedTouches: [{ identifier: 4, clientX: 80, clientY: 220 }],
          touches: [{ identifier: 4, clientX: 80, clientY: 220 }],
        }),
      ),
    )
    act(() => vi.advanceTimersByTime(200))
    // The hold grows the bubble from its resting place, as the first press did.
    expect(grown).toContain(wrap)
    act(() => vi.advanceTimersByTime(300))
    expect(wrap.dataset.satinContextLift).toBe('content')
    expect(entered.filter(element => element === wrap)).toHaveLength(2)
    expect(entered.some(element => element.matches('[data-satin-row-action-content]'))).toBe(false)
  } finally {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
})

it('carries one held contact through a submenu row into its child and selects the leaf once', () => {
  stubAnimations()
  vi.useFakeTimers()
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const select = vi.fn()
  render(
    <NestedMenu
      actions={[
        { id: 'copy', label: 'Copy', onPress() {} },
        { id: 'more', label: 'More', submenu: [{ id: 'child', label: 'Child', onPress() {} }] },
      ]}
      select={select}
    />,
  )
  // jsdom has no hit testing: y 10 is the More row, y 60 the child's row.
  const row = (id: string) => node.querySelector(`[data-satin-action-id="${id}"]`)
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (_x: number, y: number) => (y < 50 ? row('more') : row('child')),
  })
  onTestFinished(() => {
    delete (document as Partial<Document>).elementFromPoint
  })
  const contact = createMenuContact()
  const detach = contact.attach(node)
  const pointer = (type: string, y: number) =>
    act(() => {
      document.dispatchEvent(
        Object.assign(new Event(type), { pointerId: 1, clientX: 20, clientY: y }),
      )
    })
  try {
    act(() => contact.transfer({ pointerId: 1, x: 20, y: 10 }, node))
    act(() => vi.advanceTimersByTime(SUBMENU_DWELL_MS))
    expect(row('more')?.getAttribute('aria-expanded')).toBe('true')
    pointer('pointermove', 60)
    pointer('pointerup', 60)
    expect(select).toHaveBeenCalledTimes(1)
    expect(select.mock.calls[0]![0].id).toBe('child')
  } finally {
    detach()
  }
})

function revealedRowWithPinnedChat() {
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  class TestPointer extends Event {
    pointerId = 29
    detail = 1
    pointerType = 'touch'
    isPrimary = true
    button = 0
    clientX = 100
    clientY = 150
  }
  vi.stubGlobal('PointerEvent', TestPointer)
  stubAnimations()
  const navigate = vi.fn()
  const pressed = vi.fn()
  render(
    <>
      <Row
        label="Message"
        swipeActions={{ edge: 'trailing', actions: [{ id: 'flag', label: 'Flag' }] }}
      />
      <button onClick={navigate} onPointerDown={pressed}>
        Pinned chat
      </button>
    </>,
  )
  const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
  const content = host.querySelector<HTMLElement>('[data-satin-row-action-content]')!
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 400,
    bottom: 52,
    width: 400,
    height: 52,
  } as DOMRect)
  const touch = (type: string, x: number, time = performance.now()) =>
    act(() => {
      const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        changedTouches: [{ identifier: 9, clientX: x, clientY: 26 }],
        touches: type === 'touchend' ? [] : [{ identifier: 9, clientX: x, clientY: 26 }],
      })
      Object.defineProperty(event, 'timeStamp', { value: time })
      host.dispatchEvent(event)
    })
  // An ordinary swipe: its 100pt move arrives after the 25ms in which a fast
  // stroke would restart its pan (fullSwipeContact swipePanStart).
  const down = performance.now()
  touch('touchstart', 300, down)
  touch('touchmove', 200, down + 100)
  touch('touchend', 200, down + 400)
  vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({ left: -80 } as DOMRect)
  const pinned = [...node.querySelectorAll('button')].find(
    button => button.textContent === 'Pinned chat',
  )!
  const tap = () =>
    act(() => {
      pinned.dispatchEvent(new TestPointer('pointerdown', { bubbles: true, cancelable: true }))
      pinned.dispatchEvent(new TestPointer('pointerup', { bubbles: true, cancelable: true }))
      pinned.dispatchEvent(new TestPointer('click', { bubbles: true, cancelable: true }))
    })
  return { tap, pressed, navigate, host, content, touch }
}

it('delivers the first outside tap while a revealed row closes', () => {
  const { tap, pressed, navigate } = revealedRowWithPinnedChat()
  tap()
  expect(pressed).toHaveBeenCalledOnce()
  expect(navigate).toHaveBeenCalledOnce()
})

it('finishes the row return while repeated taps act on another control', async () => {
  const { tap, navigate, content } = revealedRowWithPinnedChat()
  let finishReturn!: () => void
  content.animate = vi.fn(() => ({
    finished: new Promise<void>(resolve => {
      finishReturn = resolve
    }),
    cancel() {},
  })) as unknown as typeof content.animate
  tap()
  const finishFirstReturn = finishReturn
  tap()
  tap()
  expect(navigate).toHaveBeenCalledTimes(3)
  await act(async () => finishFirstReturn())
  // The first return clears its visible pose; outside taps cannot prolong it.
  expect(content.style.transform).toBe('')
  expect(content.style.borderRadius).toBe('')
})

it('keeps the trailing tray painted until its close animation finishes', async () => {
  const { tap, host, content } = revealedRowWithPinnedChat()
  let finishReturn!: () => void
  content.animate = vi.fn(() => ({
    finished: new Promise<void>(resolve => {
      finishReturn = resolve
    }),
    cancel() {},
  })) as unknown as typeof content.animate
  expect(host.dataset.satinSwipeSide).toBe('trailing')
  tap()
  // The logical target is closed, but CSS must still select the outgoing tray.
  expect(host.dataset.satinSwipeSide).toBe('trailing')
  expect(host.dataset.satinSwipeActive).toBe('true')
  await act(async () => finishReturn())
  expect(host.dataset.satinSwipeActive).toBeUndefined()
})

it('still catches the presented row when the contact starts on that row', () => {
  const { content, touch, navigate } = revealedRowWithPinnedChat()
  const cancel = vi.fn()
  content.getAnimations = () => [{ cancel } as unknown as Animation]
  vi.mocked(content.getBoundingClientRect).mockReturnValue({ left: -35 } as DOMRect)
  touch('touchstart', 180)
  expect(content.style.transform).toBe('translate3d(-35px,0,0)')
  expect(cancel).toHaveBeenCalledOnce()
  expect(navigate).not.toHaveBeenCalled()
  touch('touchend', 180)
})

it('closes once on touchend after WebKit releases and leaves its touch pointer', async () => {
  const { host, content, touch } = revealedRowWithPinnedChat()
  let finishReturn!: () => void
  const cancel = vi.fn()
  const animate = vi.fn(() => ({
    finished: new Promise<void>(resolve => {
      finishReturn = resolve
    }),
    cancel,
  }))
  content.animate = animate as unknown as typeof content.animate
  content.getAnimations = () =>
    animate.mock.results.map(result => result.value as unknown as Animation)
  const pointer = (type: string) =>
    act(() =>
      host.dispatchEvent(
        Object.assign(
          new PointerEvent(type, { bubbles: type !== 'pointerleave', cancelable: true }),
          { pointerType: 'touch', pointerId: 9, isPrimary: true, button: 0 },
        ),
      ),
    )
  pointer('pointerdown')
  touch('touchstart', 180)
  pointer('pointerup')
  pointer('lostpointercapture')
  pointer('pointerleave')
  expect(animate).not.toHaveBeenCalled()
  touch('touchend', 180)
  expect(animate).toHaveBeenCalledOnce()
  expect(cancel).not.toHaveBeenCalled()
  expect(host.dataset.satinSwipeActive).toBe('true')
  await act(async () => finishReturn())
  expect(host.dataset.satinSwipeActive).toBeUndefined()
})

describe('destructive full swipe on the touch fallback', () => {
  function destructiveRow() {
    vi.stubGlobal('PointerEvent', class extends Event {})
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const animate = stubAnimations()
    const remove = vi.fn()
    render(
      <Row
        label="Conversation"
        swipeActions={{
          edge: 'trailing',
          actions: [
            { id: 'delete', label: 'Delete', role: 'destructive', onPress: remove },
            { id: 'mute', label: 'Hide Alerts', onPress() {} },
          ],
        }}
      />,
    )
    const host = node.querySelector<HTMLElement>('[data-satin-row-actions]')!
    const content = host.querySelector<HTMLElement>('[data-satin-row-action-content]')!
    content.getAnimations = () => []
    host.dataset.satinSwipeLabelLayout = 'below'
    host
      .querySelector<HTMLElement>('[data-satin-swipe-tray="trailing"]')!
      .style.setProperty('--satin-swipe-button-width', '50')
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 400,
      bottom: 80,
      width: 400,
      height: 80,
    } as DOMRect)
    // Contact response is time-based. Dispatch a sampled stroke rather than
    // compressing every move into one synchronous instant.
    let clock = performance.now()
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const send = (type: string, x: number) => {
      clock += 1000 / 60
      const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        changedTouches: [{ identifier: 4, clientX: x, clientY: 40 }],
        touches: type === 'touchend' ? [] : [{}],
      })
      Object.defineProperty(event, 'timeStamp', { value: clock })
      act(() => host.dispatchEvent(event))
    }
    const drag = (path: number[], release = path.at(-1)!) => {
      send('touchstart', path[0]!)
      for (const x of path.slice(1)) send('touchmove', x)
      animate.mockClear()
      send('touchend', release)
    }
    const settled = () => {
      const index = animate.mock.contexts.findIndex(element => element === content)
      return index < 0 ? undefined : (animate.mock.calls[index]![0] as Keyframe[]).at(-1)!.transform
    }
    return { remove, drag, settled, content, host }
  }
  /** Finger x every 10pt from `from` to `to`, either direction. */
  const stroke = (from: number, to: number) =>
    Array.from(
      { length: Math.floor(Math.abs(to - from) / 10) + 1 },
      (_, index) => from + Math.sign(to - from) * index * 10,
    )

  it('fires when the finger reaches the far edge, and the row has jumped to its anchor', () => {
    const row = destructiveRow()
    row.drag(stroke(380, 60))
    expect(row.remove).toHaveBeenCalledTimes(1)
  })

  it('does not fire after the same travel when the finger stays out of the zone', () => {
    // 290pt of travel from x380 ends at x90, where native never takes over.
    const row = destructiveRow()
    row.drag([...stroke(380, 100), 90])
    expect(row.remove).not.toHaveBeenCalled()
    expect(row.settled()).toContain('translate3d(-')
  })

  it('cancels a reversal after takeover and closes the row instead of opening it', () => {
    const row = destructiveRow()
    row.drag([...stroke(380, 60), ...stroke(70, 140)])
    expect(row.remove).not.toHaveBeenCalled()
    expect(row.settled()).toContain('translate3d(0px')
    // The tray stays painted while the row returns from far across, like a dismissal.
    expect(row.host.dataset.satinSwipeActive).toBe('true')
  })

  it('does not fire when lift-off is the only sample in the zone', () => {
    const row = destructiveRow()
    row.drag(stroke(380, 100), 60)
    expect(row.remove).not.toHaveBeenCalled()
  })
})
