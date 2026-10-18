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
  document.body.removeAttribute('style')
  document.getElementById('satin-theme-color')?.remove()
  delete window.__SATIN_STATUS_COLOR__
  delete window.__SATIN_APPEARANCE__
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
  expect(document.body.style.backgroundColor).toBe('rgb(242 242 247)')
  expect(document.body.style.getPropertyPriority('background-color')).toBe('important')
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

it('publishes the visible page colour through appearance changes and restores launch ownership', async () => {
  const root = setup()
  const meta = document.createElement('meta')
  meta.id = 'satin-theme-color'
  meta.content = '#ffffff'
  document.head.append(meta)
  const { installStatusColor } = await import('./statusColor.ts')
  const status = installStatusColor()
  status.setBase('#ffffff')
  root.style.setProperty('--satin-background', 'rgb(255, 255, 255)')
  root.innerHTML = `<div data-satin-screen-container><div data-satin-navigation-motion-layer
    style="background-color: rgb(255, 192, 203)"></div></div>`
  const motion = root.querySelector<HTMLElement>('[data-satin-navigation-motion-layer]')!
  vi.spyOn(motion, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 440, 900))
  let appearanceChanged: (() => void) | undefined
  window.__SATIN_APPEARANCE__ = {
    subscribe: listener => {
      appearanceChanged = listener
      return () => {
        appearanceChanged = undefined
      }
    },
    getSnapshot: () => ({ dark: false, pending: false }),
    getDiagnostics: () => [],
    setPreferredColorScheme: () => {},
  }
  restore = installStatusBand(root)
  expect(meta.content).toBe('rgb(255 192 203)')
  status.setBase('#000000')
  expect(meta.content).toBe('rgb(255 192 203)')
  motion.style.backgroundColor = 'rgb(20, 30, 40)'
  document.documentElement.dataset.satinAppearance = 'dark'
  appearanceChanged!()
  expect(meta.content).toBe('rgb(20 30 40)')
  restore()
  restore = undefined
  expect(meta.content).toBe('#000000')
  delete window.__SATIN_APPEARANCE__
})

it('composites an open sheet dim into the strip request without dimming the scene twice', async () => {
  const root = setup()
  const meta = document.createElement('meta')
  meta.id = 'satin-theme-color'
  document.head.append(meta)
  root.style.setProperty('--satin-background', 'rgb(240, 200, 100)')
  root.innerHTML = `<dialog open><span data-satin-presentation-dimmer
    style="display:block; background-color: rgba(0,0,0,0.2); opacity:0.5"></span></dialog>`
  restore = installStatusBand(root)
  expect(meta.content).toBe('rgb(216 180 90)')
  expect(document.body.style.backgroundColor).toBe('rgb(216 180 90)')
  expect(document.documentElement.style.backgroundColor).toBe('rgb(216 180 90)')
  expect(document.documentElement.style.getPropertyValue('--satin-status-band')).toBe(
    'rgb(240 200 100)',
  )
  const dialog = root.querySelector('dialog')!
  dialog.setAttribute('data-satin-presentation-moving', 'entrance')
  await flush()
  // Animation styles can change without any DOM mutation between frames.
  const dimmer = root.querySelector<HTMLElement>('[data-satin-presentation-dimmer]')!
  const originalStyle = getComputedStyle(dimmer)
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element =>
    element === dimmer
      ? ({
          ...originalStyle,
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          opacity: '1',
        } as CSSStyleDeclaration)
      : computed(element),
  )
  await flush()
  expect(document.body.style.backgroundColor).toBe('rgb(192 160 80)')
  expect(getComputedStyle(root).backgroundColor).toBe('rgb(240 200 100)')
  vi.restoreAllMocks()
  dialog.removeAttribute('data-satin-presentation-moving')
  dialog.removeAttribute('open')
  await flush()
  expect(meta.content).toBe('rgb(240 200 100)')
})
