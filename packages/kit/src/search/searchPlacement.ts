import type { DeviceIdiom } from '../layout/deviceIdiom.ts'
import type { SearchFieldPlacement } from './searchable.ts'

/** Stock iOS 27.0 reference List + searchable defaults: a tab owns the bottom dock, so
 * iPhone automatic search uses the drawer there; iPad uses the trailing navigation
 * toolbar. Explicit drawer/default-toolbar-item requests keep their existing paths. */
export function resolveSearchPlacement(
  placement: SearchFieldPlacement | undefined,
  screen: Readonly<{
    idiom?: DeviceIdiom
    pane?: 'stack' | 'sidebar' | 'detail'
    compact: boolean
    bottomBarItems: boolean
    searchToolbarItem: boolean
    scoped?: boolean
    tabbed?: boolean
  }>,
): 'navigationBarDrawer' | 'toolbar' | 'navigationBarToolbar' {
  if (placement === 'navigationBarDrawer') return 'navigationBarDrawer'
  // iPad remains iPad in a narrow window. Sidebar search belongs below its own
  // toolbar; an explicit toolbar request always stays in the trailing slot.
  if (screen.idiom === 'pad') {
    if (placement === 'toolbar') return 'navigationBarToolbar'
    return screen.pane === 'sidebar' ? 'navigationBarDrawer' : 'navigationBarToolbar'
  }
  if (placement === 'toolbar' || screen.searchToolbarItem) {
    return screen.compact && !screen.scoped ? 'toolbar' : 'navigationBarDrawer'
  }
  if (!screen.compact) return 'navigationBarToolbar'
  if (screen.scoped || screen.tabbed || screen.bottomBarItems) return 'navigationBarDrawer'
  return 'toolbar'
}
