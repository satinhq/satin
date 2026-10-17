import type { AppDefinition } from './definition.ts'

/** The launch screen's icon and optional label. The inline environment paints it before application JavaScript loads, so
 * both must be plain strings. */
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

export const launchScreenCSS = `
#satin-launch-screen {
  position:fixed;
  inset:calc(-1 * var(--satin-launch-excluded-top, 0px)) 0 0;
  z-index:${launchScreenLayer};
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  background:var(--satin-launch-background);
  color:var(--satin-launch-ink);
  font:17px system-ui;
  pointer-events:none
}
#satin-launch-screen[hidden],#satin-launch-progress[hidden] {
  display:none
}
.satin-launch-icon {
  position:relative;
  width:108px;
  height:108px;
  display:grid;
  place-items:center
}
#satin-launch-screen>p {
  position:absolute;
  top:calc(50% + 54px);
  margin:16px 0 0
}
.satin-launch-icon img {
  border-radius:15px
}
#satin-launch-progress {
  position:absolute;
  inset:0;
  width:108px;
  height:108px;
  transform:rotate(-90deg)
}
`

export interface DownloadProgress {
  /** Monotonic response-header progress, independent of downloaded bytes. */
  activity?: number
  readonly loaded: number
  readonly total: number
}

/** Closed-shadow styles. Inner !important declarations protect the host itself
 * from author resets; descendants never participate in the app cascade. */
export const prelaunchCSS = `
:host {
  all:initial !important;
  display:block !important;
  position:fixed !important;
  inset:0 !important;
  z-index:20004 !important;
  opacity:1 !important;
  visibility:visible !important;
  transform:none !important;
  filter:none !important;
  clip-path:none !important;
  overflow:visible !important;
  pointer-events:none !important;
  contain:none !important;
  isolation:isolate !important;
  color-scheme:light dark !important
}
* {
  box-sizing:border-box
}
 [hidden] {
  display:none !important
}
${launchScreenCSS}#satin-launch-error {
  position:fixed;
  inset:0;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:32px;
  background:var(--satin-launch-background);
  color:var(--satin-launch-ink);
  font:17px/1.45 system-ui;
  text-align:center;
  pointer-events:auto;
  overflow:auto
}
#satin-launch-error h1 {
  font-size:24px;
  margin:0 0 12px
}
#satin-launch-error p {
  max-width:420px;
  margin:17px 0;
  white-space:pre-wrap;
  overflow-wrap:anywhere
}
#satin-launch-error .detail {
  font-size:13px;
  opacity:.65
}
#satin-launch-error button {
  font:600 17px system-ui;
  color:#007aff;
  background:transparent;
  border:0;
  padding:16px 32px;
  min-height:44px
}
`
