import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { enableShake } from './shake.ts'
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', { visibilityState: 'visible' })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('asks for permission only on explicit enable, reports denial, and does not listen', async () => {
  const permission = vi.fn().mockResolvedValue('denied')
  vi.stubGlobal('DeviceMotionEvent', { requestPermission: permission })
  const add = vi.spyOn(window, 'addEventListener')
  expect(permission).not.toHaveBeenCalled()
  await expect(enableShake(vi.fn())).rejects.toThrow('denied')
  expect(permission).toHaveBeenCalledTimes(1)
  expect(add).not.toHaveBeenCalled()
})
it('rejects absent motion APIs', async () => {
  vi.stubGlobal('DeviceMotionEvent', undefined)
  await expect(enableShake(vi.fn())).rejects.toThrow('unavailable')
})
it('requires repeated acceleration peaks, ignores hidden motion, and cleans up', async () => {
  vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockResolvedValue('granted') })
  let time = 1_000
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  const open = vi.fn()
  const stop = await enableShake(open)
  const motion = (magnitude: number) => {
    const event = new Event('devicemotion')
    Object.assign(event, { acceleration: { x: magnitude, y: 0, z: 0 } })
    window.dispatchEvent(event)
    time += 150
  }
  motion(2)
  motion(20)
  motion(20)
  expect(open).not.toHaveBeenCalled()
  motion(2)
  motion(20)
  expect(open).not.toHaveBeenCalled()
  motion(2)
  motion(20)
  expect(open).toHaveBeenCalledTimes(1)
  time += 3_000
  vi.stubGlobal('document', { visibilityState: 'hidden' })
  motion(20)
  motion(20)
  motion(20)
  expect(open).toHaveBeenCalledTimes(1)
  stop()
  vi.stubGlobal('document', { visibilityState: 'visible' })
  time += 3_000
  motion(20)
  motion(20)
  motion(20)
  expect(open).toHaveBeenCalledTimes(1)
})
