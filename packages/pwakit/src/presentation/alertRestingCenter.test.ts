import { expect, it } from 'vitest'
import { alertRestingCenter } from './model.ts'

// Installed iPad (1366 x 1024): the centred alert's panel is at 512 pt, its field ends at 531.3 pt
// (19.3 pt below the centre), the keyboard's top is at 526 pt (498 pt tall) and the alert's
// keyboard position is 263 pt. Every tap focus from 512 pt made WebKit scroll the document
// (11-17 scroll events, the page 2.5-3 pt off for 9-12 frames).
it('rests an iPad alert with its field clear of the keyboard to come', () => {
  const center = alertRestingCenter(512, 19.3, 1024, 498, 263)
  expect(center).toBeCloseTo(498.7, 5)
  // The field's bottom edge is 8 pt above the keyboard's top.
  expect(center + 19.3).toBeCloseTo(1024 - 498 - 8, 5)
})

it('leaves a phone alert centred: its field is clear already', () => {
  // iPhone 17 Pro Max, fitted viewport 894 pt: centre 430 pt, keyboard 391 pt with the accessory bar.
  expect(alertRestingCenter(430, 19.3, 894, 391, 251.5)).toBe(430)
})

it('never rests above the keyboard position, and does nothing without an expected keyboard', () => {
  // A tall alert whose field reaches far below its centre.
  expect(alertRestingCenter(512, 300, 1024, 498, 263)).toBe(263)
  expect(alertRestingCenter(512, 19.3, 1024, 0, 512)).toBe(512)
})
