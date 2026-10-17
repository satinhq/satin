import type { SymbolName } from '../symbols/Symbol.tsx'
import type { ComponentType, ReactNode } from 'react'
import type { Register, RegisteredRoutes, RouteProps, Routes } from './routes.tsx'
/** A primary stack: its root route and, when that route requires them, the root's params. */
export type StackDeclaration<R extends Routes> = {
  [K in keyof R['definitions'] & string]: {
    root: K
  } & ({} extends RouteProps<R, K> ? { params?: RouteProps<R, K> } : { params: RouteProps<R, K> })
}[keyof R['definitions'] & string]
/** One tab in `defineNavigation`: its id, label, symbol or icon, and the root of its stack. */
export type TabDeclaration<R extends Routes> = StackDeclaration<R> & {
  /** The tab's identity: typed by `TabId`, used by `TabView selection` and restoration. */
  id: string
  label: string
  icon?: ReactNode
  symbol?: SymbolName
  /** `search` marks the search tab, drawn apart from the other tabs. */
  role?: 'search'
  /** Wraps the tab's stack, for per-tab providers. Render `<NavigationStack />` inside it. */
  content?: ComponentType
}
/** An app's primary navigation: either tabs, each owning a stack, or one stack. */
export type NavigationDeclaration<R extends Routes = RegisteredRoutes> =
  | { tabs: readonly TabDeclaration<R>[]; stack?: never; defaultTab?: string }
  | { stack: StackDeclaration<R>; tabs?: never; defaultTab?: never }
/**
 * Declares the app's primary tabs or its single stack before anything renders, so every stack
 * and tab id exists (and is typed) from the first frame. Pass the result to `runApp`; `TabView`,
 * `Tab` and `NavigationStack` then render it. Components may freely wrap those views.
 *
 * @example
 * const navigation = defineNavigation(routes, {
 *   tabs: [{ id: 'home', label: 'Home', symbol: 'house', root: 'home' }],
 * })
 */
export function defineNavigation<R extends Routes, const D extends NavigationDeclaration<R>>(
  routes: R,
  declaration: D & (D extends { tabs: readonly { id: infer I }[] } ? { defaultTab?: I } : unknown),
): D {
  return validateNavigation(routes, declaration)
}
/** Checks a declaration against its routes; `defineNavigation` and `runApp` both call it. */
export function validateNavigation<R extends Routes, D extends NavigationDeclaration<R>>(
  routes: R,
  declaration: D,
): D {
  if (Boolean(declaration.tabs) === Boolean(declaration.stack))
    throw new Error('Declare tabs or a single stack, exclusively')
  const stacks =
    'tabs' in declaration && declaration.tabs
      ? declaration.tabs
      : [{ id: 'main', ...declaration.stack }]
  if (!stacks.length) throw new Error('Navigation requires at least one primary stack')
  const ids = new Set<string>()
  for (const stack of stacks) {
    if (!stack.id?.trim() || ids.has(stack.id))
      throw new Error(`Invalid or duplicate tab id: ${stack.id}`)
    ids.add(stack.id)
    if (
      !Object.hasOwn(routes.definitions, stack.root) ||
      !routes.definitions[stack.root]?.validate(stack.params)
    )
      throw new Error(`Invalid root route: ${stack.root}`)
  }
  if (declaration.defaultTab !== undefined && !ids.has(declaration.defaultTab))
    throw new Error(`Unknown default tab: ${declaration.defaultTab}`)
  return Object.freeze({
    ...declaration,
    ...(declaration.tabs
      ? { tabs: Object.freeze(declaration.tabs.map(tab => Object.freeze({ ...tab }))) }
      : { stack: Object.freeze({ ...declaration.stack }) }),
  }) as D
}
/** The navigation declared through `Register`, which types bare `TabView`, `Tab` and
 * `NavigationStack`; `never` when the app has not registered one. */
export type RegisteredNavigation = Register extends {
  navigation: infer D extends NavigationDeclaration<Routes>
}
  ? D
  : never
/** The union of a navigation declaration's tab ids. */
export type TabId<D = RegisteredNavigation> = D extends {
  tabs: readonly { id: infer Id extends string }[]
}
  ? Id
  : never
