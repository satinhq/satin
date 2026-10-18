import { installSteps, serializeInstallPolicy } from './installPolicy.ts'
import type { SafariBar } from './installTipPath.ts'
import { deviceTokens } from './installExperienceDevice.ts'
import { CSS_D, homeScene, homeStep, TIP_GLASS } from './installExperienceHome.ts'
import {
  installExperienceRuntime,
  type InstallExperienceConfig,
} from './installExperienceRuntime.ts'
import { installQrMatrix } from './installQr.ts'
import type { AppDefinition } from './definition.ts'
import { minifySync } from 'vite'
import { GLYPHS, INSTALL_STRINGS, springEasing } from './installStrings.ts'

export { GLYPHS, INSTALL_STRINGS, springEasing }

/**
 * The install page as an experience: one screen, the app as the hero, and instructions that
 * point at Safari's real control instead of showing a picture of it.
 *
 * The approved Mist Home Screen design is the default for install and gate pages.
 */
const SYSTEM_BLUE = { light: '#007aff', dark: '#0a84ff' }

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')

/** Black or white, whichever reads better on the given six-digit hex colour. */
function labelOn(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.36 ? '#000' : '#fff'
}

/** Mixes two six-digit hex colours; `amount` is how much of the second one. */
function mixHex(from: string, to: string, amount: number) {
  const channel = (offset: number) => {
    const start = Number.parseInt(from.slice(offset, offset + 2), 16)
    const end = Number.parseInt(to.slice(offset, offset + 2), 16)
    return Math.round(start + (end - start) * amount)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(1)}${channel(3)}${channel(5)}`
}

/**
 * The raised surface for grouped content on a given background, as the system pairs them:
 * white on a light grouped background, light grey on white, and a lifted grey in the dark.
 */
function cardOn(background: string) {
  if (labelOn(background) === '#fff') return mixHex(background, '#ffffff', 0.11)
  const nearWhite = mixHex(background, '#000000', 0.05) === mixHex('#ffffff', '#000000', 0.05)
  return nearWhite ? '#f2f2f7' : mixHex(background, '#ffffff', 0.86)
}

/** A glyph from the inline symbol sheet. */
const glyph = (name: string) =>
  `<svg class="ix-g" aria-hidden="true"><use href="#ix-${name}"/></svg>`

/** Fills `{app}` and the glyph placeholders of one string. Glyphs get a spoken name. */
function phrase(text: string, app: string) {
  const spoken = (name: string) => (name ? `<span class="ix-sr">${name}</span>` : '')
  return escapeHtml(text)
    .replaceAll('{app}', `<bdi>${escapeHtml(app)}</bdi>`)
    .replace('{menu}', spoken(INSTALL_STRINGS.menuName) + glyph('menu'))
    .replace('{share}', spoken(INSTALL_STRINGS.shareName) + glyph('share'))
    .replace('{home}', spoken(INSTALL_STRINGS.homeName) + glyph('home'))
    .replaceAll('{device}', `<span data-device-name>${INSTALL_STRINGS.deviceAny}</span>`)
}

/** Joins markup fragments; lets long templates be written one element per line. */
const join = (...parts: string[]) => parts.join('')

/** The symbol sheet for one page: only the glyphs its markup uses. */
function sprite(markup: string) {
  const symbols = Object.entries(GLYPHS)
    .filter(([name]) => markup.includes(`#ix-${name}"`))
    .map(([name, drawing]) => `<symbol id="ix-${name}" viewBox="0 0 24 24">${drawing}</symbol>`)
  return join(
    '<svg class="ix-sprite" width="0" height="0" aria-hidden="true"><defs>',
    ...symbols,
    '</defs></svg>',
  )
}

/** Foundation for the install experience: tokens, type scale, states, panels, failure styling. */
function baseCss(colors: {
  background: string
  darkBackground: string
  tint: string
  darkTint: string
}) {
  const darkPage = labelOn(colors.darkBackground) === '#fff'
  return `
:root {
  color-scheme: light dark;
  --bg: ${colors.background};
  --card: ${cardOn(colors.background)};
  ${deviceTokens(labelOn(colors.background) === '#fff')}
  --label: ${labelOn(colors.background)};
  --tint: ${colors.tint};
  --on-tint: ${labelOn(colors.tint)};
  --spring: ${springEasing()};
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: ${colors.darkBackground};
    --card: ${cardOn(colors.darkBackground)};
    ${deviceTokens(darkPage)}
    --label: ${labelOn(colors.darkBackground)};
    ${colors.darkTint === colors.tint ? '' : `--tint: ${colors.darkTint}; --on-tint: ${labelOn(colors.darkTint)};`}
  }
}
:root {
  --second: color-mix(in srgb, var(--label) 60%, transparent);
  --third: color-mix(in srgb, var(--label) 30%, transparent);
  --fill: color-mix(in srgb, var(--label) 6%, transparent);
  --hair: color-mix(in srgb, var(--label) 14%, transparent);
  --tint-soft: color-mix(in srgb, var(--tint) 15%, transparent);
}
html {
  height: 100%;
  background: var(--bg);
  color: var(--label);
  font: 17px/1.294 system-ui, -apple-system, sans-serif;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}
@supports (-webkit-touch-callout: none) {
  html { font: -apple-system-body; font-family: system-ui, -apple-system, sans-serif; }
}
body { height: 100%; min-height: 100lvh; margin: 0; overflow: hidden; }
h1, h2, p, ol { margin: 0; padding: 0; }
ol { list-style: none; }
.ix {
  box-sizing: border-box;
  height: 100vh;
  height: 100svh;
  overflow-y: auto;
  padding: 0 24px 96px;
  padding-inline: max(24px, env(safe-area-inset-left)) max(24px, env(safe-area-inset-right));
}
.ix-sprite { position: absolute; }
/*
 * No fixed footer (round six): Safari 26 and later extend a fixed element at the bottom edge
 * into the area under its floating toolbar as a flat colour, which cut the tip's shadow off in
 * a hard line. The page's own background already reaches the screen's bottom.
 */
.ix-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.ix-g {
  width: 1.3em;
  height: 1.3em;
  vertical-align: -0.3em;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
h1 { font-size: min(1.294rem, 34px); line-height: 1.27; font-weight: 700; letter-spacing: -0.01em; }
.ix-about { color: var(--second); font-size: 0.882rem; line-height: 1.33; }
h2 { font-size: min(1.294rem, 34px); line-height: 1.27; font-weight: 700; letter-spacing: -0.01em; text-wrap: balance; }
.ix-foot { color: var(--second); font-size: 0.765rem; font-weight: 400; line-height: 1.38; }
.ix-foot { margin-top: 20px; }
.ix-hint { display: none; margin-top: 16px; font-size: 0.882rem; font-weight: 600; }
html[data-state="back"] .ix-hint { display: block; }

/* One panel at a time. Without the runtime the steps stay readable. */
[data-panel], [data-for] { display: none; }
html:not([data-env]) [data-panel="steps"],
html[data-env="safari"] [data-panel="steps"],
html[data-env="inapp"] [data-panel="inapp"],
html[data-env="browser"] [data-panel="browser"],
html[data-env="gate"] [data-panel="gate"] { display: block; }
html:not([data-bar]) [data-for="any"],
html[data-bar="unknown"] [data-for="any"],
html[data-bar="compact"] [data-for="compact"],
html[data-bar="toolbar"] [data-for="toolbar"],
html[data-bar="top"] [data-for="toolbar"] { display: revert; }
html:not([data-env="safari"]) .ix-pointer,
html:not([data-bar]) .ix-pointer,
html[data-bar="unknown"] .ix-pointer,
html:not([data-ready]) .ix-pointer { display: none; }

/* The deployment check runs silently; this element is only shown when it fails. */
#satin-install-check { margin-top: 28px; color: var(--second); font-size: 0.882rem; }

/* Buttons. */
.ix-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  box-sizing: border-box;
  width: 100%;
  min-height: 50px;
  margin-top: 12px;
  padding: 0 20px;
  border: 0;
  border-radius: 25px;
  background: var(--tint);
  color: var(--on-tint);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
}
.ix-button.ix-quiet { background: var(--fill); color: var(--tint); }
.ix-button[data-copied]::after { content: " ✓"; }

[data-panel] > p:not([class]) { margin-top: 8px; color: var(--second); }
[data-panel] > .ix-button:first-of-type { margin-top: 24px; }

/* Not an iPhone or iPad: hand the page over. Parts that need the script wait for it. */
html:not([data-ready]) [data-js], html[data-ready] [data-nojs], [data-copy-failed][hidden] { display: none; }
.ix-copy-failed { margin-top: 10px; color: var(--second); font-size: 0.882rem; }
.ix-copy-failed .ix-address { display: block; margin-top: 4px; color: var(--label); }
.ix-qr {
  box-sizing: border-box;
  width: 176px;
  margin: 22px 0 16px;
  padding: 10px;
  border-radius: 22px;
  background: #fff;
  color: #000;
  box-shadow: 0 0 0 1px var(--hair);
}
.ix-qr svg { display: block; }
.ix-address {
  font: 0.765rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
  user-select: all;
  -webkit-user-select: all;
}
html[data-env="gate"] .ix { max-width: 440px; margin: 0 auto; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`
}

/** `rgb(255 255 255 / 0.36)` as `#ffffff5c`: the same colour in fewer bytes. */
const hexColor = (_match: string, red: string, green: string, blue: string, alpha: string) =>
  '#' +
  [Number(red), Number(green), Number(blue), Math.round(Number(alpha) * 255)]
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')

const minifyCss = (css: string) =>
  css
    .replace(/rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/g, hexColor)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/(^|[^\d.])0\.(\d)/g, '$1.$2')
    .replaceAll(';}', '}')
    .trim()

/**
 * Minifies every inline script of the finished page with Vite's own minifier. The scripts
 * are self-contained expressions, so renaming their locals cannot change what they do; the
 * JSON data block has a `type` attribute and is left alone.
 */
/** Includes named head scripts; JSON, modules and external scripts are left alone. */
export function minifyInlineScripts(html: string) {
  const inline = /<script((?:\s+(?:id|data-[\w-]+)(?:="[^"]*")?)*)>([\s\S]*?)<\/script>/g
  return html.replace(inline, (_tag, attributes: string, source: string) => {
    const result = minifySync('install-page.js', source)
    if (result.errors.length) {
      throw new Error(`Satin could not minify an install page script: ${result.errors[0]!.message}`)
    }
    return `<script${attributes}>${result.code.trim()}</script>`
  })
}

/** One fragment per place Safari keeps Share; the runtime shows the one that applies. */
function perBar(any: string, compact: string, toolbar: string) {
  return join(
    `<span data-for="any">${any}</span>`,
    `<span data-for="compact">${compact}</span>`,
    `<span data-for="toolbar">${toolbar}</span>`,
  )
}

function heroMarkup(name: string, about: string, icon: string, kind: 'install' | 'gate') {
  const title =
    kind === 'gate'
      ? 'This app is designed for iPhone and iPad'
      : phrase(INSTALL_STRINGS.addTitle, name)
  return `<header class="ix-hero">${homeScene(escapeHtml(icon))}<h1 class="ix-title">${title}</h1><p class="ix-about" dir="auto">${about}</p></header>`
}

function stepsMarkup(app: string, browser: 'safari' | 'other' = 'safari') {
  const rows = (bar: SafariBar) => installSteps(browser, bar, INSTALL_STRINGS)
  const content = (index: number, part: 'symbol' | 'action' | 'where') => {
    const render = (bar: SafariBar) => {
      const value = rows(bar)[index]![part]
      return part === 'symbol' ? glyph(value) : phrase(value, app)
    }
    return browser === 'safari' && index === 0 && part !== 'where'
      ? perBar(render('unknown'), render('compact'), render('toolbar'))
      : render('unknown')
  }
  return rows('unknown')
    .map((_, index) =>
      homeStep(
        content(index, 'symbol'),
        content(index, 'action'),
        index === 0 && browser === 'safari' ? '' : content(index, 'where'),
      ),
    )
    .join('')
}

export interface InstallExperienceInput {
  readonly app: AppDefinition
  readonly base: string
  /** Everything install.ts already puts in the head before its style block. */
  readonly head: string
  readonly kind: 'install' | 'gate'
  /** The deployment check scripts, already serialized by install.ts. Empty for the gate. */
  readonly scripts: string
  readonly installRoute: string
  readonly preview?: boolean
}

export function installExperiencePage(input: InstallExperienceInput) {
  const { app, kind } = input
  const text = (key: keyof typeof INSTALL_STRINGS) => phrase(INSTALL_STRINGS[key], app.name)
  const dark =
    app.appearance.darkLaunch === 'match-light'
      ? app.appearance.background
      : app.appearance.darkLaunch.background
  const icons = app.icons.filter(icon => icon.type === 'image/png')
  const largest = (icons.length ? icons : app.icons).reduce((best, icon) =>
    Number.parseInt(icon.sizes, 10) > Number.parseInt(best.sizes, 10) ? icon : best,
  )
  const css = minifyCss(
    baseCss({
      background: app.appearance.background,
      darkBackground: dark,
      tint: app.appearance.tint ?? SYSTEM_BLUE.light,
      darkTint: app.appearance.tint ?? SYSTEM_BLUE.dark,
    }) + CSS_D,
  )

  // The cue at Safari's real control. Concept a turns its first step into the cue instead.
  const tip = join(
    `<span data-for="compact">${glyph('menu')}${text('tipMenu')}</span>`,
    `<span data-for="toolbar">${glyph('share')}${text('tipShare')}</span>`,
    TIP_GLASS,
  )
  const pointer = `<div class="ix-pointer" aria-hidden="true">${tip}</div>`
  const browserSteps = stepsMarkup(app.name, 'other')
  const openSafari = (quiet: boolean) =>
    `<a class="ix-button${quiet ? ' ix-quiet' : ''}" data-open-safari href="#">${text('openSafari')}</a>`
  // Copying needs the script and a clipboard that allows it. When it fails, the page says so
  // and shows the address to select (the gate shows it already).
  const copyLink = (withAddress: boolean) =>
    join(
      `<button type="button" class="ix-button ix-quiet" data-js data-copy="${text('copied')}">`,
      `${text('copyLink')}</button>`,
      `<p class="ix-copy-failed" data-copy-failed hidden>${text('copyFailed')}`,
      withAddress ? '<span class="ix-address" data-address></span>' : '',
      '</p>',
    )

  // One panel per situation; the stylesheet shows the one the runtime selects. The lists
  // carry an explicit role: Safari drops list semantics from lists styled without markers.
  // Nothing the page observes ever replaces the steps: an install cannot be told apart from
  // a cancelled dialog followed by leaving Safari, so "already added" is the person's call.
  const stepsPanel = join(
    '<div data-panel="steps">',
    `<ol class="ix-steps" role="list">${stepsMarkup(app.name)}</ol>`,
    `<p class="ix-hint" data-say="back">${text('backHint')}</p>`,
    `<p class="ix-foot">${text('alreadyAdded')}</p></div>`,
  )
  const inAppPanel = join(
    `<div data-panel="inapp"><h2>${text('inAppTitle')}</h2><p>${text('inAppBody')}</p>`,
    openSafari(false),
    copyLink(true),
    `<p class="ix-foot">${text('inAppFoot')}</p></div>`,
  )
  const browserPanel = join(
    '<div data-panel="browser">',
    `<ol class="ix-steps" role="list">${browserSteps}</ol>`,
    openSafari(true),
    '</div>',
  )
  // Without scripts there is no code and no copying: the gate then asks for the address bar.
  const gatePanel = join(
    `<div data-panel="gate"><h2>${text('gateTitle')}</h2>`,
    '<div class="ix-qr" data-qr data-js></div>',
    `<p data-js>${text('gateBody')}</p><p class="ix-address" data-address data-js></p>`,
    `<p data-nojs>${text('gateNoScript')}</p>`,
    copyLink(false),
    '</div>',
  )
  const liveRegion = '<p class="ix-sr" role="status" aria-live="polite" data-live></p>'
  const panels = join(stepsPanel, inAppPanel, browserPanel, gatePanel, liveRegion)

  const check = kind === 'install' ? '<section id="satin-install-check" hidden></section>' : ''
  const config: InstallExperienceConfig = {
    installRoute: input.installRoute,
    kind,
    preview: input.preview === true,
    devices: [INSTALL_STRINGS.devicePhone, INSTALL_STRINGS.devicePad],
  }
  const runtime = join(
    `<script>(${installExperienceRuntime.toString()})(`,
    `${JSON.stringify(config).replaceAll('<', '\\u003c')},`,
    `${installQrMatrix.toString()},${serializeInstallPolicy()})</script>`,
  )
  const gateAttribute = kind === 'gate' ? ' data-env="gate"' : ''
  const rootAttributes = `lang="en" data-install-design="home-screen"${gateAttribute}`
  // The guide is the page's normal state from the first frame. The deployment check runs
  // behind it and replaces it only on deployment failure.
  const guideAttributes = 'id="satin-install-guide" class="ix-panels"'
  const main = join(
    heroMarkup(app.name, escapeHtml(app.description), largest.src, kind),
    check,
    `<section ${guideAttributes}>${panels}</section>`,
    pointer,
  )
  const page = join(
    `<!doctype html><html ${rootAttributes}>`,
    `<head>${input.head}<style>${css}</style></head>`,
    `<body data-satin-install-page>${sprite(main)}<main class="ix">${main}</main>`,
    `${input.scripts}${runtime}</body></html>`,
  )
  return minifyInlineScripts(page)
}
