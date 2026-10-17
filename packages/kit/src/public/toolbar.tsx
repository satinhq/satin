import { readDeviceIdiom } from '../layout/deviceIdiom.ts'
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ToolbarMaterialContext } from '../glass/toolbarMaterialContext.ts'
import type { Slots, ToolbarSlot } from './screenChrome.tsx'

// Toolbar items render into the slot elements their Screen registered for its entry, through a
// portal, so they keep the screen's React context while drawing in the navigation bar.

/** A `bottomBar` toolbar item joins its screen's bottom inset chain (registered by Screen). */
export const BottomBarRegistrationContext = createContext<(() => () => void) | null>(null)
/** A `DefaultToolbarItem kind="search"` reports the element it holds in the bottom bar. */
export const SearchToolbarItemContext = createContext<
  ((element: HTMLElement | null) => void) | null
>(null)
/** A toolbar item's placement and content. `automatic` lets the bar choose; `bottomBar` puts it
 * in the bottom toolbar. */
export type ToolbarItemProps = {
  placement:
    | 'subtitle'
    | 'largeTitle'
    | 'largeSubtitle'
    | 'principal'
    | 'topBarLeading'
    | 'topBarTrailing'
    | 'primaryAction'
    | 'confirmationAction'
    | 'cancellationAction'
    | 'automatic'
    | 'bottomBar'
  children?: ReactNode
}
export const ToolbarContext = createContext<boolean | 'group'>(false)
export const ToolbarConfirmationContext = createContext(false)
const toolbarPlacement: Record<ToolbarItemProps['placement'], ToolbarSlot> = {
  principal: 'principal',
  subtitle: 'subtitle',
  largeTitle: 'largeTitle',
  largeSubtitle: 'largeSubtitle',
  topBarLeading: 'topBarLeading',
  topBarTrailing: 'trailing',
  primaryAction: 'trailing',
  confirmationAction: 'trailing',
  cancellationAction: 'leading',
  automatic: 'trailing',
  bottomBar: 'bottom',
}
export const ToolbarSlotsContext = createContext<Slots>({})
/** Places one item in the navigation bar or the bottom toolbar. Adjacent actions share a glass
 * capsule; a `ToolbarSpacer` separates groups. */
export function ToolbarItem({ children, placement }: ToolbarItemProps) {
  const slots = useContext(ToolbarSlotsContext)
  const registerBottomBar = useContext(BottomBarRegistrationContext)
  const slot = toolbarPlacement[placement]
  const destination = slots[slot] ?? (slot === 'topBarLeading' ? slots.leading : undefined)
  useLayoutEffect(() => {
    if (slot === 'bottom' && destination) return registerBottomBar?.()
  }, [slot, destination, registerBottomBar])
  // A spacer inside an item (the pre-reference spelling) separates items like a direct ToolbarSpacer.
  const spacer = isValidElement(children) && children.type === ToolbarSpacer
  return destination
    ? createPortal(
        <div data-satin-toolbar-item={spacer ? 'spacer' : 'item'}>
          <ToolbarMaterialContext
            value={!['subtitle', 'largeTitle', 'largeSubtitle'].includes(slot)}
          >
            <ToolbarContext value={!['subtitle', 'largeTitle', 'largeSubtitle'].includes(slot)}>
              <ToolbarConfirmationContext value={placement === 'confirmationAction'}>
                {children}
              </ToolbarConfirmationContext>
            </ToolbarContext>
          </ToolbarMaterialContext>
        </div>,
        destination,
      )
    : null
}
/** Which system item to place, and where. Only `search` exists. */
export type DefaultToolbarItemProps = {
  /** The system item. Only `search` is drawn. */
  kind: 'search'
  placement?: 'bottomBar' | 'automatic'
}
/** Places the screen's search field among its bottom toolbar items. The screen must be
 * `searchable`. */
export function DefaultToolbarItem({ kind }: DefaultToolbarItemProps) {
  const slots = useContext(ToolbarSlotsContext)
  const report = useContext(SearchToolbarItemContext)
  // iPad search is owned by the navigation column's trailing slot.
  const destination = readDeviceIdiom() === 'pad' ? undefined : slots.bottom
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    report?.(element)
    return () => report?.(null)
  }, [report, element])
  return destination && kind === 'search'
    ? createPortal(
        <div ref={setElement} data-satin-toolbar-item="search" data-satin-search-toolbar-host="" />,
        destination,
      )
    : null
}
/** The spacer's sizing and placement. */
export type ToolbarSpacerProps = {
  /** `fixed` separates two items' glass by the standard 12 pt gap; `flexible`, the default,
   * takes the free space of the bar. */
  sizing?: 'fixed' | 'flexible'
  placement?: ToolbarItemProps['placement']
}
/** Splits toolbar items into separate glass capsules. Consecutive items of one placement share
 * one capsule; a spacer between them splits it. Place it directly in `toolbar`, next to the
 * items. */
export function ToolbarSpacer({
  sizing = 'flexible',
  placement = 'automatic',
}: ToolbarSpacerProps) {
  const slots = useContext(ToolbarSlotsContext)
  const inItem = useContext(ToolbarContext) !== false
  const spacer = <span aria-hidden="true" data-satin-toolbar-spacer={sizing} />
  if (inItem) return spacer
  const slot = toolbarPlacement[placement]
  const destination = slots[slot] ?? (slot === 'topBarLeading' ? slots.leading : undefined)
  return destination ? createPortal(spacer, destination) : null
}
/** Groups several items under one placement. They render as consecutive `ToolbarItem`s and share
 * one glass capsule. */
export function ToolbarItemGroup({ children, placement }: ToolbarItemProps) {
  // gives confirmation actions separate capsules, even inside a group.
  if (placement === 'confirmationAction')
    return (
      <ToolbarItem placement={placement}>
        <div data-satin-toolbar-confirmation-group="true">{children}</div>
      </ToolbarItem>
    )
  return (
    <>
      {Children.toArray(children).map((child, index) => (
        <ToolbarItem
          key={isValidElement(child) && child.key !== null ? child.key : index}
          placement={placement}
        >
          {child}
        </ToolbarItem>
      ))}
    </>
  )
}
