import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react'
import type { NamespaceID } from '../motion/matchedGeometry.tsx'
import { NavigatorContext } from '../navigation/navigationContext.tsx'
import { installZoomDismissDrag } from '../navigation/zoomDrag.ts'
import { registerTransitionSource, registerZoomRequest } from '../navigation/zoomTransition.ts'

const brand: unique symbol = Symbol('satin.navigationTransition')

/**
 * How a pushed screen arrives and leaves: `automatic` (a slide) or `zoom`. Give one to
 * `Screen`'s `navigationTransition`.
 */
export type NavigationTransition = Readonly<{
  [brand]: true
  kind: 'automatic' | 'zoom'
  sourceID?: string
  namespace?: NamespaceID
}>

/** The source identity and namespace for `NavigationTransition.zoom`. */
export type ZoomTransitionOptions = Readonly<{
  /** The id of the `MatchedTransitionSource` the screen zooms out of and back into. */
  sourceID: string
  in: NamespaceID
}>

/** Transitions between retained navigation entries. */
export const NavigationTransition: Readonly<{
  automatic: NavigationTransition
  zoom: (options: ZoomTransitionOptions) => NavigationTransition
}> = Object.freeze({
  /** The platform's push: the screen slides in from the trailing edge. */
  automatic: Object.freeze({ [brand]: true as const, kind: 'automatic' as const }),
  /** The screen grows out of its source view, and shrinks back into it when it is popped or
   * dragged down. */
  zoom: ({ sourceID, in: namespace }: ZoomTransitionOptions) =>
    Object.freeze({ [brand]: true as const, kind: 'zoom' as const, sourceID, namespace }),
})

/** The source's id and namespace, and the one element the screen zooms out of. */
export type MatchedTransitionSourceProps = Readonly<{
  /** The id a `NavigationTransition.zoom` names as its `sourceID`. */
  id: string
  in: NamespaceID
  /** One element: the view the screen zooms out of. Its corner radius is the zoom's start. */
  children: ReactNode
}>

/**
 * Marks the view a zoom transition starts from and returns to. A push zooms only while its
 * source is on screen; otherwise it slides as usual.
 * @example
 * <MatchedTransitionSource id={album.id} in={albumZoom}>
 *   <Image src={album.artwork} alt="" />
 * </MatchedTransitionSource>
 * @experimental Pushed screens only; `FullScreenCover` and `Sheet` zooms are not available yet.
 */
export function MatchedTransitionSource({
  id,
  in: namespace,
  children,
}: MatchedTransitionSourceProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  useLayoutEffect(
    () => registerTransitionSource({ namespace, id, wrapper: wrapper.current! }),
    [namespace, id],
  )
  // display: contents keeps the wrapped element in its parent's flex or grid layout.
  return (
    <div ref={wrapper} data-satin-transition-source={id} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}

/**
 * Applies a screen's `navigationTransition`: registers its zoom request and, while it is shown,
 * the downward drag that zooms it back into its source.
 */
export function useNavigationTransition(
  entryKey: string,
  transition: NavigationTransition | undefined,
) {
  const navigator = useContext(NavigatorContext)
  const sourceID = transition?.kind === 'zoom' ? transition.sourceID : undefined
  const namespace = transition?.kind === 'zoom' ? transition.namespace : undefined
  useLayoutEffect(() => {
    if (sourceID === undefined || !namespace || !navigator) return
    const unregister = registerZoomRequest(entryKey, { namespace, sourceID })
    const screen = document.querySelector<HTMLElement>(
      `[data-satin-screen-key="${CSS.escape(entryKey)}"]`,
    )
    const uninstall = screen ? installZoomDismissDrag(screen, entryKey, navigator) : undefined
    return () => {
      uninstall?.()
      unregister()
    }
  }, [entryKey, sourceID, namespace, navigator])
}
