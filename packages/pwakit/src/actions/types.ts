import type { ReactNode } from 'react'
import type { SymbolName } from '../symbols/Symbol.tsx'
import type { CornerShape } from '../shapes/corners.ts'

/** Shared by menus, context menus and row swipe actions. */
export type Action =
  | ActionItem
  | Readonly<{ section: readonly Action[]; label?: string }>
  | Readonly<{
      id: string
      label: string
      symbol?: SymbolName
      icon?: ReactNode
      disabled?: boolean
      submenu: readonly Action[]
    }>
/** A leaf command shared by menus, swipe actions, alerts and confirmation dialogs. */
export type ActionItem = Readonly<{
  id: string
  label: string
  accessibilityLabel?: string
  symbol?: SymbolName
  icon?: ReactNode
  role?: 'destructive' | 'cancel'
  disabled?: boolean
  /** Selection semantics for menu-style pickers. Defined false values reserve the checkmark column. */
  checked?: boolean
  onPress?: (() => void) | (() => Promise<void>)
  tint?: string
}>
/** A swipe command may omit its visible title while retaining an accessible name. */
export type SwipeActionItem =
  | ActionItem
  | Readonly<
      Omit<ActionItem, 'label' | 'accessibilityLabel'> & {
        label?: never
        accessibilityLabel: string
      } & ({ symbol: SymbolName } | { icon: ReactNode })
    >
export type SwipeAction = Action | SwipeActionItem
/** `swipeActions`: one or more edge configurations for a row. */
export type SwipeActions = SwipeActionsConfiguration | readonly SwipeActionsConfiguration[]

/** Swipe actions on one row edge. Full swipe is enabled unless explicitly disabled. */
export type SwipeActionsConfiguration = Readonly<{
  edge?: 'leading' | 'trailing'
  /** Revealed row face. Omit for the native default; custom shapes are unrestricted. */
  shape?: CornerShape
  allowsFullSwipe?: boolean
  actions: readonly SwipeAction[]
}>

/** `contextMenu`: row commands and an optional preview. */
export type ContextMenuConfiguration =
  readonly Action[] | Readonly<{ actions: readonly Action[]; preview?: ReactNode }>
/** Row swipe actions and context-menu commands. */
export type RowActionsProps = Readonly<{
  swipeActions?: SwipeActions
  contextMenu?: ContextMenuConfiguration
}>
export function actionItems(actions: readonly Action[], inheritedDisabled?: boolean): ActionItem[]
export function actionItems(
  actions: readonly SwipeAction[],
  inheritedDisabled?: boolean,
): SwipeActionItem[]
export function actionItems(
  actions: readonly SwipeAction[],
  inheritedDisabled = false,
): SwipeActionItem[] {
  return actions.flatMap(action =>
    'section' in action
      ? actionItems(action.section, inheritedDisabled)
      : 'submenu' in action
        ? actionItems(action.submenu, inheritedDisabled || !!action.disabled)
        : [inheritedDisabled ? { ...action, disabled: true } : action],
  )
}
export function contextDefinition(
  value: ContextMenuConfiguration,
): Readonly<{ actions: readonly Action[]; preview?: ReactNode }> {
  return 'actions' in value ? value : { actions: value }
}

/** Resolve each edge once, using a single configuration shape. */
export function swipeEdge(value: SwipeActions | undefined, edge: 'leading' | 'trailing') {
  if (!value) return { actions: [], allowsFullSwipe: true, shape: undefined }
  if ('actions' in value) {
    return {
      actions: (value.edge ?? 'trailing') === edge ? actionItems(value.actions) : [],
      allowsFullSwipe: value.allowsFullSwipe !== false,
      shape: value.shape,
    }
  }
  const configuration = value.find(item => (item.edge ?? 'trailing') === edge)
  return {
    actions: actionItems(configuration?.actions ?? []),
    allowsFullSwipe: configuration?.allowsFullSwipe !== false,
    shape: configuration?.shape,
  }
}
