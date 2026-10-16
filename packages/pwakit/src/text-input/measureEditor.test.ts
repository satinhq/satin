// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { measureEditorContentHeight } from './measureEditor.ts'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('measures an isolated copy with matching text layout and leaves the editing session intact', () => {
  const editor = document.createElement('textarea')
  editor.style.cssText =
    'width:240px;height:80px;font:17px serif;line-height:23px;padding:4px;box-sizing:border-box'
  editor.value = 'one two three\nfour five six'
  document.body.append(editor)
  editor.focus()
  editor.setSelectionRange(4, 7, 'backward')
  editor.scrollTop = 12
  const focus = vi.spyOn(editor, 'focus')
  const selection = vi.spyOn(editor, 'setSelectionRange')
  let measured: HTMLTextAreaElement | undefined
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLTextAreaElement,
  ) {
    measured = this as HTMLTextAreaElement
    expect(measured).not.toBe(editor)
    expect(measured.value).toBe(editor.value)
    expect(measured.wrap).toBe(editor.wrap)
    expect(measured.style.width).toBe('240px')
    expect(measured.style.boxSizing).toBe('border-box')
    expect(measured.style.lineHeight).toBe('23px')
    expect(measured.inert).toBe(true)
    expect(measured.tabIndex).toBe(-1)
    expect(measured.getAttribute('aria-hidden')).toBe('true')
    expect(measured.style.visibility).toBe('hidden')
    expect(editor.style.height).toBe('80px')
    return 54
  })
  expect(measureEditorContentHeight(editor)).toBe(54)
  expect(measured?.isConnected).toBe(false)
  expect(document.activeElement).toBe(editor)
  expect([editor.selectionStart, editor.selectionEnd, editor.selectionDirection]).toEqual([
    4,
    7,
    'backward',
  ])
  expect(editor.scrollTop).toBe(12)
  expect(focus).not.toHaveBeenCalled()
  expect(selection).not.toHaveBeenCalled()
})

it('removes its measurement node even if layout measurement throws', () => {
  const editor = document.createElement('textarea')
  document.body.append(editor)
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => {
    throw new Error('layout unavailable')
  })
  expect(() => measureEditorContentHeight(editor)).toThrow('layout unavailable')
  expect([...document.querySelectorAll('textarea')]).toEqual([editor])
})
