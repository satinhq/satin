export type TabBadgeValue = number | 'dot' | null

/** Zero clears a count. Share this policy across glass, fallback and sidebar tabs. */
export function TabBadge({ value }: { value?: TabBadgeValue }) {
  if (value == null || value === 0) return null
  return (
    <span data-satin-tab-badge={value === 'dot' ? 'dot' : 'number'}>
      {value === 'dot' ? null : value}
    </span>
  )
}
