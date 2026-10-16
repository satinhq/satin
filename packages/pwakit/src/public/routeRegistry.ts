import type { ScreenRegistry } from '../navigation/registry.ts'
const registries = new WeakMap<object, ScreenRegistry>()
export function registerRoutes(routes: object, registry: ScreenRegistry) {
  registries.set(routes, registry)
}
export function resolveRoutes(routes: object): ScreenRegistry {
  const registry = registries.get(routes)
  if (!registry) throw new Error('Use defineRoutes to declare destinations')
  return registry
}
