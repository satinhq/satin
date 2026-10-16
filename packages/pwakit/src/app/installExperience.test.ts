import { describe, expect, it } from 'vitest'
import { defineSatinApp } from './definition.ts'
import { installPage } from './install.ts'
import { INSTALL_STRINGS } from './installExperience.ts'

const app = defineSatinApp({
  id: '/reps',
  name: 'Reps <Pro>',
  shortName: 'Reps',
  description: 'Log every set.',
  icons: [
    { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
  appearance: {
    tint: '#ff5a1f',
    background: '#f6f3ee',
    darkLaunch: { background: '#0f0e0d' },
  },
  appShell: { additionalPrecache: [] },
  capabilities: [],
  connectivity: 'local',
  orientations: { supported: ['portrait', 'landscape'], fallback: 'none' },
  scope: '/app/',
  startRoute: '/app/',
  installRoute: '/install',

  updateActivation: 'cold-launch',
})

describe('install experience page', () => {
  it('ships the approved design by default with the silent deployment check', () => {
    const page = installPage(app, 'install')
    expect(page).toContain('data-install-design="home-screen"')
    expect(page).toContain('data-satin-install-page')
    expect(page).toContain('data-satin-install-check')
    expect(page).toContain('<section id="satin-install-check" hidden></section>')
    expect(page).not.toMatch(/install-steps|data-concept|data:image|Checking|configuration…/)
    expect(Buffer.byteLength(page)).toBeLessThan(46_000)
    expect(page).not.toMatch(/<section id="satin-install-guide"[^>]*hidden/)
  })

  it('keeps a clear supported-device message on the gate', () => {
    const page = installPage(app, 'gate')
    expect(page).toContain('<title>This app is designed for iPhone and iPad</title>')
    expect(page).toContain('<h1 class="ix-title">This app is designed for iPhone and iPad</h1>')
    expect(page).toContain('data-env="gate"')
    expect(page).not.toContain('id="satin-install-check"')
    expect(page).toContain('data-qr data-js')
    expect(page).toContain('data-nojs')
  })

  it('only accepts review overrides in preview builds', () => {
    expect(installPage(app, 'install')).toMatch(/preview:!1\b/)
    expect(installPage(app, 'install', '/', { preview: true })).toMatch(/preview:!0\b/)
  })

  it('makes the action the title, with the drawing and the description supporting it', () => {
    const page = installPage(app, 'install')
    const phone = page.indexOf('<svg class="ix-device ix-phone"')
    const tablet = page.indexOf('<svg class="ix-device ix-tablet"')
    const title = page.indexOf(
      '<h1 class="ix-title">Add <bdi>Reps &lt;Pro></bdi> to Home Screen</h1>',
    )
    const about = page.indexOf('<p class="ix-about" dir="auto">Log every set.</p>')
    const steps = page.indexOf('<ol class="ix-steps" role="list">')
    expect(page).toContain('<html lang="en" data-install-design="home-screen">')
    expect(phone).toBeGreaterThan(0)
    expect(tablet).toBeGreaterThan(phone)
    expect(title).toBeGreaterThan(tablet)
    expect(about).toBeGreaterThan(title)
    expect(steps).toBeGreaterThan(about)
    expect(page.match(/<h1/g)).toHaveLength(1)
    expect(page).not.toContain('<div data-panel="steps"><h2>')
    // The drawings are our own: vectors and the app's own icon, nothing else.
    expect(page.match(/<image /g)).toHaveLength(2)
    expect(page.match(/<image [^>]+>/g)!.every(tag => tag.includes('href="/icon-512.png"'))).toBe(
      true,
    )
  })

  it('draws the lower part of the device, static, on the mist wallpaper', () => {
    const page = installPage(app, 'install')
    // Round five: cropped to one row of apps, the dock and the Home indicator.
    expect(page).toContain('<svg class="ix-device ix-phone" viewBox="-12 584 458 346"')
    expect(page).toContain('<svg class="ix-device ix-tablet" viewBox="-14 880 950 442"')
    // Round ten: the app sits in place with a soft shadow (no dashed outline), among
    // placeholder apps in soft tints rather than identical grey squares.
    expect(page).not.toContain('ix-free')
    expect(page).toMatch(/class="ix-t1"[^>]*>.*class="ix-t2"/)
    // Nothing moves when the page opens: no lift, no rise, no tip pop or nudge.
    expect(page).not.toMatch(/ix-lift|ix-rise|ix-nudge/)
    // Round seven: only the tip animates in, growing out of Safari's control.
    expect(page).toMatch(/html\[data-ready\] \.ix-pointer\{animation:ix-tip /)
    expect(page).not.toMatch(/hills|dawn/)
  })

  it('draws the tip as one glass shape, so its outline runs around the tail', () => {
    const page = installPage(app, 'install')
    expect(page).toContain('<svg class="ix-glass" aria-hidden="true">')
    // Round eight: panel and tail are one path, drawn by the runtime; every layer uses it.
    expect(page).toContain('<path id="ix-shape" d="M0 0"/>')
    expect(page).not.toContain('data-tail')
    expect(page.match(/<use href="#ix-shape"\/>/g)!.length).toBeGreaterThanOrEqual(7)
    // Round six's layers: outside-only dark line weighted to the sides, top light line,
    // page-coloured edge band; the shadow is the shape's own, not a filter on a box.
    expect(page).toContain('<mask id="ix-out"')
    expect(page).toContain('<mask id="ix-hm"')
    // Round nine: inner light lines are strokes of the tip's path, weighted by the edge's angle
    // over one corner radius (17 pt) from the top and the bottom.
    expect(page).toContain(
      '<linearGradient id="ix-lt" gradientUnits="userSpaceOnUse" x2="0" y2="17">',
    )
    expect(page).toContain(
      '<linearGradient id="ix-lb" gradientUnits="userSpaceOnUse" x2="0" y2="-17">',
    )
    expect(page).toContain('mask="url(#ix-lm)"')
    expect(page).toContain('stroke-width="20" filter="url(#ix-blur)"')
    expect(page).toContain('<filter id="ix-shadow"')
    expect(page).not.toMatch(/\.ix-glass\{[^}]*drop-shadow/)
    expect(page).not.toMatch(/feMorphology|ix-glass-tail|ix-gt/)
  })

  it('leaves no fixed footer for Safari to stretch under its toolbar', () => {
    const page = installPage(app, 'install')
    // A fixed element at the bottom edge is extended by Safari 26+ under its floating toolbar
    // as a flat colour, which cut the tip's shadow off in a hard line (owner, round six).
    expect(page).not.toMatch(/\.ix::after\{content:""/)
    expect(page).toContain('min-height:100lvh')
    expect(page).not.toContain('class="ix-arrow"')
  })

  it('never lets an observed event take the steps away', () => {
    const page = installPage(app, 'install')
    expect(page).not.toContain('data-panel="added"')
    expect(page).not.toContain('data-restart')
    expect(page).not.toContain('localStorage')
    expect(page).toContain(`Already added? Open <bdi>Reps &lt;Pro></bdi> from your Home Screen.`)
  })

  it('shows the address when copying fails', () => {
    const page = installPage(app, 'install')
    expect(page).toContain(
      `<p class="ix-copy-failed" data-copy-failed hidden>${INSTALL_STRINGS.copyFailed}<span class="ix-address" data-address></span></p>`,
    )
  })

  it('gives step 1 no subtitle; only steps 2 and 3 say more', () => {
    const page = installPage(app, 'install')
    const rows = page
      .match(/<ol class="ix-steps" role="list">([\s\S]*?)<\/ol>/)![1]!
      .split('<li>')
      .slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).not.toContain('ix-where')
    expect(rows[1]).toContain(
      '<span class="ix-where">Tap View More if it isn’t in the list.</span>',
    )
    expect(rows[2]).toContain('<span class="ix-where">Make sure Open as Web App is on.</span>')
    expect(page).not.toMatch(/Share is in the menu that opens|It’s in Safari’s/)
    // A one-line row lays out as a native one-line list row.
    expect(page).toContain('.ix-steps li:not(:has(.ix-where)){min-height:52px')
  })

  it('names the same control in the first step and in the tip', () => {
    const page = installPage(app, 'install')
    const glyph = (name: string) =>
      `<svg class="ix-g" aria-hidden="true"><use href="#ix-${name}"/></svg>`
    // The Page Menu gives no signal when it opens, so both name both taps and stay true.
    expect(page).toContain('<span data-for="compact">Tap Page Menu, then Share</span>')
    expect(page).toContain(`<span data-for="compact">${glyph('menu')}Page Menu, then Share</span>`)
    expect(page).toContain('<span data-for="toolbar">Tap Share</span>')
    expect(page).toContain(`<span data-for="toolbar">${glyph('share')}Share</span>`)
  })

  it('stays under 46 KB with every inline script minified', () => {
    const page = installPage(app, 'install')
    expect(Buffer.byteLength(page)).toBeLessThan(46_000)
    // Only the glyphs the page uses are in its symbol sheet.
    expect(page).toContain('<symbol id="ix-put"')
    expect(page).not.toContain('<symbol id="ix-arrow"')
  })

  it('writes short, calm strings', () => {
    for (const text of Object.values(INSTALL_STRINGS)) {
      expect(text).not.toContain('!')
      expect(text).not.toMatch(/this app/i)
      expect(text.length).toBeLessThanOrEqual(90)
    }
  })
})
