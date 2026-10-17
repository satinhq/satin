// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { afterEach, expect, it } from 'vitest'
import { semanticColor, systemColor } from './colors.ts'

const stylesheet = document.createElement('style')
stylesheet.textContent = frameworkStyleDeclarations()
document.head.append(stylesheet)

afterEach(() => {
  document.documentElement.removeAttribute('data-satin-appearance')
  document.body.replaceChildren()
})

it('publishes the full measured UIKit palette and semantic content colors', () => {
  const light = getComputedStyle(document.documentElement)
  expect(light.getPropertyValue('--satin-system-purple')).toBe('#cb30e0')
  expect(light.getPropertyValue('--satin-tertiary-system-fill')).toBe('rgb(118 118 128 / 0.12)')
  expect(systemColor('cyan')).toBe('var(--satin-system-cyan)')
  expect(systemColor('gray6')).toBe('var(--satin-system-gray6)')
  expect(semanticColor('secondaryLabel')).toBe('var(--satin-secondary-label)')
  expect(semanticColor('systemGroupedBackground')).toBe('var(--satin-system-grouped-background)')
  document.documentElement.dataset.satinAppearance = 'dark'
  const dark = getComputedStyle(document.documentElement)
  expect(dark.getPropertyValue('--satin-system-purple')).toBe('#db34f2')
  expect(dark.getPropertyValue('--satin-system-cyan')).toBe('#3cd3fe')
})

it('switches public document tokens without the zero-specificity app appearance bug', () => {
  const authorStyle = document.createElement('style')
  authorStyle.textContent = `:root { --app-label: #000; }
    :where(html[data-satin-appearance='dark']) { --app-label: #fff; }`
  document.head.append(authorStyle)
  const mount = document.createElement('main')
  const content = document.createElement('article')
  const portal = document.createElement('aside')
  mount.append(content)
  document.body.append(mount, portal)
  for (const element of [content, portal]) {
    element.style.color = semanticColor('label')
    element.style.backgroundColor = semanticColor('systemBackground')
  }
  for (const [appearance, label, background] of [
    ['light', '#000000', '#ffffff'],
    ['dark', '#ffffff', '#000000'],
    ['light', '#000000', '#ffffff'],
  ]) {
    document.documentElement.dataset.satinAppearance = appearance
    for (const element of [content, portal]) {
      expect(element.style.color).toBe(semanticColor('label'))
      const resolved = getComputedStyle(document.documentElement)
      expect(resolved.getPropertyValue('--app-label')).toBe('#000')
      expect(resolved.getPropertyValue('--satin-label')).toBe(label)
      expect(resolved.getPropertyValue('--satin-system-background')).toBe(background)
    }
  }
  authorStyle.remove()
})
