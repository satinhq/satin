// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { RESIDENT_BYTES } from './production.ts'
import { ResidentPlanes, type ResidentPlane } from './residentPlanes.ts'

// The resident budget is sized for a tab bar whose other tabs stay resident when one of them is
// a long list (a phone: 1320 px wide). Review round, October 2: at 160 MB the planes fitted with
// 0.4 MB to spare, the larger entry window's material context tipped it over, and every return
// from the list tab recomposed a context it had just evicted (4 to 11 ms, a frame later).

const host = { isConnected: true } as Element
const plane = (id: string, pixelsHigh: number): ResidentPlane => ({
  signature: id,
  key: `backdrop:${id}:1`,
  revision: 1,
  origin: { x: 0, y: 0 },
  width: 440,
  height: pixelsHigh / 3,
  resolution: 3,
  host,
  appearance: 'light',
  text: '17px',
  imageBytes: 1320 * pixelsHigh * 4,
})
/** A material context readback: 440 pt wide, the plane's height in points, four bytes each. */
const contextBytes = (points: number) => 440 * Math.ceil(points) * 4

it('keeps a grown list plane, three single-viewport planes and every material context they made', () => {
  const resident = new ResidentPlanes<string>(RESIDENT_BYTES)
  // A short tab is selected: the other two short tabs and the list are resident.
  expect(resident.retain('merge', plane('merge', 3018))).toBe(true)
  expect(resident.retain('settings', plane('settings', 2868))).toBe(true)
  expect(resident.retain('scroll', plane('scroll', 8192))).toBe(true)
  // Contexts made along the way: each short tab's, and the list's as an entry window, grown and
  // (a longer list) recentred a few times.
  const contexts = [1006, 956, 956, 1499, 2731, 2731, 2731, 2731]
  contexts.forEach((points, index) =>
    resident.storeContext(`context-${index}`, `context-${index}`, contextBytes(points)),
  )
  expect(resident.settle('context-0')).toEqual([])
  expect(resident.size).toBe(3)
  for (let index = 0; index < contexts.length; index++)
    expect(resident.context(`context-${index}`)).toBe(`context-${index}`)
  // Still a ceiling: a second grown list does not fit beside the first.
  resident.retain('second-list', plane('second-list', 8192))
  expect(resident.settle('context-0').length).toBeGreaterThan(0)
})
