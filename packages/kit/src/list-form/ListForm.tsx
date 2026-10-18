import type { SystemColorName } from '../public/colors.ts'
import { NavigationPaneContext } from '../navigation/navigationContext.tsx'
import { SensoryButton } from '../haptics/SensoryButton.tsx'
import { StepperButton } from './StepperButton.tsx'
import { SymbolImage, type SymbolName } from '../symbols/Symbol.tsx'
import { Menu } from '../glass/Menu.tsx'
import { observeSeparatorInsets } from './separatorInsets.ts'
import { ListRowContentContext } from './listContext.ts'
import { RowActions } from '../actions/RowActions.tsx'
import {
  ForEach,
  forEachRows,
  ListItemContext,
  ListSelectionContext,
  useEditMode,
  type ForEachProps,
  type ListItemID,
  type ListSelectionModel,
} from './editing.tsx'
import { ListItem, type ForEachItem } from './ListItem.tsx'
import { resetReorderTransforms } from './reorder.ts'
import { RowMotionCommit, RowMotionScope, useRowMotionGroup } from './rowMotionScope.tsx'
import type { ActionItem, RowActionsProps } from '../actions/types.ts'
import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useId,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  ListNavigationContext,
  ScrollSurface,
  type ScrollSurfaceProps,
} from '../scroll/ScrollSurface.tsx'
import { Pressable, type PressableProps } from '../press/Pressable.tsx'
import { DisclosureIndicator } from '../settings/DisclosureIndicator.tsx'
import type { Searchable } from '../search/searchable.ts'
import { readDeviceIdiom } from '../layout/deviceIdiom.ts'

export type ListEngineProps = Omit<ScrollSurfaceProps, 'axis'> & {
  style?: CSSProperties
  variant?: 'insetGrouped' | 'plain' | 'grouped' | 'sidebar'
  navigationTitle?: string
  navigationTitleDisplay?: 'large' | 'inline'
  /** A search field in the navigation bar drawer above this List. */
  searchable?: Searchable
  /** Default keeps measured header/footer gaps. Numbers are section gaps in points. */
  listSectionSpacing?: 'default' | 'compact' | number
  /** Controls the scroll surface background, leaving row backgrounds intact. */
  scrollContentBackground?: 'hidden' | 'visible'
  /** Selection state resolved by the public List. */
  selectionBinding?: ListSelectionBinding
}

/** A controlled List selection: one optional row, or a set of rows. */
export type ListSelectionBinding =
  | Readonly<{
      mode: 'single'
      value: ListItemID | null
      onChange: (next: ListItemID | null) => void
    }>
  | Readonly<{
      mode: 'multiple'
      value: ReadonlySet<ListItemID>
      onChange: (next: Set<ListItemID>) => void
    }>

/*
 * The selection the rows see. A tap replaces a single selection and never clears it; a set
 * selection toggles while editing and is replaced outside editing (native reference native reference `native editing fixture`
 * and `native editing fixture` retap probes). Entering edit mode clears what was selected outside it.
 */
function useSelectionModel(binding: ListSelectionBinding | undefined) {
  const [editMode] = useEditMode()
  const latest = useRef(binding)
  latest.current = binding
  const wasEditing = useRef(editMode === 'active')
  useLayoutEffect(() => {
    const entering = editMode === 'active' && !wasEditing.current
    wasEditing.current = editMode === 'active'
    const current = latest.current
    if (!entering || !current) return
    if (current.mode === 'single' && current.value !== null) current.onChange(null)
    if (current.mode === 'multiple' && current.value.size) current.onChange(new Set())
  }, [editMode])
  return useMemo<ListSelectionModel | null>(() => {
    if (!binding) return null
    return {
      mode: binding.mode,
      isSelected: id => (binding.mode === 'single' ? binding.value === id : binding.value.has(id)),
      activate(id, editing) {
        if (binding.mode === 'single') {
          if (binding.value !== id) binding.onChange(id)
          return
        }
        if (!editing) {
          if (binding.value.size !== 1 || !binding.value.has(id)) binding.onChange(new Set([id]))
          return
        }
        const next = new Set(binding.value)
        if (!next.delete(id)) next.add(id)
        binding.onChange(next)
      },
    }
  }, [binding])
}

export function List({
  children,
  className,
  variant,
  navigationTitle,
  navigationTitleDisplay = 'large',
  searchable,
  listSectionSpacing = 'default',
  scrollContentBackground,
  selectionBinding,
  ...props
}: ListEngineProps) {
  const selection = useSelectionModel(selectionBinding)
  if (
    listSectionSpacing !== 'default' &&
    listSectionSpacing !== 'compact' &&
    (typeof listSectionSpacing !== 'number' ||
      !Number.isFinite(listSectionSpacing) ||
      listSectionSpacing < 0)
  ) {
    throw new Error(
      'listSectionSpacing requires default, compact, or a finite nonnegative point value.',
    )
  }
  const pane = useContext(NavigationPaneContext)
  const resolvedVariant = variant ?? (pane === 'sidebar' ? 'sidebar' : 'insetGrouped')
  // The title and the bar's content inset belong to the screen's primary scroll view
  // (ScrollSurface): a List nested below other content keeps its own frame.
  return (
    <ListNavigationContext
      value={{ title: navigationTitle, display: navigationTitleDisplay, searchable }}
    >
      <ScrollSurface
        {...props}
        style={{
          ...props.style,
          ['--satin-list-section-spacing' as string]:
            typeof listSectionSpacing === 'number' ? `${listSectionSpacing}px` : 'initial',
        }}
        axis="vertical"
        role="list"
        data-satin-list={resolvedVariant}
        data-satin-scroll-content-background={scrollContentBackground}
        data-satin-list-idiom={readDeviceIdiom()}
        data-satin-list-section-spacing={listSectionSpacing === 'compact' ? 'compact' : undefined}
        className={className}
      >
        <ListSelectionContext value={selection}>
          <RowMotionScope>
            <ListItems>{children}</ListItems>
          </RowMotionScope>
        </ListSelectionContext>
      </ScrollSurface>
    </ListNavigationContext>
  )
}

/** A section's rows and its optional header and footer. */
export type SectionProps = {
  style?: CSSProperties
  children: ReactNode
  header?: ReactNode
  footer?: ReactNode
  className?: string
}
type SectionRow = { child: ReactNode; key: string; motionID?: ListItemID; item?: ForEachItem }

/** The rows of a list or section: fragments flatten, and each `ForEach` element becomes a row
 * that knows its identity, offset and the `ForEach`'s editing. */
function sectionRows(children: ReactNode, parentKeys: string[] = []): SectionRow[] {
  // Children.map gives every element a reconciliation key, including unkeyed ones.
  // Read authored keys first so positional identity never becomes data identity.
  const authoredKeys: (string | null)[] = []
  const normalized = Children.map(children, child => {
    if (child !== null && child !== undefined && typeof child !== 'boolean') {
      authoredKeys.push(isValidElement(child) ? child.key : null)
    }
    return child
  })
  return (normalized ?? []).flatMap((child, index): SectionRow[] => {
    const keys = [...parentKeys, isValidElement(child) ? String(child.key ?? index) : String(index)]
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      return sectionRows(child.props.children, keys)
    }
    if (isValidElement<ForEachProps<unknown>>(child) && child.type === ForEach) {
      const { onDelete, onMove } = child.props
      const group = JSON.stringify(keys)
      return forEachRows(child.props).map(row => ({
        child: row.child,
        key: JSON.stringify([...keys, row.key]),
        motionID: row.id,
        item: { id: row.id, offset: row.offset, editing: { onDelete, onMove }, group },
      }))
    }
    return [{ child, key: JSON.stringify(keys), motionID: authoredKeys[index] ?? undefined }]
  })
}

/** One row's content and its overrides: insets in points, background, separator, swipe actions,
 * context menu and editing opt-outs. */
export type ListRowProps = RowActionsProps & {
  children: ReactNode
  listRowInsets?: number | { top?: number; leading?: number; bottom?: number; trailing?: number }
  listRowBackground?: string
  listRowSeparator?: 'visible' | 'hidden'
  /** No reorder handle in edit mode. Other rows can still move past it. */
  moveDisabled?: boolean
  /** No swipe-to-delete or delete control for this row. */
  deleteDisabled?: boolean
  /** The List selection skips this row. */
  selectionDisabled?: boolean
}

function listRowStyle({
  listRowInsets,
  listRowBackground,
}: Pick<ListRowProps, 'listRowInsets' | 'listRowBackground'>): CSSProperties {
  const insets =
    typeof listRowInsets === 'number'
      ? {
          top: listRowInsets,
          leading: listRowInsets,
          bottom: listRowInsets,
          trailing: listRowInsets,
        }
      : listRowInsets
  return {
    '--satin-row-inset-top': insets?.top === undefined ? undefined : `${insets.top}px`,
    '--satin-row-inset-leading': insets?.leading === undefined ? undefined : `${insets.leading}px`,
    '--satin-row-inset-bottom': insets?.bottom === undefined ? undefined : `${insets.bottom}px`,
    '--satin-row-inset-trailing':
      insets?.trailing === undefined ? undefined : `${insets.trailing}px`,
    '--satin-row-background': listRowBackground,
    '--satin-settings-separator-trailing':
      insets?.trailing === undefined ? undefined : `${insets.trailing}px`,
    '--satin-row-separator-inset':
      insets?.leading === undefined ? undefined : `${insets.leading}px`,
  } as CSSProperties
}

/**
 * One row with custom content or per-row overrides.
 *
 * A ListRow is always one row. Several children share it side by side, laid out
 * as an HStack would (centred, 8 pt apart, a NavigationLink filling the rest);
 * each separate row needs its own ListRow.
 */
export function ListRow({
  children,
  listRowSeparator,
  listRowInsets,
  listRowBackground,
}: ListRowProps) {
  const options = { children, listRowInsets, listRowBackground }
  return (
    <div
      data-satin-list-row-options="true"
      data-satin-row-separator={listRowSeparator}
      data-satin-row-insets={options.listRowInsets === undefined ? undefined : 'explicit'}
      style={listRowStyle(options)}
    >
      <ListRowContentContext value={true}>{children}</ListRowContentContext>
    </div>
  )
}

// React components may render null, portals, or hidden helpers. Keep them mounted,
// but derive row participation from their local output rather than their type.
function hasRowContent(node: Node): boolean {
  return [...node.childNodes].some(child => {
    if (child.nodeType === Node.TEXT_NODE) return Boolean(child.textContent)
    if (!(child instanceof Element)) return false
    // A presentation's <dialog> is shown in the top layer, never inside the row (Sheet, Alert).
    if (
      child.matches(
        'script, style, template, dialog, [hidden], input[type="hidden"], [data-satin-edit-control]',
      )
    )
      return false
    if (getComputedStyle(child).display === 'none') return false
    if (child.hasAttribute('data-satin-list-row-options')) return hasRowContent(child)
    return true
  })
}

function ListItems({ children, section = false }: { children: ReactNode; section?: boolean }) {
  const rows = sectionRows(children)
  const parentRef = useRef<HTMLElement>(null)
  // An empty map must stay registered to animate its first insertion and last removal.
  const { rows: motionGroup, scope } = useRowMotionGroup(true)
  const order = JSON.stringify(rows.map(row => row.key))
  useLayoutEffect(() => {
    const parent = parentRef.current
    if (!parent) return
    const update = () => {
      const siblings = [...parent.children]
      const visible = siblings.filter(item => {
        if (!item.hasAttribute('data-satin-section-item')) return true
        const empty = !hasRowContent(item)
        item.toggleAttribute('data-satin-empty-row', empty)
        const group = item.querySelector('[data-satin-list-section]')
        item.setAttribute('role', empty || group ? 'presentation' : 'listitem')
        return !empty
      })
      visible.forEach((item, index) => {
        const next = visible[index + 1]
        item.toggleAttribute(
          'data-satin-next-header',
          Boolean(next?.querySelector('[data-satin-section-header]')),
        )
        item.toggleAttribute(
          'data-satin-next-empty-state',
          Boolean(next?.querySelector('[data-satin-empty-state]')),
        )
        if (!item.hasAttribute('data-satin-section-item')) return
        const isBoundary = (sibling: Element | undefined) =>
          !sibling ||
          !sibling.hasAttribute('data-satin-section-item') ||
          sibling.querySelector('[data-satin-list-section]') !== null
        item.toggleAttribute('data-satin-first-row', isBoundary(visible[index - 1]))
        item.setAttribute('data-satin-last-row', String(isBoundary(visible[index + 1])))
        item.toggleAttribute(
          'data-satin-row-group-end',
          Boolean(visible[index + 1]) && isBoundary(visible[index + 1]),
        )
      })
    }
    update()
    // A drop leaves rows where they landed until the new order renders; this is that render.
    if (!parent.querySelector(':scope > [data-satin-reorder-lifted]'))
      resetReorderTransforms(parent)
    const observer = new MutationObserver(records => {
      if (
        records.some(
          record =>
            record.type !== 'attributes' ||
            (record.target instanceof Element &&
              record.target.parentElement?.matches(
                '[data-satin-section-item], [data-satin-list-row-options]',
              )),
        )
      )
        update()
    })
    observer.observe(parent, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden', 'style', 'class'],
    })
    return () => observer.disconnect()
  }, [children])
  return (
    <RowMotionCommit scope={scope} order={order}>
      {rows.map(({ child, key, motionID, item }, index) => {
        // Keep explicit sections and authored titles as siblings. Opaque components
        // that render sections are unboxed by the same semantic CSS boundary.
        if (!section && isValidElement(child) && (child.type === Section || child.type === 'h1')) {
          return <Fragment key={key}>{child}</Fragment>
        }
        const options =
          isValidElement<ListRowProps>(child) && child.type === ListRow ? child.props : undefined
        const next = rows[index + 1]?.child
        const groupEnds = !section && isValidElement(next) && next.type === Section
        const itemRef = (element: HTMLDivElement | null) => {
          if (element) parentRef.current = element.parentElement
          if (motionID !== undefined) {
            if (element) {
              motionGroup.set(key, {
                identity: JSON.stringify([typeof motionID, motionID]),
                element,
              })
            } else {
              motionGroup.delete(key)
            }
          }
        }
        const attributes = {
          role: 'listitem',
          'data-satin-section-item': 'true',
          'data-satin-list-direct-row': section ? undefined : 'true',
          'data-satin-last-row': index === rows.length - 1 || groupEnds ? 'true' : undefined,
        }
        const style = options ? listRowStyle(options) : undefined
        // Only rows that can edit or carry row actions pay for the editing item.
        if (item || options?.swipeActions || options?.contextMenu)
          return (
            <ListItem
              key={key}
              item={item}
              options={options}
              style={style}
              attributes={attributes}
              itemRef={itemRef}
            >
              {child}
            </ListItem>
          )
        return (
          <div key={key} ref={itemRef} style={style} {...attributes}>
            {child}
          </div>
        )
      })}
    </RowMotionCommit>
  )
}

/** A group of rows in a `List` or `Form`, with an optional header and footer. */
export function Section({ children, header, footer, className, style }: SectionProps) {
  const headerId = useId()
  const rowsRef = useRef<HTMLDivElement>(null)
  const { rows: boundaryMotion } = useRowMotionGroup(Boolean(header || footer))
  const boundaryRef = (kind: 'header' | 'footer') => (element: HTMLDivElement | null) => {
    if (element) boundaryMotion.set(kind, { identity: JSON.stringify([kind, headerId]), element })
    else boundaryMotion.delete(kind)
  }
  useLayoutEffect(() => {
    if (rowsRef.current) return observeSeparatorInsets(rowsRef.current)
  }, [])
  return (
    <section
      style={style}
      className={className}
      data-satin-list-section="true"
      role="group"
      aria-labelledby={header ? headerId : undefined}
    >
      {header && (
        <div
          ref={boundaryRef('header')}
          id={headerId}
          role="heading"
          aria-level={2}
          data-satin-section-header="true"
        >
          {header}
          {/* The scroll edge material, drawn while a plain list pins this header (styles.css). */}
          <div aria-hidden="true" data-satin-edge-material="" />
        </div>
      )}
      <div ref={rowsRef} data-satin-section-rows="true">
        <ListItems section>{children}</ListItems>
      </div>
      {footer && (
        <div ref={boundaryRef('footer')} data-satin-section-footer="true">
          {footer}
        </div>
      )}
    </section>
  )
}

export type RowProps = RowActionsProps & {
  buttonProps?: Omit<PressableProps, 'children' | 'onPress'>
  label: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onPress?: () => void
  disabled?: boolean
  destructive?: boolean
  className?: string
  value?: ReactNode
  accessibilityLabel?: string
}
export const Row: ForwardRefExoticComponent<RowProps & RefAttributes<HTMLButtonElement>> =
  forwardRef<HTMLButtonElement, RowProps>(function Row(
    {
      swipeActions,
      contextMenu,
      buttonProps,
      label,
      leading,
      trailing,
      onPress,
      disabled = false,
      destructive = false,
      className,
      value,
      accessibilityLabel,
    },
    ref,
  ) {
    // While its List edits with a selection, the row's own action gives way to selecting it.
    const item = useContext(ListItemContext)
    const labels = (
      <>
        <span data-satin-row-label="true">
          {typeof label === 'string' || typeof label === 'number' ? (
            <span data-satin-row-text="true">{label}</span>
          ) : (
            label
          )}
        </span>
        <span data-satin-row-trailing="true">
          {value != null && (
            <span data-satin-row-value="true">
              <span data-satin-row-text="true">{value}</span>
            </span>
          )}
          {trailing}
        </span>
      </>
    )
    const content = (
      <>
        <span data-satin-row-leading="true">{leading}</span>
        {value == null ? labels : <span data-satin-row-value-content="true">{labels}</span>}
      </>
    )
    const shared = {
      className,
      'data-satin-row': 'true',
      'data-satin-row-disabled': disabled ? 'true' : undefined,
      'data-satin-row-destructive': destructive ? 'true' : undefined,
    } as const
    const row = onPress ? (
      <Pressable
        {...(buttonProps as PressableProps)}
        iconOnly={false}
        {...shared}
        ref={ref}
        feedback="row"
        disabled={disabled}
        onPress={item?.pressSelects ? item.select : onPress}
        aria-label={accessibilityLabel}
      >
        {content}
      </Pressable>
    ) : (
      <div {...shared} aria-label={accessibilityLabel}>
        {content}
      </div>
    )
    return swipeActions || contextMenu ? (
      <RowActions swipeActions={swipeActions} contextMenu={contextMenu} disabled={disabled}>
        {row}
      </RowActions>
    ) : (
      row
    )
  })

/** The symbol and its tile colour: a system colour name or any CSS colour. */
export type RowIconProps = {
  symbol: SymbolName
  color: SystemColorName | (string & {})
}
const tileColors: Record<string, string> = {
  blue: 'var(--satin-system-blue, #0088ff)',
  green: 'var(--satin-system-green, #34c759)',
  red: 'var(--satin-system-red, #ff383c)',
  orange: '#ff9500',
  purple: '#af52de',
  gray: '#8e8e93',
}
/** A Settings-style icon: a white symbol on a rounded colour tile, for a row's leading edge. */
export function RowIcon({ symbol, color }: RowIconProps) {
  return (
    <span
      role="presentation"
      data-satin-row-icon="true"
      style={{ backgroundColor: tileColors[color] ?? color }}
    >
      <SymbolImage name={symbol} style={{ fontSize: 21.7 }} />
    </span>
  )
}
export function NavigationRow(props: Omit<RowProps, 'trailing'> & { trailing?: ReactNode }) {
  return <Row {...props} trailing={props.trailing ?? <DisclosureIndicator />} />
}
export function ValueRow(props: Omit<RowProps, 'onPress'> & { value: ReactNode }) {
  return <Row {...props} />
}
export function ButtonRow({
  children,
  role,
  onPress,
  disabled,
  ...actions
}: RowActionsProps & {
  children: ReactNode
  role?: 'destructive'
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Row
      {...actions}
      className="satin-list-button"
      label={children}
      onPress={onPress}
      disabled={disabled}
      destructive={role === 'destructive'}
    />
  )
}

export { Toggle, ToggleRow, type ToggleProps } from './Toggle.tsx'
export { Slider, SliderRow, type SliderProps } from './Slider.tsx'

/** One option of a `Picker`. */
export type Choice = {
  id: string
  label: string
  /** The option's icon by symbol name. */
  symbol?: SymbolName
  /** The option's icon as a React node, for an icon that is not a symbol. */
  icon?: ReactNode
  /** The icon's colour. An option with a colour and no icon shows a
   * filled circle in that colour, the usual way to offer a colour. */
  color?: string
  /** The option shows dimmed and can't be chosen. */
  disabled?: boolean
}
function isDecorated(choice: Choice) {
  return choice.symbol !== undefined || choice.icon !== undefined || choice.color !== undefined
}
function choiceGlyph(choice: Choice): ReactNode {
  if (choice.icon !== undefined && choice.symbol === undefined) return choice.icon
  return <SymbolImage name={choice.symbol ?? 'circle.fill'} />
}
/** The option's icon in a list row, in its own colour. Lists draw a Label's icon in colour. */
function ChoiceIcon({ choice, colored }: { choice: Choice; colored: boolean }) {
  if (!isDecorated(choice)) return null
  return (
    <span
      data-satin-picker-choice-icon="true"
      aria-hidden="true"
      style={colored && choice.color ? { color: choice.color } : undefined}
    >
      {choiceGlyph(choice)}
    </span>
  )
}
/* The option as an entry in the open menu. Menus draw every icon in the label colour, so the
 * option's colour is not passed on (iOS 27 native reference: a red `house` draws black in the menu). */
function choiceMenuIcon(choice: Choice): Pick<ActionItem, 'symbol' | 'icon'> {
  if (!isDecorated(choice)) return {}
  if (choice.symbol !== undefined) return { symbol: choice.symbol }
  if (choice.icon !== undefined) return { icon: choice.icon }
  return { symbol: 'circle.fill' }
}

/**
 * Returns the function every Picker style calls to choose an option. It commits only what the
 * Picker offers now: a menu entry or a pushed options list can outlive a render, so the press
 * is checked against the latest options and disabled state, and ignored once the Picker is gone.
 */
function useChooseOption(state: {
  options: readonly Choice[]
  disabled?: boolean
  onChange: (id: string) => void
}) {
  const latest = useRef<typeof state | null>(state)
  assertUniqueChoiceIds(state.options)
  useLayoutEffect(() => {
    latest.current = state
    return () => {
      latest.current = null
    }
  }, [state])
  return (id: string) => {
    const current = latest.current
    if (!current || current.disabled) return
    const option = current.options.find(choice => choice.id === id)
    if (option && !option.disabled) current.onChange(id)
  }
}
function assertUniqueChoiceIds(options: readonly Choice[]) {
  const ids = new Set<string>()
  for (const option of options) {
    if (ids.has(option.id)) throw new Error(`Picker option id "${option.id}" is duplicated.`)
    ids.add(option.id)
  }
}

export type PickerRowProps = {
  style?: CSSProperties
  label: string
  value: string
  onChange: (id: string) => void
  options: readonly Choice[]
  presentation?: 'menu' | 'navigation'
  onNavigate?: () => void
  disabled?: boolean
  leading?: ReactNode
}
function PickerMenuIndicator() {
  return <SymbolImage name="chevron.up.chevron.down" data-satin-picker-indicator="true" />
}
export function PickerRow({
  label,
  value,
  onChange,
  options,
  presentation = 'menu',
  onNavigate,
  disabled = false,
  leading,
  style,
}: PickerRowProps) {
  const choose = useChooseOption({ options, disabled, onChange })
  const selected = options.find(option => option.id === value)
  const navigate = presentation === 'navigation'
  if (navigate && !onNavigate)
    throw new Error('PickerRow navigation presentation requires onNavigate.')
  const valueLabel = pickerSelection(options, value) ?? value
  // A selected Label shows as its icon and title in the accent colour (iOS 27 native reference menu rest).
  const decoratedValue = !navigate && selected !== undefined && isDecorated(selected)
  return (
    <div style={style} data-satin-picker="true" data-satin-picker-mode={presentation}>
      <Row
        label={label}
        leading={leading}
        value={
          navigate ? (
            valueLabel
          ) : (
            <Menu
              label={label}
              disabled={disabled}
              actions={options.map(option => ({
                id: option.id,
                label: option.label,
                ...choiceMenuIcon(option),
                checked: option.id === value,
                disabled: disabled || option.disabled,
                onPress: () => choose(option.id),
              }))}
              trigger={props => (
                <Pressable
                  {...props}
                  disabled={disabled}
                  aria-label={`${label}, ${valueLabel}`}
                  data-satin-picker-trigger="true"
                  data-satin-picker-decorated={decoratedValue ? 'true' : undefined}
                >
                  {decoratedValue && <ChoiceIcon choice={selected} colored={false} />}
                  <span>{valueLabel}</span>
                  <PickerMenuIndicator />
                </Pressable>
              )}
            />
          )
        }
        trailing={navigate ? <DisclosureIndicator /> : undefined}
        disabled={disabled}
        onPress={navigate ? onNavigate : undefined}
        accessibilityLabel={navigate ? `${label}, ${valueLabel}` : undefined}
      />
    </div>
  )
}

export function PickerOptions({
  label,
  value,
  onChange,
  options,
  disabled,
  style,
  labelPlacement = 'row',
}: {
  style?: CSSProperties
  label: string
  value: string
  onChange: (id: string) => void
  options: readonly Choice[]
  disabled?: boolean
  /* An inline Picker's label is the first row of its card (iOS 27 native reference inline Picker in a
   * Section). A pushed options list carries the label as its navigation title instead. */
  labelPlacement?: 'row' | 'navigationTitle'
}) {
  const choose = useChooseOption({ options, disabled, onChange })
  return (
    <Section style={style}>
      {labelPlacement === 'row' && <Row label={label} disabled={disabled} />}
      {options.map(option => (
        <Row
          disabled={disabled || option.disabled}
          key={option.id}
          label={option.label}
          leading={<ChoiceIcon choice={option} colored />}
          className={
            isDecorated(option)
              ? 'satin-picker-choice satin-picker-choice-decorated'
              : 'satin-picker-choice'
          }
          trailing={option.id === value ? <SymbolImage name="checkmark" /> : undefined}
          onPress={() => choose(option.id)}
          accessibilityLabel={`${option.label}${option.id === value ? ', selected' : ''}`}
        />
      ))}
    </Section>
  )
}

import { clampStepper, pickerSelection } from './state.ts'
export type StepperProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  label: string
  onEditingChange?: (editing: boolean) => void
}
export function StepperControl({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  disabled = false,
  label,
  onEditingChange,
}: StepperProps) {
  if (Number.isNaN(min) || Number.isNaN(max) || min > max) {
    throw new Error('StepperControl bounds must be ordered numbers.')
  }
  if (!Number.isFinite(value)) {
    throw new Error('StepperControl value must be finite.')
  }
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error('StepperControl step must be finite and greater than zero.')
  }
  return (
    <span
      data-satin-row-intrinsic="true"
      data-satin-stepper="true"
      data-satin-stepper-disabled={disabled ? 'true' : undefined}
      role="group"
      aria-label={`${label}, ${value}`}
    >
      <StepperButton
        onEditingChange={onEditingChange}
        label={`Decrease ${label}, ${value}`}
        disabled={disabled || value <= min}
        onStep={() => onChange(clampStepper(value, min, max, -step))}
      >
        <SymbolImage name="minus" weight="medium" />
      </StepperButton>
      <StepperButton
        onEditingChange={onEditingChange}
        label={`Increase ${label}, ${value}`}
        disabled={disabled || value >= max}
        onStep={() => onChange(clampStepper(value, min, max, step))}
      >
        <SymbolImage name="plus" weight="semibold" />
      </StepperButton>
    </span>
  )
}
export function StepperRow(props: StepperProps) {
  return (
    <Row
      className="satin-stepper-row"
      label={props.label}
      trailing={<StepperControl {...props} />}
    />
  )
}

export function SegmentedControl({
  value,
  onChange,
  options,
  disabled = false,
  label = 'Options',
  style: cssStyle,
}: {
  style?: CSSProperties
  value: string
  onChange: (id: string) => void
  options: readonly Choice[]
  disabled?: boolean
  label?: string
}) {
  const choose = useChooseOption({ options, disabled, onChange })
  const selectionIndex = options.findIndex(option => option.id === value)
  if (selectionIndex < 0) {
    throw new Error(`SegmentedControl value "${value}" is not present in options.`)
  }
  const style = {
    '--satin-segment-count': options.length,
    '--satin-segment-index': selectionIndex,
    ...cssStyle,
  } as CSSProperties
  return (
    <div
      data-satin-segmented="true"
      data-satin-segmented-disabled={disabled ? 'true' : undefined}
      role="group"
      aria-label={label}
      style={style}
    >
      <span data-satin-segmented-selection="true" role="presentation" />
      {options.map(option => (
        <SensoryButton
          sensoryFeedback={value === option.id ? false : 'selection'}
          key={option.id}
          aria-pressed={value === option.id}
          disabled={disabled || option.disabled}
          data-satin-segment-disabled={option.disabled ? 'true' : undefined}
          onPress={() => choose(option.id)}
        >
          <span>{option.label}</span>
        </SensoryButton>
      ))}
    </div>
  )
}
