import type { InstallBrowser, InstallDevice } from './installContext.ts'
import type { SafariBar } from './installTipPath.ts'
import type { GLYPHS, INSTALL_STRINGS } from './installStrings.ts'

/** Pure naming policy. App admission deliberately requires additional WebKit signals. */
export function classifyInstallSignals(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
) {
  const webkit = /AppleWebKit/i.test(userAgent) && !/Android/i.test(userAgent)
  const device: InstallDevice = !webkit
    ? 'other'
    : /iPhone|iPod/.test(userAgent)
      ? 'iphone'
      : /iPad/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
        ? 'ipad'
        : 'other'
  const other = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave|YaBrowser|Focus\//.test(userAgent)
  const embedded =
    /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|Snapchat|Twitter|LinkedInApp|Pinterest|GSA\//.test(
      userAgent,
    )
  const browser: InstallBrowser =
    !webkit || /Chrome\//i.test(userAgent) || other
      ? 'other'
      : !/Safari\//.test(userAgent) || embedded
        ? 'in-app'
        : 'safari'
  const version = browser === 'safari' ? /Version\/(\d+)/.exec(userAgent)?.[1] : undefined
  return { device, browser, safariVersion: version ? Number(version) : null }
}

/** Geometry stays pure; callers supply the measured dynamic viewport collapse. */
export function safariBarGeometry(
  version: number | null,
  device: InstallDevice,
  width: number,
  height: number,
  collapse: number,
): SafariBar {
  if (version !== 27 || device === 'other') return 'unknown'
  if (device === 'ipad') return width < 600 ? 'unknown' : 'top'
  if (width > height) return 'top'
  return collapse >= 70 ? 'toolbar' : 'compact'
}

export function safariToolbarCollapse(
  version: number | null,
  device: InstallDevice,
  width: number,
  height: number,
) {
  // Only portrait iPhone Safari 27 needs a dynamic toolbar measurement.
  if (version !== 27 || device !== 'iphone' || width > height) return 0
  const unit = (name: string) => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;width:0;visibility:hidden;height:100' + name
    document.documentElement.append(probe)
    const height = probe.offsetHeight
    probe.remove()
    return height
  }
  return unit('lvh') - unit('svh')
}

export interface InstallStep {
  readonly symbol: keyof typeof GLYPHS
  readonly action: string
  readonly where: string
}

/** Static HTML and React render this same step model. */
export function installSteps(
  browser: InstallBrowser,
  bar: SafariBar,
  text: typeof INSTALL_STRINGS,
): readonly InstallStep[] {
  const safari = browser === 'safari'
  return [
    {
      symbol: safari && bar === 'compact' ? 'menu' : 'share',
      action: safari && bar === 'compact' ? text.rowMenu : text.rowShare,
      where: safari ? '' : text.rowShareBrowser,
    },
    {
      symbol: 'home',
      action: text.rowHome,
      where: safari ? text.rowHomeWhere : text.rowHomeBrowser,
    },
    { symbol: 'put', action: text.rowAdd, where: text.keepWebApp },
  ]
}

export const installPolicy = {
  classifyInstallSignals,
  safariBarGeometry,
  safariToolbarCollapse,
  tipPath,
}

/** Only browser-safe functions are embedded; no React or app startup dependency. */
export function serializeInstallPolicy() {
  return (
    '{' +
    Object.entries(installPolicy)
      .map(([name, implementation]) => `${name}:${implementation.toString()}`)
      .join(',') +
    '}'
  )
}

export function tipPath(w: number, h: number, bar: Exclude<SafariBar, 'unknown'>) {
  const r = Math.round(h * 0.405)
  const top = bar === 'top'
  const at = bar === 'compact' ? 105 : bar === 'toolbar' ? w / 2 : w - 42
  const edge = top ? 0 : h
  const point = (dx: number, dy: number) => `${at + (top ? -dx : dx)} ${edge + (top ? -dy : dy)}`
  const tail = [
    `L${point(17, 0)}C${point(10.7, 0)} ${point(9.35, 1.36)} ${point(8, 3.23)}`,
    `L${point(1.96, 9.18)}Q${point(0, 11.05)} ${point(-1.96, 9.18)}`,
    `L${point(-8, 3.23)}C${point(-9.35, 1.36)} ${point(-10.7, 0)} ${point(-17, 0)}`,
  ].join('')
  const arc = (x: number, y: number) => `A${r} ${r} 0 0 1 ${x} ${y}`
  return (
    `M${r} 0${top ? tail : ''}L${w - r} 0${arc(w, r)}L${w} ${h - r}${arc(w - r, h)}` +
    `${top ? '' : tail}L${r} ${h}${arc(0, h - r)}L0 ${r}${arc(r, 0)}Z`
  )
}
