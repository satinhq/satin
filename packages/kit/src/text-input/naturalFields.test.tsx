// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { TextField, SecureField, TextEditor, Stepper } from '../public/controls.tsx'
import { GlassFieldContext } from '../public/fieldContext.ts'
import { Row, StepperControl } from '../list-form/ListForm.tsx'
import { RowLabelBody } from '../list-form/RowLabel.tsx'
import { ListContext } from '../list-form/listContext.ts'
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'

let root: Root | undefined
const styles = readFileSync(new NodeURL('../styles.css', import.meta.url), 'utf8')
function mount(content: React.ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const style = document.createElement('style')
  style.textContent = styles
  document.head.append(style)
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(content))
  return container
}
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  document.head.replaceChildren()
  vi.restoreAllMocks()
})
it('keeps field names while showing only prompts, and uses clear fields inside glass', () => {
  const container = mount(
    <>
      <TextField label="Name" prompt="Your name" value="" onChange={() => {}} />
      <GlassFieldContext value={true}>
        <SecureField label="Password" value="" onChange={() => {}} />
        <TextEditor label="Message" prompt="Message Atlas" value="" onChange={() => {}} />
      </GlassFieldContext>
      <ListContext value={true}>
        <TextEditor label="Notes" value="" onChange={() => {}} />
      </ListContext>
    </>,
  )
  const labels = [...container.querySelectorAll('label')]
  expect(labels.map(label => label.textContent)).toEqual(['Name', 'Password', 'Message', 'Notes'])
  for (const label of labels) {
    expect(container.querySelector(`#${CSS.escape(label.htmlFor)}`)).not.toBeNull()
    expect(getComputedStyle(label).clipPath).toBe('inset(50%)')
  }
  const formEditor = container.querySelector('[data-satin-field-style="row"] textarea')!
  // Stock Form editor: one empty line, first line 23 pt below the cell top, text 5 pt inside the row.
  expect(formEditor.getAttribute('rows')).toBe('1')
  expect(getComputedStyle(formEditor).padding).toBe('12px 5px')
  const field = container.querySelector('[data-satin-field-style="plain"]')!
  expect(getComputedStyle(field).backgroundColor).toBe('transparent')
  expect(getComputedStyle(field).borderRadius).toBe('0px')
  expect(container.querySelector('input[type=password]')?.getAttribute('autocomplete')).toBe(
    'current-password',
  )
})
it('grows a vertical field beyond a short parent, caps at lineLimit, and retains selection on updates', () => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight')
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return Math.max(1, this.value.split('\n').length) * 22
    },
  })
  try {
    const render = (value: string) => (
      <div style={{ height: 22 }}>
        <TextField
          axis="vertical"
          label="Message"
          lineLimit={{ min: 1, max: 3 }}
          value={value}
          onChange={() => {}}
          style={{ lineHeight: '22px' }}
        />
      </div>
    )
    const animate = vi.fn()
    const container = mount(render('one\ntwo'))
    const editor = container.querySelector('textarea')!
    expect(editor.getAttribute('enterkeyhint')).toBeNull()
    expect(editor.style.height).toBe('44px')
    editor.animate = animate
    editor.focus()
    editor.setSelectionRange(2, 2)
    act(() => root!.render(render('one\ntwo\nthree\nfour')))
    expect(editor.style.height).toBe('66px')
    // The new line fits immediately; WebKit never sees an animated, undersized
    // editable viewport while it is revealing the caret.
    expect(animate).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(editor)
    editor.setSelectionRange(0, 3)
    act(() => editor.dispatchEvent(new Event('input', { bubbles: true })))
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([0, 3])
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    editor.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
  } finally {
    if (descriptor) Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', descriptor)
    else delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight
  }
})

it('preserves explicit row-label lines and centers Stepper symbols in their buttons', () => {
  const container = mount(
    <ListContext value={true}>
      <Stepper label={'Time to prepare\nand cook: 30 min'} value={30} onChange={() => {}} />
    </ListContext>,
  )
  const label = container.querySelector('[data-satin-row-text]')!
  expect(label.textContent).toBe('Time to prepare\nand cook: 30 min')
  expect(getComputedStyle(label).whiteSpace).toBe('pre-wrap')
  for (const button of container.querySelectorAll('[data-satin-stepper] button')) {
    const css = getComputedStyle(button)
    expect(css.display).toBe('flex')
    expect(css.alignItems).toBe('center')
    expect(css.justifyContent).toBe('center')
  }
})

it('keeps ordinary List label insets separate from the plain-text Stepper calibration', () => {
  const container = mount(
    <ListContext value={true}>
      <Row
        label={
          <span>
            <span>Chat title</span>
            <span>Two-line preview</span>
            <span>9:41 AM</span>
          </span>
        }
      />
      <Row label={<RowLabelBody detail="Subtitle">Title</RowLabelBody>} />
      <Row label={'Ordinary\nstring label'} />
      <Stepper label={'Time to prepare\nand cook: 30 min'} value={30} onChange={() => {}} />
      <Row
        label={<RowLabelBody detail="Subtitle">Title</RowLabelBody>}
        trailing={<StepperControl label="Title" value={30} onChange={() => {}} />}
      />
    </ListContext>,
  )
  const labels = [...container.querySelectorAll('[data-satin-row-label="true"]')]
  expect(labels.map(label => getComputedStyle(label).paddingBlock)).toEqual([
    '10px',
    '10px',
    '10px',
    '10.166667px',
    '10px',
  ])
})
