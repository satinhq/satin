// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { installStatusBand } from './statusBand.ts'

let restore: (() => void) | undefined
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0))
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) callback(0)
}
function setup() {
  vi.stubGlobal('innerWidth', 440)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(++frameId, cb)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  document.documentElement.dataset.satinViewportFit = 'auto'
  const root = document.createElement('div')
  document.body.append(root)
  return root
}
afterEach(() => {
  restore?.()
  restore = undefined
  frames.clear()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-satin-appearance')
  document.documentElement.removeAttribute('data-satin-viewport-fit')
})
it('never turns an unresolved launch background into a published black band', async () => {
  const root = setup()
  restore = installStatusBand(root)
  expect(document.documentElement.style.getPropertyValue('--satin-status-band')).toBe('')
  root.style.setProperty('--satin-background', 'rgb(242, 242, 247)')
  await flush()
  expect(document.documentElement.style.getPropertyValue('--satin-status-band')).toBe(
    'rgb(242 242 247)',
  )
})
it('updates through dark/light/dark appearance changes without remounting', async () => {
  const root = setup()
  document.documentElement.style.setProperty('--app-background', 'rgb(0, 0, 0)')
  root.style.setProperty('--satin-background', 'var(--app-background)')
  restore = installStatusBand(root)
  expect(document.documentElement.style.getPropertyValue('--satin-status-band')).toBe('rgb(0 0 0)')
  for (const [appearance, color, expected] of [
    ['light', 'rgb(242, 242, 247)', 'rgb(242 242 247)'],
    ['dark', 'rgb(0, 0, 0)', 'rgb(0 0 0)'],
  ]) {
    document.documentElement.style.setProperty('--app-background', color!)
    document.documentElement.dataset.satinAppearance = appearance
    await flush()
    expect(document.documentElement.style.getPropertyValue('--satin-status-band')).toBe(expected)
  }
})
it('refreshes on pageshow and releases the published colour on unmount', async () => {
  const root = setup()
  document.documentElement.style.setProperty('--satin-status-band', 'previous')
  document.documentElement.style.setProperty('--app-background', 'rgb(0, 0, 0)')
  root.style.setProperty('--satin-background', 'var(--app-background)')
  restore = installStatusBand(root)
  document.documentElement.style.setProperty('--app-background', 'rgb(242, 242, 247)')
  window.dispatchEvent(new Event('pageshow'))
  await flush()
  expect(document.documentElement.style.getPropertyValue('--satin-status-band')).toBe(
    'rgb(242 242 247)',
  )
  restore()
  restore = undefined
  expect(document.documentElement.style.getPropertyValue('--satin-status-band')).toBe('previous')
})
it("restores the app's own inline backgrounds after writing the band directly during a transition", async () => {
  const root = setup()
  root.style.setProperty('--satin-background', 'rgb(242, 242, 247)')
  document.body.style.setProperty('background-color', 'rgb(1, 2, 3)')
  root.innerHTML = `
    <div data-satin-screen-container data-satin-transition="push">
      <div data-satin-navigation-motion-layer></div>
    </div>
    <div data-satin-scroll-edge-cap style="background-color: rgb(9, 8, 7)"></div>`
  const cap = root.querySelector<HTMLElement>('[data-satin-scroll-edge-cap]')!
  const motion = root.querySelector<HTMLElement>('[data-satin-navigation-motion-layer]')!
  vi.spyOn(motion, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 440,
    bottom: 956,
    width: 440,
    height: 956,
    toJSON: () => ({}),
  })
  restore = installStatusBand(root)
  await flush()
  expect(document.body.style.getPropertyPriority('background-color')).toBe('important')
  // The edge touching WebKit's clock band must follow the same moving fill.
  expect(getComputedStyle(cap).backgroundColor).toBe(getComputedStyle(root).backgroundColor)
  root.querySelector<HTMLElement>('[data-satin-screen-container]')!.dataset.satinTransition =
    'settled'
  await flush()
  await flush()
  expect(document.body.style.getPropertyValue('background-color')).toBe('rgb(1, 2, 3)')
  expect(document.body.style.getPropertyPriority('background-color')).toBe('')
  expect(root.style.getPropertyValue('background-color')).toBe('')
  expect(cap.style.backgroundColor).toBe('rgb(9, 8, 7)')
})
it('refreshes cached fills when an ancestor of a screen changes class', async () => {
  const root = setup()
  root.style.setProperty('--satin-background', 'rgb(242, 242, 247)')
  root.innerHTML =
    '<div id="wrap"><div data-satin-screen-container><div data-satin-navigation-motion-layer></div></div></div>'
  const motion = root.querySelector<HTMLElement>('[data-satin-navigation-motion-layer]')!
  vi.spyOn(motion, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 440,
    bottom: 956,
    width: 440,
    height: 956,
    toJSON: () => ({}),
  })
  restore = installStatusBand(root)
  await flush()
  expect(document.documentElement.style.getPropertyValue('--satin-status-band')).toBe(
    'rgb(242 242 247)',
  )
  const style = document.createElement('style')
  style.textContent = '#wrap.red { background-color: rgb(255, 0, 0) }'
  document.head.append(style)
  root.querySelector('#wrap')!.classList.add('red')
  await flush()
  expect(document.documentElement.style.getPropertyValue('--satin-status-band')).toBe(
    'rgb(255 0 0)',
  )
  style.remove()
})
