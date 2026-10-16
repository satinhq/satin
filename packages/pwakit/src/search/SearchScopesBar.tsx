import type { CSSProperties } from 'react'
import { GlassBackground } from '../glass/GlassEffect.tsx'
import { SegmentedControl } from '../list-form/ListForm.tsx'
import type { SearchScopes } from './searchable.ts'

/** The same controlled scope bar is available under either navigation search placement. */
export function SearchScopesBar({
  scopes,
  presented,
}: {
  scopes: SearchScopes
  presented: boolean
}) {
  return (
    <div
      data-satin-search-scopes=""
      inert={!presented}
      style={{ '--satin-search-scope-count': scopes.options.length } as CSSProperties}
    >
      <GlassBackground
        shape="capsule"
        selection={{
          index: Math.max(
            0,
            scopes.options.findIndex(option => option.id === scopes.selection),
          ),
          count: scopes.options.length,
          // A released drag of the thumb selects the nearest scope; taps stay with the buttons.
          onSelect: index => scopes.onSelectionChange(scopes.options[index].id),
        }}
      />
      <SegmentedControl
        label="Search Scope"
        options={scopes.options}
        value={scopes.selection}
        onChange={scopes.onSelectionChange}
      />
    </div>
  )
}
