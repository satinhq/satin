import { isSerializableState } from '../restoration/scene.ts'
import type { ScreenRegistry } from './registry.ts'
import type { ScreenId, ScreenParams } from './store.ts'
export interface RouteSchema<Params> {
  readonly version: number
  /** String parameter names accepted by the classic notification transport. */
  readonly pushParams?: readonly string[]
  readonly schemaOwned?: boolean
  /** Validation also serves links when the destination deliberately skips persistence. */
  readonly persist?: boolean
  readonly validate: (params: unknown) => params is Params
}
export interface SerializedRoute {
  screen: string
  version: number
  params?: unknown
}
export type TypedRoute<R extends ScreenRegistry> = {
  [Id in ScreenId<R>]: { screen: Id; params: ScreenParams<R, Id> }
}[ScreenId<R>]
/** Each route is independently versioned so updates keep the deepest valid ancestor. */
export function createRouteCodec<R extends ScreenRegistry>(registry: R) {
  const decode = (input: unknown): SerializedRoute | null => {
    try {
      if (!input || typeof input !== 'object') return null
      const route = input as SerializedRoute
      if (
        typeof route.screen !== 'string' ||
        !Number.isInteger(route.version) ||
        (route.params !== undefined && !isSerializableState(route.params))
      )
        return null
      const definition = registry.resolve(route.screen),
        schema = definition?.restoration
      if (!schema || route.version !== schema.version || !schema.validate(route.params)) return null
      return {
        screen: route.screen,
        version: schema.version,
        ...(route.params === undefined ? {} : { params: route.params }),
      }
    } catch {
      return null
    }
  }
  const decodePath = (input: unknown): SerializedRoute[] => {
    if (!Array.isArray(input)) return []
    const path: SerializedRoute[] = []
    for (const item of input.slice(0, 64)) {
      const route = decode(item)
      if (!route) break
      path.push(route)
    }
    return path
  }
  return {
    decode,
    decodePath,
    pushRules(tabs?: readonly string[]): import('../push/routes.ts').PushRouteRules {
      return Object.fromEntries(
        registry.definitions
          .filter(screen => screen.restoration?.pushParams)
          .map(screen => [
            screen.id,
            {
              params: screen.restoration!.pushParams!,
              version: screen.restoration!.version,
              validate: screen.restoration!.validate,
              schemaOwned: screen.restoration!.schemaOwned,
              ...(tabs ? { tabs } : {}),
            },
          ]),
      )
    },
    encode(route: TypedRoute<R>): SerializedRoute {
      const result = decode({
        ...route,
        version: registry.resolve(route.screen)?.restoration?.version,
      })
      if (!result) throw new Error('Invalid or non-restorable route')
      // Roundtrip rejects values that cannot survive storage.
      const roundtrip = decode(JSON.parse(JSON.stringify(result)))
      if (!roundtrip) throw new Error('Route params must be serializable')
      return roundtrip
    },
    encodeURL(base: string, path: readonly TypedRoute<R>[], tab?: string) {
      const url = new URL(base)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        !url.pathname.endsWith('/') ||
        url.search ||
        url.hash
      )
        throw new Error('Use an app scope URL')
      if (tab) url.searchParams.set('satin-tab', tab)
      url.searchParams.set('satin-route', JSON.stringify(path.map(route => this.encode(route))))
      return url.href
    },
    decodeURL(input: string, base: string): SerializedRoute[] | null {
      try {
        const url = new URL(input, base),
          scope = new URL(base)
        if (
          url.origin !== scope.origin ||
          url.pathname !== scope.pathname ||
          url.username ||
          url.password
        )
          return null
        const raw = url.searchParams.get('satin-route')
        if (raw === null) return null
        try {
          return decodePath(JSON.parse(raw))
        } catch {
          return []
        }
      } catch {
        return null
      }
    },
  }
}

/** Object key order is not route identity. Never throw for an app-owned value. */
export function sameRouteParams(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      )
    return value
  }
  try {
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
  } catch {
    return false
  }
}
