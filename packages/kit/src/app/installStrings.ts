/**
 * The install page's words, glyphs and spring: browser-safe (no build-time imports), shared by
 * the default page and the components custom install pages can use (`@satinhq/kit/install`).
 */

/** Every user-facing string of the install experience. `{app}` is the app's name. */
export const INSTALL_STRINGS = {
  keepWebApp: 'Make sure Open as Web App is on.',
  // The action is the title.
  addTitle: 'Add {app} to Home Screen',
  // Each step is a bold action and one line saying where to find it. Safari's Page Menu
  // gives the page no signal when it opens, so where Share sits inside it the first step
  // and the tip name both taps at once and stay true while nothing on the page moves.
  rowMenu: 'Tap Page Menu, then Share',
  rowShare: 'Tap Share',
  rowShareBrowser: 'It’s in this browser’s toolbar or menu.',
  rowHome: 'Choose Add to Home Screen',
  rowHomeWhere: 'Tap View More if it isn’t in the list.',
  rowHomeBrowser: 'Not in the list? Open this page in Safari.',
  rowAdd: 'Tap Add',
  tipMenu: 'Page Menu, then Share',
  tipShare: 'Share',
  // Spoken names for the drawn glyphs.
  menuName: 'the page menu',
  shareName: '',
  homeName: '',
  backHint: 'Not added yet. Add to Home Screen is under View More, and Add finishes it.',
  alreadyAdded: 'Already added? Open {app} from your Home Screen.',
  inAppTitle: 'Open this page in Safari',
  inAppBody: 'This browser can’t add apps to your Home Screen.',
  openSafari: 'Open in Safari',
  copyLink: 'Copy Link',
  copied: 'Link copied',
  copyFailed: 'Couldn’t copy the link. Select the address to copy it.',
  inAppFoot: 'Or open this browser’s menu and choose Open in Safari.',
  // Device words. The page is written with `{device}` = "iPhone or iPad"; on an iPhone or an
  // iPad the runtime puts that device's name in its place.
  deviceAny: 'iPhone or iPad',
  devicePhone: 'iPhone',
  devicePad: 'iPad',
  gateTitle: 'Open {app} on your {device}',
  gateBody: 'Scan the code with the Camera on your {device}, or open this address in Safari there.',
  gateNoScript: 'Open this page’s address in Safari on your {device}.',
} as const

/**
 * The shared system spring (mass 1, stiffness 186.57, damping 25.13) as a CSS `linear()`
 * easing, sampled every 30 ms over 600 ms.
 */
export function springEasing() {
  const stiffness = 186.57
  const damping = 25.13
  const natural = Math.sqrt(stiffness)
  const ratio = damping / (2 * natural)
  const damped = natural * Math.sqrt(1 - ratio * ratio)
  const points: string[] = []
  for (let step = 0; step <= 20; step++) {
    const time = step * 0.03
    const envelope = Math.exp(-ratio * natural * time)
    const value =
      1 -
      envelope * (Math.cos(damped * time) + ((ratio * natural) / damped) * Math.sin(damped * time))
    points.push(step === 20 ? '1' : value.toFixed(3).replace(/^0\./, '.'))
  }
  return `linear(${points.join(',')})`
}

/** Our own drawings of the glyphs Safari shows, on a 24 x 24 canvas, stroked in currentColor. */
export const GLYPHS = {
  menu: '<path d="M5 7.5h14M5 12h14M5 16.5h8.5"/>',
  share:
    '<path d="M12 14.5v-11M8 7l4-4 4 4M8.5 10H7a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2h-1.5"/>',
  home: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  more: '<path d="M6.5 9.5 12 15l5.5-5.5"/>',
  check: '<path d="M5.5 12.5l4.5 4.5 8.5-9.5"/>',
  arrow: '<path d="M12 4.5v14M6.5 13.5l5.5 5.5 5.5-5.5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  // Add: an arrow coming down into a tray, the counterpart of Share's arrow going up out of one.
  put: '<path d="M12 3.5v11M8 10.5l4 4 4-4M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>',
} as const
