import { afterEach, expect, it, vi } from 'vitest'
import {
  BACKGROUND_UPDATE_AFTER_MS,
  FOREGROUND_UPDATE_CHECK_MS,
  mayApplyBackgroundUpdate,
  watchBackgroundUpdates,
  trackEditableState,
} from './backgroundUpdate.ts'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('applies only at suspension and protects foreground work and app-managed unsaved state', () => {
  const root = { querySelectorAll: () => [] } as unknown as ParentNode
  vi.stubGlobal('document', { hidden: true })
  expect(mayApplyBackgroundUpdate(root, false, BACKGROUND_UPDATE_AFTER_MS - 1)).toBe(false)
  expect(mayApplyBackgroundUpdate(root, true, BACKGROUND_UPDATE_AFTER_MS)).toBe(false)
  expect(mayApplyBackgroundUpdate(root, false, BACKGROUND_UPDATE_AFTER_MS)).toBe(true)
  vi.stubGlobal('document', { hidden: false })
  expect(mayApplyBackgroundUpdate(root, false, BACKGROUND_UPDATE_AFTER_MS)).toBe(false)
})

it('protects text entered in a native input', () => {
  class Input {
    type = 'text'
    disabled = false
    value = 'draft'
    defaultValue = ''
    checked = false
    defaultChecked = false
  }
  vi.stubGlobal('HTMLInputElement', Input)
  vi.stubGlobal('HTMLTextAreaElement', class {})
  vi.stubGlobal('HTMLSelectElement', class {})
  vi.stubGlobal('HTMLElement', class {})
  vi.stubGlobal('document', { hidden: true })
  const root = { querySelectorAll: () => [new Input()] } as unknown as ParentNode
  expect(mayApplyBackgroundUpdate(root, false, BACKGROUND_UPDATE_AFTER_MS)).toBe(false)
})

it('downloads during use, retries on return, and leaves activation to the safe boundary', async () => {
  const page = Object.assign(new EventTarget(), { hidden: false })
  const windowEvents = new EventTarget()
  const worker = Object.assign(new EventTarget(), { state: 'installing' })
  const registration = Object.assign(new EventTarget(), {
    waiting: null as typeof worker | null,
    installing: worker,
    update: vi.fn(async () => {}),
  })
  vi.stubGlobal('document', page)
  vi.stubGlobal('window', windowEvents)
  vi.stubGlobal('navigator', {
    onLine: true,
    serviceWorker: { getRegistration: vi.fn(async () => registration) },
  })
  const installed = vi.fn()
  const stop = watchBackgroundUpdates('/app/', installed)
  await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce())
  page.hidden = true
  page.dispatchEvent(new Event('visibilitychange'))
  windowEvents.dispatchEvent(new Event('pagehide'))
  await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(2))
  page.hidden = false
  page.dispatchEvent(new Event('visibilitychange'))
  await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(3))
  registration.waiting = worker
  worker.state = 'installed'
  worker.dispatchEvent(new Event('statechange'))
  expect(installed).toHaveBeenCalled()
  stop()
  installed.mockClear()
  worker.dispatchEvent(new Event('statechange'))
  windowEvents.dispatchEvent(new Event('pagehide'))
  expect(installed).not.toHaveBeenCalled()
  expect(registration.update).toHaveBeenCalledTimes(3)
})

it('permits a clean suspended app to apply without waiting fifteen minutes', () => {
  vi.stubGlobal('document', { hidden: true })
  const root = { querySelectorAll: () => [] } as unknown as ParentNode
  expect(mayApplyBackgroundUpdate(root, false, 0)).toBe(true)
})

it('checks pagehide without a visibility event and skips network updates offline', async () => {
  const page = Object.assign(new EventTarget(), { hidden: false })
  const events = new EventTarget()
  const registration = Object.assign(new EventTarget(), {
    waiting: {},
    installing: null,
    update: vi.fn(async () => {}),
  })
  vi.stubGlobal('document', page)
  vi.stubGlobal('window', events)
  vi.stubGlobal('navigator', {
    onLine: false,
    serviceWorker: { getRegistration: vi.fn(async () => registration) },
  })
  const installed = vi.fn()
  const stop = watchBackgroundUpdates('/app/', installed)
  await vi.waitFor(() => expect(installed).toHaveBeenCalled())
  events.dispatchEvent(new Event('pagehide'))
  await vi.waitFor(() => expect(installed).toHaveBeenCalled())
  expect(registration.update).not.toHaveBeenCalled()
  stop()
})

// React synchronizes defaultValue after controlled edits. Preserve the original
// clean value until the draft is sent/cleared, rather than marking the root forever.
it('protects a controlled draft but releases sent or unmounted inputs', () => {
  class Input {
    type = 'text'
    disabled = false
    value = ''
    defaultValue = ''
    checked = false
    defaultChecked = false
  }
  vi.stubGlobal('HTMLInputElement', Input)
  vi.stubGlobal('HTMLTextAreaElement', class {})
  vi.stubGlobal('HTMLSelectElement', class {})
  vi.stubGlobal('HTMLElement', class {})
  const input = new Input()
  let present = true
  const root = Object.assign(new EventTarget(), {
    querySelectorAll: () => (present ? [input] : []),
  })
  const tracker = trackEditableState(root as unknown as HTMLElement)
  input.value = 'draft'
  const event = new Event('input')
  Object.defineProperty(event, 'target', { value: input })
  root.dispatchEvent(event)
  input.defaultValue = 'draft'
  expect(tracker.hasUnsavedChanges()).toBe(true)
  input.value = ''
  input.defaultValue = ''
  expect(tracker.hasUnsavedChanges()).toBe(false)
  input.type = 'checkbox'
  input.checked = true
  root.dispatchEvent(event)
  input.defaultChecked = true
  expect(tracker.hasUnsavedChanges()).toBe(true)
  input.checked = false
  input.defaultChecked = false
  expect(tracker.hasUnsavedChanges()).toBe(false)
  input.value = 'another draft'
  present = false
  expect(tracker.hasUnsavedChanges()).toBe(false)
  tracker.dispose()
})

it('retries after a WebKit update check never settles instead of wedging the downloader', async () => {
  vi.useFakeTimers()
  const page = Object.assign(new EventTarget(), { hidden: false })
  const events = new EventTarget()
  const registration = Object.assign(new EventTarget(), {
    waiting: null,
    installing: null,
    update: vi.fn(() => new Promise(() => {})),
  })
  vi.stubGlobal('document', page)
  vi.stubGlobal('window', events)
  vi.stubGlobal('navigator', {
    onLine: true,
    serviceWorker: { getRegistration: async () => registration },
  })
  const stop = watchBackgroundUpdates('/app/', vi.fn())
  await vi.advanceTimersByTimeAsync(FOREGROUND_UPDATE_CHECK_MS)
  expect(registration.update.mock.calls.length).toBeGreaterThan(1)
  stop()
})

it('does not poll or reconnect repeatedly while suspended and checks on resume', async () => {
  vi.useFakeTimers()
  const page = Object.assign(new EventTarget(), { hidden: true })
  const events = new EventTarget()
  const registration = Object.assign(new EventTarget(), {
    waiting: null,
    installing: null,
    update: vi.fn(async () => {}),
  })
  vi.stubGlobal('document', page)
  vi.stubGlobal('window', events)
  vi.stubGlobal('navigator', {
    onLine: true,
    serviceWorker: { getRegistration: async () => registration },
  })
  const stop = watchBackgroundUpdates('/app/', () => {})
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(registration.update).toHaveBeenCalledOnce()
    events.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(registration.update).toHaveBeenCalledOnce()
    page.hidden = false
    page.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(registration.update).toHaveBeenCalledTimes(2)
  } finally {
    stop()
  }
})
