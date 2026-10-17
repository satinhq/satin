import type { ScreenEntry, TransitionBinding, TransitionController } from './types.ts'

export type TransitionScreenElements = Readonly<{
  dim: HTMLElement
  motion: HTMLElement
  screen: HTMLElement
}>

export type TransitionNavigationElements = Readonly<{
  backButtonMask?: HTMLElement
  backButtonVisual?: HTMLElement
  backVisibleByEntry: ReadonlyMap<string, boolean>
  titles: ReadonlyMap<string, HTMLElement>
  /** Each entry's bar toolbar slots. */
  toolbars?: ReadonlyMap<string, readonly HTMLElement[]>
}>

export type BoundNavigatorTransition = Readonly<{
  binding: TransitionBinding
  controller: TransitionController
}>

/** Shared ownership for DOM painting, glass source selection and tracks. */
export function transitionParticipants<Controller>(
  entries: readonly { transition: { phase: string; controller?: Controller } }[],
) {
  const groups = new Map<Controller | undefined, { entering: number[]; exiting: number[] }>()
  entries.forEach((entry, index) => {
    if (entry.transition.phase === 'settled') return
    const group = groups.get(entry.transition.controller) ?? { entering: [], exiting: [] }
    if (entry.transition.phase === 'entering') group.entering.push(index)
    else group.exiting.push(index)
    groups.set(entry.transition.controller, group)
  })
  return [...groups].flatMap(([controller, group]) => {
    const entering = group.entering.at(-1)
    const primaryIndex = entering ?? group.exiting.at(-1)
    const secondaryIndex =
      entering !== undefined ? (group.exiting.at(-1) ?? entering - 1) : (group.exiting[0] ?? 0) - 1
    return primaryIndex === undefined || secondaryIndex < 0
      ? []
      : [
          {
            controller,
            primaryIndex,
            secondaryIndex,
            direction: entering !== undefined ? ('push' as const) : ('pop' as const),
          },
        ]
  })
}

/** The rear title's clipping box and content (NavigationChrome renders both in every layer). */
function titleClip(layer: HTMLElement) {
  const clip = layer.querySelector?.<HTMLElement>('[data-satin-navigation-title-clip]')
  const content = layer.querySelector?.<HTMLElement>('[data-satin-navigation-title-content]')
  return clip && content ? { secondaryTitleClip: clip, secondaryTitleContent: content } : {}
}

export function collectTransitionBindings(
  entries: readonly ScreenEntry[],
  elements: ReadonlyMap<string, TransitionScreenElements>,
  width: number,
  navigation?: TransitionNavigationElements,
): readonly BoundNavigatorTransition[] {
  const bindings: BoundNavigatorTransition[] = []
  const navigationBinding = (
    primaryIndex: number,
    secondaryIndex: number,
    direction: TransitionBinding['direction'],
  ) => {
    if (!navigation) return {}
    const primaryEntry = entries[primaryIndex]
    const secondaryEntry = entries[secondaryIndex]
    if (!primaryEntry || !secondaryEntry) return {}
    const primaryTitle = navigation.titles.get(primaryEntry.key)
    const secondaryTitle = navigation.titles.get(secondaryEntry.key)
    const primaryBackVisible = navigation.backVisibleByEntry.get(primaryEntry.key) ?? false
    const secondaryBackVisible = navigation.backVisibleByEntry.get(secondaryEntry.key) ?? false
    const backFromVisible = direction === 'push' ? secondaryBackVisible : primaryBackVisible
    const backToVisible = direction === 'push' ? primaryBackVisible : secondaryBackVisible
    const backVisibilityChanges = backFromVisible !== backToVisible

    const primaryToolbar = [...(navigation.toolbars?.get(primaryEntry.key) ?? [])]
    if (direction === 'pop') {
      for (let index = primaryIndex - 1; index > secondaryIndex; index--) {
        for (const slot of navigation.toolbars?.get(entries[index]!.key) ?? []) {
          if (!slot.childElementCount) continue
          const placement = slot.dataset.satinNavigationToolbarSlot
          if (
            !primaryToolbar.some(
              existing =>
                existing.childElementCount &&
                existing.dataset.satinNavigationToolbarSlot === placement,
            )
          )
            primaryToolbar.push(slot)
        }
      }
    }
    const secondaryToolbar = navigation.toolbars?.get(secondaryEntry.key)
    return {
      ...(primaryToolbar?.length ? { primaryToolbar } : {}),
      ...(secondaryToolbar?.length ? { secondaryToolbar } : {}),
      ...(primaryTitle ? { primaryTitle } : {}),
      ...(secondaryTitle ? { secondaryTitle, ...titleClip(secondaryTitle) } : {}),
      ...(navigation.backButtonMask && navigation.backButtonVisual && backVisibilityChanges
        ? {
            backButtonMask: navigation.backButtonMask,
            backButtonFromVisible: backFromVisible,
            backButtonToVisible: backToVisible,
            backButtonVisual: navigation.backButtonVisual,
          }
        : {}),
    }
  }

  for (const {
    controller,
    primaryIndex,
    secondaryIndex,
    direction,
  } of transitionParticipants<TransitionController>(entries)) {
    if (!controller?.bind) continue
    const primaryEntry = entries[primaryIndex],
      secondaryEntry = entries[secondaryIndex]
    if (!primaryEntry || !secondaryEntry) continue
    const primaryElements = elements.get(primaryEntry.key),
      secondaryElements = elements.get(secondaryEntry.key)
    if (!primaryElements || !secondaryElements) continue
    bindings.push({
      binding: {
        ...navigationBinding(primaryIndex, secondaryIndex, direction),
        direction,
        primary: primaryElements.motion,
        secondary: secondaryElements.screen,
        ...(primaryElements.screen.closest?.('.satin-sheet-content')
          ? { occludeSecondary: true }
          : {}),
        secondaryDim: secondaryElements.dim,
        width,
      },
      controller,
    })
  }

  return bindings
}
