import { installLaunchScreenRuntime } from './launchScreenRuntime.ts'
import { launchScreenMarkup, prelaunchCSS } from './launchScreen.ts'
import { resolveDeviceIdiom } from '../layout/deviceIdiom.ts'
import { checkDeployment, deploymentExpectation } from './deployment.ts'
import { installPageCheck } from './installCheck.ts'
import { customInstallPage, installCustomMount } from './installCustom.ts'
import { installExperiencePage } from './installExperience.ts'
import { ADAPTIVE_LAYOUT_POLICY } from '../layout/layoutClass.ts'
import { SATIN_VIEWPORT, resolveViewportFit } from './viewportValue.ts'
import { startupImages } from './startup.ts'
import type { AppDefinition } from './definition.ts'
import { APP_MANIFEST_VARIANTS, appManifestStem } from './manifests.ts'

export interface IOSWebKitSignals {
  readonly touchCallout: boolean
  readonly gestureEvents: boolean
  readonly standalone: boolean
}

export function isIOSWebKit(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
  signals: IOSWebKitSignals,
) {
  if (!/AppleWebKit/i.test(userAgent) || /Android/i.test(userAgent)) return false
  const mobileIdentity = /iPhone|iPad|iPod/i.test(userAgent)
  const touchMacIdentity = platform === 'MacIntel' && maxTouchPoints > 1
  // CSS parsing, gesture APIs and the standalone API are independent signals.
  // GestureEvent and ongesturestart count together, not as two separate proofs.
  const signalCount =
    Number(signals.touchCallout) + Number(signals.gestureEvents) + Number(signals.standalone)
  // Some WKWebViews omit Safari's standalone/gesture API. Keep genuine mobile
  // WebKit compatible when one signal survives; a spoofed UA alone never passes.
  return mobileIdentity ? signalCount >= 1 : touchMacIdentity && signalCount >= 2
}

/** Generated install and app heads share one idiom resolver and manifest URL policy. */
export function appManifestHrefExpression(stemExpression: string) {
  const suffixes = Object.fromEntries(
    APP_MANIFEST_VARIANTS.filter(variant => variant.selected).map(variant => [
      variant.idiom,
      variant.suffix,
    ]),
  )
  return `${stemExpression} + ((${JSON.stringify(suffixes)})[(${resolveDeviceIdiom.toString()})(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)] ?? ${JSON.stringify(suffixes.phone)})`
}

/** Public page URLs are projected under Vite's deployment base. */
export function installRouteForBase(app: AppDefinition, base: string) {
  const route = app.installRoute ?? '/install'
  return route.startsWith(base) ? route : base + route.slice(1)
}

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
/** Preview builds accept device/layout overrides; production never does. */
export interface InstallPageOptions {
  readonly cover?: string
  readonly preview?: boolean
  /** The author's bundled install page, set by satinApp(app, { installPage }). */
  readonly customPage?: string
}

export function installPage(
  app: AppDefinition,
  kind: 'landing' | 'install' | 'gate',
  base = '/',
  options: InstallPageOptions = {},
) {
  const icon = app.icons.find(icon => icon.type === 'image/png') ?? app.icons[0]!
  const dark =
    app.appearance.darkLaunch === 'match-light'
      ? app.appearance.background
      : app.appearance.darkLaunch.background
  const stem = appManifestStem(app)
  // Keep the device asset table outside the bounded install-page payload.
  // Constant palettes retain their existing no-JavaScript startup fallback.
  const fallback =
    app.appearance.background === dark
      ? '<noscript>' +
        startupImages(stem, app.appearance.background, dark)
          .map(
            image =>
              `<link rel="apple-touch-startup-image" href="${base}${image.file}" media="${image.media}">`,
          )
          .join('') +
        '</noscript>'
      : ''
  const startup = `<script defer src="${app.scope}${stem}-startup.js"></script>${fallback}`

  const status = `<meta name="apple-mobile-web-app-capable" content="yes"><meta id="satin-install-status" name="apple-mobile-web-app-status-bar-style" content="default"><meta name="theme-color" content="${app.appearance.background}" media="(prefers-color-scheme: light)"><meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)">`
  const title = kind === 'gate' ? 'This app is designed for iPhone and iPad' : app.name
  const body = `<p>${escape(app.description)}</p><a href="${escape(installRouteForBase(app, base))}">Add to Home Screen</a>`
  const head = `<meta charset="utf-8"><meta name="viewport" content="${SATIN_VIEWPORT}"><script>(()=>{const fit=(${resolveViewportFit.toString()})(${JSON.stringify(app.viewportFit ?? 'adaptive')},navigator.userAgent,navigator.platform,navigator.maxTouchPoints,innerWidth,innerHeight,${ADAPTIVE_LAYOUT_POLICY.horizontal.regularMinimum},${ADAPTIVE_LAYOUT_POLICY.vertical.regularMinimum});document.querySelector('meta[name="viewport"]').content=${JSON.stringify(SATIN_VIEWPORT)}.replace('viewport-fit=cover','viewport-fit='+fit)})();</script><title>${escape(title)}</title>${status}${startup}<link rel="manifest" href="${base}${stem}.webmanifest"><script>(()=>{document.querySelector('link[rel="manifest"]').href=${appManifestHrefExpression(JSON.stringify(base + stem))}})();</script><link rel="apple-touch-icon" href="${escape(icon.src)}">`
  const environment = `<script id="satin-prelaunch-install">(${installLaunchScreenRuntime.toString()})(${JSON.stringify({ markup: options.cover ?? launchScreenMarkup({ ...app, launchScreen: { icon: 'data:,' } }), css: prelaunchCSS, scope: app.scope, background: app.appearance.background, darkBackground: dark, darkInk: app.appearance.darkLaunch === 'match-light' ? '#1c1c1e' : '#fff', cover: false }).replaceAll('<', '\\u003c')});</script>`
  const scripts = `${kind === 'install' ? environment : ''}<script id="satin-deployment" type="application/json">${JSON.stringify([deploymentExpectation(app, base)]).replaceAll('<', '\\u003c')}</script>${kind === 'install' ? `<script data-satin-install-check${options.customPage ? ` data-satin-install-entry="${escape(options.customPage)}"` : ''}>(${installPageCheck.toString()})(${JSON.stringify(deploymentExpectation(app, base))},${checkDeployment.toString()},4000${options.customPage ? `,(${installCustomMount.toString()}).bind(null,${JSON.stringify(options.customPage)})` : ''}).catch(error=>{console.error("[Satin deployment]",error);window.__SATIN_PRELAUNCH__.error("Configuration check failed. Reload and check the console.","This app is misconfigured");document.getElementById("satin-install-guide").hidden=true})</script>` : ''}`
  if (options.customPage && kind === 'install') {
    return customInstallPage({
      head,
      scripts,
      name: app.name,
      icon: icon.src,
      tint: app.appearance.tint ?? '#007aff',
      installRoute: installRouteForBase(app, base),
      background: app.appearance.background,
      darkBackground: dark,
      darkText: app.appearance.darkLaunch !== 'match-light',
    })
  }
  if (kind !== 'landing') {
    return installExperiencePage({
      app,
      base,
      head,
      kind,
      scripts,
      installRoute: installRouteForBase(app, base),
      preview: options.preview ?? process.env.SATIN_INSTALL_PREVIEW === '1',
    })
  }
  return `<!doctype html><html lang="en"><head>${head}<style>html{background:${app.appearance.background};color:#1c1c1e;font:17px/1.5 system-ui}@media(prefers-color-scheme:dark){html{background:${dark};color:${app.appearance.darkLaunch === 'match-light' ? '#1c1c1e' : '#fff'}}}body{margin:0}main{max-width:420px;margin:72px auto;padding:24px}img{border-radius:22px}h1{font-size:32px;line-height:1.15}a{color:#007aff}p{opacity:.8}</style></head><body data-satin-install-page><main><img src="${escape(icon.src)}" width="96" height="96" alt=""><h1>${escape(title)}</h1>${body}</main>${scripts}</body></html>`
}
