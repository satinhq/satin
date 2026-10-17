// Development telemetry is compile-time disabled in ordinary release builds.
const checks = new Map<string, number>()
const listeners = new Map<string, Set<(at: number) => void>>()

export function checkAppShellUpdate(registration: ServiceWorkerRegistration) {
  if (import.meta.env.SATIN_DEV_MENU) {
    const at = Date.now()
    checks.set(registration.scope, at)
    for (const listener of listeners.get(registration.scope) ?? []) listener(at)
  }
  return registration.update()
}

export function subscribeAppShellChecks(scope: string, listener: (at: number) => void) {
  const current = checks.get(scope)
  if (current !== undefined) listener(current)
  const scoped = listeners.get(scope) ?? new Set<(at: number) => void>()
  scoped.add(listener)
  listeners.set(scope, scoped)
  return () => {
    scoped.delete(listener)
    if (!scoped.size) listeners.delete(scope)
  }
}
