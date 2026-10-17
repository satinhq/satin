import { createBottomInsetGeometry } from './bottomInsetGeometry.ts'
import { installKeyboardCarrier } from './keyboardCarrier.ts'
import { editable } from '../keyboard/adapter.ts'
import { IgnoresSafeAreaContext } from './context.ts'
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'

/** Whether an enclosing SafeAreaInset already owns the bottom boundary (keyboard, home indicator). */
export const BottomInsetContext = createContext<{
  consumed: boolean
  geometry?: ReturnType<typeof createBottomInsetGeometry>
}>({ consumed: false })
/** `VerticalEdge`/`HorizontalEdge`: `leading` and `trailing` follow the layout direction. */
export type SafeAreaInsetEdge = 'top' | 'bottom' | 'leading' | 'trailing'
/** The edge, the accessory (`content`) and its spacing; `children` is the content it insets. */
export type SafeAreaInsetProps = Omit<HTMLAttributes<HTMLDivElement>, 'content'> &
  Readonly<{
    edge: SafeAreaInsetEdge
    content: ReactNode
    /*
     * `safeAreaInset(edge:spacing:)`: room between the content and the inset. Defaults to
     * the system spacing, 8 pt (iOS 27 native reference: the last line sits 8 pt higher than with `spacing: 0`).
     */
    spacing?: number
  }>

/** Default spacing between content and a safe-area inset. */
const SYSTEM_INSET_SPACING_PX = 8
const ACCESSORY_INSET_SCOPE = { consumed: true }

/**
 * `safeAreaInset(edge:spacing:content:)`. The accessory takes room from the content's safe
 * area on its edge; a scroll view inside still spans the whole frame and scrolls under it.
 *
 * Bottom: content can scroll under the accessory; its terminal anchor clears it.
 * The accessory's height reaches the content's scroll inset in the same frame it changes (CSS
 * `--satin-inset-accessory-height`, written by its resize observer), so a composer that grows by
 * a line keeps the newest message above it with no frame between.
 */
export function SafeAreaInset({
  edge,
  content,
  spacing = SYSTEM_INSET_SPACING_PX,
  children,
  ...props
}: SafeAreaInsetProps) {
  if (edge !== 'bottom')
    return (
      <EdgeInset {...props} edge={edge} content={content} spacing={spacing}>
        {children}
      </EdgeInset>
    )
  return (
    <BottomInset {...props} content={content} spacing={spacing}>
      {children}
    </BottomInset>
  )
}

type InsetBodyProps = Omit<SafeAreaInsetProps, 'edge' | 'spacing'> & Readonly<{ spacing: number }>

function BottomInset({ content, spacing, children, ...props }: InsetBodyProps) {
  const edge = 'bottom'
  const geometry = useMemo(createBottomInsetGeometry, [])
  const scope = useMemo(() => ({ consumed: true, geometry }), [geometry])
  const contentElement = useRef<HTMLDivElement>(null)
  const parent = useContext(BottomInsetContext)
  const measuredHeight = useRef(0)
  const systemInset = useRef(0)
  const publish = useCallback(
    (measuredExtension?: number) => {
      const content = contentElement.current
      if (!content) return
      // Read the resolved system extension, not a registered property whose value
      // WebKit can retain from the previous resize. Accessory height does not change it.
      const extension =
        measuredExtension ?? (-Number.parseFloat(getComputedStyle(content).marginBottom) || 0)
      geometry.publish((parent.geometry?.value ?? 0) + measuredHeight.current + spacing + extension)
    },
    [geometry, parent.geometry, spacing],
  )
  // `IgnoresSafeArea regions="keyboard"` around the inset: the boundary stays above the home
  // indicator while the keyboard is up `ignoresSafeArea(.keyboard)`.
  const keyboardIgnored = useContext(IgnoresSafeAreaContext).keyboard
  const inset = useRef<HTMLDivElement>(null)
  const accessory = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const host = inset.current
    const element = accessory.current
    if (!host || !element) return
    const measure = () => {
      const property = '--satin-inset-accessory-height'
      measuredHeight.current = element.getBoundingClientRect().height
      const height = `${measuredHeight.current}px`
      const content = contentElement.current
      // Finish geometry reads before the height write invalidates the transcript's layout.
      const extension = content
        ? -Number.parseFloat(getComputedStyle(content).marginBottom) || 0
        : 0
      systemInset.current = extension
      if (host.style.getPropertyValue(property) !== height) host.style.setProperty(property, height)
      publish(extension)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    // System padding and the content extension can cancel in the scrollport size.
    // The boundary content box still changes, so it must be observed as well.
    observer.observe(host)
    // Rotation, keyboard avoidance and tab coverage can change the system contribution too.
    if (contentElement.current) observer.observe(contentElement.current)
    return () => observer.disconnect()
  }, [publish])
  useLayoutEffect(() => {
    if (inset.current) return parent.geometry?.attach(inset.current, publish, geometry)
  }, [parent.geometry, publish, geometry])
  useLayoutEffect(publish, [publish, spacing])
  // The root boundary moves with the keyboard on the compositor (keyboardCarrier.ts). A TabView's
  // boundary keeps its tab bar behind the keyboard and only pads its content cell: not carried.
  const carried = !parent.consumed && !keyboardIgnored
  useLayoutEffect(() => {
    const host = inset.current
    const element = accessory.current
    if (!carried || !host || !element) return
    if (host.parentElement?.hasAttribute('data-satin-tab-view')) return
    return installKeyboardCarrier(host, element, geometry, () => ({
      systemInset: systemInset.current,
      accessoryHeight: measuredHeight.current,
      // Tab-hosted boundaries own covered rows and are excluded above.
      coveredRows: 0,
    }))
  }, [carried, geometry])
  // Native controls never end editing. WebKit moves focus at a press's mouse-down, so a press on
  // an accessory control (Send) would take the keyboard down with the field beside it.
  const keepEditing = (event: MouseEvent<HTMLDivElement>) => {
    if (editable(document.activeElement) && !editable(event.target)) event.preventDefault()
  }
  return (
    <div
      {...props}
      style={{ ...props.style, ['--satin-inset-spacing' as string]: `${spacing}px` }}
      ref={inset}
      data-satin-safe-area-inset={edge}
      data-satin-bottom-boundary={parent.consumed ? 'nested' : 'root'}
      data-satin-keyboard-ignored={keyboardIgnored || undefined}
    >
      <BottomInsetContext value={scope}>
        <div ref={contentElement} data-satin-inset-content="true">
          {children}
        </div>
        <BottomInsetContext value={ACCESSORY_INSET_SCOPE}>
          <div ref={accessory} data-satin-inset-accessory="true" onMouseDown={keepEditing}>
            {content}
          </div>
        </BottomInsetContext>
      </BottomInsetContext>
    </div>
  )
}

/*
 * Top, leading and trailing insets join the same chain as the bottom one:
 * - top: the accessory sits at the safe area's top edge (below the bar, or below a large title)
 *   and adds its height plus `spacing` to the content's top inset (`--satin-scroll-inset-top`), as
 *   native adds it to the scroll view's adjusted inset (iOS 27 native reference `inset-top`: 116 + 44.33 + 8);
 * - leading/trailing: the accessory is a column of the safe area's height and the content's frame
 *   gives up its width plus `spacing` (`inset-leading`: strip 0–60, cards from 68).
 * A background drawn by the accessory's root view reaches the screen's top edge. An accessory
 * `background` ignores the safe area by default (`inset-top`: the yellow fills 0–160.33).
 */
function EdgeInset({
  edge,
  content,
  spacing,
  children,
  ...props
}: InsetBodyProps & Readonly<{ edge: Exclude<SafeAreaInsetEdge, 'bottom'> }>) {
  const accessory = useRef<HTMLDivElement>(null)
  const inset = useRef<HTMLDivElement>(null)
  const bottom = useContext(BottomInsetContext)
  useLayoutEffect(() => {
    if (edge !== 'top' && accessory.current) return bottom.geometry?.attach(accessory.current)
  }, [bottom.geometry, edge])
  useLayoutEffect(() => {
    const host = inset.current
    const element = accessory.current
    if (!host || !element || edge !== 'top') return
    const measure = () =>
      host.style.setProperty(
        '--satin-inset-accessory-height',
        `${element.getBoundingClientRect().height}px`,
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [edge])
  return (
    <div
      {...props}
      style={{ ...props.style, ['--satin-inset-spacing' as string]: `${spacing}px` }}
      ref={inset}
      data-satin-safe-area-inset={edge}
    >
      <div data-satin-inset-content="true">{children}</div>
      <div ref={accessory} data-satin-inset-accessory={edge}>
        {content}
      </div>
    </div>
  )
}
