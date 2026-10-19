// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { InstallSteps, InstallTip, useInstallContext } from '../install.ts'
import { tipPath } from './installTipPath.ts'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1'
const INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0'

const unmount: Array<() => void> = []
afterEach(() => {
  for (const dispose of unmount.splice(0)) dispose()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function render(node: React.ReactNode, userAgent: string) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('navigator', { userAgent, platform: 'iPhone', maxTouchPoints: 5 })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  document.body.innerHTML =
    '<script id="satin-install-context" type="application/json">{"name":"Reps","icon":"/icon.png","tint":"#ff5a1f","installRoute":"/install"}</script><div id="root"></div>'
  const root = createRoot(document.getElementById('root')!)
  act(() => root.render(node))
  unmount.push(() => act(() => root.unmount()))
  return document.getElementById('root')!
}

it('gives a custom page its context through the hook', () => {
  let seen: ReturnType<typeof useInstallContext> | undefined
  function Probe() {
    seen = useInstallContext()
    return null
  }
  render(<Probe />, IPHONE_SAFARI)
  expect(seen).toMatchObject({
    device: 'iphone',
    browser: 'safari',
    safariVersion: 27,
    standalone: false,
  })
  expect(seen!.app.name).toBe('Reps')
})

it('renders the steps in Satin’s words, for Safari and for an in-app browser', () => {
  const safari = render(<InstallSteps />, IPHONE_SAFARI)
  expect(safari.querySelectorAll('li')).toHaveLength(3)
  expect(safari.textContent).toContain('Choose Add to Home Screen')
  expect(safari.textContent).toContain('Make sure Open as Web App is on.')
  // Step 1 is one line in Safari: no empty second line.
  expect(safari.querySelector('li')!.querySelectorAll('span span')).toHaveLength(0)
  expect(safari.querySelectorAll('li')[1]!.textContent).toContain(
    'Tap View More if it isn’t in the list.',
  )
  for (const dispose of unmount.splice(0)) dispose()
  const inApp = render(<InstallSteps />, INSTAGRAM)
  expect(inApp.textContent).toContain('It’s in this browser’s toolbar or menu.')
})

it('shows the tip only where Safari’s control was measured', () => {
  expect(render(<InstallTip />, INSTAGRAM).querySelector('.satin-tip')).toBeNull()
})

it('draws the same single tip path as the default page', () => {
  // The default page's runtime test checks this exact outline for a 240 x 42 compact tip.
  const d = tipPath(240, 42, 'compact')
  expect(d.startsWith('M17 0L223 0A17 17 0 0 1 240 17')).toBe(true)
  expect(d).toContain('L122 42C115.7 42')
  expect(d).toContain('Q105 53.05')
  expect(d.match(/M/g)).toHaveLength(1)
})

it('renders installation instructions when CSP blocks inserted style elements', () => {
  document.getElementById('satin-steps-style')?.remove()
  const append = document.head.append.bind(document.head)
  const blocked = vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    if (nodes.some(node => node instanceof HTMLStyleElement))
      throw Error('style-src blocks unhashed style elements')
    append(...nodes)
  })
  try {
    expect(render(<InstallSteps />, IPHONE_SAFARI).querySelector('.satin-steps')).not.toBeNull()
  } finally {
    blocked.mockRestore()
  }
})
