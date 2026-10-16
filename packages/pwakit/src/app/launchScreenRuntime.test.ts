// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installLaunchWatchdog } from './launchWatchdog.ts'

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  delete (window as Window & { __SATIN_LAUNCH_SCREEN__?: unknown }).__SATIN_LAUNCH_SCREEN__
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  )
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  document.body.innerHTML = `
    <div id="satin-launch-screen">
      <svg id="satin-launch-progress" hidden><circle stroke-dashoffset="100" /></svg>
    </div>`
})

afterEach(() => {
  window.dispatchEvent(new Event('satin-launch-revealed'))
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('shows an applied-update ring for 800 ms and completes it before revealing the new app', async () => {
  const { showAppliedUpdate, setLaunchScreen } = await import('./launchScreenRuntime.ts')
  const cover = document.getElementById('satin-launch-screen')!
  const ring = document.getElementById('satin-launch-progress')!
  let finish!: () => void
  const finished = new Promise<void>(resolve => {
    finish = resolve
  })
  const animate = vi.spyOn(Element.prototype, 'animate').mockImplementation(function (
    this: Element,
  ) {
    return {
      finished: this === ring.querySelector('circle') ? finished : Promise.resolve(),
      pause: vi.fn(),
      play: vi.fn(),
      cancel: vi.fn(),
    } as unknown as Animation
  })
  const pending = showAppliedUpdate()
  expect(ring.hasAttribute('hidden')).toBe(false)
  expect(ring.getAttribute('aria-label')).toBe('App updated')
  expect(animate).toHaveBeenCalledWith([{ strokeDashoffset: '100' }, { strokeDashoffset: '0' }], {
    duration: 800,
    easing: 'ease-in-out',
    fill: 'forwards',
  })
  setLaunchScreen(false)
  await vi.advanceTimersByTimeAsync(2000)
  expect(cover.hidden).toBe(false)
  expect(animate).toHaveBeenCalledOnce()
  finish()
  expect(await pending).toBe(true)
  await vi.advanceTimersByTimeAsync(0)
  expect(ring.querySelector('circle')?.getAttribute('stroke-dashoffset')).toBe('0')
  expect(cover.hidden).toBe(true)
  expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], {
    duration: 300,
    easing: 'ease-out',
    fill: 'forwards',
  })
})

it.each([undefined, 0])(
  'continues the parser-started ring through React mount (ringStart=%s)',
  async ringStart => {
    const { installLaunchScreenRuntime, resumeAppliedUpdate, showAppliedUpdate, setLaunchScreen } =
      await import('./launchScreenRuntime.ts')
    sessionStorage.setItem(
      'satin:just-updated:v1:/app/',
      JSON.stringify({
        at: Date.now(),
        previous: 'a',
        current: 'b',
        ringStart,
      }),
    )
    let finish!: () => void
    const animation = {
      finished: new Promise<void>(resolve => {
        finish = resolve
      }),
      pause: vi.fn(),
      play: vi.fn(),
      cancel: vi.fn(),
    }
    const animate = vi
      .spyOn(Element.prototype, 'animate')
      .mockReturnValue(animation as unknown as Animation)
    installLaunchScreenRuntime()
    resumeAppliedUpdate('/app/')
    const ring = document.getElementById('satin-launch-progress')!
    expect(ring.hasAttribute('hidden')).toBe(false)
    const offset = ringStart === 0 ? '100' : '0'
    expect(ring.querySelector('circle')?.getAttribute('stroke-dashoffset')).toBe(offset)
    expect(animate.mock.calls[0]![0]).toEqual([
      { strokeDashoffset: offset },
      { strokeDashoffset: '0' },
    ])
    setLaunchScreen(true)
    expect(animation.cancel).not.toHaveBeenCalled()
    const pending = showAppliedUpdate()
    expect(animate).toHaveBeenCalledOnce()
    finish()
    expect(await pending).toBe(true)
    sessionStorage.clear()
  },
)

it('confirms a new document build when a worker activated without a reload marker', async () => {
  const { installLaunchScreenRuntime, resumeAppliedUpdate, completeLaunchProgress } =
    await import('./launchScreenRuntime.ts')
  localStorage.setItem('satin:revealed-build:v1:/app/', 'build-a')
  let finish!: () => void
  vi.spyOn(Element.prototype, 'animate').mockReturnValue({
    finished: new Promise<void>(resolve => {
      finish = resolve
    }),
    pause: vi.fn(),
    play: vi.fn(),
    cancel: vi.fn(),
  } as unknown as Animation)
  installLaunchScreenRuntime()
  resumeAppliedUpdate('/app/', 'build-b')
  expect(document.getElementById('satin-launch-progress')!.hasAttribute('hidden')).toBe(false)
  expect(localStorage.getItem('satin:revealed-build:v1:/app/')).toBe('build-a')
  let ready = false
  const completion = completeLaunchProgress().then(() => {
    ready = true
  })
  await Promise.resolve()
  expect(ready).toBe(false)
  finish()
  await completion
  expect(ready).toBe(true)
  window.dispatchEvent(new Event('satin-launch-revealed'))
  expect(localStorage.getItem('satin:revealed-build:v1:/app/')).toBe('build-b')
})

it('pauses applied-update confirmation while hidden, including an initially hidden successor', async () => {
  const { showAppliedUpdate } = await import('./launchScreenRuntime.ts')
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  let finish!: () => void
  const animation = {
    finished: new Promise<void>(resolve => {
      finish = resolve
    }),
    pause: vi.fn(),
    play: vi.fn(),
    cancel: vi.fn(),
  }
  vi.spyOn(Element.prototype, 'animate').mockReturnValue(animation as unknown as Animation)
  const pending = showAppliedUpdate()
  expect(animation.pause).toHaveBeenCalledOnce()
  expect(animation.play).not.toHaveBeenCalled()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(animation.play).toHaveBeenCalledOnce()
  finish()
  expect(await pending).toBe(true)
  document.dispatchEvent(new Event('visibilitychange'))
  expect(animation.play).toHaveBeenCalledOnce()
})

it.each([null, 'build-a'])(
  'keeps first and unchanged launches ring-free (previous=%s)',
  async previous => {
    const { setLaunchScreen, resumeAppliedUpdate } = await import('./launchScreenRuntime.ts')
    vi.spyOn(Element.prototype, 'animate').mockReturnValue({
      finished: Promise.resolve(),
    } as unknown as Animation)
    setLaunchScreen(true)
    if (previous) localStorage.setItem('satin:revealed-build:v1:/app/', previous)
    resumeAppliedUpdate('/app/', 'build-a')
    expect(document.getElementById('satin-launch-progress')!.hasAttribute('hidden')).toBe(true)
    setLaunchScreen(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(document.getElementById('satin-launch-screen')!.hidden).toBe(true)
    expect(document.getElementById('satin-launch-progress')!.hasAttribute('hidden')).toBe(true)
  },
)

it.each([false, true])(
  'keeps the cover visible through completed progress, ring fade and cover fade (recovery=%s)',
  async recoverFromFailure => {
    const { setLaunchProgress, setLaunchScreen } = await import('./launchScreenRuntime.ts')
    const cover = document.getElementById('satin-launch-screen')!
    const ring = document.getElementById('satin-launch-progress')!
    const circle = ring.querySelector('circle')!
    const fades: { element: Element; finish: () => void }[] = []
    vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element) {
      let finish!: () => void
      const finished = new Promise<void>(resolve => {
        finish = resolve
      })
      fades.push({ element: this, finish })
      return { finished } as unknown as Animation
    })
    installLaunchWatchdog(1000)
    if (recoverFromFailure) {
      vi.advanceTimersByTime(1000)
      expect(document.getElementById('satin-launch-error')).not.toBeNull()
      expect(cover.hidden).toBe(true)
    }
    setLaunchProgress({ loaded: 35, total: 100 })
    await vi.advanceTimersByTimeAsync(160)
    setLaunchProgress(null)
    setLaunchScreen(false)
    expect(cover.hidden).toBe(false)
    expect(document.getElementById('satin-launch-error')).toBeNull()
    expect(fades).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(3000)
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 2)
    expect(cover.hidden).toBe(false)
    expect(fades.map(fade => fade.element)).toEqual([ring])
    fades[0]!.finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(ring.hasAttribute('hidden')).toBe(true)
    expect(cover.hidden).toBe(false)
    expect(fades.map(fade => fade.element)).toEqual([ring, cover])
    fades[1]!.finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(cover.hidden).toBe(true)
    // Worker activity can arrive after readiness. It must not restore retired chrome.
    setLaunchProgress({ loaded: 200, total: 200 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(cover.hidden).toBe(true)
    expect(document.getElementById('satin-launch-error')).toBeNull()
  },
)

it('restores a stalled launch only after genuine progress and can detect a second stall', () => {
  installLaunchWatchdog(1000)
  vi.advanceTimersByTime(1000)
  expect(document.getElementById('satin-launch-screen')!.hidden).toBe(true)
  window.dispatchEvent(new CustomEvent('satin-launch-progress', { detail: { loaded: 1 } }))
  expect(document.getElementById('satin-launch-error')).toBeNull()
  expect(document.getElementById('satin-launch-screen')!.hidden).toBe(false)
  vi.advanceTimersByTime(1000)
  expect(document.getElementById('satin-launch-error')).not.toBeNull()
})

it('completes a visible partial ring before a watchdog error replaces the cover', async () => {
  const { setLaunchProgress, completeLaunchProgress } = await import('./launchScreenRuntime.ts')
  const cover = document.getElementById('satin-launch-screen')!
  const ring = document.getElementById('satin-launch-progress')!
  const circle = ring.querySelector('circle')!
  const fades: { element: Element; finish: () => void }[] = []
  vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element) {
    let finish!: () => void
    const finished = new Promise<void>(resolve => {
      finish = resolve
    })
    fades.push({ element: this, finish })
    return { finished } as unknown as Animation
  })
  installLaunchWatchdog(10000)
  setLaunchProgress({ loaded: 25, total: 100 })
  await vi.advanceTimersByTimeAsync(160)
  window.dispatchEvent(
    new CustomEvent('satin-glass-error', {
      detail: { code: 'readiness-timeout', message: 'No frame' },
    }),
  )
  expect(cover.hidden).toBe(false)
  const error = document.getElementById('satin-launch-error')!
  expect(Number(error.style.zIndex)).toBeLessThan(20000)
  await vi.advanceTimersByTimeAsync(3000)
  expect(Number(circle.getAttribute('stroke-dashoffset'))).toBe(0)
  expect(cover.hidden).toBe(false)
  fades[0]!.finish()
  await vi.advanceTimersByTimeAsync(0)
  fades[1]!.finish()
  await vi.advanceTimersByTimeAsync(0)
  expect(cover.hidden).toBe(true)
  expect(Number(error.style.zIndex)).toBeGreaterThan(20000)
  expect(error.textContent).toContain('readiness-timeout')
  setLaunchProgress({ loaded: 50, total: 100 })
  await vi.advanceTimersByTimeAsync(1500)
  expect(cover.hidden).toBe(false)
  expect(document.getElementById('satin-launch-error')).toBeNull()
  expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(50, 2)
  // A recovery interrupts a pending document replacement too.
  const completing = completeLaunchProgress()
  window.dispatchEvent(
    new CustomEvent('satin-glass-error', {
      detail: { code: 'readiness-timeout', message: 'No frame' },
    }),
  )
  setLaunchProgress({ loaded: 60, total: 100 })
  await vi.advanceTimersByTimeAsync(1500)
  expect(await completing).toBe(false)
  expect(cover.hidden).toBe(false)
  expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(40, 2)
})

it.each([
  { width: 440, height: 956, viewport: 894, excluded: 62 },
  { width: 1032, height: 1376, viewport: 1352, excluded: 24 },
  { width: 440, height: 956, viewport: 956, excluded: 0 },
])(
  'centers the launch icon and ring in the native screen frame ($width × $height)',
  async geometry => {
    vi.stubGlobal('screen', { width: geometry.width, height: geometry.height })
    vi.stubGlobal('innerWidth', geometry.width)
    vi.stubGlobal('innerHeight', geometry.viewport)
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    const { installLaunchScreenRuntime } = await import('./launchScreenRuntime.ts')
    installLaunchScreenRuntime()
    const top = Number.parseFloat(
      document.documentElement.style.getPropertyValue('--satin-launch-excluded-top'),
    )
    expect(top).toBe(geometry.excluded)
    // The viewport origin is below the excluded system strip. The extended
    // cover's CSS center must resolve to the native bitmap's screen center.
    expect(geometry.excluded + (geometry.viewport - top) / 2).toBe(geometry.height / 2)
    delete (navigator as Navigator & { standalone?: boolean }).standalone
  },
)
