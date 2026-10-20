import type { DownloadProgress } from './launchScreen.ts'

export interface LaunchScreenController {
  readonly version: 1
  stylesReady(): Promise<void>
  error(reason: string, title?: string, retry?: () => void, detail?: string): void
  recover(): void
  appearance(background: string, ink: string): void
  snapshot(): {
    version: 1
    state: string
    error: string
    coverVisible: boolean
    ringVisible: boolean
    label: string | null
    offset: string
    box: number[]
    background: string
  }
  progress(progress: DownloadProgress | null): void
  updated(start?: 0 | 100): Promise<boolean>
  complete(): Promise<boolean>
  reveal(): void
  fail(onRetired: () => void): void
  restore(): void
}

type LaunchWindow = Window & { __SATIN_PRELAUNCH__?: LaunchScreenController }

// Serialized into the head so failures before module loading use the same
// controller as ordinary readiness. Keep this function self-contained.
export interface PrelaunchOptions {
  readonly markup: string
  readonly css: string
  readonly scope: string
  readonly background: string
  readonly darkBackground: string
  readonly darkInk: string
  readonly nonce?: string
  readonly cover?: boolean
}

export function installLaunchScreenRuntime(options: PrelaunchOptions) {
  const launchWindow = window as LaunchWindow
  if (launchWindow.__SATIN_PRELAUNCH__) return launchWindow.__SATIN_PRELAUNCH__
  const host = document.createElement('satin-prelaunch')
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.nonce = options.nonce ?? document.currentScript?.nonce ?? ''
  style.textContent = options.css
  const content = document.createElement('div')
  content.innerHTML = options.markup
  root.append(style, content)
  document.documentElement.append(host)
  const presentHost = (visible: boolean) => {
    if (visible) {
      if (!host.isConnected) document.documentElement.append(host)
    } else host.remove()
  }
  const element = (id: string) => root.getElementById(id) as HTMLElement | null
  const cover = element('satin-launch-screen')!
  const failure = document.createElement('section')
  failure.id = 'satin-launch-error'
  failure.setAttribute('role', 'alert')
  failure.hidden = true
  let state = options.cover === false ? 'idle' : 'preparing'
  cover.hidden = options.cover === false
  presentHost(!cover.hidden)
  const dark = matchMedia('(prefers-color-scheme: dark)')
  const appearance = (background: string, ink: string) => {
    host.style.setProperty('--satin-launch-background', background, 'important')
    host.style.setProperty('--satin-launch-ink', ink, 'important')
  }
  const systemAppearance = () =>
    appearance(
      dark.matches ? options.darkBackground : options.background,
      dark.matches ? options.darkInk : '#1c1c1e',
    )
  systemAppearance()
  dark.addEventListener?.('change', systemAppearance)
  let value = 0
  let velocity = 0
  let target = 0
  let downloadTarget = 0
  let frame = 0
  let previous = 0
  let generation = 0
  let revealed = false
  const alignCover = () => {
    if (revealed) return
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    const fullWidth = Math.abs(innerWidth - screen.width) <= 1
    // Default-status-bar WebClips start their viewport below the system strip.
    // Extend the cover into that excluded space so its center stays in the
    // native startup image's screen frame. Windowed apps keep their own frame.
    const excludedTop = standalone && fullWidth ? Math.max(0, screen.height - innerHeight) : 0
    host.style.setProperty('--satin-launch-excluded-top', `${excludedTop}px`, 'important')
  }
  alignCover()
  window.addEventListener('resize', alignCover)
  window.addEventListener('orientationchange', alignCover)
  window.addEventListener(
    'satin-launch-revealed',
    () => {
      window.removeEventListener('resize', alignCover)
      window.removeEventListener('orientationchange', alignCover)
    },
    { once: true },
  )
  let retiring: Promise<void> | null = null
  let appliedUpdate: Promise<boolean> | null = null
  let updateAnimation: Animation | null = null
  const ringElement = () => element('satin-launch-progress')!
  const paint = () => {
    ringElement()
      ?.querySelector('circle')
      ?.setAttribute('stroke-dashoffset', String(100 - Math.max(0, Math.min(100, value))))
  }
  const animateProgress = (now: number) => {
    const seconds = Math.min((now - previous) / 1000, 0.032)
    previous = now
    // Existing measured spring: mass 1, stiffness 186.57, damping 25.13.
    const steps = Math.max(1, Math.ceil(seconds / 0.004))
    for (let index = 0; index < steps; index++) {
      const dt = seconds / steps
      velocity += ((target - value) * 186.57 - velocity * 25.13) * dt
      value += velocity * dt
    }
    if (Math.abs(target - value) > 0.01 || Math.abs(velocity) > 0.01) {
      frame = requestAnimationFrame(animateProgress)
    } else {
      value = target
      velocity = 0
      frame = 0
    }
    paint()
    ringElement()?.setAttribute('aria-valuenow', String(Math.round(value)))
  }
  const start = () => {
    if (frame) return
    previous = performance.now()
    frame = requestAnimationFrame(animateProgress)
  }
  const complete = () => {
    if (appliedUpdate) return appliedUpdate
    const ring = ringElement()
    if (!ring || ring.hasAttribute('hidden')) return Promise.resolve(true)
    const currentGeneration = generation
    // This is presentation completion, not a synthetic download-byte event.
    target = 100
    start()
    return new Promise<boolean>(resolve => {
      const check = () => {
        if (currentGeneration !== generation) {
          resolve(false)
          return
        }
        if (frame) requestAnimationFrame(check)
        // Let the exact full arc paint before fading or replacing the document.
        else
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(currentGeneration === generation)),
          )
      }
      check()
    })
  }
  const fade = async (element: HTMLElement, duration: number) => {
    await element
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration,
        easing: 'ease-out',
        fill: 'forwards',
      })
      .finished.catch(() => {})
  }
  const retire = (onRetired: () => void) => {
    const screen = element('satin-launch-screen')
    if (!screen) {
      onRetired()
      return
    }
    const currentGeneration = generation
    retiring ??= (async () => {
      const ring = ringElement()
      if (ring && !ring.hasAttribute('hidden')) {
        // The failure panel stays behind the completing arc.
        screen.style.zIndex = '20003'
        ring.setAttribute('aria-label', 'Finishing launch')
        await complete()
        if (currentGeneration !== generation) return
        await fade(ring, 200)
        if (currentGeneration !== generation) return
        ring.setAttribute('hidden', '')
      }
      if (currentGeneration !== generation) return
      await fade(screen, 300)
      if (currentGeneration !== generation) return
      screen.hidden = true
      // Retire the viewport-sized host too: its closed shadow tree can retain
      // WebKit's opaque status-strip paint after the visible cover has gone.
      // Retain the controller and shadow tree for a later failure's Retry UI.
      presentHost(failure.isConnected && !failure.hidden)
      performance.mark('satin-launch-cover-retired')
    })()
    void retiring.then(() => {
      if (currentGeneration === generation) onRetired()
    })
  }
  let styleError = false
  const stylesheetChanged = (event: Event) => {
    const link = event.target
    if (!(link instanceof HTMLLinkElement) || !link.hasAttribute('data-satin-style')) return
    if (event.type === 'load') link.media = link.dataset.satinStyle || 'all'
    else styleError = true
  }
  document.addEventListener('load', stylesheetChanged, true)
  document.addEventListener('error', stylesheetChanged, true)
  let stylesReady: Promise<void> | undefined
  const controller: LaunchScreenController = {
    version: 1,
    stylesReady() {
      return (stylesReady ??= new Promise<void>((resolve, reject) => {
        const managed = document.querySelector('link[data-satin-style]')
        styleError ||= !!document.querySelector(
          'link[data-satin-style][data-satin-style-error="true"]',
        )
        const check = () => {
          if (styleError) reject(new Error('App stylesheet failed to load. Retry.'))
          else if (
            !managed ||
            getComputedStyle(document.documentElement).getPropertyValue('--satin-styles-applied')
          ) {
            resolve()
          } else requestAnimationFrame(check)
        }
        if (managed) requestAnimationFrame(check)
        else check()
      }))
    },
    appearance,
    snapshot() {
      const ring = ringElement()!
      const box = ring.getBoundingClientRect()
      const style = getComputedStyle(ring)
      const circle = ring.querySelector('circle')!
      // Detached WebKit trees have no computed style; retain the painted value.
      return {
        version: 1,
        state,
        error: failure.isConnected ? (failure.textContent ?? '') : '',
        coverVisible: host.isConnected && !cover.hidden,
        ringVisible:
          host.isConnected &&
          !cover.hidden &&
          !ring.hasAttribute('hidden') &&
          style.display !== 'none' &&
          Number(style.opacity) > 0,
        label: ring.getAttribute('aria-label'),
        offset:
          getComputedStyle(circle).strokeDashoffset || circle.getAttribute('stroke-dashoffset')!,
        box: [box.x, box.y, box.width, box.height],
        background:
          getComputedStyle(cover).backgroundColor ||
          host.style.getPropertyValue('--satin-launch-background'),
      }
    },
    error(reason, title = 'Unable to Open App', retry, detail) {
      presentHost(true)
      state = 'failed'
      failure.replaceChildren()
      const heading = document.createElement('h1')
      heading.textContent = title
      const message = document.createElement('p')
      message.textContent = reason
      const diagnostics = document.createElement('p')
      diagnostics.className = 'detail'
      diagnostics.textContent = detail ?? ''
      diagnostics.hidden = !detail
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Retry'
      button.onclick =
        retry ??
        (() => {
          try {
            sessionStorage.setItem('satin-install-reset:' + options.scope, '1')
          } catch {
            /* Retry still reloads without storage. */
          }
          location.reload()
        })
      failure.append(heading, message, diagnostics, button)
      root.append(failure)
      failure.hidden = false
      // The same controller finishes a visible arc before showing its failure.
      if (ringElement().hasAttribute('hidden')) cover.hidden = true
      else
        controller.fail(() => {
          if (state === 'failed') cover.hidden = true
        })
    },
    recover() {
      failure.remove()
      presentHost(!cover.hidden)
      if (state === 'failed' && !revealed) {
        state = options.cover === false ? 'idle' : 'preparing'
        if (options.cover === false) cover.hidden = true
        else controller.restore()
      }
    },
    updated(start: 0 | 100 = 0) {
      if (appliedUpdate) return appliedUpdate
      const ring = ringElement()
      const circle = ring?.querySelector('circle')
      if (!ring || !circle || revealed || retiring) return Promise.resolve(false)
      const currentGeneration = generation
      cancelAnimationFrame(frame)
      frame = 0
      value = start
      velocity = 0
      target = downloadTarget = 100
      paint()
      ring.removeAttribute('hidden')
      ring.setAttribute('aria-label', 'App updated')
      ring.setAttribute('aria-valuenow', String(start))
      // Owner-requested confirmation, not download bytes or a native motion fit.
      const animation = circle.animate(
        [{ strokeDashoffset: String(100 - start) }, { strokeDashoffset: '0' }],
        { duration: 800, easing: 'ease-in-out', fill: 'forwards' },
      )
      updateAnimation = animation
      const visibilityChanged = () => (document.hidden ? animation.pause() : animation.play())
      document.addEventListener('visibilitychange', visibilityChanged)
      visibilityChanged()
      appliedUpdate = animation.finished
        .then(
          () => {
            if (currentGeneration !== generation) return false
            value = 100
            paint()
            ring.setAttribute('aria-valuenow', '100')
            animation.cancel()
            return true
          },
          () => false,
        )
        .finally(() => {
          document.removeEventListener('visibilitychange', visibilityChanged)
          if (updateAnimation === animation) updateAnimation = null
        })
      return appliedUpdate
    },
    progress(progress) {
      const ring = ringElement()
      // A phase ending does not mean the cover is ready to retire. Keep the
      // real last sample until readiness or an explicit error owns the handoff.
      if (revealed || retiring || appliedUpdate || !progress || progress.total <= 0) return
      if (!Number.isFinite(progress.loaded) || !Number.isFinite(progress.total)) return
      const next = Math.max(0, Math.min(100, (progress.loaded / progress.total) * 100))
      // Bundle preparation and update checking may have different denominators.
      // A visible arc never jumps backwards when the next phase starts.
      downloadTarget = Math.max(downloadTarget, next)
      target = downloadTarget
      ring.removeAttribute('hidden')
      ring.setAttribute('aria-label', 'Downloading and installing app')
      start()
    },
    complete,
    reveal() {
      if (revealed || state === 'failed') return
      revealed = true
      state = 'ready'
      failure.remove()
      window.dispatchEvent(new Event('satin-launch-revealed'))
      retire(() => {})
    },
    fail(onRetired) {
      retire(onRetired)
    },
    restore() {
      if (revealed) return
      presentHost(true)
      // The parser starts confirmation before React mounts. Its initial restore
      // must leave that animation running; an actual failed retirement can retry.
      if (appliedUpdate && !retiring) return
      updateAnimation?.cancel()
      appliedUpdate = null
      generation++
      retiring = null
      // Recovery resumes the real sample through the same velocity-continuous
      // spring, rather than leaving a cancelled completion targeted at 100.
      target = downloadTarget
      const ring = ringElement()
      const cover = element('satin-launch-screen')
      if (ring && !ring.hasAttribute('hidden')) start()
      for (const [element, duration] of [
        [ring, 200],
        [cover, 300],
      ] as const) {
        if (!element) continue
        const opacity = Number.parseFloat(getComputedStyle(element).opacity)
        element.getAnimations().forEach(animation => animation.cancel())
        if (Number.isFinite(opacity) && opacity < 1 && !element.hidden) {
          void element
            .animate([{ opacity }, { opacity: 1 }], {
              duration,
              easing: 'ease-out',
              fill: 'forwards',
            })
            .finished.catch(() => {})
        }
      }
      const screen = element('satin-launch-screen')
      if (screen) {
        screen.hidden = false
        screen.style.removeProperty('z-index')
      }
    },
  }
  launchWindow.__SATIN_PRELAUNCH__ = controller
  return controller
}

export function prelaunchController() {
  const controller = (window as LaunchWindow).__SATIN_PRELAUNCH__
  if (!controller || controller.version !== 1)
    throw new Error('Satin pre-launch v1 bootstrap is missing.')
  return controller
}

export function showLaunchFailure(reason: string, title?: string) {
  prelaunchController().error(reason, title)
}

export function setLaunchScreen(visible: boolean) {
  if (visible) {
    prelaunchController().restore()
    return
  }
  // The completed app-readiness gate owns this explicit recovery. A watchdog
  // failure may have retired the cover while that gate was still preparing.
  // Reset its retirement before revealing, even if no more bytes arrive.
  const controller = prelaunchController()
  controller.recover()
  controller.reveal()
}

export function setLaunchProgress(progress: DownloadProgress | null) {
  window.dispatchEvent(new CustomEvent('satin-launch-progress', { detail: progress }))
  prelaunchController().progress(progress)
}

/** Complete a visible arc before a cold-update document replacement. */
export function completeLaunchProgress() {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function')
    return Promise.resolve(true)
  return prelaunchController().complete()
}

/** Confirm an applied update on its successor document before revealing the app. */
export function showAppliedUpdate() {
  return prelaunchController().updated()
}

/** Runs immediately after the inline environment, before application modules. */
export function resumeAppliedUpdate(scope: string, buildId?: string) {
  let ringStart: 0 | 100 | null = null
  try {
    const raw = sessionStorage.getItem('satin:just-updated:v1:' + scope)
    const marker = raw ? JSON.parse(raw) : null
    if (
      marker &&
      Number.isFinite(marker.at) &&
      (marker.previous === null || typeof marker.previous === 'string') &&
      (marker.current === null || typeof marker.current === 'string')
    ) {
      // Legacy clients already completed their arc before requesting reload.
      ringStart = marker.ringStart === 0 ? 0 : 100
    }
  } catch {
    // A failed session-storage read must not prevent durable build detection.
  }
  if (buildId) {
    const key = 'satin:revealed-build:v1:' + scope
    try {
      const previous = localStorage.getItem(key)
      // A waiting worker can activate after the old process closes, without
      // leaving a reload marker. Compare the actual HTML build, not the network.
      if (previous && previous !== buildId && ringStart === null) ringStart = 0
    } catch {
      // Storage denial must not prevent the cached app from opening.
    }
    window.addEventListener(
      'satin-launch-revealed',
      () => {
        try {
          localStorage.setItem(key, buildId)
        } catch {
          // Keep the explicit reload marker path usable without durable storage.
        }
      },
      { once: true },
    )
  }
  if (ringStart !== null) void (window as LaunchWindow).__SATIN_PRELAUNCH__?.updated(ringStart)
}
