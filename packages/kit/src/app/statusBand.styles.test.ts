// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'

afterEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
  delete document.documentElement.dataset.satinDocument
  delete document.body.dataset.satinDocument
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
  expect(getComputedStyle(root).position).toBe('relative')
  expect(getComputedStyle(scene).position).toBe('fixed')
  expect(getComputedStyle(scene).height).toBe('12px')
  expect(getComputedStyle(scene).top).toBe('0px')

  // A fixed child does not follow the flow root's keyboard pan correction.
  root.style.setProperty('--satin-keyboard-offset-top', '-37px')
  root.dataset.satinKeyboard = 'visible'
  expect(getComputedStyle(scene).top).toBe(getComputedStyle(root).top)
  expect(getComputedStyle(scene).top).toBe('-37px')
  delete root.dataset.satinKeyboard
  expect(getComputedStyle(scene).top).toBe('0px')
})

// The DOM emulator checks declarations, not WebKit layout or @layer precedence.
// Installed edge drags and the layered Catalyst fixture cover those separately.
it('prevents legacy app sizing from reopening the document scroller', () => {
  document.documentElement.dataset.satinDocument = 'true'
  document.body.dataset.satinDocument = 'true'
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const appStyle = document.createElement('style')
  appStyle.textContent = `
    html, body { height: 100%; }
    #root { min-height: 100%; }
    body { overflow: auto; }
  `
  document.head.append(style, appStyle)
  const mount = document.createElement('div')
  mount.id = 'root'
  mount.dataset.satinMount = 'true'
  const root = document.createElement('div')
  root.dataset.satinRoot = 'true'
  root.style.setProperty('--satin-status-band-frame-height', '812px')
  mount.append(root)
  const strayContent = document.createElement('div')
  strayContent.style.height = '3000px'
  document.body.append(mount, strayContent)

  expect(getComputedStyle(document.documentElement).overflow).toBe('hidden')
  for (const element of [document.documentElement, document.body, mount]) {
    expect(getComputedStyle(element).height).toBe('auto')
  }
  expect(getComputedStyle(document.body).overflow).toBe('clip')
  expect(getComputedStyle(document.body).maxHeight).toBe('100lvh')
  expect(getComputedStyle(mount).overflow).toBe('clip')
  expect(getComputedStyle(mount).minHeight).toBe('100lvh')

  root.style.setProperty('--satin-keyboard-layout-height', '812px')
  root.style.setProperty('--satin-keyboard-viewport-height', '500px')
  root.style.setProperty('--satin-keyboard-offset-top', '37px')
  root.dataset.satinKeyboard = 'visible'
  expect(getComputedStyle(root).height).toBe('812px')
  expect(getComputedStyle(root).position).toBe('fixed')
  expect(getComputedStyle(document.body).maxHeight).toBe('100lvh')
  expect(getComputedStyle(root).minHeight).toBe('0')
  expect(getComputedStyle(document.body).overflow).toBe('clip')
})
