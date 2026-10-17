import { useContext, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import type { ContentAlignment } from '../content/content.tsx'
import { BottomInsetContext } from './SafeAreaInset.tsx'

// Overlay content is already inside the parent's reduced safe area. Its descendants consume
// only their own local insets and inherit the parent's keyboard transform.
const CONTENT_SCOPE = { consumed: true }

/** The layered `content` and its alignment. The children set the frame. */
export type OverlayProps = Omit<HTMLAttributes<HTMLDivElement>, 'content'> &
  Readonly<{
    alignment?: ContentAlignment
    content: ReactNode
  }>

/** Layers `content` over its children without changing their frame. Inside a `SafeAreaInset`, the
 * overlay keeps to the reduced safe area and moves with the keyboard, like the composer. */
export function Overlay({ alignment = 'center', content, children, ...props }: OverlayProps) {
  const { geometry, consumed } = useContext(BottomInsetContext)
  const layer = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (layer.current) return geometry?.attach(layer.current)
  }, [geometry, alignment])
  const vertical = alignment.startsWith('top')
    ? 'start'
    : alignment.startsWith('bottom')
      ? 'end'
      : 'center'
  const horizontal = alignment.toLowerCase().endsWith('leading')
    ? 'start'
    : alignment.toLowerCase().endsWith('trailing')
      ? 'end'
      : 'center'
  return (
    <div {...props} data-satin-overlay="true">
      {children}
      <div
        ref={layer}
        data-satin-overlay-layer={alignment}
        data-satin-overlay-inset={consumed || undefined}
        style={{ alignItems: vertical, justifyItems: horizontal }}
      >
        <div data-satin-overlay-content="true">
          <BottomInsetContext value={CONTENT_SCOPE}>{content}</BottomInsetContext>
        </div>
      </div>
    </div>
  )
}
