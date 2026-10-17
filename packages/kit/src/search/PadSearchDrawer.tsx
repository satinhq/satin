import { useState, type RefObject } from 'react'
import { SearchToolbarField } from './SearchToolbarField.tsx'
import type { Searchable } from './searchable.ts'

/** A column-owned field. Its host stays in this scroll surface, never a sibling pane. */
export function PadSearchDrawer({
  configuration,
  scroller,
}: {
  configuration: Searchable
  scroller: RefObject<HTMLDivElement | null>
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  return (
    <div ref={setHost} data-satin-search-pad-drawer="" data-satin-search-toolbar-host="">
      {host && (
        <SearchToolbarField
          configuration={configuration}
          scroller={scroller}
          host={host}
          navigation
          drawer
        />
      )}
    </div>
  )
}
