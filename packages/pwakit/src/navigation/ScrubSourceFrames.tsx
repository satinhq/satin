import type { CSSProperties, ReactNode, RefObject } from 'react'

// The private horizontal scrollers an installed back swipe drives (nativeScrubSource.ts). Each is
// a scroller over a track five panes wide, with its content held sticky at the track's left edge:
// scrolling moves no content, and the page tracks follow the scroll offset through a
// ScrollTimeline. Without native navigation every layer is `display: contents`, so the DOM keeps
// one shape across layouts.

const contents: CSSProperties = { display: 'contents' }

/** Five panes wide: a source at rest sits two panes in (clientWidth * 2), leaving two panes of
 * travel either way (see stackScrubHostStyle). */
const scrubTrack: CSSProperties = { width: '500%', height: '100%' }

/** The stack host's own style while it is the sticky content of the stack's scrub source. Keep
 * the visual pop endpoint inside the private native scroll range: at the physical boundary
 * WebKit can briefly recommit an older timeline sample when asynchronous scrolling ends. One
 * pane of constant effects beyond either endpoint makes that transfer independent of the pose. */
// A framework module, not an app file: fast refresh never reloads it on its own.
// oxlint-disable-next-line react/only-export-components
export const stackScrubHostStyle: CSSProperties = {
  position: 'sticky',
  transform: 'translateZ(0)',
  width: '20%',
  left: 0,
  top: 0,
  right: 'auto',
  bottom: 'auto',
}

export function StackScrubSource({
  enabled,
  sourceRef,
  children,
}: {
  enabled: boolean
  sourceRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  return (
    <div
      ref={sourceRef}
      data-satin-native-scrub={enabled ? 'true' : undefined}
      style={
        enabled
          ? {
              position: 'absolute',
              inset: 0,
              // Keep the source mounted across pushes and takeovers. Retirement briefly
              // disables overflow to stop UIKit consuming the next tap as a momentum stop.
              // Content owns touch-action. The private source never narrows it.
              overflowX: 'scroll',
              overflowY: 'hidden',
              overscrollBehaviorX: 'none',
              scrollbarWidth: 'none',
            }
          : contents
      }
    >
      <div style={enabled ? scrubTrack : contents}>{children}</div>
    </div>
  )
}

/** The split layout's detail column scrub source, beside the sidebar (`left`). */
export function DetailScrubSource({
  enabled,
  sourceRef,
  left,
  children,
}: {
  enabled: boolean
  sourceRef: RefObject<HTMLDivElement | null>
  left: number
  children: ReactNode
}) {
  return (
    <div
      ref={sourceRef}
      data-satin-detail-scrub={enabled ? 'true' : undefined}
      style={
        enabled
          ? {
              position: 'absolute',
              left,
              right: 0,
              // Floating regular-width tabs reserve content inset, not pane space.
              top: 0,
              bottom: 0,
              // Always a scroller; content retains its own touch-action policy.
              overflowX: 'scroll',
              overflowY: 'hidden',
              overscrollBehaviorX: 'none',
              scrollbarWidth: 'none',
            }
          : contents
      }
    >
      <div style={enabled ? scrubTrack : contents}>
        <div
          data-satin-detail-content="true"
          style={
            enabled
              ? {
                  position: 'sticky',
                  transform: 'translateZ(0)',
                  width: '20%',
                  height: '100%',
                  left: 0,
                  top: 0,
                }
              : contents
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
}
