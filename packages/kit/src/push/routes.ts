/** Shared, validated route codec. No navigation or browser history side effects. */
export interface PushRoute<
  Params extends Record<string, string | number | boolean> = Record<string, string>,
> {
  screen: string
  params?: Params
  tab?: string
  version?: number
}
export type PushRouteRules = Record<
  string,
  {
    params: readonly string[]
    tabs?: readonly string[]
    version?: number
    validate?: (params: unknown) => boolean
    schemaOwned?: boolean
  }
>
export function validatePushRoute(
  route: PushRoute<Record<string, string | number | boolean>>,
  rules: PushRouteRules,
): PushRoute<Record<string, string | number | boolean>> {
  const rule = Object.hasOwn(rules, route?.screen ?? '') ? rules[route.screen] : undefined
  if (!rule || (route.tab !== undefined && !rule.tabs?.includes(route.tab)))
    throw new Error('Unknown push destination')
  if (route.version !== undefined && !Number.isInteger(route.version))
    throw new Error('Invalid route version')
  if (rule.version !== undefined && route.version !== rule.version)
    throw new Error('Incompatible route version')
  const params = route.params ?? {}
  if (
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params) ||
    (rule.schemaOwned
      ? Object.keys(params).some(
          key =>
            !rule.params.includes(key) ||
            !['string', 'number', 'boolean'].includes(typeof params[key]) ||
            (typeof params[key] === 'number' && !Number.isFinite(params[key])) ||
            (typeof params[key] === 'string' && params[key].length > 256),
        )
      : Object.keys(params).length !== rule.params.length ||
        rule.params.some(
          key =>
            !Object.hasOwn(params, key) ||
            typeof params[key] !== 'string' ||
            params[key].length > 256,
        ))
  )
    throw new Error('Invalid route parameters')
  if (rule.validate && !rule.validate(route.params)) throw new Error('Invalid route parameters')
  return {
    screen: route.screen,
    ...(route.params === undefined ? {} : { params }),
    ...(route.tab ? { tab: route.tab } : {}),
    ...(route.version !== undefined ? { version: route.version } : {}),
  }
}
export function encodePushRoute(
  base: string,
  route: PushRoute<Record<string, string | number | boolean>>,
  rules: PushRouteRules,
  deliveryId: string,
): string {
  if (typeof deliveryId !== 'string' || !deliveryId || deliveryId.length > 128)
    throw new Error('Invalid delivery ID')
  const url = new URL(base)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !url.pathname.endsWith('/') ||
    url.search ||
    url.hash
  )
    throw new Error('Use an HTTPS app scope URL')
  url.searchParams.set('satin-push', JSON.stringify(validatePushRoute(route, rules)))
  url.searchParams.set('satin-delivery', deliveryId)
  return url.href
}
export function decodePushRoute(input: string, base: string, rules: PushRouteRules) {
  try {
    const url = new URL(input, base),
      scope = new URL(base)
    if (
      url.username ||
      url.password ||
      url.origin !== scope.origin ||
      url.pathname !== scope.pathname
    )
      return null
    const raw = url.searchParams.get('satin-push'),
      id = url.searchParams.get('satin-delivery')
    return raw && id && id.length <= 128
      ? { route: validatePushRoute(JSON.parse(raw), rules), id }
      : null
  } catch {
    return null
  }
}
