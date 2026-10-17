import { installSteps } from './installPolicy.ts'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GLYPHS, INSTALL_STRINGS, springEasing } from './installStrings.ts'
import { deviceTokens } from './installExperienceDevice.ts'
import { TIP_GLASS } from './installExperienceHome.ts'
import { readInstallContext, type InstallContext } from './installContext.ts'
import { classifySafariBar, tipPath, type SafariBar } from './installTipPath.ts'

// Optional building blocks for a custom install page (public through `@satinhq/kit/install`): the
// context hook, the steps list and the tip, with the default page's words and look. Styles
// are scoped to `satin-` classes; `--satin-install-tint` overrides the app's tint.

/** Returns the install context, read once when the page opens. It throws outside the install
 * page. */
export function useInstallContext(): InstallContext {
  const [context] = useState(readInstallContext)
  return context
}

function useSafariBar(context: InstallContext): SafariBar {
  const [bar, setBar] = useState<SafariBar>('unknown')
  useLayoutEffect(() => {
    const update = () => setBar(classifySafariBar(context.safariVersion, context.device))
    update()
    addEventListener('resize', update)
    return () => removeEventListener('resize', update)
  }, [context.safariVersion, context.device])
  return bar
}

const glyph = (name: keyof typeof GLYPHS, className: string) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: GLYPHS[name] }}
  />
)

const STEPS_CSS = `
.satin-steps{list-style:none;margin:0;padding:0;border-radius:22px;background:color-mix(in srgb,currentColor 5%,transparent);text-align:start;--sym:36px;--tint:var(--satin-install-tint,var(--satin-app-tint))}
.satin-steps li{display:grid;grid-template-columns:var(--sym) 1fr;column-gap:12px;align-items:center;min-height:60px;box-sizing:border-box;padding:10px 16px 10px 14px;position:relative}
.satin-steps li:not(:has(span span)){min-height:52px;padding-block:8px}
.satin-steps li+li::before{content:"";position:absolute;top:0;inset-inline:calc(var(--sym) + 26px) 0;height:.5px;background:color-mix(in srgb,currentColor 14%,transparent)}
.satin-steps-sym{display:grid;place-items:center;width:var(--sym);height:var(--sym);border-radius:calc(var(--sym)*.27);background:color-mix(in srgb,var(--tint) 15%,transparent);color:var(--tint)}
.satin-steps-g{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.satin-steps b{display:block;font-size:17px;font-weight:600;line-height:1.294}
.satin-steps span span{display:block;opacity:.6;font-size:15px;line-height:1.33}
`

function useStyle(id: string, css: string) {
  useLayoutEffect(() => {
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.append(style)
  }, [id, css])
}

function useAppTint(context: InstallContext) {
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--satin-app-tint', context.app.tint)
  }, [context.app.tint])
}

/** The three install steps for this device, browser and Safari layout, worded as on Satin's own
 * install page. */
export function InstallSteps() {
  const context = useInstallContext()
  const bar = useSafariBar(context)
  useStyle('satin-steps-style', STEPS_CSS)
  useAppTint(context)
  const rows = installSteps(context.browser, bar, INSTALL_STRINGS)
  return (
    <ol className="satin-steps" role="list">
      {rows.map(({ symbol, action, where }) => (
        <li key={action}>
          <span className="satin-steps-sym">{glyph(symbol, 'satin-steps-g')}</span>
          <span>
            <b>{action}</b>
            {where && <span>{where}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

const TIP_CSS = `
.satin-tip{position:fixed;z-index:2;left:9px;bottom:13px;display:flex;align-items:center;min-height:42px;box-sizing:border-box;padding:0 15px;font:600 15px/20px system-ui,-apple-system,sans-serif;white-space:nowrap;--tint:var(--satin-install-tint,var(--satin-app-tint));--zero:0;--one:1;--label:#000;transform-origin:105px calc(100% + 11px);animation:satin-tip .45s .3s ${springEasing()} both;color:var(--label);${deviceTokens(false)}}
@media(prefers-color-scheme:dark){.satin-tip{--label:#fff;${deviceTokens(true)}}}
@keyframes satin-tip{from{transform:scale(.2);opacity:0;filter:blur(4px)}}
@media(prefers-reduced-motion:reduce){.satin-tip{animation:none}}
.satin-tip[data-bar=toolbar]{right:16px;width:fit-content;margin:0 auto;transform-origin:50% calc(100% + 11px)}
.satin-tip[data-bar=top]{left:auto;right:calc(env(safe-area-inset-right) + 78px);bottom:auto;top:12px;transform-origin:calc(100% - 42px) -11px}
.satin-tip .ix-glass{position:absolute;inset:0;z-index:-1;width:100%;height:100%;overflow:visible}
.satin-tip .ix-glass-fill{fill:var(--glass)}.satin-tip .ix-glass-band{stroke:var(--glass-band)}
.satin-tip .ix-glass-line{opacity:var(--hl-line)}.satin-tip .ix-glass-soft{opacity:var(--hl-soft)}
.satin-tip-g{flex:none;width:32px;height:32px;margin:-6px 3.5px -6px -6.6px;color:var(--tint);fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
`

/**
 * The tip at Safari's real control ("Page Menu, then Share" or "Share"), in Satin's glass.
 * Shown only in Safari 27 on an iPhone or iPad, where the control's place was measured;
 * renders nothing anywhere else. Its glass takes the page's background colour.
 */
export function InstallTip() {
  const context = useInstallContext()
  const bar = useSafariBar(context)
  const tip = useRef<HTMLDivElement>(null)
  useStyle('satin-tip-style', TIP_CSS)
  useAppTint(context)
  useEffect(() => {
    const element = tip.current
    if (!element || bar === 'unknown') return
    element.style.setProperty('--bg', getComputedStyle(document.documentElement).backgroundColor)
    const draw = () =>
      element
        .querySelector('#ix-shape')
        ?.setAttribute('d', tipPath(element.offsetWidth, element.offsetHeight, bar))
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    return () => observer.disconnect()
  }, [bar])
  if (bar === 'unknown' || context.browser !== 'safari') return null
  const compact = bar === 'compact'
  return (
    <div ref={tip} className="satin-tip" data-bar={bar} aria-hidden="true">
      <span dangerouslySetInnerHTML={{ __html: TIP_GLASS }} style={{ display: 'contents' }} />
      {glyph(compact ? 'menu' : 'share', 'satin-tip-g')}
      {compact ? INSTALL_STRINGS.tipMenu : INSTALL_STRINGS.tipShare}
    </div>
  )
}
