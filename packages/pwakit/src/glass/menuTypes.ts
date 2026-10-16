import type { ReactNode } from 'react'
import type { Action } from '../actions/types.ts'
import type { MenuSymbolName } from './menuSymbolMasks.ts'
export type GlassAction = Readonly<{
  id: string
  label: string
  icon?: ReactNode
  symbol?: MenuSymbolName
  destructive?: boolean
  onPress: () => void
}>
/** A menu entry at any depth: sections and submenus nest glass actions as well as plain ones. */
export type MenuEntry =
  | Action
  | GlassAction
  | Readonly<{ section: readonly MenuEntry[]; label?: string }>
  | Readonly<{
      id: string
      label: string
      icon?: ReactNode
      disabled?: boolean
      submenu: readonly MenuEntry[]
    }>
