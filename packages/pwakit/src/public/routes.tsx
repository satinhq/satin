import { PickerDestination, pickerRouteId, pickerTitle } from './pickerNavigation.tsx'
import { ScreenContentContext, ScreenChromeContext } from './screenChrome.tsx'
import { registerRoutes } from './routeRegistry.ts'
import { createElement, useContext, useSyncExternalStore, type ComponentType } from 'react'
import { createScreenRegistry } from '../navigation/registry.ts'
import { useParams, ScreenContext } from '../navigation/navigationContext.tsx'
import type {
  Visibility,
  TitleDisplayMode,
  NavigationBackButtonBehavior,
} from '../navigation/types.ts'
import type {
  ToolbarMinimizationBehavior,
  ToolbarMinimizationRestoration,
  ToolbarMinimizationSafeAreaAdjustment,
} from '../navigation/toolbarMinimization.ts'

import { NavigationLayoutContext } from '../layout/navigationLayoutContext.ts'
import { useLayoutClass } from '../root/runtimeContext.ts'

import {
  param,
  validateParameters,
  type ParameterSchema,
  type RouteParameters,
} from '../push/schema.ts'

const subscribeNever = () => () => {}
const snapshotZero = () => 0

export {
  param,
  type Parameter,
  type ParameterSchema,
  type RouteParameters,
} from '../push/schema.ts'
/** A destination's static chrome: what its bar shows from the first frame of the push. `Screen`
 * overrides any of these once the screen has its data. */
export type RouteOptions<S extends ParameterSchema> = {
  /** The parameter schema, built with `param`. */
  params?: S
  /** A function of the params lets the title be right on the push's first frame. */
  title?: string | ((params: RouteParameters<S>) => string)
  titleDisplay?: TitleDisplayMode
  backButton?: NavigationBackButtonBehavior
  /** The navigation bar's visibility. */
  toolbarVisibility?: Visibility
  toolbarMinimizationBehavior?: ToolbarMinimizationBehavior
  toolbarMinimizationRestoration?: ToolbarMinimizationRestoration
  toolbarMinimizationSafeAreaAdjustment?: ToolbarMinimizationSafeAreaAdjustment
  /** `skip` keeps this entry (and anything pushed above it) out of the restored path. */
  restoration?: 'restore' | 'skip'
  /** The sidebar row this destination selects in a `NavigationSplitView` (default: its id). */
  sidebar?: string | ((params: RouteParameters<S>) => string)
}
/** A screen bound to its parameter schema; made by `route`, collected by `defineRoutes`. */
export interface RouteDefinition<P = any> {
  readonly component: ComponentType<P>
  readonly options: RouteOptions<any>
  readonly validate: (value: unknown) => value is P
}
/**
 * Binds a screen component to its parameter schema and static chrome. Declare the params first,
 * then type the component with `RouteParameters<typeof params>`; this order avoids inference
 * cycles.
 *
 * @example
 * const noteParams = { id: param.string() }
 * function NoteScreen({ id }: RouteParameters<typeof noteParams>) { ... }
 * route(NoteScreen, { params: noteParams, title: 'Note' })
 */
export function route<const S extends ParameterSchema = Record<never, never>>(
  component: ComponentType<NoInfer<RouteParameters<S>>>,
  options: RouteOptions<S> = {},
): RouteDefinition<RouteParameters<S>> {
  const schema = Object.freeze({ ...options.params })
  options = Object.freeze({ ...options, params: schema as S })
  const validate = (value: unknown): value is RouteParameters<S> =>
    validateParameters(schema, value)
  return Object.freeze({ component, options, validate })
}
/** Every destination of an app, made by `defineRoutes`. */
export interface Routes<
  D extends Record<string, RouteDefinition> = Record<string, RouteDefinition>,
> {
  readonly definitions: D
}
/** The params of one route, as its component receives them. */
export type RouteProps<R extends Routes, Id extends keyof R['definitions']> =
  R['definitions'][Id] extends RouteDefinition<infer P> ? P : never
/**
 * Declares every destination once. The same schema
 * types `useNavigation` and `NavigationLink`, validates restored paths and checks notification
 * deep links, so a route id or param is never a free-form string.
 *
 * @example
 * export const routes = defineRoutes({
 *   notes: route(NotesScreen, { title: 'Notes', titleDisplay: 'large' }),
 *   note: route(NoteScreen, { params: noteParams, title: 'Note' }),
 * })
 */
export function defineRoutes<const D extends Record<string, RouteDefinition>>(
  definitions: D,
): Routes<D> {
  for (const id of Object.keys(definitions)) {
    if (!id.trim() || id.startsWith('__satin:')) throw new Error('A route id must not be empty')
  }
  // Built-in destinations need the same content chrome as app routes. Registering only their
  // bar leaves scroll views with the presentation's empty context and no navigation inset.
  const destinations: Record<string, RouteDefinition> = {
    ...definitions,
    [pickerRouteId]: route(PickerDestination, {
      params: { id: param.string() },
      title: pickerTitle,
      titleDisplay: 'inline',
      restoration: 'skip',
    }),
  }
  const screens = Object.entries(destinations).map(([id, definition]) => {
    const { component, options, validate } = definition
    const Screen = () => {
      const params = useParams() ?? {}
      // A List can be a route's entire body. Optional Screen declarations must not
      // be required for system placement or for finding that route's toolbar.
      const screen = useContext(ScreenContext)
      const chrome = useContext(ScreenChromeContext)
      useSyncExternalStore(
        chrome?.subscribe ?? subscribeNever,
        chrome?.snapshot ?? snapshotZero,
        snapshotZero,
      )
      const slots = screen ? chrome?.slots.get(screen.key) : undefined
      const scopedHorizontal = useContext(NavigationLayoutContext)
      const runtimeHorizontal = useLayoutClass().horizontal
      const title = typeof options.title === 'function' ? options.title(params) : options.title
      return (
        <ScreenContentContext
          value={{
            title,
            horizontalSizeClass: scopedHorizontal ?? runtimeHorizontal,
            bottomToolbar: slots?.bottom ?? undefined,
            trailingToolbar: slots?.trailing ?? undefined,
            titleDisplay: options.titleDisplay ?? 'inline',
            backButton: options.backButton,
            toolbarVisibility: options.toolbarVisibility,
            toolbarMinimizationBehavior: options.toolbarMinimizationBehavior,
            toolbarMinimizationRestoration: options.toolbarMinimizationRestoration,
            toolbarMinimizationSafeAreaAdjustment: options.toolbarMinimizationSafeAreaAdjustment,
          }}
        >
          {createElement(component, params)}
        </ScreenContentContext>
      )
    }
    return {
      id,
      component: Screen,
      navigation: {
        title: options.title ?? '',
        display: options.titleDisplay ?? 'inline',
        backButton: options.backButton,
        visibility: options.toolbarVisibility,
      },
      splitSelection: options.sidebar,
      restoration: {
        version: 1,
        schemaOwned: true,
        persist: options.restoration !== 'skip',
        pushParams: Object.keys(options.params ?? {}),
        validate,
      },
    }
  })
  const routes = Object.freeze({ definitions: Object.freeze(definitions) })
  registerRoutes(routes, createScreenRegistry(...screens))
  return routes
}

/**
 * Augment once in the app to type bare `NavigationLink`, `NavigationStack`, `TabView` and
 * `useNavigation` without generics.
 *
 * @example
 * declare module '@satinhq/kit' {
 *   interface Register { routes: typeof routes; navigation: typeof navigation }
 * }
 */
export interface Register {}
/** The routes declared through `Register`; an empty route set when the app has not registered. */
export type RegisteredRoutes = Register extends { routes: infer R extends Routes }
  ? R
  : Routes<Record<never, never>>
