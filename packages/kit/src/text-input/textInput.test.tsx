import { editorHeight } from './editorGeometry.ts'
import { shouldSubmitField } from './submit.ts'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TextField, SecureField } from './TextField.tsx'
import { TextEditor } from './TextEditor.tsx'
import { textFieldAttributes, type TextFieldKind } from './kinds.ts'
import { createFocusChain } from './focusChain.ts'
import { keyboardGeometry, revealDelta } from '../keyboard/geometry.ts'

describe('text input policy', () => {
  it.each([
    ['text', 'text', 'text', 'off'],
    ['name', 'text', 'text', 'name'],
    ['email', 'email', 'email', 'email'],
    ['url', 'url', 'url', 'url'],
    ['tel', 'tel', 'tel', 'tel'],
    ['number', 'text', 'numeric', 'off'],
    ['decimal', 'text', 'decimal', 'off'],
    ['search', 'search', 'text', 'off'],
    ['username', 'text', 'text', 'username'],
    ['new-password', 'password', 'text', 'new-password'],
    ['current-password', 'password', 'text', 'current-password'],
    ['one-time-code', 'text', 'numeric', 'one-time-code'],
  ])('%s maps keyboard, semantics and autofill', (kind, type, inputMode, autoComplete) => {
    expect(textFieldAttributes(kind as TextFieldKind)).toMatchObject({
      type,
      inputMode,
      autoComplete,
    })
    expect(textFieldAttributes(kind as TextFieldKind, 'next').enterKeyHint).toBe('next')
  })
  it('disables text correction for literal values and keeps prose editing aids', () => {
    expect(textFieldAttributes('email')).toMatchObject({
      autoCorrect: 'off',
      autoCapitalize: 'none',
      spellCheck: false,
    })
    expect(textFieldAttributes('text')).toMatchObject({
      autoCorrect: 'on',
      autoCapitalize: 'sentences',
      spellCheck: true,
    })
  })
  it('renders semantic labels and allows attribute overrides', () => {
    const html = renderToStaticMarkup(
      <TextField
        id="email"
        label="Email"
        kind="email"
        value=""
        onChange={() => {}}
        autoComplete="off"
      />,
    )
    expect(html).toContain('for="email"')
    expect(html).toContain('autoComplete="off"')
    expect(html).toContain('data-satin-role="text-input"')
    expect(
      renderToStaticMarkup(<SecureField label="Secret" value="" onChange={() => {}} />),
    ).toContain('type="password"')
    expect(
      renderToStaticMarkup(
        <TextEditor label="Notes" value="a\nb" onChange={() => {}} minLines={6} />,
      ),
    ).toContain('rows="6"')
  })

  it('keeps a list field named when its title becomes the default prompt', () => {
    const row = renderToStaticMarkup(
      <TextField id="name" label="Name" variant="row" value="" onChange={() => {}} />,
    )
    expect(row).toContain('<label for="name">Name</label>')
    expect(row).toContain('placeholder="Name"')
    const explicit = renderToStaticMarkup(
      <TextField label="Name" variant="row" placeholder="Your name" value="" onChange={() => {}} />,
    )
    expect(explicit).toContain('placeholder="Your name"')
    const populated = renderToStaticMarkup(
      <TextField id="typed-name" label="Name" variant="row" value="Alex" onChange={() => {}} />,
    )
    expect(populated).toContain('<label for="typed-name">Name</label>')
    expect(populated).toContain('value="Alex"')
  })
})
it('focus chain skips disabled/unmounted/inert fields and dismisses at the end', () => {
  const make = () => ({
    focus: vi.fn(),
    blur: vi.fn(),
    disabled: false,
    readOnly: false,
    isConnected: true,
    closest: vi.fn(() => null),
  })
  const chain = createFocusChain(['a', 'b', 'c'])
  const a = make(),
    b = make(),
    c = make()
  b.disabled = true
  chain.field('a').ref(a)
  chain.field('b').ref(b)
  chain.field('c').ref(c)
  chain.field('a').onSubmit()
  expect(c.focus).toHaveBeenCalledWith({ preventScroll: true })
  chain.field('c').onSubmit()
  expect(c.blur).toHaveBeenCalledOnce()
  chain.field('c').ref(null)
  chain.field('a').onSubmit()
  expect(a.blur).toHaveBeenCalledOnce()
  expect(() => createFocusChain(['a', 'a'])).toThrow('unique')
})
it('geometry includes panned occlusion, hardware keyboards, zoom and closing', () => {
  expect(keyboardGeometry(894, 550, 80, 1, true)).toEqual({
    height: 344,
    visible: true,
    viewportHeight: 550,
    offsetTop: 80,
    layoutHeight: 894,
  })
  expect(keyboardGeometry(894, 894, 0, 1, true).height).toBe(0)
  expect(keyboardGeometry(894, 550, 0, 2, true).height).toBe(0)
  expect(keyboardGeometry(894, 550, 0, 1, false).height).toBe(0)
  expect(keyboardGeometry(440, 240, 0, 1, true).height).toBe(200)
})
it('reveal changes only the nearest surface by the minimum needed', () => {
  expect(revealDelta(200, 244, 100, 850, 550)).toBe(0)
  expect(revealDelta(700, 744, 100, 850, 550)).toBe(206)
  expect(revealDelta(80, 124, 100, 850, 550)).toBe(-32)
  expect(revealDelta(200, 900, 100, 850, 550)).toBe(88)
})

it('Return does not submit during composition or after a consumer cancellation', () => {
  const event = {
    key: 'Enter',
    keyCode: 13,
    defaultPrevented: false,
    nativeEvent: { isComposing: false },
  }
  expect(shouldSubmitField(event)).toBe(true)
  expect(shouldSubmitField({ ...event, nativeEvent: { isComposing: true } })).toBe(false)
  expect(shouldSubmitField({ ...event, keyCode: 229 })).toBe(false)
  expect(shouldSubmitField({ ...event, defaultPrevented: true })).toBe(false)
  expect(shouldSubmitField({ ...event, key: 'a' })).toBe(false)
})

it('editors grow only inside the visible region, including a short landscape keyboard frame', () => {
  expect(editorHeight(60, 3, 22, 0, 455)).toBe(66)
  expect(editorHeight(700, 3, 22, 0, 455)).toBe(455)
  expect(editorHeight(700, 6, 22, 0, 100)).toBe(100)
  expect(editorHeight(200, 3, 22, 8, 455)).toBe(200)
})
