// EXPERIMENTAL, PRIVATE (exported from the internal entry only). A temporary sidebar drawer
// whose gestures are participants of one pane gesture scope shared with the content (a
// navigation stack's back swipe, rows). Overlay is the phone default; reveal and push use the
// same participants and transactions with different visual tracks. The app owns the panel's
// shape, width-independent styling, material and content; the framework owns hit testing,
// geometry, movement, focus and the scrim.

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createGestureScope } from '../gestures/ownership.ts'
import {
  PaneGestureScopeContext,
  type PaneContent,
  type PaneGestureScope,
} from '../gestures/scopeContext.ts'
import {
  createDrawerController,
  type DrawerElements,
  type DrawerOptions,
} from './drawerController.ts'
import type { DrawerMotion, LayoutDirection } from './drawerMotion.ts'
import { DrawerHandleContext, type ExperimentalDrawerHandle } from './drawerHandle.ts'

export type ExperimentalDrawerProps = Readonly<{
  /** Committed visibility. */
  open: boolean
  onOpenChange: (open: boolean) => void
  sidebar: ReactNode
  /** Accessible name of the sidebar region. */
  sidebarLabel: string
  children: ReactNode
  motion?: DrawerMotion
  /** Allow the leading edge to open the drawer at the content's root (owner decision 4). */
  edgeOpen?: boolean
  /** Defaults to the document's direction. */
  layoutDirection?: LayoutDirection
  /** App-owned panel look: shape, material, colour. Width comes from pane geometry. */
  panelClassName?: string
  panelStyle?: CSSProperties
}>

function documentDirection(): LayoutDirection {
  if (typeof document === 'undefined') return 'ltr'
  return getComputedStyle(document.documentElement).direction === 'rtl' ? 'rtl' : 'ltr'
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ExperimentalDrawer({
  open,
  onOpenChange,
  sidebar,
  sidebarLabel,
  children,
  motion = 'overlay',
  edgeOpen = true,
  layoutDirection,
  panelClassName,
  panelStyle,
}: ExperimentalDrawerProps) {
  const [direction] = useState<LayoutDirection>(() => layoutDirection ?? documentDirection())
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const overlaySourceRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const invokerRef = useRef<Element | null>(null)
  const latest = useRef<DrawerOptions>({ motion, direction, edgeOpen, open, reducedMotion: false })
  const commitRef = useRef(onOpenChange)
  // Read by input handlers, which always run after this commit's layout effects.
  useLayoutEffect(() => {
    latest.current = { motion, direction, edgeOpen, open, reducedMotion: prefersReducedMotion() }
    commitRef.current = onOpenChange
  })
  const [width, setWidth] = useState(0)

  const [runtime] = useState(() => {
    const scope = createGestureScope()
    let content: PaneContent | null = null
    const elements = (): DrawerElements | undefined => {
      const root = rootRef.current
      const contentElement = contentRef.current
      const overlaySource = overlaySourceRef.current
      const scrim = scrimRef.current
      const panel = panelRef.current
      if (!root || !contentElement || !overlaySource || !scrim || !panel) return undefined
      return { root, content: contentElement, overlaySource, scrim, panel }
    }
    const controller = createDrawerController({
      scope,
      pane: () => content,
      elements,
      options: () => latest.current,
      commit: next => commitRef.current(next),
    })
    const pane: PaneGestureScope = {
      scope,
      publishContent(next) {
        content = next
        controller.refresh()
      },
      content: () => content,
      contentSourceBorrowed: () => controller.borrowsContentSource(),
    }
    return { scope, controller, pane }
  })
  const { scope, controller, pane } = runtime

  useLayoutEffect(() => controller.register(), [controller])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    return scope.bind(root)
  }, [scope])

  // Pane geometry: the drawer's width follows the pane, and a change retires the generation.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => {
      const paneWidth = content.getBoundingClientRect().width
      controller.layout(paneWidth)
      setWidth(controller.width)
      // The overlay's private scroller rests two panes in, with travel either way.
      const source = overlaySourceRef.current
      if (source && controller.driver !== 'scroll') source.scrollLeft = source.clientWidth * 2
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [controller])

  useLayoutEffect(() => controller.refresh(), [controller, motion])

  useLayoutEffect(() => {
    controller.syncCommitted(open)
  }, [controller, open])

  // Focus: into the sidebar when it opens, back to the invoking control when it closes.
  const wasOpen = useRef(open)
  useLayoutEffect(() => {
    if (open === wasOpen.current) return
    wasOpen.current = open
    const panel = panelRef.current
    if (open && panel) {
      if (!invokerRef.current) invokerRef.current = document.activeElement
      const first = panel.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panel).focus({ preventScroll: true })
      return
    }
    const invoker = invokerRef.current
    invokerRef.current = null
    if (invoker instanceof HTMLElement && invoker.isConnected)
      invoker.focus({ preventScroll: true })
  }, [open])

  const handle = useMemo<ExperimentalDrawerHandle>(() => {
    const request = (next: boolean) => {
      if (next) invokerRef.current = document.activeElement
      controller.request(next)
    }
    return {
      open,
      show: () => request(true),
      hide: () => request(false),
      toggle: () => request(!open),
      label: open ? 'Hide sidebar' : 'Show sidebar',
    }
  }, [controller, open])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    handle.hide()
  }

  const side = direction === 'rtl' ? 'right' : 'left'
  const panel = (
    <aside
      ref={panelRef}
      data-satin-drawer-panel="true"
      data-satin-drawer-close-zone="true"
      role="dialog"
      aria-modal="true"
      aria-label={sidebarLabel}
      aria-hidden={open ? undefined : true}
      inert={!open}
      tabIndex={-1}
      dir={direction}
      className={panelClassName}
      style={panelStyle}
    >
      {sidebar}
    </aside>
  )
  const overlay = motion === 'overlay'
  return (
    <DrawerHandleContext value={handle}>
      <PaneGestureScopeContext value={pane}>
        <div
          ref={rootRef}
          data-satin-drawer="root"
          data-satin-drawer-motion={motion}
          data-satin-drawer-side={side}
          data-satin-drawer-open={open ? 'true' : undefined}
          style={{ '--satin-drawer-width': `${width}px` } as CSSProperties}
          onKeyDown={onKeyDown}
        >
          {!overlay && <div data-satin-drawer-underlay="true">{panel}</div>}
          <div ref={contentRef} data-satin-drawer-content="true" inert={open}>
            {children}
          </div>
          <div ref={overlaySourceRef} data-satin-drawer-overlay-source="true">
            <div data-satin-drawer-track="true">
              <div data-satin-drawer-layer="true">
                <div
                  ref={scrimRef}
                  data-satin-drawer-scrim="true"
                  data-satin-drawer-close-zone="true"
                  aria-hidden="true"
                  onClick={() => handle.hide()}
                />
                {overlay && panel}
              </div>
            </div>
          </div>
        </div>
      </PaneGestureScopeContext>
    </DrawerHandleContext>
  )
}
