import type { ReactNode } from 'react'

/** Groups destinations in the adaptable sidebar without creating another navigator. */
export type TabSectionProps = Readonly<{
  title: string
  /** Stable section identity when titles change or two sections have the same title. */
  id?: string
  /** Groups stay in the sidebar; the most recently selected destination can enter the iPad bar. */
  tabPlacement?: 'sidebarOnly'
  children: ReactNode
}>

/** A collapsible sidebar group. TabView consumes this declaration. */
export function TabSection({ children }: TabSectionProps) {
  return children
}
