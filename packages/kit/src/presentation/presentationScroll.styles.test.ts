// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { expect, it } from 'vitest'

it('reserves the first headerless section gap through an opaque component in an inline List', () => {
  // Happy DOM cannot parse these complete selector groups as CSS rules, but its selector
  // matcher supports them. WebKit captures separately verify the painted margin.
  const css = frameworkStyleDeclarations().replace(/\/\*[\s\S]*?\*\//g, '')
  const gapSelectors = [...css.matchAll(/([^{}]+)\{\s*margin-top:\s*35px;\s*\}/g)]
    .flatMap(match => match[1]!.split(/,(?![^()]*\))/))
    .map(selector =>
      selector.trim().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')'),
    )
  const host = document.createElement('div')
  const hasGap = () =>
    gapSelectors.some(selector => host.querySelector('section')!.matches(selector))
  for (const positioned of [false, true]) {
    for (const wrapped of [false, true]) {
      const section = '<section data-satin-list-section="true">Options</section>'
      const content = wrapped
        ? `<div data-satin-section-item="true" data-satin-list-direct-row="true">${section}</div>`
        : section
      host.innerHTML = `<div data-satin-list="insetGrouped" data-satin-list-navigation="inline">${positioned ? `<div data-satin-scroll-content>${content}</div>` : content}</div>`
      expect(hasGap(), `positioned=${positioned} wrapped=${wrapped}`).toBe(true)
      host
        .querySelector('[data-satin-list-navigation]')!
        .setAttribute('data-satin-list-navigation', 'large')
      expect(hasGap()).toBe(false)
    }
  }
})

it('keeps the modal viewport fixed while long alert content retains an isolated scrollport', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const dialog = document.createElement('dialog')
  dialog.className = 'satin-presentation'
  dialog.dataset.satinPresentation = 'alert'
  dialog.innerHTML =
    '<div class="satin-presentation-surface"><canvas></canvas><div class="satin-presentation-scroll">Long alert</div></div>'
  document.head.append(style)
  document.body.append(dialog)
  try {
    expect(getComputedStyle(dialog).overflow).toBe('hidden')
    expect(getComputedStyle(dialog).overscrollBehavior).toBe('none')
    const surface = getComputedStyle(dialog.firstElementChild!)
    expect(surface.overflow).toBe('hidden')
    expect(surface.padding).toBe('0px')
    const scroll = getComputedStyle(dialog.querySelector('.satin-presentation-scroll')!)
    expect(scroll.overflowY).toBe('auto')
    expect(scroll.overscrollBehavior).toBe('none')
    expect(Number.parseFloat(scroll.minHeight)).toBe(0)
    expect(scroll.padding).toBe('20px 16px 16px')
  } finally {
    dialog.remove()
    style.remove()
  }
})
