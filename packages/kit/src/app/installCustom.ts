/**
 * Custom install pages (round ten): an app may replace Satin's install page with its own,
 * entirely (`satinApp(app, { installPage: './src/Install.tsx' })`). Satin still owns the
 * document around it: the head (manifest, icons, title, status bar), the deployment check and
 * the app's context. The author's bundle is loaded only after the check passes, so a broken
 * deploy shows Satin's loud failure and never the author's page.
 */

import { minifyInlineScripts } from './installExperience.ts'

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')

/**
 * Loads the author's page once. Self-contained: embedded verbatim in the page and called by
 * the deployment check when it passes (also after a Retry).
 */
export function installCustomMount(entry: string) {
  if (document.querySelector('script[data-satin-install-author]')) return
  const script = document.createElement('script')
  script.type = 'module'
  script.src = entry
  script.dataset.satinInstallAuthor = ''
  script.onerror = () =>
    (
      window as Window & { __SATIN_PRELAUNCH__?: { error(reason: string): void } }
    ).__SATIN_PRELAUNCH__?.error('The install page failed to load. Please retry.')
  document.body.append(script)
}

export interface CustomInstallPageInput {
  readonly head: string
  /** The deployment metadata and the check script, already serialized by install.ts. */
  readonly scripts: string
  readonly name: string
  readonly icon: string
  readonly tint: string
  readonly installRoute: string
  readonly background: string
  readonly darkBackground: string
  readonly darkText: boolean
}

export function customInstallPage(input: CustomInstallPageInput) {
  const context = JSON.stringify({
    name: input.name,
    icon: input.icon,
    tint: input.tint,
    installRoute: input.installRoute,
  }).replaceAll('<', '\\u003c')
  // Without scripts neither the check nor the author's page can run, so the page states
  // Satin's plain steps (the same words as the default page's no-script text).
  const noScript = [
    '<noscript><main class="satin-install-noscript">',
    `<h1>Add ${escape(input.name)} to Home Screen</h1><ol>`,
    '<li>In Safari, open the page menu, then tap Share.</li>',
    '<li>Choose Add to Home Screen (under View More if needed).</li>',
    '<li>Make sure Open as Web App is on, then tap Add.</li>',
    '</ol></main></noscript>',
  ].join('')
  const style = [
    `html{background:${input.background};color:#1c1c1e;font:17px/1.4 system-ui,-apple-system,sans-serif}`,
    `@media(prefers-color-scheme:dark){html{background:${input.darkBackground};color:${input.darkText ? '#fff' : '#1c1c1e'}}}`,
    'body{margin:0}.satin-install-noscript{max-width:420px;margin:72px auto;padding:24px}',
  ].join('')
  const page = [
    `<!doctype html><html lang="en"><head>${input.head}<style>${style}</style></head>`,
    '<body data-satin-install-page data-satin-install-custom>',
    '<section id="satin-install-check" hidden></section><div id="satin-install-guide"></div>',
    noScript,
    `<script id="satin-install-context" type="application/json">${context}</script>`,
    input.scripts,
    '</body></html>',
  ].join('')
  return minifyInlineScripts(page)
}
