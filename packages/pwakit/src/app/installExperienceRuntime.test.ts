// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  installExperienceRuntime,
  type InstallExperienceConfig,
} from './installExperienceRuntime.ts'

const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1'
const WEB_VIEW_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1'
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15'

const config: InstallExperienceConfig = {
  installRoute: '/install',
  kind: 'install',
  preview: false,
  devices: ['iPhone', 'iPad'],
}
const root = document.documentElement
let focused = true
let visibility: DocumentVisibilityState = 'visible'
let viewport: EventTarget & { height: number }
// Each test starts a fresh runtime; its window and document listeners are removed afterwards.
let listeners: [EventTarget, string, EventListenerOrEventListenerObject][] = []

function browser(userAgent: string, platform = 'iPhone', maxTouchPoints = 5) {
  vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints })
}

function mount(hidden = true) {
  document.body.innerHTML = `<section id="satin-install-guide"${hidden ? ' hidden' : ''}>
    <p data-say="back">Not added yet.</p><h2>Open Reps on your <span data-device-name>iPhone or iPad</span></h2>
    <a data-open-safari href="#">Open in Safari</a><p data-address></p><div data-qr></div>
    <div><button data-copy="Link copied">Copy Link</button>
    <p data-copy-failed hidden>Couldn’t copy the link.</p></div><p data-live></p></section>`
  return document.getElementById('satin-install-guide')!
}

const start = (overrides: Partial<InstallExperienceConfig> = {}) =>
  installExperienceRuntime({ ...config, ...overrides }, () => [[true, false]])

/** The full-height share sheet covers the page. */
function coverWithSheet() {
  focused = false
  dispatchEvent(new Event('blur'))
}
/** A dialog over the page raises the keyboard. */
function raiseKeyboard() {
  viewport.height = 484
  viewport.dispatchEvent(new Event('resize'))
}
/** The dialog closes, by Add or by Cancel: the keyboard goes away. */
function closeDialog() {
  viewport.height = 714
  viewport.dispatchEvent(new Event('resize'))
}
function returnFocus() {
  focused = true
  dispatchEvent(new Event('focus'))
}
function hidePage() {
  visibility = 'hidden'
  focused = false
  document.dispatchEvent(new Event('visibilitychange'))
}
function showPage() {
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  focused = true
  visibility = 'visible'
  viewport = Object.assign(new EventTarget(), { height: 714 })
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('innerWidth', 402)
  vi.stubGlobal('innerHeight', 714)
  vi.stubGlobal('location', {
    origin: 'https://reps.example',
    pathname: '/install',
    search: '?state=back&env=inapp&device=pad',
  })
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  browser(SAFARI_IPHONE)
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target)
    vi.spyOn(target, 'addEventListener').mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.push([target, type, listener])
        add(type, listener)
      },
    )
  }
  localStorage.clear()
  for (const name of Object.keys(root.dataset)) delete root.dataset[name]
})
afterEach(() => {
  for (const [target, type, listener] of listeners) target.removeEventListener(type, listener)
  listeners = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('waits for the deployment check to reveal the guide before starting', async () => {
  const guide = mount()
  start()
  expect(root.dataset.env).toBe('safari')
  expect(root.dataset.state).toBeUndefined()
  guide.hidden = false
  await vi.advanceTimersByTimeAsync(0)
  expect(root.dataset.state).toBe('steps')
  expect(root.dataset.ready).toBe('true')
})

it('ignores review overrides outside preview builds', () => {
  mount(false)
  start()
  expect(root.dataset.env).toBe('safari')
  expect(root.dataset.state).toBe('steps')
})

it('honours review overrides in preview builds', () => {
  mount(false)
  start({ preview: true })
  expect(root.dataset.env).toBe('inapp')
  expect(root.dataset.state).toBe('back')
  expect(root.dataset.device).toBe('pad')
})

it('moves the emphasis with the sheet, the dialog, and back', () => {
  mount(false)
  start()
  expect(root.dataset.step).toBe('1')
  coverWithSheet()
  expect(root.dataset.step).toBe('2')
  raiseKeyboard()
  expect(root.dataset.step).toBe('3')
  closeDialog()
  expect(root.dataset.step).toBe('3')
  vi.advanceTimersByTime(2800)
  expect(root.dataset.step).toBe('1')
})

it('says nothing was added when the dialog closes and the page stays visible', () => {
  const guide = mount(false)
  start()
  coverWithSheet()
  raiseKeyboard()
  closeDialog()
  vi.advanceTimersByTime(2700)
  expect(root.dataset.state).toBe('steps')
  vi.advanceTimersByTime(200)
  expect(root.dataset.state).toBe('back')
  expect(guide.querySelector('[data-live]')!.textContent).toBe('Not added yet.')
  expect(localStorage.length).toBe(0)
})

it('says nothing was added when a sheet closes and focus returns', () => {
  mount(false)
  start()
  coverWithSheet()
  returnFocus()
  expect(root.dataset.step).toBe('1')
  vi.advanceTimersByTime(2800)
  expect(root.dataset.state).toBe('back')
})

// Review finding (round three, P1): Cancel, then leaving Safari within a few seconds, was
// taken for Add and hid the steps for good. Add and that sequence look the same to the page.
it('keeps the steps when the dialog is cancelled and Safari is left at once', () => {
  mount(false)
  start()
  coverWithSheet()
  raiseKeyboard()
  returnFocus()
  closeDialog()
  vi.advanceTimersByTime(600)
  hidePage()
  expect(root.dataset.state).toBe('steps')
  vi.advanceTimersByTime(5000)
  expect(root.dataset.state).toBe('steps')
  showPage()
  vi.advanceTimersByTime(600)
  expect(root.dataset.state).toBe('steps')
  expect(root.dataset.step).toBe('1')
  expect(localStorage.length).toBe(0)
})

it('starts again from the first step after Safari was left with the dialog open', () => {
  mount(false)
  start()
  coverWithSheet()
  raiseKeyboard()
  hidePage()
  showPage()
  closeDialog()
  vi.advanceTimersByTime(600)
  expect(root.dataset.state).toBe('steps')
  expect(root.dataset.step).toBe('1')
})

it('does not say "not added" while Safari is in the background', () => {
  mount(false)
  start()
  coverWithSheet()
  raiseKeyboard()
  closeDialog()
  vi.advanceTimersByTime(1000)
  hidePage()
  vi.advanceTimersByTime(5000)
  expect(root.dataset.state).toBe('steps')
})

it('keeps its place when a stray focus event arrives before the dialog', () => {
  mount(false)
  start()
  coverWithSheet()
  returnFocus()
  raiseKeyboard()
  expect(root.dataset.step).toBe('3')
  returnFocus()
  expect(root.dataset.step).toBe('3')
  closeDialog()
  vi.advanceTimersByTime(500)
  hidePage()
  expect(root.dataset.state).toBe('steps')
})

it('does not claim an install from a keyboard that no sheet preceded', () => {
  mount(false)
  start()
  raiseKeyboard()
  expect(root.dataset.step).toBe('1')
  closeDialog()
  vi.advanceTimersByTime(300)
  hidePage()
  showPage()
  vi.advanceTimersByTime(5000)
  expect(root.dataset.state).toBe('steps')
  expect(localStorage.length).toBe(0)
})

it('lets the scene yield height in steps before the page scrolls', () => {
  const guide = mount(false)
  const main = guide.parentElement!
  // The page overflows until the scene has stepped down twice.
  vi.spyOn(main, 'clientHeight', 'get').mockReturnValue(700)
  vi.spyOn(main, 'scrollHeight', 'get').mockImplementation(() =>
    Number(root.dataset.tight ?? 0) >= 2 ? 700 : 760,
  )
  start()
  expect(root.dataset.tight).toBe('2')
})

it('does not claim an install when no dialog raised the keyboard', () => {
  mount(false)
  start()
  coverWithSheet()
  returnFocus()
  vi.advanceTimersByTime(500)
  hidePage()
  expect(root.dataset.state).toBe('steps')
  expect(localStorage.length).toBe(0)
})

it('does not claim an install when Safari is left long after the dialog closed', () => {
  mount(false)
  start()
  coverWithSheet()
  raiseKeyboard()
  closeDialog()
  vi.advanceTimersByTime(4000)
  hidePage()
  expect(root.dataset.state).toBe('back')
})

it('stops assuming a sheet is open when no focus event ever comes back', () => {
  mount(false)
  start()
  coverWithSheet()
  vi.advanceTimersByTime(5900)
  expect(root.dataset.step).toBe('2')
  vi.advanceTimersByTime(200)
  expect(root.dataset.step).toBe('1')
  expect(root.dataset.state).toBe('steps')
})

it('takes a touch on the page as proof that nothing covers it', () => {
  mount(false)
  start()
  coverWithSheet()
  dispatchEvent(new Event('pointerdown'))
  expect(root.dataset.step).toBe('1')
})

it('keeps the emphasis while an iPad popover leaves the page in view', () => {
  browser(SAFARI_MAC, 'MacIntel', 5)
  mount(false)
  start()
  coverWithSheet()
  vi.advanceTimersByTime(60_000)
  expect(root.dataset.step).toBe('2')
})

it('treats leaving Safari as nothing at all', () => {
  mount(false)
  start()
  visibility = 'hidden'
  coverWithSheet()
  document.dispatchEvent(new Event('visibilitychange'))
  visibility = 'visible'
  returnFocus()
  vi.advanceTimersByTime(5000)
  expect(root.dataset.state).toBe('steps')
  expect(root.dataset.step).toBe('1')
})

it('ignores an install remembered by an earlier version of the page', () => {
  localStorage.setItem('satin-install:/reps:/install', 'added')
  mount(false)
  start()
  expect(root.dataset.state).toBe('steps')
})

it.each([
  [SAFARI_IPHONE, 'iPhone', 5, 'iPhone'],
  [SAFARI_MAC, 'MacIntel', 5, 'iPad'],
  [SAFARI_MAC, 'MacIntel', 0, 'iPhone or iPad'],
])('names the device for %s on %s', (userAgent, platform, touch, expected) => {
  browser(userAgent, platform, touch)
  const guide = mount(false)
  start()
  expect(guide.querySelector('[data-device-name]')!.textContent).toBe(expected)
})

it.each([
  ['missing', undefined],
  ['blocked', { writeText: () => Promise.reject(new Error('NotAllowedError')) }],
])('says so and shows the address when the clipboard is %s', async (_case, clipboard) => {
  vi.stubGlobal('navigator', {
    userAgent: WEB_VIEW_IPHONE,
    platform: 'iPhone',
    maxTouchPoints: 5,
    clipboard,
  })
  const guide = mount(false)
  start()
  guide.querySelector<HTMLButtonElement>('[data-copy]')!.click()
  await vi.advanceTimersByTimeAsync(0)
  expect(guide.querySelector<HTMLElement>('[data-copy-failed]')!.hidden).toBe(false)
  expect(guide.querySelector('[data-live]')!.textContent).toBe('Couldn’t copy the link.')
})

it('confirms a copied link', async () => {
  const writeText = vi.fn(() => Promise.resolve())
  vi.stubGlobal('navigator', {
    userAgent: WEB_VIEW_IPHONE,
    platform: 'iPhone',
    maxTouchPoints: 5,
    clipboard: { writeText },
  })
  const guide = mount(false)
  start()
  guide.querySelector<HTMLButtonElement>('[data-copy]')!.click()
  await vi.advanceTimersByTimeAsync(0)
  expect(writeText).toHaveBeenCalledWith('https://reps.example/install')
  expect(guide.querySelector<HTMLElement>('[data-copy-failed]')!.hidden).toBe(true)
  expect(guide.querySelector('[data-live]')!.textContent).toBe('Link copied')
})

it.each([
  [WEB_VIEW_IPHONE, 'iPhone', 5, 'inapp'],
  [SAFARI_IPHONE + ' Instagram 300.0', 'iPhone', 5, 'inapp'],
  [CHROME_IPHONE, 'iPhone', 5, 'browser'],
  [SAFARI_MAC, 'MacIntel', 0, 'gate'],
  [SAFARI_MAC, 'MacIntel', 5, 'safari'],
  [
    'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    'Linux',
    5,
    'gate',
  ],
])('classifies %s on %s as %s', (userAgent, platform, touch, expected) => {
  browser(userAgent, platform, touch)
  if (platform === 'MacIntel') {
    vi.stubGlobal('innerWidth', 1194)
    vi.stubGlobal('innerHeight', 790)
  }
  mount(false)
  start()
  expect(root.dataset.env).toBe(expected)
  expect(root.dataset.bar).toBe(expected === 'safari' ? 'top' : undefined)
})

it.each([
  [SAFARI_IPHONE, 'iPhone', 402, 'compact'],
  [SAFARI_IPHONE.replace('Version/27.0', 'Version/26.2'), 'iPhone', 402, 'unknown'],
  [SAFARI_IPHONE, 'iPhone', 874, 'top'],
  [SAFARI_IPHONE.replace('Version/27.0', 'Version/26.2'), 'iPhone', 874, 'unknown'],
  [SAFARI_MAC, 'MacIntel', 1194, 'top'],
  [SAFARI_MAC.replace('Version/27.0', 'Version/26.2'), 'MacIntel', 1194, 'unknown'],
  // A narrow iPad window: where Safari keeps Share there was not measured.
  [SAFARI_MAC, 'MacIntel', 375, 'unknown'],
])('places the pointer for %s on %s at width %s as %s', (userAgent, platform, width, expected) => {
  browser(userAgent, platform)
  vi.stubGlobal('innerWidth', width)
  mount(false)
  start()
  expect(root.dataset.bar).toBe(expected)
})

it('hands the page to Safari and to the phone', () => {
  browser(SAFARI_MAC, 'MacIntel', 0)
  const guide = mount(false)
  start()
  expect(guide.querySelector<HTMLAnchorElement>('[data-open-safari]')!.getAttribute('href')).toBe(
    'x-safari-https://reps.example/install',
  )
  expect(guide.querySelector('[data-address]')!.textContent).toBe('reps.example/install')
  expect(guide.querySelector('[data-qr] path')!.getAttribute('d')).toBe('M0 0h1v1h-1z')
})

it('always shows the gate on the app shell’s unsupported page', () => {
  mount(false)
  start({ kind: 'gate' })
  expect(root.dataset.env).toBe('gate')
})
