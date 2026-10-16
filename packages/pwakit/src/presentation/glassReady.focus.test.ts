// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { holdPresentationForGlass } from './glassReady.ts'
import { focusFromFramework, trackInputModality } from '../focus/programmaticFocus.ts'

// Recorded on the installed iPad (kb6/evidence/probe2, trace1): opening the alert from a real tap,
// pointerup 0 ms, focusin on the field 10 ms, focusout 13 ms with no blur() call and no related
// target, and no keyboard. The hold had hidden the panel between the two; a hidden element cannot
// keep focus in WebKit. With the field kept focusable (kb6/evidence/c1a): no focusout, keyboard
// reported 141 ms after the focus.
afterEach(() => {
  document.body.replaceChildren()
})

function alertPanel() {
  const panel = document.createElement('div')
  panel.innerHTML =
    '<div data-satin-glass-region-id="alert"><canvas data-satin-glass-region-canvas></canvas></div>' +
    '<input><button>Save</button>'
  document.body.append(panel)
  return { panel, field: panel.querySelector('input')!, canvas: panel.querySelector('canvas')! }
}

it('keeps the focused editor focusable, and unpainted, while the panel waits for its glass', async () => {
  const { panel, field, canvas } = alertPanel()
  field.style.opacity = '0.9'
  field.focus()
  const release = holdPresentationForGlass(panel, null, [], () => {})
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(true)
  // Its own visibility wins over the hidden panel's, so WebKit does not end editing.
  expect(field.style.visibility).toBe('visible')
  expect(field.style.opacity).toBe('0')
  expect(document.activeElement).toBe(field)
  canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
  await new Promise(resolve => setTimeout(resolve, 0))
  // Revealed with the panel, in the same step, with its own styles back.
  expect(panel.hasAttribute('data-satin-glass-hold')).toBe(false)
  expect(field.style.visibility).toBe('')
  expect(field.style.opacity).toBe('0.9')
  release()
  expect(field.style.opacity).toBe('0.9')
})

it('gives the editor its styles back when the show is closed before its glass arrives', () => {
  const { panel, field } = alertPanel()
  field.focus()
  const release = holdPresentationForGlass(panel, null, [], () => {})
  expect(field.style.opacity).toBe('0')
  release()
  expect(field.style.visibility).toBe('')
  expect(field.style.opacity).toBe('')
})

it('changes nothing when the focus is elsewhere, or on a control that is not an editor', () => {
  const { panel, field } = alertPanel()
  panel.querySelector('button')!.focus()
  const release = holdPresentationForGlass(panel, null, [], () => {})
  expect(field.style.visibility).toBe('')
  expect(panel.querySelector('button')!.style.visibility).toBe('')
  release()
})

it('a held presentation is inert, except the path to an editor the opening tap focused', async () => {
  const { panel, field, canvas } = alertPanel()
  const dimmer = document.createElement('div')
  const ownInert = panel.querySelector('button')!
  ownInert.setAttribute('inert', '')
  document.body.append(dimmer)
  field.focus()
  const release = holdPresentationForGlass(panel, dimmer, [], () => {}, undefined, undefined, {
    inert: true,
  })
  expect(panel.hasAttribute('inert')).toBe(false)
  expect(field.closest('[inert]')).toBeNull()
  expect(panel.querySelector('[data-satin-glass-region-id]')!.hasAttribute('inert')).toBe(true)
  expect(dimmer.hasAttribute('inert')).toBe(true)
  canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(panel.querySelectorAll('[inert]')).toHaveLength(1)
  expect(ownInert.hasAttribute('inert')).toBe(true)
  expect(dimmer.hasAttribute('inert')).toBe(false)
  release()
})

it('a held sheet with no editor is inert as a whole, and gets a visible focus back at reveal', async () => {
  const { panel, canvas } = alertPanel()
  const save = panel.querySelector('button')!
  trackInputModality(document)
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
  save.focus()
  // A keyboard arrival: the dialog's initial focus is visible.
  const matches = save.matches.bind(save)
  Object.defineProperty(save, 'matches', {
    value: (selector: string) => selector === ':focus-visible' || matches(selector),
  })
  const release = holdPresentationForGlass(panel, null, [], () => {}, undefined, undefined, {
    inert: true,
  })
  expect(panel.hasAttribute('inert')).toBe(true)
  // WebKit ends focus inside an inert subtree.
  save.blur()
  canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(panel.hasAttribute('inert')).toBe(false)
  expect(document.activeElement).toBe(save)
  release()
})

it('does not revive the UA focus indicator after a touch-presented sheet becomes ready', async () => {
  const { panel, canvas } = alertPanel()
  const save = panel.querySelector('button')!
  trackInputModality(document)
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  // showModal can leave :focus-visible set even when Satin has quieted its indicator.
  const matches = save.matches.bind(save)
  Object.defineProperty(save, 'matches', {
    value: (selector: string) => selector === ':focus-visible' || matches(selector),
  })
  focusFromFramework(save)
  const release = holdPresentationForGlass(panel, null, [], () => {}, undefined, undefined, {
    inert: true,
  })
  save.blur()
  canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(panel.hasAttribute('inert')).toBe(false)
  expect(document.activeElement).not.toBe(save)
  release()
})

it('leaves inert to a menu, which keeps its own (no option)', () => {
  const { panel } = alertPanel()
  const release = holdPresentationForGlass(panel, null, [], () => {})
  expect(panel.querySelectorAll('[inert]')).toHaveLength(0)
  expect(panel.hasAttribute('inert')).toBe(false)
  release()
})

it('does not give back a focus a tap left invisible (a script focus would draw a ring)', async () => {
  const { panel, canvas } = alertPanel()
  const save = panel.querySelector('button')!
  save.focus()
  const matches = save.matches.bind(save)
  Object.defineProperty(save, 'matches', {
    value: (selector: string) => selector !== ':focus-visible' && matches(selector),
  })
  const release = holdPresentationForGlass(panel, null, [], () => {}, undefined, undefined, {
    inert: true,
  })
  save.blur()
  canvas.dataset.satinGlassPresentedShow = canvas.dataset.satinGlassShow
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(panel.hasAttribute('inert')).toBe(false)
  expect(document.activeElement).not.toBe(save)
  release()
})
