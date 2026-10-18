// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createKeyboardAvoidance } from './avoidance.ts'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it('merges keyboard overlap with a live safe-area inset and restores the original padding', async () => {
  const surface = document.createElement('div')
  surface.dataset.satinScrollAxis = 'vertical'
  const original = 'calc(10px + var(--satin-scroll-inset-bottom))'
  surface.style.paddingBottom = original
  surface.style.setProperty('--satin-scroll-inset-bottom', '367px')
  const editor = document.createElement('input')
  surface.append(editor)
  document.body.append(surface)
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 1000 } as DOMRect)
  vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 140 } as DOMRect)
  const avoidance = createKeyboardAvoidance()
  try {
    avoidance.reveal(editor, null, { offsetTop: 0, bottom: 633 }, false)
    expect(surface.style.paddingBottom).toBe(
      'calc(10px + max(var(--satin-scroll-inset-bottom), 367px))',
    )
    // Growing nested accessories and keyboard changes keep the inset live; neither is added twice.
    surface.style.setProperty('--satin-scroll-inset-bottom', '420px')
    avoidance.reveal(editor, null, { offsetTop: 0, bottom: 600 }, false)
    expect(surface.style.paddingBottom).toBe(
      'calc(10px + max(var(--satin-scroll-inset-bottom), 400px))',
    )
    // React can rewrite inline styles while editing. Preserve its new authored padding too.
    surface.style.paddingBottom = 'calc(20px + var(--satin-scroll-inset-bottom))'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(surface.style.paddingBottom).toBe(
      'calc(20px + max(var(--satin-scroll-inset-bottom), 400px))',
    )
    avoidance.releaseAll()
    expect(surface.style.paddingBottom).toBe('calc(20px + var(--satin-scroll-inset-bottom))')
  } finally {
    avoidance.releaseAll()
  }
})
