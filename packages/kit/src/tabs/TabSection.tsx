import type { ReactNode } from 'react'

/** A sidebar group's title, optional id and placement, and its `Tab` children. */
export type TabSectionProps = Readonly<{
  title: string
  /** Stable section identity when titles change or two sections have the same title. */
  id?: string
  /** Groups stay in the sidebar; the most recently selected destination can enter the iPad bar. */
  tabPlacement?: 'sidebarOnly'
  children: ReactNode
}>

/** Groups `Tab`s under a collapsible header in the `TabView` sidebar. It adds no navigator of its
 * own. */
export function TabSection({ children }: TabSectionProps) {
  return children
}
