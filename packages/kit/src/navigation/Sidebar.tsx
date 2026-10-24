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
  /** A trailing count or other accessory. */
  value?: ReactNode
  disabled?: boolean
}>
/** The sidebar's entries, the selection callback and which entry starts selected. */
export type SidebarProps = Readonly<{
  entries: readonly SidebarEntry[]
  onSelect: (id: string) => void
  section?: string
  /** Controlled selection for application-owned detail state; null leaves every row unselected. */
  selection?: string | null
  /** First enabled entry by default, false for an empty detail, or an explicit entry id. */
  initialSelection?: 'first' | false | string
}>

/** A list of sidebar destinations. Selecting one shows it in the split view's detail column. */
export function Sidebar({
  entries,
  onSelect,
  section,
  selection,
  initialSelection = 'first',
}: SidebarProps) {
  const split = useContext(SplitContext)
  useLayoutEffect(() => {
    if (split?.mode !== 'split' || !entries.length || !split.claimInitialSelection?.()) return
    if (selection !== undefined || split.entry || initialSelection === false) return
    const initial = chooseSidebarInitialEntry(entries, initialSelection)
    if (initial) onSelect(initial.id)
  }, [entries, initialSelection, onSelect, selection, split])
  return (
    <ScrollSurface id="sidebar" axis="vertical" primary data-satin-sidebar-list="true">
      {section && <h2 data-satin-sidebar-section="true">{section}</h2>}
      {entries.map(entry => (
        <Pressable
          key={entry.id}
          disabled={entry.disabled}
          data-satin-sidebar-row="true"
          aria-current={
            (selection === undefined ? split?.identity : selection) === entry.id
              ? 'page'
              : undefined
          }
          onPress={() => onSelect(entry.id)}
        >
          {entry.icon && (
            <span aria-hidden="true" data-satin-sidebar-icon="true">
              {entry.icon}
            </span>
          )}
          <span data-satin-sidebar-label="true">{entry.label}</span>
          {entry.value != null && <span data-satin-sidebar-value="true">{entry.value}</span>}
        </Pressable>
      ))}
    </ScrollSurface>
  )
}
