import { createContext, Fragment, useContext, useMemo, useState, type ReactNode } from 'react'
import type { RowActionsProps } from '../actions/types.ts'

/** Whether a screen's lists show their editing controls: `active` or `inactive`. */
export type EditMode = 'inactive' | 'active'

/** A row's identity in `List` selection: the `ForEach` id. */
export type ListItemID = string | number

type EditModeBinding = readonly [EditMode, (next: EditMode) => void]

const inactiveEverywhere: EditModeBinding = ['inactive', () => {}]
const EditModeContext = createContext<EditModeBinding>(inactiveEverywhere)

/**
 * Every navigation destination owns one edit mode, for its retained entry:
 * its `EditButton` and its lists read and write the same value, and another screen keeps its own.
 */
export function EditModeScope({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState<EditMode>('inactive')
  const binding = useMemo(() => [editMode, setEditMode] as const, [editMode])
  return <EditModeContext value={binding}>{children}</EditModeContext>
}

/**
 * Returns this screen's edit mode and a setter. `EditButton` toggles the same value, so a
 * toolbar or bottom bar can follow it.
 *
 * @example
 * const [editMode] = useEditMode()
 * const editing = editMode === 'active'
 */
export function useEditMode(): readonly [EditMode, (next: EditMode) => void] {
  return useContext(EditModeContext)
}

/** `List` selection as the rows see it. */
export type ListSelectionModel = Readonly<{
  /** `single` selects one row (an optional binding); `multiple` collects a set. */
  mode: 'single' | 'multiple'
  isSelected(id: ListItemID): boolean
  /** A row tap: replaces a single selection; toggles a set only while editing. */
  activate(id: ListItemID, editing: boolean): void
}>

export const ListSelectionContext = createContext<ListSelectionModel | null>(null)

/**
 * The collection, how to identify each element, the row each element becomes and its editing
 * actions. `id` may be omitted when the elements have an `id` field.
 */
export type ForEachProps<T> = {
  data: readonly T[]
  children: (item: T, offset: number) => ReactNode
  /** `onDelete`: the offsets into `data` of the rows to delete. */
  onDelete?: (offsets: number[]) => void
  /** `onMove`: the moved offsets and where they go, both counted in `data` before the move. */
  onMove?: (fromOffsets: number[], toOffset: number) => void
} & (T extends { id: ListItemID }
  ? { id?: (item: T) => ListItemID }
  : { id: (item: T) => ListItemID })

/** The `ForEach` modifiers that make its rows editable. */
export type ForEachEditing = Readonly<Pick<ForEachProps<{ id: ListItemID }>, 'onDelete' | 'onMove'>>

/**
 * Makes one row per element of `data`, identified by its `id` (or an `id` function). In a
 * `List`, `onDelete` adds swipe-to-delete and the editing delete control; `onMove` adds the
 * reorder handle. Both receive offsets into `data`; apply them with `removing` and `moving`.
 *
 * Put `ForEach` directly in a `List` or `Section`: the list reads it to know each row's identity.
 *
 * @example
 * <ForEach data={notes} onDelete={offsets => setNotes(notes => removing(notes, offsets))}>
 *   {note => <NavigationLink to="note" params={{ id: note.id }}>{note.title}</NavigationLink>}
 * </ForEach>
 */
export function ForEach<T>(props: ForEachProps<T>) {
  // Outside a List, a ForEach is only its rows. Inside one, the List expands it itself.
  return (
    <>
      {forEachRows(props).map(row => (
        <Fragment key={row.key}>{row.child}</Fragment>
      ))}
    </>
  )
}

/** One expanded `ForEach` element: its rendered row and where it sits in `data`. */
export type ForEachRow = Readonly<{
  key: string
  id: ListItemID
  offset: number
  child: ReactNode
}>

export function forEachRows<T>(props: ForEachProps<T>): ForEachRow[] {
  const identify =
    (props.id as ((item: T) => ListItemID) | undefined) ??
    ((item: T) => (item as { id: ListItemID }).id)
  return props.data.map((item, offset) => {
    const id = identify(item)
    return { key: `${typeof id}:${id}`, id, offset, child: props.children(item, offset) }
  })
}

/** What an editable row needs from its list item: edit state, selection and the item's actions. */
export type ListItemState = Readonly<{
  editing: boolean
  /** While editing with a selection, a row's own press selects it, as a list row does. */
  pressSelects: boolean
  select(): void
  /** Rows that also declare actions hand them to the item, which owns the row's one gesture host. */
  delegateActions?: (actions: RowActionsDelegation | undefined) => void
}>

/** A row's own swipe actions, context menu and disabled state, handed to its list item. */
export type RowActionsDelegation = RowActionsProps & Readonly<{ disabled?: boolean }>

export const ListItemContext = createContext<ListItemState | null>(null)
