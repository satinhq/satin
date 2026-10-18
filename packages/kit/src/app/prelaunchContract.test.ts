// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { setupPrelaunch, prelaunchDOM } from './prelaunch.test-helper.ts'
import { prelaunchController } from './launchScreenRuntime.ts'

beforeEach(() => {
  setupPrelaunch()
})
afterEach(() => {
  window.dispatchEvent(new Event('satin-launch-revealed'))
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('has one versioned instance and a closed root outside app-owned body descendants', () => {
  const controller = prelaunchController()
  expect(controller.version).toBe(1)
  expect(prelaunchController()).toBe(controller)
  const host = document.querySelector('satin-prelaunch')!
  expect(host.parentElement).toBe(document.documentElement)
  expect(host.shadowRoot).toBeNull()
  document.body.innerHTML = '<div id="satin-launch-progress">Impersonator</div>'
  controller.progress({ loaded: 50, total: 100 })
  expect(prelaunchDOM.getElementById('satin-launch-progress')!.hasAttribute('hidden')).toBe(false)
  expect(document.getElementById('satin-launch-progress')!.textContent).toBe('Impersonator')
})

it('does not admit app content until every nonblocking stylesheet loads', async () => {
  const link = document.createElement('link')
  link.dataset.satinStyle = 'all'
  document.body.append(link)
  let admitted = false
  const ready = prelaunchController()
    .stylesReady()
    .then(() => {
      admitted = true
    })
  await Promise.resolve()
  expect(admitted).toBe(false)
  link.dispatchEvent(new Event('load'))
  await ready
  expect(admitted).toBe(true)
})

it('rejects an already failed stylesheet without depending on a worker or React', async () => {
  const link = document.createElement('link')
  link.dataset.satinStyle = 'all'
  link.dataset.satinStyleError = 'true'
  document.body.append(link)
  await expect(prelaunchController().stylesReady()).rejects.toThrow('stylesheet failed')
  const body = document.body
  body.remove()
  try {
    prelaunchController().error('Offline first launch. Connect and retry.')
    expect(prelaunchDOM.getElementById('satin-launch-error')!.textContent).toContain(
      'Offline first launch',
    )
    expect(prelaunchDOM.getElementById('satin-launch-screen')!.hidden).toBe(true)
  } finally {
    document.documentElement.append(body)
  }
})

it('routes retry through the same failure renderer and supports recovery without duplicate panels', () => {
  const retry = vi.fn()
  const controller = prelaunchController()
  controller.error('Missing bundle', 'Unable to Open App', retry)
  controller.error('Missing stylesheet', 'Unable to Open App', retry)
  expect(prelaunchDOM.querySelectorAll('[role="alert"]')).toHaveLength(1)
  prelaunchDOM.querySelector('button')!.click()
  expect(retry).toHaveBeenCalledOnce()
  controller.recover()
  expect(prelaunchDOM.querySelector('[role="alert"]')).toBeNull()
  expect(controller.snapshot().state).toBe('preparing')
})

it('keeps a failed launch visible until explicit recovery, even if readiness arrives late', () => {
  const controller = prelaunchController()
  controller.error('Missing stylesheet')
  controller.reveal()
  expect(controller.snapshot().state).toBe('failed')
  expect(controller.snapshot().error).toContain('Missing stylesheet')
})

it('reattaches the retired host for a later failure and detaches it after recovery', async () => {
  vi.spyOn(Element.prototype, 'animate').mockReturnValue({
    finished: Promise.resolve(),
  } as unknown as Animation)
  const controller = prelaunchController()
  const host = document.querySelector<HTMLElement>('satin-prelaunch')!
  controller.reveal()
  await vi.waitFor(() => expect(host.isConnected).toBe(false))
  const retry = vi.fn()
  controller.error('Connection lost', 'Unable to Open App', retry)
  expect(host.isConnected).toBe(true)
  prelaunchDOM.querySelector('button')!.click()
  expect(retry).toHaveBeenCalledOnce()
  controller.recover()
  expect(host.isConnected).toBe(false)
  expect(prelaunchController()).toBe(controller)
})

it('keeps a disabled cover out of paint while retaining failure and recovery UI', () => {
  setupPrelaunch(false)
  const host = prelaunchDOM.host
  const controller = prelaunchController()
  expect(host.isConnected).toBe(false)
  controller.error('Missing bundle')
  expect(host.isConnected).toBe(true)
  controller.recover()
  expect(host.isConnected).toBe(false)
  expect(controller.snapshot().coverVisible).toBe(false)
})

it('keeps retired observations numeric when WebKit no longer computes shadow styles', async () => {
  vi.spyOn(Element.prototype, 'animate').mockReturnValue({
    finished: Promise.resolve(),
  } as unknown as Animation)
  const controller = prelaunchController()
  controller.reveal()
  await vi.waitFor(() => expect(prelaunchDOM.host.isConnected).toBe(false))
  const computedStyle = getComputedStyle
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(element =>
    element.isConnected
      ? computedStyle(element)
      : ({
          strokeDashoffset: '',
          backgroundColor: '',
          display: '',
          opacity: '',
        } as CSSStyleDeclaration),
  )
  const snapshot = controller.snapshot()
  expect(Number.parseFloat(snapshot.offset)).toBe(100)
  expect(snapshot.background).toBe('#f2f2f7')
  expect(snapshot.coverVisible).toBe(false)
  expect(snapshot.ringVisible).toBe(false)
  expect(snapshot.box.every(Number.isFinite)).toBe(true)
  expect(prelaunchDOM.host.isConnected).toBe(false)
})
