import { useDarkAppearance } from './appearance.ts'
import { defineSatinApp, type AppDefinition } from './definition.ts'
import { registerAppShell } from '../sw/registerAppShell.ts'

declare global {
  interface Window {
    __SATIN_DEFINITION__?: AppDefinition
  }
}
let source: AppDefinition | undefined
let validated: AppDefinition | undefined
export function getBuiltApp() {
  const next = window.__SATIN_DEFINITION__
  if (next !== source) {
    source = next
    validated = next ? defineSatinApp(next) : undefined
  }
  return validated
}
export function useAppBackground(app: AppDefinition | undefined, legacy: string | undefined) {
  const dark = useDarkAppearance()
  if (app && legacy !== undefined)
    throw new Error('SatinRoot background is owned by the app definition; remove background.')
  return app
    ? dark && app.appearance.darkLaunch !== 'match-light'
      ? app.appearance.darkLaunch.background
      : app.appearance.background
    : (legacy ?? '#ffffff')
}
let shell: ReturnType<typeof registerAppShell> | undefined
export function registerDefinedAppShell(
  app: AppDefinition,
): Promise<import('../sw/registerAppShell.ts').SatinAppShellRegistration | null> {
  shell ??= registerAppShell({
    updateProfile: app.updateProfile ?? 'release',
    updateActivation: import.meta.env.SATIN_DEV_MENU
      ? 'cold-launch-or-explicit'
      : app.updateActivation,
    scope: app.scope,
    serviceWorkerUrl: `${app.scope}sw.js`,
  }).catch(error => {
    shell = undefined
    throw error
  })
  return shell
}
