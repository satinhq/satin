import type { DownloadProgress } from './launchScreen.ts'

interface LaunchScreenController {
  progress(progress: DownloadProgress | null): void
  updated(start?: 0 | 100): Promise<boolean>
  complete(): Promise<boolean>
  reveal(): void
  fail(onRetired: () => void): void
  restore(): void
}

type LaunchWindow = Window & { __SATIN_LAUNCH_SCREEN__?: LaunchScreenController }

// Serialized into the head so failures before module loading use the same
// controller as ordinary readiness. Keep this function self-contained.
export function installLaunchScreenRuntime() {
  const launchWindow = window as LaunchWindow
  if (launchWindow.__SATIN_LAUNCH_SCREEN__) return launchWindow.__SATIN_LAUNCH_SCREEN__
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
    document.documentElement.style.setProperty('--satin-launch-excluded-top', `${excludedTop}px`)
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
  const ringElement = () => document.getElementById('satin-launch-progress')
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
    const screen = document.getElementById('satin-launch-screen')
    if (!screen) {
      onRetired()
      return
    }
    const currentGeneration = generation
    retiring ??= (async () => {
      const ring = ringElement()
      if (ring && !ring.hasAttribute('hidden')) {
        // React and head failure panels must stay behind the completing arc.
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
      performance.mark('satin-launch-cover-retired')
    })()
    void retiring.then(() => {
      if (currentGeneration === generation) onRetired()
    })
  }
  const controller: LaunchScreenController = {
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
      if (!ring || revealed || retiring || !progress || progress.total <= 0) return
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
      if (revealed) return
      revealed = true
      window.dispatchEvent(new Event('satin-launch-revealed'))
      retire(() => {})
    },
    fail(onRetired) {
      retire(onRetired)
    },
    restore() {
      if (revealed) return
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
      const cover = document.getElementById('satin-launch-screen')
      if (ring && !ring.hasAttribute('hidden')) start()
      for (const [element, duration] of [
        [ring, 200],
        [cover, 300],
      ] as const) {
        if (!element) continue
        const opacity = Number(getComputedStyle(element).opacity)
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
      const screen = document.getElementById('satin-launch-screen')
      if (screen) {
        screen.hidden = false
        screen.style.removeProperty('z-index')
      }
    },
  }
  launchWindow.__SATIN_LAUNCH_SCREEN__ = controller
  return controller
}

export function setLaunchScreen(visible: boolean) {
  if (visible) {
    installLaunchScreenRuntime().restore()
    return
  }
  installLaunchScreenRuntime().reveal()
}

export function setLaunchProgress(progress: DownloadProgress | null) {
  window.dispatchEvent(new CustomEvent('satin-launch-progress', { detail: progress }))
  installLaunchScreenRuntime().progress(progress)
}

/** Complete a visible arc before a cold-update document replacement. */
export function completeLaunchProgress() {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function')
    return Promise.resolve(true)
  return installLaunchScreenRuntime().complete()
}

/** Confirm an applied update on its successor document before revealing the app. */
export function showAppliedUpdate() {
  return installLaunchScreenRuntime().updated()
}

/** Serialized after the declarative cover, before modules and their first paint. */
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
  if (ringStart !== null) void (window as LaunchWindow).__SATIN_LAUNCH_SCREEN__?.updated(ringStart)
}
