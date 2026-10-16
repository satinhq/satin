import type { AppDefinition } from './definition.ts'

/** Serializable so the same slot paints before JavaScript modules load. */
export interface LaunchScreenSlot {
  readonly icon?: string
  readonly label?: string
}

export function launchScreenMarkup(app: AppDefinition) {
  const escape = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  const icon =
    app.launchScreen?.icon ??
    app.icons.find(icon => icon.type === 'image/png')?.src ??
    app.icons[0]!.src
  // Inlining removes the fetch, not the decode. Paint the icon atomically with
  // the cover and SVG ring instead of letting the first arc appear on its own.
  return `<div id="satin-launch-screen" role="status" aria-label="Opening ${escape(app.name)}"><div class="satin-launch-icon"><img src="${escape(icon)}" width="68" height="68" decoding="sync" alt="" draggable="false"><svg id="satin-launch-progress" viewBox="0 0 108 108" role="progressbar" aria-label="Downloading app" aria-valuemin="0" aria-valuemax="100" hidden><circle cx="54" cy="54" r="51" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg></div>${app.launchScreen?.label ? `<p>${escape(app.launchScreen.label)}</p>` : ''}</div>`
}

// Launch overlays sit above framework chrome (up to 15000). Keep their
// ordering away from the maximum CSS integer boundary.
export const launchScreenLayer = 20_000
export const launchErrorLayer = launchScreenLayer + 1

export const launchScreenCSS = `#satin-launch-screen{position:fixed;inset:calc(-1 * var(--satin-launch-excluded-top, 0px)) 0 0;z-index:${launchScreenLayer};display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--satin-launch-background);color:var(--satin-launch-ink);font:17px system-ui;pointer-events:none}#satin-launch-screen[hidden],#satin-launch-progress[hidden]{display:none}.satin-launch-icon{position:relative;width:108px;height:108px;display:grid;place-items:center}#satin-launch-screen>p{position:absolute;top:calc(50% + 54px);margin:16px 0 0}.satin-launch-icon img{border-radius:15px}#satin-launch-progress{position:absolute;inset:0;width:108px;height:108px;transform:rotate(-90deg)}`

export interface DownloadProgress {
  /** Monotonic response-header progress, independent of downloaded bytes. */
  activity?: number
  readonly loaded: number
  readonly total: number
}
