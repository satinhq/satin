// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import type { RuntimeGeometry, RuntimeOptions, SurfaceRenderSpec } from '../renderSpecs.ts'
import { glyphSignature } from './productionPrepare.ts'

// The ink capture draws every box of a tab that has a background (foreground.ts): a dot badge is
// such a box and has no text. The signature that decides whether ink is captured again, or an
// image the renderer keeps is installed again, must see it.

function dock(badge?: 'dot' | 'number') {
  const element = document.createElement('div')
  for (const label of ['Inbox', 'Settings']) {
    const tab = document.createElement('button')
    tab.setAttribute('role', 'tab')
    const text = document.createElement('span')
    text.textContent = label
    tab.append(text)
    if (label === 'Inbox' && badge) {
      const mark = document.createElement('span')
      mark.setAttribute('data-satin-tab-badge', badge)
      mark.style.backgroundColor = 'rgb(255, 59, 48)'
      mark.style.borderRadius = '9px'
      if (badge === 'number') mark.textContent = '3'
      tab.append(mark)
    }
    element.append(tab)
  }
  document.body.replaceChildren(element)
  return element
}
const signature = (element: HTMLElement) =>
  glyphSignature(
    {
      id: 'dock',
      sampleWidth: 526,
      sampleHeight: 318,
      sampleInsetX: 64,
      sampleInsetY: 128,
      shape: { first: { centerX: 0, centerY: 0, halfWidth: 0, halfHeight: 0 } },
    } as unknown as SurfaceRenderSpec,
    {
      chrome: { dock: element },
      menu: { trigger: element },
    } as unknown as RuntimeOptions['elements'],
    'light',
    3,
    { width: 440, height: 956, tabBarCentres: [110, 330] } as unknown as RuntimeGeometry,
  )

it('a dot badge that appears or goes is other ink', () => {
  const plain = signature(dock())
  const dotted = signature(dock('dot'))
  expect(dotted).not.toBe(plain)
  // The same bar again is the same ink (it can be installed again from the kept image).
  expect(signature(dock('dot'))).toBe(dotted)
  expect(signature(dock())).toBe(plain)
})

it('a badge that changes colour, and a dot that becomes a number, are other ink', () => {
  const bar = dock('dot')
  const dotted = signature(bar)
  bar.querySelector<HTMLElement>('[data-satin-tab-badge]')!.style.backgroundColor =
    'rgb(0, 122, 255)'
  expect(signature(bar)).not.toBe(dotted)
  expect(signature(dock('number'))).not.toBe(dotted)
})
