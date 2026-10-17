import { registerEarlyWorker } from './earlyWorker.ts'
import { deploymentExpectation } from './deployment.ts'
import { installLaunchWatchdog } from './launchWatchdog.ts'
import { installLaunchScreenRuntime, resumeAppliedUpdate } from './launchScreenRuntime.ts'
import { GLASS_LAUNCH_BUDGET_MS } from './launchReadiness.ts'
import { appManifestHrefExpression, isIOSWebKit, installRouteForBase } from './install.ts'
import { resolvePlatformGate } from './platformPolicy.ts'
import { launchScreenMarkup, prelaunchCSS } from './launchScreen.ts'
import { installAppearanceStore } from './appearanceStore.ts'
import { ADAPTIVE_LAYOUT_POLICY } from '../layout/layoutClass.ts'
import { SATIN_VIEWPORT, resolveViewportFit } from './viewportValue.ts'
import { STARTUP_SCREENS, startupImages } from './startup.ts'
import type { AppDefinition } from './definition.ts'
import { appManifestStem } from './manifests.ts'
export { appManifestStem, appManifestFiles } from './manifests.ts'

/** One app definition in a multi-install lab build, chosen by exact query parameters. */
export interface AppFixture {
  /** Legacy display-mode capability rig only, never a production option. */
  readonly display?: 'standalone' | 'fullscreen' | 'minimal-ui'
  readonly app: AppDefinition
  /** Exact query parameters for this lab-only installed app. First match wins. */
  readonly query: Readonly<Record<string, string>>
}

export function generateAppHead(
  fixtures: readonly AppFixture[],
  base: string,
  production = true,
  devServer = false,
  covers: ReadonlyMap<string, string> = new Map(),
  buildId?: string,
) {
  const appearance = fixtures[0]?.app.appearance
  const lightBackground = appearance?.background ?? '#ffffff'
  const darkBackground =
    appearance?.darkLaunch === 'match-light'
      ? lightBackground
      : (appearance?.darkLaunch.background ?? '#000000')
  const data = JSON.stringify(
    fixtures.map(({ app, query }) => ({
      app,
      cover: covers.get(app.id) ?? launchScreenMarkup(app),
      query,
      installRoute: installRouteForBase(app, base),
      startupStem: appManifestStem(app),
      manifest: `${base}${appManifestStem(app)}`,
    })),
  ).replaceAll('<', '\\u003c')
  // A cached navigation must paint its launch surface even before head scripts
  // run. Match the manifest's two backgrounds, including match-light apps.
  return `<style id="satin-launch-paint">:root{--satin-launch-background:${lightBackground};--satin-launch-ink:#1c1c1e;--satin-background:${lightBackground}}@media(prefers-color-scheme:dark){:root{--satin-launch-background:${darkBackground};--satin-launch-ink:${appearance?.darkLaunch === 'match-light' ? '#1c1c1e' : '#ffffff'};--satin-background:${darkBackground}}}html,body{background:var(--satin-background);margin:0} [data-satin-root][data-satin-launch]:not([data-satin-launch="ready"]){opacity:0;pointer-events:none}</style>
<script id="satin-platform-gate">(() => {
 performance.mark('satin-document-head');
 const fixtures = ${data};
 const query = new URLSearchParams(location.search);
 const selected = fixtures.find(f => Object.entries(f.query).every(([k,v]) => query.get(k) === v));
 const app = selected.app;
 window.__SATIN_DEFINITION__ = app;
 const iosWebKit = (${isIOSWebKit.toString()})(
  navigator.userAgent, navigator.platform, navigator.maxTouchPoints, {
  touchCallout: typeof CSS !== 'undefined' && CSS.supports('-webkit-touch-callout', 'none'),
  gestureEvents: 'GestureEvent' in window || 'ongesturestart' in window,
  standalone: typeof navigator.standalone === 'boolean'
 });
 const standalone = navigator.standalone === true ||
  (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
 const decision = (${resolvePlatformGate.toString()})(
  app.platforms, iosWebKit, standalone, app.updateProfile, ${devServer}
 );
 window.__SATIN_PLATFORM_BLOCKED__ = decision !== 'run';
 if(window.__SATIN_PLATFORM_BLOCKED__) {
  location.replace(decision === 'install' ? selected.installRoute : app.scope + 'unsupported.html');
 }
})();</script>
<meta name="viewport" content="${SATIN_VIEWPORT}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta id="satin-theme-color" name="theme-color" content="${fixtures[0]?.app.appearance.background ?? '#ffffff'}">
<meta id="satin-status-bar-style" name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="color-scheme" content="light dark">
<script id="satin-deployment" type="application/json">${JSON.stringify(fixtures.map(({ app }) => deploymentExpectation(app, base))).replaceAll('<', '\\u003c')}</script>
<link id="satin-manifest" rel="manifest">
<link id="satin-touch-icon" rel="apple-touch-icon">
<script id="satin-head-init">(() => {
 if(window.__SATIN_PLATFORM_BLOCKED__ !== false) return;
 const fixtures = ${data};
 const query = new URLSearchParams(location.search);
 const selected = fixtures.find(f => Object.entries(f.query).every(([k,v]) => query.get(k) === v));
 const app = selected.app;
 const fit = (${resolveViewportFit.toString()})(app.viewportFit || 'adaptive', navigator.userAgent, navigator.platform, navigator.maxTouchPoints, innerWidth, innerHeight, ${ADAPTIVE_LAYOUT_POLICY.horizontal.regularMinimum}, ${ADAPTIVE_LAYOUT_POLICY.vertical.regularMinimum});
 document.querySelector('meta[name="viewport"]').content = ${JSON.stringify(SATIN_VIEWPORT)}.replace('viewport-fit=cover', 'viewport-fit=' + fit);
 document.documentElement.dataset.satinViewportFit = fit;
 (${installLaunchScreenRuntime.toString()})({
  markup: selected.cover, css: ${JSON.stringify(prelaunchCSS)}, scope: app.scope,
  background: app.appearance.background,
  darkBackground: app.appearance.darkLaunch === 'match-light' ? app.appearance.background : app.appearance.darkLaunch.background,
  darkInk: app.appearance.darkLaunch === 'match-light' ? '#1c1c1e' : '#ffffff'
 });
 (${resumeAppliedUpdate.toString()})(app.scope, app.updateProfile === 'release' ? ${JSON.stringify(buildId)} : undefined);
 (${installLaunchWatchdog.toString()})(${Math.max(10_000, GLASS_LAUNCH_BUDGET_MS)});
 // First installation can overlap module loading. Existing registrations,
 // with active or waiting versions, remain under the normal launch/update policy.
 if (${production} && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.__SATIN_WORKER_LOOKUP__ = new Promise(resolve => {
   (${registerEarlyWorker.toString()})(app.scope, error => { window.__SATIN_WORKER_LOOKUP_ERROR__ = error; if (error) window.dispatchEvent(new CustomEvent('satin-worker-lookup-error', { detail: error.message })); resolve(); }).catch(() => resolve());
  });
 }
 document.title = app.name;
 const launchBackground = app.appearance.darkLaunch === 'match-light' ? app.appearance.background : app.appearance.darkLaunch.background;
 const startup = (${startupImages.toString()})(selected.startupStem, app.appearance.background, launchBackground, ${JSON.stringify(STARTUP_SCREENS)});
 for (const image of startup) {
  const link = document.createElement('link');
  link.rel = 'apple-touch-startup-image'; link.href = ${JSON.stringify(base)} + image.file; link.media = image.media;
  document.head.appendChild(link);
 }
 document.getElementById('satin-touch-icon').href = app.icons.find(i => i.type === 'image/png')?.src || app.icons[0].src;
 const darkBackground = app.appearance.darkLaunch === 'match-light' ? app.appearance.background : app.appearance.darkLaunch.background;
 // CSS can select the cold background before the controller runs. Once
 // installed, the shared controller owns every root color, in every session.
 const darkInk = app.appearance.darkLaunch === 'match-light' ? '#1c1c1e' : '#ffffff';
 const store = (${installAppearanceStore.toString()})();
 const apply = () => {
  const dark = store.getSnapshot().dark;
  const appearance = dark && app.appearance.darkLaunch !== 'match-light' ? app.appearance.darkLaunch : app.appearance;
  document.documentElement.style.backgroundColor = appearance.background;
  document.documentElement.style.setProperty('--satin-launch-background', appearance.background);
  document.documentElement.style.setProperty('--satin-launch-ink', dark ? darkInk : '#1c1c1e');
  document.documentElement.style.setProperty('--satin-background', appearance.background);
  window.__SATIN_PRELAUNCH__.appearance(appearance.background, dark ? darkInk : '#1c1c1e');
  document.getElementById('satin-theme-color').content = appearance.background;
  document.getElementById('satin-manifest').href = ${appManifestHrefExpression('selected.manifest')};
 };
 apply();
 store.subscribe(apply);
 document.addEventListener('visibilitychange', apply);
 addEventListener('pagehide', apply);
})();</script>`
}
