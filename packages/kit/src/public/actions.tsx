import { useContext, type ReactNode } from 'react'
import { Menu as EngineMenu, type MenuTriggerProps } from '../glass/Menu.tsx'
import { ToolbarContext } from './toolbar.tsx'
import { Button } from './controls.tsx'
import type { Action } from '../actions/types.ts'
export { ContextMenu } from '../actions/RowActions.tsx'
export type { Action } from '../actions/types.ts'
/** A menu's label and its actions. */
export type MenuProps = Readonly<{
  /** What the menu's button shows. In a toolbar a Symbol or an icon Label draws a glass circle. */
  label: ReactNode
  actions: readonly Action[]
  /** Draws a custom trigger. Forward every supplied trigger prop.
   * @experimental Custom menu triggers may change. */
  trigger?: (props: MenuTriggerProps) => ReactNode
}>
/** A button that opens a menu of actions. In a toolbar a symbol label draws an icon button and a
 * text label draws a capsule. */
export function Menu(props: MenuProps) {
  const toolbar = useContext(ToolbarContext)
  const trigger =
    props.trigger ??
    (toolbar === true
      ? (triggerProps: MenuTriggerProps) => <Button {...triggerProps}>{props.label}</Button>
      : undefined)
  return <EngineMenu {...props} trigger={trigger} />
}
