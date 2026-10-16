import type { TabBarItem } from './TabBar.tsx'
import { createContext } from 'react'

/** A bottom accessory expands native phone tabs to the full dock. */
export const TabBarAccessoryContext = createContext(false)

/** iOS 27 intrinsic platters have 8 pt end margins and 8 pt overlapping selections. */
export function intrinsicTabGeometry(width: number, count: number) {
  const spacing = (width - 16) / count
  return {
    centres: Array.from({ length: count }, (_, index) => 8 + spacing * (index + 0.5)),
    selectionWidth: spacing + 8,
  }
}

export function isSupportedTabCount(count: number) {
  return count >= 2 && count <= 5
}

export function resolveTabBarModel(
  items: readonly TabBarItem[],
  selected: string,
  allowUnselected = false,
) {
  if (!isSupportedTabCount(items.length)) {
    throw new Error('TabBar requires between two and five controlled items.')
  }
  const ids = new Set<string>()
  for (const item of items) {
    if (!item.id) throw new Error('TabBar item ids must be non-empty.')
    if (ids.has(item.id)) throw new Error(`TabBar item id "${item.id}" is duplicated.`)
    ids.add(item.id)
  }
  const selectedIndex = items.findIndex(item => item.id === selected)
  if (selectedIndex < 0 && !allowUnselected) {
    throw new Error(`TabBar selected id "${selected}" is not registered.`)
  }
  return { selectedIndex }
}
