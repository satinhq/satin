import type { ReactNode } from 'react'
import type { SymbolName } from '../symbols/Symbol.tsx'
import type { CornerShape } from '../shapes/corners.ts'

/** An entry in a menu, context menu or swipe action list: a command, a titled section of
 * entries, or a submenu. */
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
/** A single command with an id, a label, an optional symbol and role, and an `onPress` handler.
 * Menus, swipe actions, alerts and confirmation dialogs all use it. */
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
/** A swipe action command. It may drop its visible label if it has a symbol or icon and an
 * `accessibilityLabel`. */
export type SwipeActionItem =
  | ActionItem
  | Readonly<
      Omit<ActionItem, 'label' | 'accessibilityLabel'> & {
        label?: never
        accessibilityLabel: string
      } & ({ symbol: SymbolName } | { icon: ReactNode })
    >
/** An entry in a row's swipe actions: any menu entry, or a swipe command that shows only a
 * symbol. */
export type SwipeAction = Action | SwipeActionItem
/** The `swipeActions` prop of a row: actions for one edge, or a list with one entry per edge. */
export type SwipeActions = SwipeActionsConfiguration | readonly SwipeActionsConfiguration[]

/** The swipe actions on one row edge, `trailing` by default. A full swipe runs the first action
 * unless `allowsFullSwipe` is false. */
export type SwipeActionsConfiguration = Readonly<{
  edge?: 'leading' | 'trailing'
  /** The shape of the revealed row face. Omit it for the system default. */
  shape?: CornerShape
  allowsFullSwipe?: boolean
  actions: readonly SwipeAction[]
}>

/** The `contextMenu` prop of a row: a list of actions, or actions with a custom `preview`. */
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
