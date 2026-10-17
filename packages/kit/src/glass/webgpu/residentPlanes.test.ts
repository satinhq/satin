// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { ResidentPlanes, type ResidentPlane } from './residentPlanes.ts'

const host = () => {
  const element = document.createElement('section')
  document.body.append(element)
  return element
}
const plane = (
  key: string,
  element: Element,
  imageBytes = 10,
  over: Partial<ResidentPlane> = {},
): ResidentPlane => ({
  signature: `sig:${key}`,
  key,
  revision: 1,
  origin: { x: 0, y: 0 },
  width: 100,
  height: 100,
  resolution: 3,
  host: element,
  appearance: 'light',
  text: '17px',
  imageBytes,
  ...over,
})

describe('ResidentPlanes', () => {
  it('releases the old retained image when a retained plane is captured again', () => {
    const resident = new ResidentPlanes<string>(1000)
    expect(resident.retain('a', plane('backdrop:a:1', host()))).toBe(true)
    expect(resident.recaptured('a')).toBe('backdrop:a:1')
    expect(resident.size).toBe(0)
    expect(resident.recaptured('a')).toBeUndefined()
  })

  it('never retains a plane whose host left the document, and evicts one that leaves later', () => {
    const resident = new ResidentPlanes<string>(1000)
    const popped = host()
    popped.remove()
    expect(resident.retain('popped', plane('backdrop:popped:1', popped))).toBe(false)
    const covered = host()
    expect(resident.retain('covered', plane('backdrop:covered:1', covered))).toBe(true)
    covered.remove()
    expect(resident.settle()).toEqual(['backdrop:covered:1'])
    expect(resident.size).toBe(0)
  })

  it('counts image, texture and context bytes against the budget, evicting contexts before planes', () => {
    const resident = new ResidentPlanes<string>(100)
    resident.retain('a', plane('backdrop:a:1', host(), 20))
    resident.retain('b', plane('backdrop:b:1', host(), 20))
    expect(resident.bytes).toBe(80)
    resident.storeContext('old', 'context-old', 15)
    resident.storeContext('current', 'context-current', 15)
    expect(resident.bytes).toBe(110)
    // The least recently used context goes first; the current one and both planes stay.
    expect(resident.settle('current')).toEqual([])
    expect(resident.context('old')).toBeUndefined()
    expect(resident.context('current')).toBe('context-current')
    resident.retain('c', plane('backdrop:c:1', host(), 20))
    // 3 planes x 40 + 15 > 100: the oldest plane is evicted.
    expect(resident.settle('current')).toEqual(['backdrop:a:1'])
    expect(resident.bytes).toBe(95)
  })

  it('refuses a plane that alone exceeds the budget (image and texture)', () => {
    const resident = new ResidentPlanes<string>(100)
    expect(resident.retain('big', plane('backdrop:big:1', host(), 60))).toBe(false)
  })

  it('only offers captures that match the page: appearance, text size, no damage', () => {
    const resident = new ResidentPlanes<string>(1000)
    const element = host(),
      row = document.createElement('p')
    element.append(row)
    resident.retain('a', plane('backdrop:a:1', element))
    expect(resident.usable('a', 'light', '17px')).toBeDefined()
    expect(resident.usable('a', 'dark', '17px')).toBeUndefined()
    expect(resident.usable('a', 'light', '21px')).toBeUndefined()
    resident.damage(row)
    expect(resident.usable('a', 'light', '17px')).toBeUndefined()
    expect(resident.settle()).toEqual(['backdrop:a:1'])
  })

  it('clear returns every retained key for release', () => {
    const resident = new ResidentPlanes<string>(1000)
    resident.retain('a', plane('backdrop:a:1', host()))
    resident.retain('b', plane('backdrop:b:2', host()))
    resident.storeContext('k', 'c', 5)
    expect(resident.clear()).toEqual(['backdrop:a:1', 'backdrop:b:2'])
    expect(resident.bytes).toBe(0)
  })
})
