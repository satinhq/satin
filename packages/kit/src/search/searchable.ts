import type { ReactNode } from 'react'

/** A controlled scope bar, shown under the search field while search is presented. */
export type SearchScopes = Readonly<{
  selection: string
  onSelectionChange(selection: string): void
  options: readonly Readonly<{ id: string; label: string }>[]
}>

/** A suggestion shown under the search field. Choosing one replaces the search text; it does not
 * submit. */
export type SearchSuggestion = Readonly<{
  id: string
  text: string
  label?: ReactNode
}>

/** Where the search field goes. On iPhone, `'automatic'` uses the bottom toolbar outside a
 * `TabView` when the screen has no other bottom bar items or scopes; otherwise it uses a drawer
 * that scrolls away with the content. On iPad, automatic search belongs to the trailing
 * navigation toolbar, or below the sidebar toolbar in a split view. Explicit toolbar
 * placement stays trailing on iPad, including narrow windows. */
export type SearchFieldPlacement = 'automatic' | 'navigationBarDrawer' | 'toolbar'

/**
 * A search field for a screen or list: its controlled text, prompt, placement, scopes and
 * suggestions. The bar owns the field: its capsule, magnifier, clear button, close button, scope
 * bar and collapse on scroll. In the bottom toolbar, the presented field rides above the
 * keyboard with a close button, and the bar and title give way. Place
 * `<DefaultToolbarItem kind="search" placement="bottomBar" />` to put it beside other bottom bar
 * items.
 */
export type Searchable = Readonly<
  {
    text: string
    onTextChange(text: string): void
    prompt?: string
    /** Default `'automatic'`. On iPhone a field with `scopes` uses the drawer. */
    placement?: SearchFieldPlacement
    scopes?: SearchScopes
    suggestions?: readonly SearchSuggestion[]
    onSubmit?(): void
  } & (
    | { isPresented?: never; onPresentedChange?(presented: boolean): void }
    | { isPresented: boolean; onPresentedChange(presented: boolean): void }
  )
>

export function validateSearchPresentation(configuration: Searchable): void {
  if (
    configuration.isPresented !== undefined &&
    typeof configuration.onPresentedChange !== 'function'
  )
    throw new TypeError('Controlled search presentation requires onPresentedChange.')
}
