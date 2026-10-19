import { automaticGlassFallbackAllowed } from './failurePolicy.ts'
import { getGlassErrors, subscribeGlassErrors, type GlassError } from './errors.ts'
let installed = false
/** One entry per distinct failure: a cause that propagates through several stages
 * (worker → startup → runtime) is listed once, with every stage it reached. */
export function formatGlassErrors(errors: readonly GlassError[]) {
  const cause = (message: string) => message.replace(/^(Error: )+/, '')
  const groups = new Map<
    string,
    { code: string; message: string; reason?: string; stages: string[] }
  >()
  for (const error of errors) {
    if (error.transient) continue
    const key = JSON.stringify([error.code, cause(error.message), error.reason])
    const group = groups.get(key) ?? {
      code: error.code,
      message: cause(error.message),
      reason: error.reason,
      stages: [],
    }
    if (!group.stages.includes(error.stage)) group.stages.push(error.stage)
    groups.set(key, group)
  }
  return [...groups.values()]
    .map(
      g =>
        `Glass failed — ${g.code} — ${g.stages.join(' → ')}\n${g.message}${g.reason ? '\nReason: ' + g.reason : ''}`,
    )
    .join('\n\n')
}
/** Strict builds retain the loud error surface; release apps retain diagnostics only. */
export function installGlassErrorAlert() {
  if (installed || typeof document === 'undefined' || automaticGlassFallbackAllowed()) return
  installed = true
  const paint = () => {
    const errors = getGlassErrors().filter(
      error => !error.transient && !automaticGlassFallbackAllowed(error),
    )
    if (!errors.length) return
    const prelaunch = (
      window as Window & { __SATIN_PRELAUNCH__?: { snapshot(): { state: string } } }
    ).__SATIN_PRELAUNCH__
    if (prelaunch && ['preparing', 'failed'].includes(prelaunch.snapshot().state)) {
      document.querySelector(':root > pre[data-satin-glass-error]')?.remove()
      return
    }
    // Only this alert (a child of <html>): SatinRoot's launch-failure screen also carries
    // data-satin-glass-error, and writing textContent there would erase its React tree.
    let panel = document.querySelector<HTMLElement>(':root > pre[data-satin-glass-error]')
    // Loud but never modal: it must not swallow taps on the navigation bar and tabs it
    // covers, or the only way to keep using the app is to hide it.
    if (!panel) {
      panel = document.createElement('pre')
      panel.dataset.satinGlassError = 'true'
      panel.setAttribute('role', 'alert')
      panel.style.cssText =
        'position:fixed;inset:max(16px,env(safe-area-inset-top)) 16px auto;margin:0;z-index:2147483647;max-height:70%;overflow:auto;padding:16px;background:#380b0b;color:white;white-space:pre-wrap;font:14px/1.5 monospace;pointer-events:none'
      document.documentElement.append(panel)
    }
    panel.textContent = formatGlassErrors(errors)
  }
  subscribeGlassErrors(paint)
  paint()
}
