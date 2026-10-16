// @vitest-environment happy-dom
import { act, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { Alert } from './Presentation.tsx'

// Installed iPad (1366 x 1024), the "Name workout" alert (scratch evidence kb6/evidence):
// centred, its panel is 217 pt tall with its top at 403.5 pt and its field ends at 531.3 pt, 5 pt
// under the keyboard's top (526 pt): every focus from there made WebKit scroll the document
// (base1: 11 moved frames, 17 scroll events). Resting 13.3 pt higher, the field ends at 518 pt
// and 4 cycles of real taps logged 0 scroll events (c1a).
const LAYOUT = { width: 1366, height: 1024 }
const PANEL_HEIGHT = 217
const FIELD = { top: 83.8, height: 44 }

vi.mock('./glassReady.ts', () => ({
  holdPresentationForGlass: (...args: unknown[]) => {
    ;(args[4] as (() => void) | undefined)?.()
    return () => {}
  },
}))
const keyboard = vi.hoisted(() => ({
  presentation: null as Element | null,
  anticipated: false,
  visible: false,
  height: 0,
  viewportHeight: 1024,
  offsetTop: 0,
  layoutHeight: 1024,
  expectedHeight: 498,
}))
vi.mock('../keyboard/adapter.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('../keyboard/adapter.ts')>()),
  useKeyboardMetrics: () => keyboard,
}))
vi.mock('../safe-area/useSafeAreaMetrics.ts', () => ({
  useSafeAreaMetrics: () => ({
    safeFrame: { width: LAYOUT.width, height: LAYOUT.height },
    layoutViewport: LAYOUT,
    visualViewport: { height: keyboard.viewportHeight },
    insets: { top: 0, bottom: 0 },
    physicalInsets: { top: 0, bottom: 0 },
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
    <div {...handlers} data-satin-glass-effect className={className} style={style} inert={inert}>
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
    layoutClass: { horizontal: 'regular' },
    metrics: { layoutViewport: { width: LAYOUT.width }, screen: LAYOUT },
  }),
}))

let root: Root
let element: HTMLDivElement
const renderer = { regions: { invalidate: () => {} }, ready: true } as never
const render = (children: ReactNode) =>
  act(() => root.render(<MaterialEffectContext value={renderer}>{children}</MaterialEffectContext>))
const layer = () => element.querySelector<HTMLElement>('[data-satin-glass-layer]')!
/** The engine's layout boxes: the panel, and the field inside it. */
function layoutBoxes() {
  const boxes = (node: HTMLElement) => {
    if (node.matches('[data-satin-glass-layer]')) return { top: 0, height: PANEL_HEIGHT }
    if (node.matches('input')) return FIELD
    return { top: 0, height: 0 }
  }
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return boxes(this).top
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return boxes(this).height
  })
  // happy-dom has no offsetParent: the field's positioned ancestor is the panel.
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.matches('input') ? this.closest('[data-satin-glass-layer]') : null
    },
  })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(keyboard, { visible: false, height: 0, viewportHeight: 1024, expectedHeight: 498 })
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  layoutBoxes()
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(() => {
  act(() => root.unmount())
  element.remove()
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent')
  vi.restoreAllMocks()
})

const nameAlert = (
  <Alert
    title="Name workout"
    message="Give this workout a name."
    isPresented
    onPresentedChange={() => {}}
    textField={{ label: 'Name', value: '', onChange: () => {} }}
    actions={[{ id: 'save', label: 'Save' }]}
  />
)

it('rests an alert with a text field where the field is clear of the keyboard to come', () => {
  render(nameAlert)
  // Centre 498.7 pt: the field's bottom edge is at 518 pt, 8 pt above the keyboard's top.
  expect(parseFloat(layer().style.top)).toBeCloseTo(498.7, 5)
})

it('keeps an alert without a text field, and a phone alert, at the centre', () => {
  render(
    <Alert
      title="Delete workout?"
      isPresented
      onPresentedChange={() => {}}
      actions={[{ id: 'ok', label: 'OK' }]}
    />,
  )
  expect(layer().style.top).toBe('512px')
  // A keyboard short enough to leave the centred field clear (a phone's proportion).
  keyboard.expectedHeight = 391
  render(nameAlert)
  expect(layer().style.top).toBe('512px')
})

it('follows the reported keyboard exactly once it is there', () => {
  Object.assign(keyboard, { visible: true, height: 498, viewportHeight: 526 })
  render(nameAlert)
  expect(layer().style.top).toBe('263px')
})
