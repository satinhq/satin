import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GlassEffect, GlassLayer } from '../glass/GlassEffect.tsx'
import { GlassMaterialContext } from '../glass/context.ts'
import { MaterialEffectContext } from '../glass/liquidContext.ts'
import { Glass } from '../glass/regions.ts'
import { holdPresentationForGlass } from '../presentation/glassReady.ts'

// Stock iPad tab sidebars paint to the pane edges in both column and overlay
// presentations. Rounding the material leaves gaps inside the full-height frame.
const shape = { kind: 'roundedRectangle', cornerRadius: 0, cornerStyle: 'continuous' } as const

/** The sidebar is chrome over the page even when landscape reserves a content column. */
export function TabSidebarSurface({
  children,
  overlay,
  onDismiss,
}: {
  children: ReactNode
  overlay: boolean
  onDismiss: () => void
}) {
  const material = useContext(GlassMaterialContext)
  const liquid = useContext(MaterialEffectContext)
  const panel = useRef<HTMLElement>(null)
  const dim = useRef<HTMLButtonElement>(null)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  const chrome = material?.chromeLayer
  useLayoutEffect(() => {
    const element = panel.current,
      regions = liquid?.regions
    if (!element || !regions) return
    return holdPresentationForGlass(
      element,
      dim.current,
      [],
      () => regions.invalidate(),
      undefined,
      undefined,
      { inert: true, onFailure: () => dismiss.current() },
    )
  }, [chrome, liquid?.regions])
  const surface = (
    <>
      {overlay && (
        <button
          ref={dim}
          type="button"
          data-satin-tab-sidebar-dim="true"
          aria-label="Dismiss Tab Sidebar"
          onClick={onDismiss}
        />
      )}
      <aside
        ref={panel}
        data-satin-tab-sidebar="true"
        data-satin-tab-sidebar-modal={overlay || undefined}
        aria-label="App tabs"
      >
        <GlassLayer attachment="fixed" style={{ inset: 0, width: 280, pointerEvents: 'none' }}>
          <GlassEffect glass={Glass.sheet} shape={shape} style={{ height: '100%' }} />
        </GlassLayer>
        {children}
      </aside>
    </>
  )
  return chrome ? createPortal(surface, chrome) : surface
}
