import type { ReactNode } from 'react'

/** `searchScopes(_:activation: .onSearchPresentation)`: a controlled scope bar shown
 * under the field while search is presented. */
export type SearchScopes = Readonly<{
  selection: string
  onSelectionChange(selection: string): void
  options: readonly Readonly<{ id: string; label: string }>[]
}>

/** `searchSuggestions` with `searchCompletion`: choosing one replaces the text. It does
 * not submit. */
export type SearchSuggestion = Readonly<{
  id: string
  text: string
  label?: ReactNode
}>

/** `SearchFieldPlacement`. `'automatic'` uses platform placement on iPhone: the bottom toolbar
 * outside a TabView when the screen has no other bottom bar items or scopes, else a drawer that
 * scrolls away with content. Regular-width automatic search uses the trailing navigation toolbar. */
export type SearchFieldPlacement = 'automatic' | 'navigationBarDrawer' | 'toolbar'

/**
 * `searchable(text:isPresented:placement:prompt:)`. The bar owns the field: its capsule,
 * magnifier, clear button, close button, scope bar and collapse on scroll. In the bottom toolbar,
 * the presented field rides above the keyboard with a close button, and the bar and title give
 * way. Place `<DefaultToolbarItem kind="search" placement="bottomBar" />` to put it beside other
 * bottom bar items (Messages).
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
