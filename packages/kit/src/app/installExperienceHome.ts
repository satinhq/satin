import { padDrawing, phoneDrawing } from './installExperienceDevice.ts'

/**
 * The install page leads with the action, "Add {app} to Home Screen". Above it, a drawing of the
 * device in hand (an iPhone, or an iPad on an iPad) shows a Home Screen with the app's icon
 * hovering over the next free place among greyed-out apps; the app's description sits under
 * the title. Then the steps in the grammar of Apple's onboarding sheets, one emphasised at a
 * time, and a tip in the style of the system's popover tips at Safari's real control.
 *
 * Layouts: iPhone portrait (one column), iPhone landscape and iPad landscape (the drawing
 * beside the text), iPad portrait (one centred column with room around it), and a narrow
 * iPad window (the phone's column with the iPad drawing).
 */
export function homeScene(icon: string) {
  return `<div class="ix-art">${phoneDrawing(icon)}${padDrawing(icon)}</div>`
}

/** One row: a symbol, the bold action, and where to find it. */
export function homeStep(symbol: string, action: string, where = '') {
  // Show the location detail when supplied; otherwise keep the action on one line.
  const label = `<b>${action}</b>${where ? `<span class="ix-where">${where}</span>` : ''}`
  return `<li><span class="ix-sym">${symbol}</span><span class="ix-row">${label}</span></li>`
}

/**
 * The tip's glass, copied from iOS 27's own popover tip (TipKit `.popoverTip`) rendered in the
 * Simulator on the page's colours and measured at 3x (numbers in the notes). Panel
 * and tail are one shape. Drawn in CSS pixels (no viewBox), sized to the tip by percentages,
 * with three tail placements, one shown per Safari layout. Layers, as measured:
 * - fill: the page colour lifted towards white (more at the centre in light: an edge band of
 *   the page colour about 16 pt wide fades into it);
 * - inner light lines along the top and bottom edges only (none at the sides), with a short
 *   falloff;
 * - a thin dark line just outside the edge, strongest at the sides (the lens edge);
 * - a soft, low shadow.
 */
const everywhere = 'maskUnits="userSpaceOnUse" x="-50%" y="-100%" width="200%" height="300%"'
const stop = (offset: number, alpha: string) => `<stop offset="${offset}" class="ix-stop${alpha}"/>`
const shape = '<use href="#ix-shape"/>'
/*
 * Round eight: panel and tail are one path, `#ix-shape`, which the runtime draws for the tip's
 * size and Safari's layout (see `shapeTip`), so fill and outline have no seam or step where the
 * tail meets the panel. The layers are round six's, which the owner liked; only the bottom
 * inner line is now an inner stroke of that path, so it follows the tail instead of crossing it.
 */
export const TIP_GLASS = [
  '<svg class="ix-glass" aria-hidden="true"><defs>',
  `<path id="ix-shape" d="M0 0"/><clipPath id="ix-in">${shape}</clipPath>`,
  // Round nine: the inner light lines are strokes of the tip's own path, weighted by the edge's
  // angle the way iOS lights its rims: full along the straight top and bottom, fading around the
  // 17 pt corner arcs to nothing where the edge turns vertical. On a circular arc the cosine of
  // the edge's angle is linear in height over one corner radius; native fades about as its
  // square (measured in dark at 3x), so the stops are 1, 0.56, 0.25, 0.06, 0.
  '<linearGradient id="ix-lt" gradientUnits="userSpaceOnUse" x2="0" y2="17">',
  `${stop(0, '--one')}${stop(0.25, '--q1')}${stop(0.5, '--q2')}${stop(0.75, '--q3')}${stop(1, '--zero')}</linearGradient>`,
  '<linearGradient id="ix-lb" gradientUnits="userSpaceOnUse" x2="0" y2="-17">',
  `${stop(0, '--hl-bottom')}${stop(0.25, '--qb1')}${stop(0.5, '--qb2')}${stop(0.75, '--qb3')}${stop(1, '--zero')}</linearGradient>`,
  `<mask id="ix-lm" ${everywhere} class="ix-alpha-mask">`,
  '<rect x="-50%" y="-100%" width="200%" height="100%" fill="#fff"/><rect x="-50%" width="200%" height="17" fill="url(#ix-lt)"/>',
  '<svg y="100%" width="100%" height="1" overflow="visible"><rect x="-50%" y="-17" width="200%" height="17" fill="url(#ix-lb)"/>',
  '<rect x="-50%" width="200%" height="40" class="ix-bottom-fill"/></svg></mask>',
  '<filter id="ix-hblur" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2"/></filter>',
  // The outer dark line: its strength at the top, the sides and the bottom.
  '<linearGradient id="ix-hg" gradientUnits="userSpaceOnUse" x2="0" y2="100%">',
  `${stop(0, '--ht')}${stop(0.4, '--hs')}${stop(0.6, '--hs')}${stop(1, '--hb')}</linearGradient>`,
  `<mask id="ix-hm" ${everywhere} class="ix-alpha-mask"><rect x="-50%" y="-100%" width="200%" height="300%" fill="url(#ix-hg)"/></mask>`,
  `<mask id="ix-out" ${everywhere}><rect x="-50%" y="-100%" width="200%" height="300%" fill="#fff"/><g fill="#000">${shape}</g></mask>`,
  '<filter id="ix-blur" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>',
  // The shadow is the shape's own and fades out before the bottom of Safari's page area.
  `<filter id="ix-shadow" ${everywhere.replace('maskUnits', 'filterUnits')}>`,
  '<feGaussianBlur in="SourceAlpha" stdDeviation="8"/><feOffset dy="3"/>',
  '<feComponentTransfer><feFuncA type="linear" slope=".06"/></feComponentTransfer></filter></defs>',
  `<g filter="url(#ix-shadow)">${shape}</g>`,
  `<g clip-path="url(#ix-in)"><g class="ix-glass-fill">${shape}</g>`,
  `<g class="ix-glass-band" fill="none" stroke-width="20" filter="url(#ix-blur)">${shape}</g>`,
  `<g mask="url(#ix-lm)" fill="none" stroke="#fff"><g class="ix-glass-soft" stroke-width="6" filter="url(#ix-hblur)">${shape}</g>`,
  `<g class="ix-glass-line" stroke-width="1.34">${shape}</g></g></g>`,
  `<g mask="url(#ix-out)"><g mask="url(#ix-hm)"><g stroke="#000" stroke-width="1.34" fill="none">${shape}</g></g></g>`,
  '</svg>',
].join('')

export const ILLUSTRATION_CSS = `
.ix-stop--one { stop-color: #fff; stop-opacity: var(--one); }
.ix-stop--q1 { stop-color: #fff; stop-opacity: var(--q1); }
.ix-stop--q2 { stop-color: #fff; stop-opacity: var(--q2); }
.ix-stop--q3 { stop-color: #fff; stop-opacity: var(--q3); }
.ix-stop--zero { stop-color: #fff; stop-opacity: var(--zero); }
.ix-stop--hl-bottom { stop-color: #fff; stop-opacity: var(--hl-bottom); }
.ix-stop--qb1 { stop-color: #fff; stop-opacity: var(--qb1); }
.ix-stop--qb2 { stop-color: #fff; stop-opacity: var(--qb2); }
.ix-stop--qb3 { stop-color: #fff; stop-opacity: var(--qb3); }
.ix-stop--ht { stop-color: #fff; stop-opacity: var(--ht); }
.ix-stop--hs { stop-color: #fff; stop-opacity: var(--hs); }
.ix-stop--hb { stop-color: #fff; stop-opacity: var(--hb); }
.ix-alpha-mask { mask-type: alpha; }
.ix-bottom-fill { fill: #fff; fill-opacity: var(--hl-bottom); }
.ix-wall-start { stop-color:var(--w1); }
.ix-wall-end { stop-color:var(--w2); }
.ix-wall-glow { stop-color:var(--w3); }
.ix-wall-clear { stop-color:var(--w3);stop-opacity:0; }
.ix-metal-edge { stop-color:var(--metal-a); }
.ix-metal-middle { stop-color:var(--metal-b); }

`

export const CSS_D = `
${ILLUSTRATION_CSS}
.ix { text-align: center; padding-inline: max(20px, env(safe-area-inset-left)) max(20px, env(safe-area-inset-right)); }
.ix-hero { padding-top: clamp(14px, 3svh, 32px); }

/* The drawing. Height drives its size; the large-text levels shrink it. */
/* The drawing: the lower part of the device, large, its cut edge fading into the page.
 * --art is its width; the large-text levels narrow it. */
.ix-art { --art: min(100%, 360px, 48svh); display: flex; justify-content: center; }
.ix-device {
  display: block;
  width: var(--art);
  height: auto;
  max-width: 100%;
  -webkit-mask-image: linear-gradient(transparent, #000 18%);
  mask-image: linear-gradient(transparent, #000 18%);
}
.ix-tablet, html[data-device="pad"] .ix-phone { display: none; }
html[data-device="pad"] .ix-tablet { display: block; }
.ix-frame { filter: drop-shadow(0 10px 14px rgb(0 0 0 / 0.16)); }
.ix-frame { stroke: rgb(0 0 0 / 0.12); stroke-width: 1; }
.ix-border { fill: #0b0b0c; }
.ix-t1 { fill: var(--g1); }
.ix-t2 { fill: var(--g2); }
.ix-t3 { fill: var(--g3); }
.ix-t4 { fill: var(--g4); }
.ix-label { fill: var(--label-bar); }
.ix-ink { fill: var(--ink); }
.ix-dock { fill: var(--dock-glass); stroke: var(--dock-rim); stroke-width: 1.5; }
.ix-app { filter: drop-shadow(0 6px 8px rgb(0 0 0 / 0.25)); }

/* The action is the title; the description supports it. */
.ix-title {
  margin-top: 18px;
  font-size: min(1.765rem, 40px);
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.17;
  text-wrap: balance;
  overflow-wrap: anywhere;
}
.ix-about {
  margin-top: 6px;
  color: var(--second);
  font-size: min(1rem, 28px);
  line-height: 1.294;
  text-wrap: balance;
}
[data-panel] { margin-top: 22px; }
[data-panel] h2 { font-size: min(1.176rem, 28px); font-weight: 600; }
[data-panel] h2 bdi { overflow-wrap: anywhere; }

/* The steps, in the grammar of the system's own onboarding sheets. */
.ix-steps {
  --sym: min(2.118rem, 52px);
  border-radius: 26px;
  background: var(--card);
  text-align: start;
}
[data-panel] h2 + .ix-steps { margin-top: 14px; }
.ix-steps li {
  position: relative;
  display: grid;
  grid-template-columns: var(--sym) 1fr;
  column-gap: 12px;
  align-items: center;
  min-height: 60px;
  box-sizing: border-box;
  padding-block: 10px;
  padding-inline: 14px 16px;
}
.ix-steps li + li::before {
  content: "";
  position: absolute;
  top: 0;
  inset-inline: calc(var(--sym) + 26px) 0;
  height: 0.5px;
  background: var(--hair);
}
/*
 * Round ten: every row's symbol has the same treatment, as in iOS lists: the symbol in the
 * tint on a soft tinted rounded square. No row is styled as "current" and nothing joins them.
 */
/* A one-line row is a native one-line list row: title centred, 52 pt tall. */
.ix-steps li:not(:has(.ix-where)) { min-height: 52px; padding-block: 8px; }
.ix-sym {
  display: grid;
  place-items: center;
  width: var(--sym);
  height: var(--sym);
  border-radius: calc(var(--sym) * 0.27);
  background: var(--tint-soft);
  color: var(--tint);
}
.ix-sym .ix-g { width: calc(var(--sym) * 0.61); height: calc(var(--sym) * 0.61); vertical-align: 0; }
.ix-sym [data-for] { grid-area: 1 / 1; line-height: 0; }
.ix-row b { display: block; font-size: 1rem; font-weight: 600; line-height: 1.294; }
.ix-where { display: block; color: var(--second); font-size: 0.882rem; line-height: 1.33; }
.ix-hint { margin-top: 14px; }
html[data-state="back"] [data-panel="steps"] .ix-foot { display: none; }
.ix-foot { margin-top: 14px; }

/*
 * The tip: a small one-line callout (round eight: 42 pt tall, 15 pt semibold, corners 17 pt)
 * in round six's material, measured from iOS 27's popover tip. It grows out of Safari's
 * control the way a native popover appears. Round nine: as low as the page can draw. Safari's
 * page area ends about 16 pt above its address bar (measured: 858 pt against 873.7 pt with the
 * compact bar, 794 against 810.3 with the full toolbar), so the tail cannot reach the control;
 * its point sits about 3 pt above the page area's bottom, leaving the shadow room to fade.
 */
.ix-pointer {
  position: fixed;
  z-index: 2;
  left: 9px;
  bottom: 13px;
  display: flex;
  align-items: center;
  min-height: 42px;
  box-sizing: border-box;
  padding: 0 15px;
  color: var(--label);
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
  transform-origin: 105px calc(100% + 11px);
}
html[data-ready] .ix-pointer { animation: ix-tip 0.45s 0.3s var(--spring) both; }
@keyframes ix-tip { from { transform: scale(0.2); opacity: 0; filter: blur(4px); } }
.ix-glass {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.ix-glass-fill { fill: var(--glass); }
.ix-glass-band { stroke: var(--glass-band); }
.ix-glass-line { opacity: var(--hl-line); }
.ix-glass-soft { opacity: var(--hl-soft); }
html[data-state="back"] .ix-pointer { animation: ix-tip-again 0.45s var(--spring) both; }
/* The symbol scaled with the words: its lines span about 19 x 12 pt. */
.ix-pointer .ix-g {
  flex: none;
  width: 32px;
  height: 32px;
  margin: -6px 3.5px -6px -6.6px;
  color: var(--tint);
  stroke-width: 1.4;
}
html[data-bar="toolbar"] .ix-pointer { right: 16px; width: fit-content; margin: 0 auto; transform-origin: 50% calc(100% + 11px); }
html[data-bar="top"] .ix-pointer {
  left: auto;
  right: calc(env(safe-area-inset-right) + 78px);
  bottom: auto;
  top: 12px;
  transform-origin: calc(100% - 42px) -11px;
}
html:not([data-step="1"]) .ix-pointer { display: none; }
@keyframes ix-tip-again { from { transform: scale(0.2); opacity: 0; filter: blur(4px); } }
html[data-bar="top"] .ix { padding-top: 80px; }

.ix-qr { margin-inline: auto; }
@media (min-width: 600px) { .ix-panels, #satin-install-check { max-width: 460px; margin-inline: auto; } }

/*
 * iPad portrait (any window at least 600 wide and 700 tall, upright): one column with space,
 * about centred. The offset is fixed rather than measured, so the page does not move when
 * the deployment check hands over to the steps.
 */
@media (min-width: 600px) and (min-height: 700px) and (orientation: portrait) {
  .ix-hero, html[data-bar="top"] .ix-hero { padding-top: max(24px, calc(50svh - 400px)); }
  html[data-device="pad"] .ix-art { --art: min(100%, 560px); }
  .ix-title { margin-top: 28px; font-size: min(2.118rem, 44px); }
  .ix-panels, #satin-install-check { width: 100%; max-width: 480px; }
}
/* A narrow iPad window: the phone's column, with the iPad drawn. */
@media (max-width: 599px) { html[data-device="pad"] .ix-art { --art: 100%; } }

/* Landscape with room (iPad): the drawing on the left, the title and steps beside it. */
@media (orientation: landscape) and (min-width: 900px) and (min-height: 600px) {
  .ix {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
    grid-auto-rows: min-content;
    align-content: center;
    column-gap: clamp(32px, 6vw, 88px);
    max-width: 1120px;
    margin-inline: auto;
    text-align: start;
  }
  .ix-hero { display: contents; }
  html .ix-art { grid-column: 1; grid-row: 1 / span 4; align-self: center; --art: min(100%, 540px); }
  .ix-hero > :not(.ix-art), #satin-install-check, .ix-panels { grid-column: 2; }
  .ix-title { margin-top: 0; font-size: min(2.118rem, 44px); }
  .ix-panels, #satin-install-check { max-width: none; margin-inline: 0; }
  .ix-qr { margin-inline: 0; }
}
/* iPhone landscape: little height, so the same two columns, tighter. */
@media (orientation: landscape) and (max-height: 500px) {
  .ix {
    display: grid;
    grid-template-columns: 0.75fr 1.25fr;
    grid-auto-rows: min-content;
    align-content: center;
    column-gap: 24px;
    padding-top: 52px;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    text-align: start;
  }
  .ix-hero { display: contents; }
  html .ix-art { grid-column: 1; grid-row: 1 / span 4; align-self: center; --art: min(100%, 300px, 88svh); }
  .ix-hero > :not(.ix-art), #satin-install-check, .ix-panels { grid-column: 2; }
  .ix-title { margin-top: 0; font-size: min(1.412rem, 30px); }
  .ix-about { margin-top: 2px; }
  [data-panel] { margin-top: 10px; }
  html[data-tight="3x"] .ix-foot { display: none; }
  .ix-steps li { min-height: 48px; padding-block: 5px; }
}

/* When the text is large the drawing steps back so the steps keep their room. */
html[data-tight="1"] .ix-art { --art: 260px; }
html[data-tight="2"] .ix-art { --art: 200px; }
html[data-tight="3"] .ix-art { --art: 140px; }
html[data-tight="3x"] :is(.ix-art, .ix-about) { display: none; }
html[data-tight] .ix-hero { padding-top: 6px; }
`
