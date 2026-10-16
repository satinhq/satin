import { classifyInstallSignals } from './installPolicy.ts'
/**
 * What a custom install page needs to know (public through `@satinhq/kit/install`). Every value is
 * read from the browser as it is; nothing is inferred. In particular "installed" is only the
 * standalone display mode: a Safari tab cannot tell whether the app is on the Home Screen.
 */

export type InstallDevice = 'iphone' | 'ipad' | 'other'
export type InstallBrowser = 'safari' | 'in-app' | 'other'

export interface InstallApp {
  readonly name: string
  readonly icon: string
  /** The app's tint (appearance.tint, or the system blue). */
  readonly tint: string
  /** The absolute address of the install page, for a QR code or Copy Link. */
  readonly installUrl: string
}

export interface InstallContext {
  readonly device: InstallDevice
  readonly browser: InstallBrowser
  /** Safari's major version (27 for Safari 27), or null in any other browser. */
  readonly safariVersion: number | null
  /** True when running as a Home Screen web app (standalone display mode). */
  readonly standalone: boolean
  readonly app: InstallApp
}

export interface CopyLinkResult {
  readonly copied: boolean
  /** The address, so a failure can show it for the person to select. */
  readonly url: string
}

export function classifyInstallDevice(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): InstallDevice {
  return classifyInstallSignals(userAgent, platform, maxTouchPoints).device
}

export function classifyInstallBrowser(userAgent: string): InstallBrowser {
  return classifyInstallSignals(userAgent, '', 0).browser
}

export function safariVersion(userAgent: string) {
  return classifyInstallSignals(userAgent, '', 0).safariVersion
}

function readApp(): InstallApp {
  const element = document.getElementById('satin-install-context')
  if (!element?.textContent)
    throw new Error(
      '@satinhq/kit/install is only available on the install page Satin builds (satinApp(app, { installPage })).',
    )
  const data = JSON.parse(element.textContent) as {
    name: string
    icon: string
    tint: string
    installRoute: string
  }
  return {
    name: data.name,
    icon: data.icon,
    tint: data.tint,
    installUrl: new URL(data.installRoute, location.href).href,
  }
}

export function readInstallContext(): InstallContext {
  const { userAgent, platform, maxTouchPoints } = navigator
  const signals = classifyInstallSignals(userAgent, platform, maxTouchPoints)
  return {
    ...signals,
    standalone:
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    app: readApp(),
  }
}

/** Copies the install page's address. Never throws: a refusal is reported with the address. */
export async function copyInstallLink(): Promise<CopyLinkResult> {
  const url = readApp().installUrl
  try {
    if (!navigator.clipboard?.writeText) return { copied: false, url }
    await navigator.clipboard.writeText(url)
    return { copied: true, url }
  } catch {
    return { copied: false, url }
  }
}
