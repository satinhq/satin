import type {
  AnyScreenDefinition,
  NavigationBarDefinition,
  TitleDisplayMode,
  ScreenEntry,
} from './types.ts'

export function resolveNavigationTitle(
  navigation: NavigationBarDefinition<any> | undefined,
  params: unknown,
) {
  if (!navigation) return undefined
  return typeof navigation.title === 'function' ? navigation.title(params) : navigation.title
}

export function backButtonVisible(definition: AnyScreenDefinition | undefined, entryIndex: number) {
  return (
    entryIndex > 0 &&
    definition?.navigation !== undefined &&
    definition.navigation.backButton !== 'hidden'
  )
}

export function backTargetIndex(entries: readonly ScreenEntry[]) {
  const firstExiting = entries.findIndex(entry => entry.transition.phase === 'exiting')
  return (firstExiting === -1 ? entries.length - 1 : firstExiting) - 1
}

/** An empty title reserves no large-title row. Bar demand is resolved separately. */
export function resolveNavigationDisplay(
  title: string | undefined,
  display: TitleDisplayMode | undefined,
  compact = false,
): TitleDisplayMode {
  if (display === 'none') return 'none'
  if (!title || (compact && display === 'large')) return 'inline'
  return display ?? 'inline'
}

/** Native iOS 27 omits an untitled root bar unless controls need its row. */
export function resolveNavigationVisibility(
  title: string | undefined,
  visibility: 'automatic' | 'visible' | 'hidden' | undefined,
  display: TitleDisplayMode | undefined,
  hasToolbar = false,
  hasBackButton = false,
) {
  if (visibility && visibility !== 'automatic') return visibility
  return (display !== 'none' && Boolean(title)) || hasToolbar || hasBackButton
    ? 'visible'
    : 'hidden'
}
