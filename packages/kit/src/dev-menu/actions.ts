import type { SatinAppShellRegistration } from '../sw/registerAppShell.ts'
import { checkAppShellUpdate } from '../sw/updateCheck.ts'

export function createDevMenuActions(options: {
  shell: SatinAppShellRegistration | null
  scope: string
  reload?: () => void
  checked?: (at: number) => void
}) {
  const reload = options.reload ?? (() => location.reload())
  const requireShell = () => {
    if (!options.shell) throw new Error('Service worker unavailable in this build.')
    return options.shell
  }
  return {
    reload,
    async check() {
      const shell = requireShell()
      options.checked?.(Date.now())
      await checkAppShellUpdate(shell.registration)
      return shell.refresh()
    },
    async apply() {
      const shell = requireShell()
      await shell.refresh()
      if (!(await shell.applyUpdate())) throw new Error('No waiting update was applied.')
    },
    async force(confirmed: boolean) {
      if (!confirmed) return false
      const shell = requireShell()
      const scope = new URL(options.scope, location.origin).href
      if (shell.registration.scope !== scope)
        throw new Error('Worker scope does not match this app.')
      if (!navigator.onLine) throw new Error('Connect to the network before forcing an update.')
      // Verify the origin before removing an offline copy. Storage and other scopes are untouched.
      const response = await fetch(new URL('satin-version.json', scope), { cache: 'no-store' })
      if (!response.ok || typeof (await response.json()).buildId !== 'string') {
        throw new Error('The current deployment is unavailable. Cached build retained.')
      }
      const ownedPrefix = ':satin:app-shell:v2:' + encodeURIComponent(scope) + ':'
      const bindings = ':satin:app-shell-clients:v1:' + encodeURIComponent(scope)
      if (!(await shell.registration.unregister()))
        throw new Error('Could not unregister this app worker.')
      shell.dispose()
      for (const key of await caches.keys()) {
        if (key.startsWith(ownedPrefix) || key === bindings) await caches.delete(key)
      }
      const registration = await navigator.serviceWorker.register(new URL('sw.js', scope).href, {
        scope,
        updateViaCache: 'none',
      })
      await waitForInstallation(registration)
      // Reuse the framework's explicit activation and its single reload. A first install
      // can activate directly, in which case this document needs exactly one reload too.
      const { registerAppShell } = await import('../sw/registerAppShell.ts')
      const replacement = await registerAppShell({
        scope,
        serviceWorkerUrl: new URL('sw.js', scope).href,
        updateActivation: 'cold-launch-or-explicit',
      })
      if (replacement?.waiting) {
        if (!(await replacement.applyUpdate()))
          throw new Error('Replacement worker did not activate.')
      } else reload()
      return true
    },
  }
}

function waitForInstallation(registration: ServiceWorkerRegistration) {
  if (registration.waiting || (registration.active && !registration.installing))
    return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    let worker: ServiceWorker | null = null
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      registration.removeEventListener('updatefound', inspect)
      worker?.removeEventListener('statechange', inspect)
      if (error) reject(error)
      else resolve()
    }
    const inspect = () => {
      const next = registration.installing ?? registration.waiting ?? registration.active
      if (next !== worker) {
        worker?.removeEventListener('statechange', inspect)
        worker = next
        worker?.addEventListener('statechange', inspect)
      }
      if (worker?.state === 'redundant')
        finish(new Error('Replacement worker installation failed.'))
      else if (registration.waiting || worker?.state === 'activated') finish()
    }
    const timeout = setTimeout(
      () => finish(new Error('Replacement worker installation timed out.')),
      15_000,
    )
    registration.addEventListener('updatefound', inspect)
    inspect()
  })
}
