// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { holdPresentationForGlass } from './glassReady.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it('withholds first-show content and entrance until this show receives glass, and resets on reopen', async () => {
  const panel = document.createElement('div')
  panel.innerHTML =
    '<div data-satin-glass-region-id="sheet"><canvas data-satin-glass-region-canvas></canvas></div>' +
    '<input><button>Save</button>'
  document.body.append(panel)
  const canvas = panel.querySelector('canvas')!
  const animation = { pause: vi.fn(), play: vi.fn(), currentTime: 99 } as unknown as Animation
  const invalidate = vi.fn()
  let release = holdPresentationForGlass(panel, null, [animation], invalidate)
  const first = canvas.dataset.satinGlassShow!
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(true)
  expect(animation.currentTime).toBe(0)
  expect(animation.play).not.toHaveBeenCalled()
  canvas.dataset.satinGlassPresentedShow = first
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(false)
  expect(animation.play).toHaveBeenCalledOnce()
  release()
  release = holdPresentationForGlass(panel, null, [animation], invalidate)
  canvas.dataset.satinGlassPresentedShow = first
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(true)
  expect(animation.play).toHaveBeenCalledOnce()
  canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(animation.play).toHaveBeenCalledTimes(2)
  release()
})

// Music FINDINGS #1: a sheet whose glass never submitted stayed invisible and modal for good.
it('a missing canvas fails loudly, then reveals the settled show unless it was closed', async () => {
  vi.useFakeTimers()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const panel = document.createElement('div')
  const entrance = { pause: vi.fn(), play: vi.fn(), finish: vi.fn() } as unknown as Animation
  const ready = vi.fn()
  const release = holdPresentationForGlass(panel, null, [entrance], () => {}, ready)
  const closed = document.createElement('div')
  holdPresentationForGlass(
    closed,
    null,
    [],
    () => {},
    ready,
    () => false,
  )
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(true)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(log.mock.calls.flat().join(' ')).toContain(
    'Presentation glass did not submit for the current show',
  )
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(false)
  expect(entrance.finish).toHaveBeenCalledOnce()
  expect(ready).not.toHaveBeenCalled()
  expect(closed.hasAttribute('data-satin-glass-hold')).toBe(true)
  release()
  log.mockRestore()
})

it('does not spend the first-show watchdog budget while the app is hidden', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  let visibility: DocumentVisibilityState = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const release = holdPresentationForGlass(document.createElement('div'), null, [], () => {})
  await vi.advanceTimersByTimeAsync(9000)
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(60000)
  expect(log).not.toHaveBeenCalled()
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(1000)
  expect(log).toHaveBeenCalledOnce()
  release()
})

it('keeps content hidden until the moving glass clock is acknowledged, and cancels a closed show', async () => {
  for (const closeBeforeReceipt of [false, true]) {
    const panel = document.createElement('div')
    panel.innerHTML =
      '<div data-satin-glass-region-id="sheet"><canvas data-satin-glass-region-canvas></canvas></div>'
    document.body.append(panel)
    const canvas = panel.querySelector('canvas')!
    const animation = { pause: vi.fn(), play: vi.fn(), currentTime: 0 } as unknown as Animation
    let acknowledge!: (epoch: number) => void
    const clock = new Promise<number>(resolve => {
      acknowledge = resolve
    })
    const release = holdPresentationForGlass(
      panel,
      null,
      [animation],
      () => {},
      () => {},
      () => true,
      {
        revealStart: () => clock,
      },
    )
    canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(panel.hasAttribute('data-satin-glass-hold')).toBe(true)
    expect(animation.play).not.toHaveBeenCalled()
    if (closeBeforeReceipt) release()
    acknowledge(1234)
    await Promise.resolve()
    if (closeBeforeReceipt) expect(animation.play).not.toHaveBeenCalled()
    else {
      expect(panel.hasAttribute('data-satin-glass-hold')).toBe(false)
      expect(animation.play).toHaveBeenCalledOnce()
      expect(animation.startTime).toBe(1234)
      release()
    }
  }
})

it.each(['mounts', 'loses its draw'])(
  'keeps sheet content held when a nested control %s during motion admission',
  async change => {
    const panel = document.createElement('div')
    panel.innerHTML =
      '<div data-satin-glass-region-id="sheet"><canvas data-satin-glass-region-canvas></canvas><button data-satin-glass-region-id="more"><canvas data-satin-glass-region-canvas></canvas>More</button></div>'
    document.body.append(panel)
    const outer = panel.querySelector('canvas')!
    const more = panel.querySelector('button canvas') as HTMLCanvasElement
    const animation = { pause: vi.fn(), play: vi.fn(), currentTime: 0 } as unknown as Animation
    const clocks: ((epoch: number) => void)[] = []
    const release = holdPresentationForGlass(
      panel,
      null,
      [animation],
      () => {},
      () => {},
      () => true,
      {
        revealStart: () =>
          new Promise<number>(resolve => {
            clocks.push(resolve)
          }),
      },
    )
    const tick = () => new Promise(resolve => setTimeout(resolve, 0))
    try {
      for (const canvas of [outer, more])
        canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
      await tick()
      expect(clocks).toHaveLength(1)
      let control = more
      if (change === 'mounts') {
        const star = document.createElement('button')
        star.setAttribute('data-satin-glass-region-id', 'star')
        star.innerHTML = '<canvas data-satin-glass-region-canvas></canvas>Star'
        panel.firstElementChild!.append(star)
        control = star.querySelector('canvas')!
      } else delete more.dataset.satinGlassPresentedShow
      clocks[0]!(1000)
      await tick()
      expect(panel.hasAttribute('data-satin-glass-hold')).toBe(true)
      expect(animation.play).not.toHaveBeenCalled()
      control.dataset.satinGlassPresentedShow = control.dataset.satinGlassShow
      await tick()
      expect(clocks).toHaveLength(2)
      clocks[1]!(1100)
      await tick()
      expect(panel.hasAttribute('data-satin-glass-hold')).toBe(false)
      expect(animation.play).toHaveBeenCalledOnce()
      expect(animation.startTime).toBe(1100)
    } finally {
      release()
    }
  },
)
