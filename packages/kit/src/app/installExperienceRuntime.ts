import { installPolicy } from './installPolicy.ts'
export interface InstallExperienceConfig {
  readonly installRoute: string
  readonly kind: 'install' | 'gate'
  /** Scratch review builds accept `?env=`, `?state=` and `?device=`. Never set in production. */
  readonly preview: boolean
  /** The words for this device, iPhone first: the page is written with "iPhone or iPad". */
  readonly devices: readonly [string, string]
}

type QrEncoder = (text: string) => boolean[][] | null

/**
 * Browser half of the install experience. It never invents progress: it classifies the
 * browser once, places the pointer where Safari's control really is, and reacts only to
 * events the page actually receives while the share sheet covers it.
 *
 * Measured on iOS 27.0 Safari (see the implementation contract):
 * - opening the page menu or the compact share sheet sends the page nothing;
 * - the full-height share sheet takes focus (window `blur`);
 * - the Add to Home Screen dialog raises the keyboard (`visualViewport` shrinks), and so
 *   does Add Bookmark, so a keyboard alone never proves which dialog was open;
 * - Add closes that dialog and iOS shows the Home Screen, so the page is hidden: in the
 *   Simulator one to two seconds after the keyboard goes, on a real iPad while the keyboard
 *   still counts as up, with the dialog gone when the page is next visible;
 * - Cancel closes the dialog and the page stays visible;
 * - a sheet closed with its own close button often returns no focus event at all, and stray
 *   focus events arrive while one sheet replaces another;
 * - cancelling the dialog and then leaving Safari looks the same as Add, so the page never
 *   concludes that the app was added and never takes the steps away.
 *
 * Self-contained: embedded verbatim in the page, so it must not reference module scope.
 */
export function installExperienceRuntime(
  config: InstallExperienceConfig,
  encodeQr: QrEncoder,
  policy = installPolicy,
) {
  const root = document.documentElement
  const guide = document.getElementById('satin-install-guide')
  if (!guide) return
  const query = new URLSearchParams(config.preview ? location.search : '')
  const userAgent = navigator.userAgent
  const signals = policy.classifyInstallSignals(
    userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  )
  const forcedDevice = query.get('device')
  const tablet = forcedDevice ? forcedDevice === 'pad' : signals.device === 'ipad'
  const iosWebKit = signals.device !== 'other'
  const pageUrl = location.origin + config.installRoute

  const environment =
    query.get('env') ??
    (config.kind === 'gate' || !iosWebKit
      ? 'gate'
      : signals.browser === 'in-app'
        ? 'inapp'
        : signals.browser === 'other'
          ? 'browser'
          : 'safari')
  root.dataset.env = ['gate', 'inapp', 'browser'].includes(environment) ? environment : 'safari'
  root.dataset.device = tablet ? 'pad' : 'phone'
  // On an iPhone or an iPad the page names that device; anywhere else it keeps both names.
  if (iosWebKit || forcedDevice) {
    for (const word of document.querySelectorAll('[data-device-name]')) {
      word.textContent = config.devices[tablet ? 1 : 0]
    }
  }

  // Where Safari keeps the control that starts the flow. The dynamic toolbar's size tells
  // the layouts apart: Compact collapses by about 40 pt, Bottom by 100, Top by 152.
  const classifyBar = () => {
    const forced = query.get('env')
    if (forced && ['compact', 'toolbar', 'top', 'unknown'].includes(forced)) return forced
    return policy.safariBarGeometry(
      signals.safariVersion,
      signals.device,
      innerWidth,
      innerHeight,
      policy.safariToolbarCollapse(signals.safariVersion, signals.device, innerWidth, innerHeight),
    )
  }
  // The tip's panel and tail are one path, drawn for the tip's size and Safari's layout, so
  // fill and outline have no seam where the tail meets the panel (round eight). The tail is
  // TipKit's, scaled: wide curved shoulders, straight sides, a round point.
  const tip = document.querySelector('.ix-pointer') as HTMLElement | null
  const tipShape = document.getElementById('ix-shape')
  const shapeTip = () => {
    const bar = root.dataset.bar
    if (!tip || !tipShape || !bar || bar === 'unknown') return
    const w = tip.offsetWidth
    const h = tip.offsetHeight
    if (!w || !h) return
    tipShape.setAttribute('d', policy.tipPath(w, h, bar as 'compact' | 'toolbar' | 'top'))
  }

  const placePointer = () => {
    if (root.dataset.env === 'safari') root.dataset.bar = classifyBar()
    shapeTip()
  }
  placePointer()
  addEventListener('resize', placePointer)
  if (tip && typeof ResizeObserver === 'function') new ResizeObserver(shapeTip).observe(tip)

  // Large text can push the steps below the fold. The scene yields its height first, in
  // steps (smaller, smaller still, only the icon, then without the description), before the
  // page is left to scroll.
  const main = guide.parentElement
  const fit = () => {
    if (!main || guide.hidden) return
    for (const level of ['', '1', '2', '3', '3x']) {
      if (level) root.dataset.tight = level
      else delete root.dataset.tight
      if (main.scrollHeight <= main.clientHeight + 1) break
    }
  }
  addEventListener('resize', fit)

  const live = guide.querySelector('[data-live]')
  const setState = (state: string) => {
    if (root.dataset.state === state) return
    root.dataset.state = state
    const spoken = guide.querySelector('[data-say="' + state + '"]')
    if (live && spoken) {
      // Announce, then empty the region so VoiceOver does not find the same words twice.
      const words = spoken.textContent
      live.textContent = words
      setTimeout(() => {
        if (live.textContent === words) live.textContent = ''
      }, 3000)
    }
    fit()
  }

  // Environments where Safari's own flow is not available here.
  const link = (selector: string, href: string) => {
    for (const anchor of guide.querySelectorAll<HTMLAnchorElement>(selector)) anchor.href = href
  }
  link('[data-open-safari]', 'x-safari-' + pageUrl)
  for (const address of guide.querySelectorAll('[data-address]')) {
    address.textContent = pageUrl.replace(/^https?:\/\//, '')
  }
  for (const button of guide.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    button.addEventListener('click', () => {
      const done = () => {
        button.dataset.copied = 'true'
        if (live) live.textContent = button.dataset.copy ?? ''
      }
      // Blocked or missing clipboard: say so, and show the address to select instead.
      const failed = () => {
        const note = button.parentElement?.querySelector<HTMLElement>('[data-copy-failed]')
        if (!note) return
        note.hidden = false
        if (live) live.textContent = note.textContent
      }
      try {
        navigator.clipboard.writeText(pageUrl).then(done, failed)
      } catch {
        failed()
      }
    })
  }
  if (root.dataset.env === 'gate') {
    const rows = encodeQr(pageUrl)
    const code = guide.querySelector('[data-qr]')
    if (rows && code) {
      let path = ''
      rows.forEach((row, y) => {
        row.forEach((dark, x) => {
          if (dark) path += 'M' + x + ' ' + y + 'h1v1h-1z'
        })
      })
      const size = rows.length
      code.innerHTML =
        '<svg viewBox="-2 -2 ' +
        (size + 4) +
        ' ' +
        (size + 4) +
        '" shape-rendering="crispEdges"><path fill="currentColor" d="' +
        path +
        '"/></svg>'
    } else if (code) {
      code.remove()
    }
  }

  // The share-sheet round trip, from real events only. Times are performance.now() values.
  let covered = false // a full-height sheet has taken focus from the page
  let sawBlur = false // some sheet took focus during this attempt; stray focus does not clear it
  let keyboardUp = false // a dialog over the page has raised the keyboard
  let coveredAt = 0
  let settle: ReturnType<typeof setTimeout> | undefined
  let relax: ReturnType<typeof setTimeout> | undefined
  const safari = root.dataset.env === 'safari'
  // The layout viewport ignores the keyboard; the visual viewport shrinks by its height.
  // Read through `window`: a browser without the API must not throw on the bare name.
  const viewport = window.visualViewport
  const keyboardShowing = () => (viewport?.height ?? innerHeight) < innerHeight - 120
  // Emphasis only: which step is most plausibly next. It never claims a step was done.
  const setStep = (step: number) => {
    root.dataset.step = String(step)
  }
  // Nothing was added if the page is still in view well after a sheet or dialog closed: Add
  // hides the page one to two seconds after its dialog closes.
  const settleBack = () => {
    clearTimeout(settle)
    settle = setTimeout(() => {
      if (document.visibilityState === 'hidden') return
      setStep(1)
      setState('back')
    }, 2800)
  }
  const uncover = () => {
    covered = false
    clearTimeout(relax)
    setStep(1)
  }
  addEventListener('blur', () => {
    if (!safari || document.visibilityState === 'hidden') return
    clearTimeout(settle)
    clearTimeout(relax)
    covered = true
    sawBlur = true
    coveredAt = performance.now()
    setStep(2)
    // On iPhone the sheet hides the page, and closing it with its own button returns no
    // focus event, so the assumption that it is still open must not outlive a short while.
    if (!tablet) relax = setTimeout(() => setStep(1), 6000)
  })
  viewport?.addEventListener('resize', () => {
    // The page has no text fields, so a keyboard after a sheet means a dialog over it. Stray
    // focus events arrive while sheets change, so this must not depend on the sheet still
    // counting as open.
    if (safari && sawBlur && !keyboardUp && keyboardShowing()) {
      keyboardUp = true
      covered = true
      clearTimeout(settle)
      clearTimeout(relax)
      setStep(3)
    } else if (keyboardUp && !keyboardShowing()) {
      keyboardUp = false
      settleBack()
    }
  })
  addEventListener('focus', () => {
    if (!covered || keyboardUp) return
    uncover()
    settleBack()
  })
  // A touch on the page proves no sheet covers it, even when focus never came back.
  addEventListener('pointerdown', () => {
    sawBlur = false
    if (covered && !keyboardUp) uncover()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Leaving Safari (by Add, or by anything else) says nothing about the install. Whatever
      // was pending is dropped, and the page starts again from the first step.
      clearTimeout(settle)
      if (covered && performance.now() - coveredAt < 500) sawBlur = false
      return
    }
    setTimeout(() => {
      if (keyboardShowing()) return
      keyboardUp = false
      covered = false
      sawBlur = false
      uncover()
    }, 600)
  })

  const start = () => {
    const forced = query.get('state')
    setState(forced ?? 'steps')
    setStep(Number(query.get('step') ?? 1))
    root.dataset.ready = 'true'
    fit()
  }
  if (!guide.hidden) start()
  else {
    const observer = new MutationObserver(() => {
      if (guide.hidden) return
      observer.disconnect()
      start()
    })
    observer.observe(guide, { attributes: true, attributeFilter: ['hidden'] })
  }
}
