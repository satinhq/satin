import { useContext, useLayoutEffect, type ReactNode } from 'react'
import { Pressable } from '../press/Pressable.tsx'
import { ScrollSurface } from '../scroll/ScrollSurface.tsx'
import { SplitContext } from './splitContext.ts'
import { chooseSidebarInitialEntry } from './sidebarSelection.ts'

/** One sidebar destination: its id, label, optional icon and disabled state. */
export type SidebarEntry = Readonly<{
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}>
/** The sidebar's entries, the selection callback and which entry starts selected. */
export type SidebarProps = Readonly<{
  entries: readonly SidebarEntry[]
  onSelect: (id: string) => void
  section?: string
  /** First enabled entry by default, false for an empty detail, or an explicit entry id. */
  initialSelection?: 'first' | false | string
}>

/** A list of sidebar destinations. Selecting one shows it in the split view's detail column. */
export function Sidebar({ entries, onSelect, section, initialSelection = 'first' }: SidebarProps) {
  const split = useContext(SplitContext)
  useLayoutEffect(() => {
    if (split?.mode !== 'split' || !entries.length || !split.claimInitialSelection?.()) return
    if (split.entry || initialSelection === false) return
    const initial = chooseSidebarInitialEntry(entries, initialSelection)
    if (initial) onSelect(initial.id)
  }, [entries, initialSelection, onSelect, split])
  return (
    <ScrollSurface id="sidebar" axis="vertical" primary data-satin-sidebar-list="true">
      {section && <h2 data-satin-sidebar-section="true">{section}</h2>}
      {entries.map(entry => (
        <Pressable
          key={entry.id}
          disabled={entry.disabled}
          data-satin-sidebar-row="true"
          aria-current={split?.identity === entry.id ? 'page' : undefined}
          onPress={() => onSelect(entry.id)}
        >
          {entry.icon && (
            <span aria-hidden="true" data-satin-sidebar-icon="true">
              {entry.icon}
            </span>
          )}
          <span>{entry.label}</span>
        </Pressable>
      ))}
    </ScrollSurface>
  )
}
