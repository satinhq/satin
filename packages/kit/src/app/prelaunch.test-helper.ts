/** Test-only inspection. Production keeps the shadow root closed and exposes
 * immutable observations through the versioned handoff instead of DOM handles. */
import { vi } from 'vitest'
import { installLaunchScreenRuntime } from './launchScreenRuntime.ts'
import { prelaunchCSS } from './launchScreen.ts'

const attach = Element.prototype.attachShadow
export let prelaunchDOM: ShadowRoot
export function capturePrelaunch() {
  document.querySelectorAll('satin-prelaunch').forEach(host => host.remove())
  delete (window as Window & { __SATIN_PRELAUNCH__?: unknown }).__SATIN_PRELAUNCH__
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, options) {
    const root = attach.call(this, options)
    if (this.localName === 'satin-prelaunch') prelaunchDOM = root
    return root
  })
}
export function setupPrelaunch(cover = true) {
  capturePrelaunch()
  document.head.querySelector('[data-test-framework-styles]')?.remove()
  const style = document.createElement('style')
  style.setAttribute('data-test-framework-styles', '')
  style.textContent = ':root { --satin-styles-applied: 1; }'
  document.head.append(style)
  installLaunchScreenRuntime({
    markup:
      '<div id="satin-launch-screen"><div class="satin-launch-icon"><img src="data:,icon"><svg id="satin-launch-progress" hidden><circle stroke-dashoffset="100" /></svg></div></div>',
    css: prelaunchCSS,
    scope: '/app/',
    background: '#f2f2f7',
    darkBackground: '#000000',
    darkInk: '#ffffff',
    cover,
  })
}
