import type { BoundNavigatorTransition, TransitionScreenElements } from './transitionBindings.ts'

export type NavigationGlassRoute = TransitionScreenElements & { key: string; source: HTMLElement }
export type NavigationGlassState = {
  active: boolean
  width: number
  routes: readonly NavigationGlassRoute[]
  top: string
  zoom?: boolean
}
const states = new WeakMap<HTMLElement, NavigationGlassState>()
export const navigationGlassState = (host: HTMLElement) => states.get(host)
const listeners = new WeakMap<
  HTMLElement,
  Set<(state: NavigationGlassState) => void | Promise<void>>
>()

/** Use controller bindings for the real rear of popToRoot/replace. Arbitrary
 * intermediate exiting routes must not cover that rear in the glass source. */
export function navigationGlassRoutes(
  keys: readonly string[],
  elements: ReadonlyMap<string, TransitionScreenElements>,
  bindings: readonly BoundNavigatorTransition[],
) {
  const needed = new Set<HTMLElement>()
  for (const { binding } of bindings) {
    needed.add(binding.primary)
    if (binding.secondary) needed.add(binding.secondary)
  }
  return keys.flatMap((key, index) => {
    const route = elements.get(key)
    if (
      !route ||
      !(
        needed.has(route.motion) ||
        needed.has(route.screen) ||
        (!bindings.length && index >= keys.length - 2)
      )
    )
      return []
    const source =
      route.screen.querySelector<HTMLElement>('[data-satin-scroll][data-satin-primary="true"]') ??
      route.motion
    return [{ ...route, key, source }]
  })
}

/** Commit-boundary ownership, never a React update for an animation frame. */
export function publishNavigationGlass(host: HTMLElement, state: NavigationGlassState) {
  states.set(host, state)
  const ready = Promise.all([...(listeners.get(host) ?? [])].map(listener => listener(state))).then(
    () => {},
  )
  // Publication also occurs without an automatic push consumer. The runtime reports failures.
  void ready.catch(() => {})
  return ready
}
export function observeNavigationGlass(
  host: HTMLElement,
  listener: (state: NavigationGlassState) => void | Promise<void>,
) {
  const set = listeners.get(host) ?? new Set()
  listeners.set(host, set)
  set.add(listener)
  const state = states.get(host)
  if (state) void Promise.resolve(listener(state)).catch(() => {})
  return () => {
    set.delete(listener)
  }
}

/** Read compositor-owned transforms, including overlapping pop parents. No
 * bounding-box/layout reads or independent spring clock in the frame loop. */
export function sampleNavigationGlass(state: NavigationGlassState) {
  return state.routes.map(route => {
    const outer = getComputedStyle(route.screen).transform
    const inner = getComputedStyle(route.motion).transform
    const x =
      (outer === 'none' ? 0 : new DOMMatrixReadOnly(outer).m41) +
      (inner === 'none' ? 0 : new DOMMatrixReadOnly(inner).m41)
    const dim = Number(getComputedStyle(route.dim).opacity)
    return { key: route.key, x, dim: Number.isFinite(dim) ? dim : 0 }
  })
}
