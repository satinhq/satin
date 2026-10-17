/**
 * Our own drawings of the lower part of an iPhone and an iPad showing a Home Screen, for the
 * install page.
 *
 * Built only from publicly known proportions (iPhone 17 Pro: a 402 x 874 pt screen, about
 * 16 pt of frame and border around it; iPad Pro 11-inch: an 834 x 1210 pt screen, about 44 pt
 * of border). No Apple artwork, product images or Design Resources are used or traced; see
 * the implementation contract Units are points of the drawn screen.
 *
 * Colours come from CSS custom properties, so one drawing serves light and dark:
 * `--metal-a`/`--metal-b` (the frame), `--w1`..`--w3` (the mist wallpaper),
 * `--g1`..`--g4` and `--label-bar` (placeholder apps), `--dock-glass`, `--dock-rim` and `--ink` (page dots, Home
 * indicator).
 */

/**
 * The app's icon in its place, slightly lifted with a soft shadow, as when placing it on the
 * Home Screen (round ten: no dashed outline; iOS never draws one).
 */
function appSlot(icon: string, x: number, y: number, size: number, clip: string) {
  return `<image class="ix-app" href="${icon}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#${clip})"/>`
}

/**
 * The Home Screen icon shape for the app's own icon, in the icon's bounding box, with the same
 * corner ratio as the placeholder apps. Each device drawing defines its own copy because a
 * hidden drawing's definitions don't apply in WebKit.
 */
function iconShape(id: string) {
  return `<clipPath id="${id}" clipPathUnits="objectBoundingBox"><rect width="1" height="1" rx="0.23"/></clipPath>`
}

/**
 * Placeholder apps that read as a Home Screen without being real apps: rounded squares in a few
 * soft tints (`--g1`..`--g4`), with a faint short label under those in the grid.
 */
function ghosts(size: number, y: number, xs: number[], labels: boolean) {
  return xs
    .map((x, index) => {
      const tone = `ix-t${(index % 4) + 1}`
      const icon = `<rect class="${tone}" x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.23}"/>`
      const width = size * (index % 2 ? 0.42 : 0.56)
      const label = labels
        ? `<rect class="ix-label" x="${x + (size - width) / 2}" y="${y + size + 7}" width="${width}" height="6" rx="3"/>`
        : ''
      return icon + label
    })
    .join('')
}

/** The mist wallpaper over the visible part of the screen: a grey gradient and a soft light. */
function wallpaper(id: string, width: number, height: number, top: number) {
  return [
    `<linearGradient id="${id}-w" x2="0" y1="${top}" y2="${height}" gradientUnits="userSpaceOnUse">`,
    '<stop style="stop-color:var(--w1)"/><stop offset="1" style="stop-color:var(--w2)"/></linearGradient>',
    `<radialGradient id="${id}-g"><stop style="stop-color:var(--w3)"/>`,
    '<stop offset="1" style="stop-color:var(--w3);stop-opacity:0"/></radialGradient>',
    `<rect width="${width}" height="${height}" fill="url(#${id}-w)"/>`,
    `<ellipse cx="${width * 0.2}" cy="${top + 20}" rx="${width * 0.8}" ry="${(height - top) * 0.7}" fill="url(#${id}-g)"/>`,
  ].join('')
}

/**
 * The lower part of an iPhone in portrait, drawn large (owner, round five): the frame and its
 * rounded bottom corners, one row of apps with the app in the next free place, page dots, the
 * dock and the Home indicator. The top of the device is cut off; CSS fades the cut edge.
 */
export function phoneDrawing(icon: string) {
  const screen = [
    wallpaper('ix-p', 402, 874, 580),
    ghosts(62, 636, [27.5, 122.5], true),
    '<g class="ix-ink"><circle cx="193" cy="737" r="3.5"/><circle cx="209" cy="737" r="3.5" opacity=".4"/></g>',
    '<rect class="ix-dock" x="13" y="755" width="376" height="96" rx="38"/>',
    ghosts(62, 772, [27.5, 122.5, 217.5, 312.5], false),
    '<rect class="ix-ink" x="134" y="861" width="134" height="5" rx="2.5"/>',
    appSlot(icon, 217.5, 636, 62, 'ix-icon-p'),
  ].join('')
  return [
    '<svg class="ix-device ix-phone" viewBox="-12 584 458 346" aria-hidden="true">',
    '<linearGradient id="ix-pm" x2="1"><stop style="stop-color:var(--metal-a)"/>',
    '<stop offset=".5" style="stop-color:var(--metal-b)"/><stop offset="1" style="stop-color:var(--metal-a)"/></linearGradient>',
    '<rect class="ix-frame" width="434" height="906" rx="78" fill="url(#ix-pm)"/>',
    '<rect class="ix-border" x="4" y="4" width="426" height="898" rx="74"/>',
    '<clipPath id="ix-ps"><rect width="402" height="874" rx="62"/></clipPath>',
    iconShape('ix-icon-p'),
    `<g transform="translate(16 16)" clip-path="url(#ix-ps)">${screen}</g>`,
    '</svg>',
  ].join('')
}

/**
 * The lower part of an iPad in portrait (iPad Pro 11-inch: an 834 x 1210 pt screen, about
 * 44 pt of border), drawn the same way: frame and rounded bottom corners, one row of apps with
 * the app in the next free place, page dots, the floating dock and the Home indicator.
 * Portrait, because the lower part of a landscape iPad is a thin strip with tiny apps.
 */
export function padDrawing(icon: string) {
  const screen = [
    wallpaper('ix-t', 834, 1210, 860),
    ghosts(74, 930, [100, 240, 380], true),
    '<g class="ix-ink"><circle cx="409" cy="1042" r="4"/><circle cx="425" cy="1042" r="4" opacity=".4"/></g>',
    '<rect class="ix-dock" x="40" y="1060" width="754" height="110" rx="36"/>',
    ghosts(74, 1078, [92, 188, 284, 380, 476, 572, 668], false),
    '<rect class="ix-ink" x="317" y="1196" width="200" height="5" rx="2.5"/>',
    appSlot(icon, 520, 930, 74, 'ix-icon-t'),
  ].join('')
  return [
    '<svg class="ix-device ix-tablet" viewBox="-14 880 950 442" aria-hidden="true">',
    '<linearGradient id="ix-tm" x2="1"><stop style="stop-color:var(--metal-a)"/>',
    '<stop offset=".5" style="stop-color:var(--metal-b)"/><stop offset="1" style="stop-color:var(--metal-a)"/></linearGradient>',
    '<rect class="ix-frame" width="922" height="1298" rx="64" fill="url(#ix-tm)"/>',
    '<rect class="ix-border" x="4" y="4" width="914" height="1290" rx="60"/>',
    '<clipPath id="ix-ts"><rect width="834" height="1210" rx="20"/></clipPath>',
    iconShape('ix-icon-t'),
    `<g transform="translate(44 44)" clip-path="url(#ix-ts)">${screen}</g>`,
    '</svg>',
  ].join('')
}

/** The mist wallpaper (owner's pick, round five), light and dark: top, bottom, soft light. */
const MIST = {
  light: ['#dfe1e6', '#b3b7c1', 'rgb(255 255 255 / 0.7)'],
  dark: ['#36373d', '#111114', '#55585f'],
} as const

/** The drawing's tokens and the tip's glass tokens in one appearance, as CSS declarations. */
export function deviceTokens(dark: boolean) {
  const tokens = [
    ...MIST[dark ? 'dark' : 'light'].map((color, index) => `--w${index + 1}: ${color}`),
    // Placeholder apps: soft tints, still clearly not real apps.
    ...(dark
      ? [
          'rgb(150 170 210 / 0.22)',
          'rgb(170 200 170 / 0.2)',
          'rgb(220 180 150 / 0.2)',
          'rgb(190 170 220 / 0.22)',
        ]
      : [
          'rgb(214 226 246 / 0.85)',
          'rgb(222 238 222 / 0.85)',
          'rgb(246 230 214 / 0.85)',
          'rgb(232 222 246 / 0.85)',
        ]
    ).map((tone, i) => `--g${i + 1}: ${tone}`),
    `--label-bar: rgb(${dark ? '255 255 255 / 0.14' : '255 255 255 / 0.5'})`,
    `--dock-glass: rgb(255 255 255 / ${dark ? 0.12 : 0.4})`,
    `--dock-rim: rgb(255 255 255 / ${dark ? 0.2 : 0.75})`,
    `--ink: ${dark ? 'rgb(255 255 255 / 0.85)' : 'rgb(0 0 0 / 0.72)'}`,
    `--metal-a: ${dark ? '#3a3b40' : '#b9bcc3'}`,
    `--metal-b: ${dark ? '#77797f' : '#eef0f3'}`,
    // The tip's glass, measured from iOS 27's popover tip over these page colours (round six).
    `--glass: color-mix(in srgb, var(--bg), #fff ${dark ? 12.5 : 67}%)`,
    `--glass-band: ${dark ? 'transparent' : 'var(--bg)'}`,
    // Inner light lines (round six's measured strengths): the crisp line at the top edge, a soft
    // falloff inside it, and the bottom's strength relative to the top.
    `--hl-line: ${dark ? 0.27 : 1}`,
    `--hl-soft: ${dark ? 0.08 : 0.45}`,
    `--hl-bottom: ${dark ? 0.74 : 1}`,
    '--one: 1',
    // The squared falloff around the corners, for the top and for the bottom's strength.
    ...[0.5625, 0.25, 0.0625].map((q, i) => `--q${i + 1}: ${q}`),
    ...[0.5625, 0.25, 0.0625].map((q, i) => `--qb${i + 1}: ${+(q * (dark ? 0.74 : 1)).toFixed(3)}`),
    `--ht: ${dark ? 0 : 0.08}`,
    `--hs: ${dark ? 0.85 : 0.35}`,
    `--hb: ${dark ? 0 : 0.14}`,
    '--zero: 0',
  ]
  return tokens.map(token => token + ';').join(' ')
}
