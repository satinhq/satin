// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'

afterEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
  delete document.documentElement.dataset.satinViewportFit
})

it.each(['auto', 'contain'])('keeps the %s scene a short fixed strip source', fit => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  document.head.append(style)
  document.documentElement.dataset.satinViewportFit = fit
  const root = document.createElement('div')
  root.dataset.satinRoot = 'true'
  const scene = document.createElement('div')
  scene.dataset.satinStatusBandSource = 'scene'
  root.append(scene)
  document.body.append(root)

  // The scene-specific rule must not override the resampleable fixed source.
  // Installed captures separately establish that the system strip follows it.
  expect(getComputedStyle(root).position).toBe('absolute')
  expect(getComputedStyle(scene).position).toBe('fixed')
  expect(getComputedStyle(scene).height).toBe('12px')
  expect(getComputedStyle(scene).top).toBe('0px')

  // A fixed child does not follow the absolute root's keyboard pan correction.
  root.style.setProperty('--satin-keyboard-offset-top', '-37px')
  root.dataset.satinKeyboard = 'visible'
  expect(getComputedStyle(scene).top).toBe(getComputedStyle(root).top)
  expect(getComputedStyle(scene).top).toBe('-37px')
  delete root.dataset.satinKeyboard
  expect(getComputedStyle(scene).top).toBe('0px')
})
