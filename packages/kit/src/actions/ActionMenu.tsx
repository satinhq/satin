import { SymbolImage } from '../symbols/Symbol.tsx'
import { ownMenuCompatibilityClick } from '../press/contactReceipt.ts'
import { SensoryButton, type SensoryButtonProps } from '../haptics/SensoryButton.tsx'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { Action, ActionItem } from './types.ts'

const menuActivations = new WeakMap<HTMLElement, () => void>()

/** Keep the same glyph and box when a submenu title returns to its parent row. */
export function MenuChevron({ title = false }: { title?: boolean }) {
  return (
    <span
      role="presentation"
      data-satin-submenu-chevron="true"
      style={title ? undefined : { transform: 'rotate(-90deg)' }}
    >
      <SymbolImage name="chevron.down" />
    </span>
  )
}

export function activateMenuAction(element: HTMLElement) {
  ownMenuCompatibilityClick(element.ownerDocument)
  menuActivations.get(element)?.()
}
/** A menu row: activated by taps, keyboard and menu contacts alike (activateMenuAction). */
export function ActionButton({
  onPress,
  disabled,
  ...props
}: Omit<SensoryButtonProps, 'onPress'> & { onPress: () => void }) {
  const activate = () => {
    if (!disabled) onPress()
  }
  return (
    <SensoryButton
      {...props}
      disabled={disabled}
      onPress={activate}
      ref={element => {
        if (!element) return
        menuActivations.set(element, activate)
        return () => {
          menuActivations.delete(element)
        }
      }}
    />
  )
}

export function menuKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented) return
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      ':is([role="menuitem"], [role="menuitemradio"])',
    ),
  ].filter(item => !item.disabled && item.getAttribute('aria-disabled') !== 'true')
  const index = items.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement)
  const next =
    event.key === 'ArrowDown'
      ? (index + 1) % items.length
      : event.key === 'ArrowUp'
        ? (index + items.length - 1) % items.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : -1
  if (next >= 0) {
    event.preventDefault()
    event.stopPropagation()
    items[next]?.focus()
  }
}
/** A row that opens a nested menu. */
export type SubmenuAction = Extract<Action, { submenu: readonly Action[] }>

/**
 * One level of a menu: its rows, sections and keyboard traversal. Nested menus are separate
 * levels drawn by the menu stack (glass/MenuStack.tsx); this level only reports which submenu row
 * was chosen and shows which one is open.
 */
export function ActionMenu({
  actions,
  select,
  openSubmenu,
  expandedId,
  onBack,
  header,
}: {
  actions: readonly Action[]
  select: (action: ActionItem) => void
  /** A submenu row was chosen. */
  openSubmenu?: (action: SubmenuAction, row: HTMLButtonElement) => void
  /** The id of the row whose submenu is open above this level. */
  expandedId?: string
  /** Leave this level for its parent (Left arrow). Only nested levels have one. */
  onBack?: () => void
  /** A nested level's title row, drawn above its rows and reached by the arrow keys. */
  header?: ReactNode
}) {
  // Beside sections, a run of loose actions is its own unlabelled section: native separates it
  // from its neighbours like any section (iOS 27.0 native reference: "Delete List" after Section("View")).
  const sectioned = (items: readonly Action[]): Action[] => {
    if (!items.some(action => 'section' in action)) return [...items]
    const grouped: Action[] = []
    for (const action of items) {
      const last = grouped.at(-1)
      if ('section' in action) grouped.push(action)
      else if (last && 'section' in last && loose.has(last)) (last.section as Action[]).push(action)
      else {
        const run = { section: [action] as Action[] }
        loose.add(run)
        grouped.push(run)
      }
    }
    return grouped
  }
  const loose = new WeakSet<Action>()
  const renderActions = (items: readonly Action[]) =>
    sectioned(items).map((action, index) =>
      'section' in action ? (
        <div
          role="group"
          aria-label={action.label}
          data-satin-action-section="true"
          key={`section-${index}`}
        >
          {action.label && (
            <div data-satin-action-section-header="true" aria-hidden="true">
              {action.label}
            </div>
          )}
          {renderActions(action.section)}
        </div>
      ) : (
        <ActionButton
          role={'checked' in action && action.checked !== undefined ? 'menuitemradio' : 'menuitem'}
          aria-checked={'checked' in action ? action.checked : undefined}
          key={action.id}
          disabled={action.disabled}
          data-satin-action-id={action.id}
          data-destructive={('role' in action && action.role === 'destructive') || undefined}
          data-satin-submenu-open={('submenu' in action && action.id === expandedId) || undefined}
          aria-haspopup={'submenu' in action ? 'menu' : undefined}
          aria-expanded={'submenu' in action ? action.id === expandedId : undefined}
          onPress={() => {
            if (!('submenu' in action)) select(action)
            else if (openSubmenu) {
              const row = rowElement(action.id)
              if (row) openSubmenu(action, row)
            }
          }}
        >
          {'checked' in action && action.checked !== undefined && (
            <span data-satin-action-check="true" aria-hidden="true">
              {action.checked ? '✓' : ''}
            </span>
          )}
          {action.icon ?? (action.symbol ? <SymbolImage name={action.symbol} /> : null)}
          <span data-satin-action-label="true">{action.label}</span>
          {'submenu' in action ? <MenuChevron /> : <span role="presentation" />}
        </ActionButton>
      ),
    )
  const container = useRef<HTMLDivElement>(null)
  const rowElement = (id: string) =>
    [
      ...(container.current?.querySelectorAll<HTMLButtonElement>('[data-satin-action-id]') ?? []),
    ].find(row => row.dataset.satinActionId === id)
  return (
    <div
      ref={container}
      role="menu"
      data-satin-action-menu="true"
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' && onBack) {
          event.preventDefault()
          event.stopPropagation()
          onBack()
        } else if (
          event.key === 'ArrowRight' &&
          (event.target as HTMLElement).getAttribute('aria-haspopup') === 'menu'
        ) {
          event.preventDefault()
          event.stopPropagation()
          activateMenuAction(event.target as HTMLElement)
        } else menuKeyDown(event)
      }}
    >
      {header}
      {renderActions(actions)}
    </div>
  )
}
