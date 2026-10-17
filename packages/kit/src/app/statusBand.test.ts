// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { blendBand, installStatusBand } from './statusBand.ts'
it('blends only visible portions and respects occlusion on a push or cancelled pop', () => {
  const base = [240, 240, 240] as const
  const rear = { left: -100, right: 400, color: [100, 0, 0] as const }
  const front = { left: 200, right: 600, color: [0, 0, 200] as const }
  expect(blendBand(400, base, [rear, front])).toEqual([50, 0, 100])
  expect(blendBand(400, base, [rear, { ...front, left: 0 }])).toEqual(front.color)
  expect(blendBand(400, base, [rear, { ...front, left: 400 }])).toEqual(rear.color)
  expect(blendBand(0, base, [front])).toEqual(base)
})

it("uses each split pane's own scrolled tint for the fitted status band", () => {
  const html = document.documentElement
  html.dataset.satinViewportFit = 'auto'
  html.style.setProperty('--satin-background', 'rgb(240, 240, 240)')
  const root = document.createElement('div')
  root.innerHTML = `<div data-satin-navigator-host>
    ${['sidebar', 'detail']
      .map(
        pane => `
      <div data-satin-screen-container data-satin-pane="${pane}">
        <div data-satin-navigation-motion-layer style="background: rgb(240, 240, 240)">
          <div data-satin-scroll data-satin-primary="true"></div>
        </div>
      </div>
      <div data-satin-navigation-edge-host data-satin-pane="${pane}">
        <div data-satin-scroll-edge data-satin-scroll-edge-visible="true"
          style="background: ${pane === 'sidebar' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)'}; opacity: 0.5"></div>
      </div>`,
      )
      .join('')}
  </div>`
  document.body.append(root)
  vi.stubGlobal('innerWidth', 1000)
  let paint: FrameRequestCallback | undefined
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    paint = callback
    return 1
  })
  for (const [index, motion] of [
    ...root.querySelectorAll<HTMLElement>('[data-satin-navigation-motion-layer]'),
  ].entries()) {
    vi.spyOn(motion, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 500, 0, 500, 900))
  }
  const restore = installStatusBand(root)
  try {
    paint?.(0)
    // Equal-width panes contribute white/black tint independently: 247.5 and 120.
    expect(html.style.getPropertyValue('--satin-status-band')).toBe('rgb(184 184 184)')
  } finally {
    restore()
    root.remove()
    html.removeAttribute('data-satin-viewport-fit')
    html.style.removeProperty('--satin-background')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  }
})
