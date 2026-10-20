// EXPERIMENTAL, PRIVATE (exported from the internal entry only). A sidebar, content list and
// detail container that chooses its arrangement from its own available width:
//
// - three columns when sidebar + content + detail fit (respecting a remembered hide);
// - content + detail with a temporary overlay sidebar when two fit;
// - the compact stack (`compact`, typically a navigation stack of list then detail) with a
//   temporary sidebar otherwise.
//
// Selection, detail path and sidebar preference are app state passed in; resizing never
// clears them. Pane subtrees remount when the arrangement changes (see the notes).

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ExperimentalDrawer } from './ExperimentalDrawer.tsx'
import type { DrawerMotion } from './drawerMotion.ts'
import { PROVISIONAL_COLUMN_MINIMUMS, chooseThreePaneLayout } from './threePaneLayout.ts'

export type ExperimentalThreePaneProps = Readonly<{
  sidebar: ReactNode
  sidebarLabel: string
  content: ReactNode
  detail: ReactNode
  /** The compact arrangement's content: list and detail in one navigation stack. */
  compact: ReactNode
  /** Persistent preference: hide the sidebar column in the three-column arrangement. */
  sidebarHidden: boolean
  /** Temporary drawer visibility (two-column, compact and hidden three-column). */
  drawerOpen: boolean
  onDrawerOpenChange: (open: boolean) => void
  motion?: DrawerMotion
  panelClassName?: string
  panelStyle?: CSSProperties
}>

export function ExperimentalThreePane({
  sidebar,
  sidebarLabel,
  content,
  detail,
  compact,
  sidebarHidden,
  drawerOpen,
  onDrawerOpenChange,
  motion = 'overlay',
  panelClassName,
  panelStyle,
}: ExperimentalThreePaneProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => setAvailableWidth(root.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])
  const layout = chooseThreePaneLayout(availableWidth, sidebarHidden)
  const columns = (
    <div data-satin-three-pane-columns={layout.arrangement === 'compact' ? undefined : 'true'}>
      <div data-satin-three-pane-pane="content">{content}</div>
      <div data-satin-three-pane-pane="detail">{detail}</div>
    </div>
  )
  const style = {
    '--satin-three-pane-sidebar': `${PROVISIONAL_COLUMN_MINIMUMS.sidebar}px`,
    '--satin-three-pane-content': `${PROVISIONAL_COLUMN_MINIMUMS.content}px`,
  } as CSSProperties
  let body: ReactNode
  if (!layout.sidebarTemporary) {
    body = (
      <div data-satin-three-pane-columns="true" data-satin-three-pane-with-sidebar="true">
        <nav
          data-satin-three-pane-pane="sidebar"
          aria-label={sidebarLabel}
          className={panelClassName}
          style={panelStyle}
        >
          {sidebar}
        </nav>
        <div data-satin-three-pane-pane="content">{content}</div>
        <div data-satin-three-pane-pane="detail">{detail}</div>
      </div>
    )
  } else {
    body = (
      <ExperimentalDrawer
        open={drawerOpen}
        onOpenChange={onDrawerOpenChange}
        sidebar={sidebar}
        sidebarLabel={sidebarLabel}
        motion={motion}
        panelClassName={panelClassName}
        panelStyle={panelStyle}
      >
        {layout.arrangement === 'compact' ? compact : columns}
      </ExperimentalDrawer>
    )
  }
  return (
    <div
      ref={rootRef}
      data-satin-three-pane={layout.arrangement}
      data-satin-three-pane-measured={availableWidth > 0 ? 'true' : undefined}
      style={style}
    >
      {availableWidth > 0 ? body : null}
    </div>
  )
}
