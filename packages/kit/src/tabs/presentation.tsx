import type { TabBarItem } from '../glass/TabBar.tsx'
import { SymbolImage } from '../symbols/Symbol.tsx'

/** Search is a destination with a reserved position, independent of declaration order. */
export function orderedTabItems<T extends Pick<TabBarItem, 'role'>>(
  items: readonly T[],
  placement: 'top' | 'sidebar',
): readonly T[] {
  const search = items.filter(item => item.role === 'search')
  if (!search.length) return items
  const destinations = items.filter(item => item.role !== 'search')
  return placement === 'top' ? [...destinations, ...search] : [...search, ...destinations]
}

/** Sizing and painted ink must use the same content, including the role's default symbol. */
export function TopTabLabel({ item }: { item: Pick<TabBarItem, 'role' | 'label'> }) {
  return item.role === 'search' ? <SymbolImage name="magnifyingglass" /> : item.label
}
