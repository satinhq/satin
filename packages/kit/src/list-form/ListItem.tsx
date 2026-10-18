import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { ListItemActions, type RowActionsController } from '../actions/RowActions.tsx'
import type { ActionItem, RowActionsProps } from '../actions/types.ts'
import { CONTEXT_HOLD_MS } from '../actions/contextMotion.ts'
import { animateElement } from '../motion/animate.ts'
import { sampledKeyframes, springMotion, springTrack } from '../motion/springTrack.ts'
import { Pressable } from '../press/Pressable.tsx'
import { SCROLL_PRESS_SLOP_PX } from '../scroll/pressOwnership.ts'
import {
  ListItemContext,
  ListSelectionContext,
  useEditMode,
  type ForEachEditing,
  type ListItemID,
  type ListItemState,
} from './editing.tsx'
import {
  EDIT_CONTROL_COLUMN,
  EDIT_MODE_SPRING,
  REORDER_HANDLE_INSET,
  REORDER_HANDLE_TRAVEL,
} from './editMotion.ts'
import { resetReorderTransforms, startReorderDrag, type ReorderDrag } from './reorder.ts'

/** Where a `ForEach` row came from: its identity, offset and the editing its `ForEach` declares. */
export type ForEachItem = Readonly<{
  id: ListItemID
  offset: number
  editing: ForEachEditing
  /** Rows of one `ForEach` in one section reorder among themselves. */
  group: string
}>

/** The `ListRow` modifiers an item applies to its row. */
export type ListItemOptions = RowActionsProps &
  Readonly<{ moveDisabled?: boolean; deleteDisabled?: boolean; selectionDisabled?: boolean }>

type EditingControls = Readonly<{ delete: boolean; select: boolean; reorder: boolean }>
const noControls: EditingControls = { delete: false, select: false, reorder: false }

/**
 * One row of a `List` or `Section`. For a `ForEach` row it also draws edit mode: the delete and
 * selection controls before the content, the reorder handle after it, the selected highlight, and
 * the measured shift between the two layouts.
 */
export function ListItem({
  children,
  item,
  options,
  style,
  attributes,
  itemRef,
}: {
  children: ReactNode
  item?: ForEachItem
  options?: ListItemOptions
  style?: CSSProperties
  attributes: Record<string, string | undefined>
  itemRef: (element: HTMLDivElement | null) => void
}) {
  const [editMode] = useEditMode()
  const selection = useContext(ListSelectionContext)
  const editing = editMode === 'active' && item !== undefined
  const selectable = Boolean(selection && item && !options?.selectionDisabled)
  const selected = Boolean(selectable && item && selection?.isSelected(item.id))
  const controls: EditingControls = editing
    ? {
        delete: Boolean(item?.editing.onDelete && !options?.deleteDisabled),
        select: selectable && selection?.mode === 'multiple',
        reorder: Boolean(item?.editing.onMove && !options?.moveDisabled),
      }
    : noControls
  const element = useRef<HTMLDivElement>(null)
  const shown = useEditTransition(element, controls)
  const actionsController = useRef<RowActionsController['current']>(undefined)
  const reorder = useReorder(element, item, editing)

  const select = useCallback(() => {
    if (item && selection && selectable) selection.activate(item.id, editing)
  }, [item, selection, selectable, editing])
  const rowTap = useRowTapSelection(select, selectable)
  const state = useMemo<ListItemState | null>(
    () => (item || selectable ? { editing, pressSelects: editing && selectable, select } : null),
    [item, selectable, editing, select],
  )
  const onDelete = item?.editing.onDelete
  const offset = item?.offset
  const deleteAction = useMemo<ActionItem | undefined>(
    () =>
      onDelete && offset !== undefined && !options?.deleteDisabled
        ? {
            id: 'delete',
            label: 'Delete',
            symbol: 'trash',
            role: 'destructive',
            onPress: () => onDelete([offset]),
          }
        : undefined,
    [onDelete, offset, options?.deleteDisabled],
  )
  const hostsActions = Boolean(deleteAction || options?.swipeActions || options?.contextMenu)

  const leadingInset = (shown.delete ? 1 : 0) + (shown.select ? 1 : 0)
  const itemStyle = {
    ...style,
    '--satin-edit-leading-inset':
      controls.delete || controls.select
        ? `${((controls.delete ? 1 : 0) + (controls.select ? 1 : 0)) * EDIT_CONTROL_COLUMN}px`
        : undefined,
    '--satin-edit-trailing-inset': controls.reorder ? `${REORDER_HANDLE_INSET}px` : undefined,
  } as CSSProperties

  const content = hostsActions ? (
    <ListItemActions
      swipeActions={options?.swipeActions}
      contextMenu={options?.contextMenu}
      deleteAction={deleteAction}
      controller={actionsController as RowActionsController}
    >
      {children}
    </ListItemActions>
  ) : (
    children
  )
  return (
    <div
      {...attributes}
      ref={node => {
        element.current = node
        itemRef(node)
      }}
      style={itemStyle}
      data-satin-editing={editing || undefined}
      data-satin-selected={selected || undefined}
      data-satin-reorder-group={item?.editing.onMove ? item.group : undefined}
      data-satin-foreach-offset={item?.offset}
      {...rowTap}
    >
      <ListItemContext value={state}>{content}</ListItemContext>
      {shown.delete && (
        <DeleteControl
          column={0}
          onPress={() => actionsController.current?.revealTrailing()}
          exiting={!controls.delete}
        />
      )}
      {shown.select && (
        <SelectionControl
          column={leadingInset - 1}
          selected={selected}
          onPress={select}
          exiting={!controls.select}
        />
      )}
      {shown.reorder && <ReorderHandle onPointerDown={reorder} exiting={!controls.reorder} />}
    </div>
  )
}

const ROW_CONTROLS =
  'button, a, input, textarea, select, label, [role="button"], [role="switch"], [contenteditable="true"],' +
  ' [data-satin-edit-control]'

/** Whether a contact landed on one of the row's own controls, which keep their own action. */
function onRowControl(row: Element, target: EventTarget | null) {
  const control = target instanceof Element ? target.closest(ROW_CONTROLS) : null
  return Boolean(control && row.contains(control))
}

/**
 * A tap on the row body selects the row, as a `List` with a selection does. The tap is read from
 * the pointer itself: WebKit's synthesized click can be claimed by the shared press receipt
 * (press/contactReceipt.ts) before it reaches the row, as every Satin press reads its own pointer.
 * A contact that moves past the scroll slop, is held into a context menu, or that WebKit takes
 * for a pan (pointercancel) selects nothing. A click with no pointer (VoiceOver, Full Keyboard
 * Access) still selects.
 */
function useRowTapSelection(select: () => void, enabled: boolean) {
  const contact = useRef<{ pointerId: number; x: number; y: number; at: number } | null>(null)
  if (!enabled) return {}
  return {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      const onControl = onRowControl(event.currentTarget, event.target)
      contact.current =
        event.isPrimary && !onControl
          ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp }
          : null
    },
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
      const started = contact.current
      contact.current = null
      if (!started || started.pointerId !== event.pointerId) return
      const travel = Math.hypot(event.clientX - started.x, event.clientY - started.y)
      const held = event.timeStamp - started.at
      if (travel < SCROLL_PRESS_SLOP_PX && held < CONTEXT_HOLD_MS) select()
    },
    onPointerCancel() {
      contact.current = null
    },
    onClick(event: MouseEvent<HTMLDivElement>) {
      if (event.detail === 0 && !onRowControl(event.currentTarget, event.target)) select()
    },
  }
}

function DeleteControl({
  column,
  onPress,
  exiting,
}: {
  column: number
  onPress: () => void
  exiting: boolean
}) {
  return (
    <span
      data-satin-edit-control="delete"
      data-satin-edit-column={column}
      data-satin-edit-exiting={exiting || undefined}
    >
      <Pressable aria-label="Delete" feedback="opacity" onPress={onPress}>
        <span data-satin-delete-glyph="true" aria-hidden="true" />
      </Pressable>
    </span>
  )
}

function SelectionControl({
  column,
  selected,
  onPress,
  exiting,
}: {
  column: number
  selected: boolean
  onPress: () => void
  exiting: boolean
}) {
  return (
    <span
      data-satin-edit-control="select"
      data-satin-edit-column={column}
      data-satin-edit-exiting={exiting || undefined}
    >
      <Pressable aria-label="Select" aria-pressed={selected} onPress={onPress}>
        <span data-satin-selection-glyph={selected ? 'selected' : 'empty'} aria-hidden="true">
          {selected && (
            <svg viewBox="0 0 22 22" aria-hidden="true">
              <path d="M6.7 11.9 9.9 15 15.4 7.2" />
            </svg>
          )}
        </span>
      </Pressable>
    </span>
  )
}

function ReorderHandle({
  onPointerDown,
  exiting,
}: {
  onPointerDown: (event: PointerEvent) => void
  exiting: boolean
}) {
  const handle = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = handle.current
    if (!element) return
    // A native listener, so the drag owns the contact before the row's own recognizers see it.
    const down = (event: PointerEvent) => onPointerDown(event)
    element.addEventListener('pointerdown', down)
    return () => element.removeEventListener('pointerdown', down)
  }, [onPointerDown])
  return (
    <span
      ref={handle}
      role="img"
      aria-label="Reorder"
      data-satin-edit-control="reorder"
      data-satin-edit-exiting={exiting || undefined}
    >
      <svg viewBox="0 0 21 11" aria-hidden="true">
        <path d="M0.67 0.67H20.33M0.67 5.5H20.33M0.67 10.33H20.33" />
      </svg>
    </span>
  )
}

/**
 * Keeps leaving controls mounted until their exit finishes, and plays the measured shift whenever
 * the item's editing controls change: the content and controls start where the old layout drew
 * them and settle into the new one.
 */
function useEditTransition(
  element: { current: HTMLDivElement | null },
  controls: EditingControls,
): EditingControls {
  const [shown, setShown] = useState(controls)
  const previous = useRef(controls)
  const generation = useRef(0)
  const merged: EditingControls = {
    delete: controls.delete || shown.delete,
    select: controls.select || shown.select,
    reorder: controls.reorder || shown.reorder,
  }
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = controls
    if (sameControls(before, controls)) return
    const item = element.current
    if (!item) return
    const current = ++generation.current
    const animations = playEditShift(item, before, controls)
    const settle = () => {
      if (generation.current !== current) return
      delete item.dataset.satinEditAnimating
      setShown(controls)
    }
    if (!animations.length) settle()
    else void Promise.all(animations.map(animation => animation.finished)).then(settle, () => {})
  })
  return merged
}

function sameControls(first: EditingControls, second: EditingControls) {
  return (
    first.delete === second.delete &&
    first.select === second.select &&
    first.reorder === second.reorder
  )
}

function playEditShift(item: HTMLDivElement, before: EditingControls, after: EditingControls) {
  const columns = (state: EditingControls) =>
    ((state.delete ? 1 : 0) + (state.select ? 1 : 0)) * EDIT_CONTROL_COLUMN
  const shift = columns(before) - columns(after)
  const track = springTrack(springMotion(EDIT_MODE_SPRING))
  const timing = { duration: track.duration }
  const along = (from: number, to: number) => (progress: number) => from + (to - from) * progress
  const animations: Animation[] = []
  item.dataset.satinEditAnimating = 'true'

  // The content and the separator start where the old layout drew them.
  if (shift) {
    const position = along(shift, 0)
    const frames = sampledKeyframes(track, progress => ({
      transform: `translate3d(${position(progress)}px, 0, 0)`,
    }))
    for (const child of item.children) {
      if (!(child instanceof HTMLElement) || child.dataset.satinEditControl) continue
      child.getAnimations().forEach(animation => animation.cancel())
      animations.push(animateElement(child, frames, timing))
    }
    animations.push(animateElement(item, frames, { ...timing, pseudoElement: '::after' }))
  }
  // Each leading control rides with the content from (or to) the row's edge, fading as it goes.
  item.querySelectorAll<HTMLElement>(':scope > [data-satin-edit-control]').forEach(control => {
    const kind = control.dataset.satinEditControl as 'delete' | 'select' | 'reorder'
    const entering = after[kind] && !before[kind]
    const leaving = before[kind] && !after[kind]
    const travel = kind === 'reorder' ? REORDER_HANDLE_TRAVEL : -columns(entering ? after : before)
    const translate = entering ? along(travel, 0) : leaving ? along(0, travel) : along(shift, 0)
    const opacity = entering ? along(0, 1) : leaving ? along(1, 0) : () => 1
    control.getAnimations().forEach(animation => animation.cancel())
    animations.push(
      animateElement(
        control,
        sampledKeyframes(track, progress => ({
          transform: `translate3d(${translate(progress)}px, 0, 0)`,
          opacity: opacity(progress),
        })),
        // A leaving control keeps its last pose until it unmounts.
        leaving ? { ...timing, fill: 'forwards' } : timing,
      ),
    )
  })
  return animations
}

/**
 * The reorder handle's pointer-down: lifts this row and hands it to the drag. The move is
 * reported through `onMove` with source-sequence offsets once the row settles; the new order must then
 * come back through `data`, and until it does the rows stay where they were dropped.
 */
function useReorder(
  element: { current: HTMLDivElement | null },
  item: ForEachItem | undefined,
  editing: boolean,
) {
  const drag = useRef<ReorderDrag | undefined>(undefined)
  const onMove = item?.editing.onMove
  useLayoutEffect(() => {
    if (!editing) drag.current?.cancel()
  }, [editing])
  return useCallback(
    (event: PointerEvent) => {
      const row = element.current
      if (!row || !onMove || event.button !== 0 || drag.current) return
      event.preventDefault()
      event.stopPropagation()
      ;(event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId)
      drag.current = startReorderDrag({
        item: row,
        pointer: event,
        onCommit: (from, to) => {
          const offsets = groupRows(row).map(element => Number(element.dataset.satinForeachOffset))
          const source = offsets[from]
          const destination = to > from ? offsets[to] + 1 : offsets[to]
          flushSync(() => onMove([source], destination))
          // A synchronous update has already put the rows in their new order. Otherwise the rows
          // stay where they were dropped until the new order arrives (ListItems clears them).
          if (groupRows(row).indexOf(row) !== from) resetReorderTransforms(row.parentElement!)
        },
        onEnd: () => {
          drag.current = undefined
        },
      })
    },
    [element, onMove],
  )
}

/** The rows of the dragged row's group, in document order. */
function groupRows(row: HTMLElement) {
  const group = row.dataset.satinReorderGroup
  return [...(row.parentElement?.children ?? [])].filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && element.dataset.satinReorderGroup === group,
  )
}
