// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createPortal } from 'react-dom'
import { SensoryButton } from '../haptics/SensoryButton.tsx'
import { ContentUnavailableView } from '../public/controls.tsx'
import {
  PhotosPicker,
  FileImporter,
  ShareLink,
  PasteButton,
  ControlStyleProvider,
} from '../index.ts'
import { ScreenContext } from '../navigation/navigationContext.tsx'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Section, Row, SegmentedControl, StepperRow, ToggleRow } from './ListForm.tsx'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function button(label: string) {
  const element = [
    ...container.querySelectorAll<HTMLButtonElement>('button, [data-satin-sensory-button]'),
  ].find(
    candidate => candidate.getAttribute('aria-label') === label || candidate.textContent === label,
  )
  expect(element, `button ${label}`).toBeDefined()
  return element!
}

describe('controlled list and form controls', () => {
  it('cancels a photo contact outside the row without consuming the next native activation', () => {
    act(() =>
      root.render(<PhotosPicker label="Photo" selection={null} onSelectionChange={() => {}} />),
    )
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    const opened = vi.fn()
    Object.defineProperty(input, 'showPicker', { configurable: true, value: opened })
    Object.defineProperty(input, 'hasPointerCapture', { configurable: true, value: () => false })
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 52))
    const contact = (type: string, x: number) =>
      act(() => {
        input.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 81,
            pointerType: 'touch',
            isPrimary: true,
            button: 0,
            clientX: x,
            clientY: 26,
          }),
        )
      })
    const click = () =>
      act(() => {
        input.dispatchEvent(
          new PointerEvent('click', {
            bubbles: true,
            cancelable: true,
            pointerId: 81,
            pointerType: 'touch',
            detail: 1,
          }),
        )
      })
    contact('pointerdown', 100)
    contact('pointerup', 240)
    click()
    expect(opened).not.toHaveBeenCalled()
    contact('pointerdown', 100)
    contact('pointerup', 100)
    expect(opened).not.toHaveBeenCalled()
    click()
    expect(opened).toHaveBeenCalledTimes(1)
    expect(container.querySelector('button')).toBeNull()
    expect(input.disabled).toBe(false)
    contact('pointerdown', 100)
    act(() =>
      root.render(
        <PhotosPicker label="Photo" selection={null} disabled onSelectionChange={() => {}} />,
      ),
    )
    act(() =>
      root.render(<PhotosPicker label="Photo" selection={null} onSelectionChange={() => {}} />),
    )
    contact('pointerup', 100)
    click()
    expect(opened).toHaveBeenCalledTimes(1)
    contact('pointerdown', 100)
    contact('pointerup', 100)
    click()
    expect(opened).toHaveBeenCalledTimes(2)
  })

  it('notifies once per toggle activation and announces the consumer-updated value', () => {
    const changed = vi.fn()
    function Fixture() {
      const [checked, setChecked] = useState(false)
      return (
        <ToggleRow
          label="Reminders"
          checked={checked}
          onChange={value => {
            changed(value)
            setChecked(value)
          }}
        />
      )
    }
    act(() => root.render(<Fixture />))
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    act(() => toggle.click())
    expect(changed.mock.calls).toEqual([[true]])
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    act(() => toggle.click())
    expect(changed.mock.calls).toEqual([[true], [false]])
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('changes the selected segment once and moves the accessible selected state', () => {
    const changed = vi.fn()
    function Fixture() {
      const [value, setValue] = useState('day')
      return (
        <SegmentedControl
          label="Period"
          value={value}
          options={[
            { id: 'day', label: 'Day' },
            { id: 'week', label: 'Week' },
          ]}
          onChange={next => {
            changed(next)
            setValue(next)
          }}
        />
      )
    }
    act(() => root.render(<Fixture />))
    act(() => button('Week').click())
    expect(changed.mock.calls).toEqual([['week']])
    expect(button('Week').getAttribute('aria-pressed')).toBe('true')
    expect(button('Day').getAttribute('aria-pressed')).toBe('false')
  })

  it('clamps overshooting steps at both limits and ignores activation at each limit', () => {
    const changed = vi.fn()
    function Fixture() {
      const [value, setValue] = useState(2)
      return (
        <StepperRow
          label="Copies"
          value={value}
          min={0}
          max={3}
          step={2}
          onChange={next => {
            changed(next)
            setValue(next)
          }}
        />
      )
    }
    act(() => root.render(<Fixture />))
    act(() => button('Increase Copies, 2').click())
    expect(changed.mock.calls).toEqual([[3]])
    expect(button('Increase Copies, 3').disabled).toBe(true)
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Copies, 3')
    act(() => button('Increase Copies, 3').click())
    act(() => button('Decrease Copies, 3').click())
    act(() => button('Decrease Copies, 1').click())
    expect(changed.mock.calls).toEqual([[3], [1], [0]])
    expect(button('Decrease Copies, 0').disabled).toBe(true)
    act(() => button('Decrease Copies, 0').click())
    expect(changed).toHaveBeenCalledTimes(3)
  })

  it('disabled toggles, segments and steppers never notify consumers', () => {
    const changed = vi.fn()
    act(() =>
      root.render(
        <>
          <ToggleRow label="Reminders" checked disabled onChange={changed} />
          <SegmentedControl
            value="day"
            disabled
            onChange={changed}
            options={[
              { id: 'day', label: 'Day' },
              { id: 'week', label: 'Week' },
            ]}
          />
          <StepperRow label="Copies" value={1} disabled onChange={changed} />
        </>,
      ),
    )
    for (const control of container.querySelectorAll<HTMLButtonElement>(
      'button, [data-satin-sensory-button]',
    )) {
      expect(control.disabled || control.getAttribute('aria-disabled') === 'true').toBe(true)
      act(() => control.click())
    }
    expect(changed).not.toHaveBeenCalled()
    expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    expect(button('Day').getAttribute('aria-pressed')).toBe('true')
  })
})

it('keeps toggle keyboard activation single and cancels Space when focus leaves', () => {
  const changes: boolean[] = []
  act(() =>
    root.render(
      <ToggleRow label="Keyboard" checked={false} onChange={value => changes.push(value)} />,
    ),
  )
  const toggle = container.querySelector<HTMLElement>('[role="switch"]')!
  const key = (type: string, value: string, repeat = false) =>
    act(() => {
      toggle.dispatchEvent(
        new KeyboardEvent(type, { key: value, repeat, bubbles: true, cancelable: true }),
      )
    })
  key('keydown', 'Enter')
  key('keyup', 'Enter')
  act(() => toggle.click())
  expect(changes).toEqual([true])
  key('keydown', ' ')
  act(() => toggle.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
  key('keyup', ' ')
  expect(changes).toEqual([true])
  key('keydown', ' ')
  key('keyup', ' ')
  expect(changes).toEqual([true, true])
})

it('does not add haptic state to submitted form data', () => {
  act(() =>
    root.render(
      <form>
        <input name="title" defaultValue="Note" />
        <ToggleRow label="Sync" checked onChange={() => {}} />
      </form>,
    ),
  )
  const form = container.querySelector('form')!
  act(() => container.querySelector<HTMLElement>('[role="switch"]')!.click())
  expect([...new FormData(form).entries()]).toEqual([['title', 'Note']])
})

it('omits empty and nonvisual children from rows as opaque content changes', async () => {
  function MaybeRow({ visible }: { visible: boolean }) {
    return visible ? <Row label="Appeared" /> : null
  }
  function Fixture({ visible }: { visible: boolean }) {
    return (
      <Section>
        <MaybeRow visible={visible} />
        {false}
        {''}
        {createPortal(<span>Portal content</span>, document.body)}
        <input hidden type="file" />
        {/* A presentation (Sheet, Alert) declared in a section shows in the top layer. */}
        <dialog open>Presented</dialog>
        <Row label="Always here" />
        <ContentUnavailableView title="No items" />
        <MaybeRow visible={false} />
      </Section>
    )
  }
  for (const visible of [false, true, false]) {
    await act(async () => root.render(<Fixture visible={visible} />))
    expect(
      [...container.querySelectorAll('[role="listitem"]')].map(row => row.textContent),
    ).toEqual(visible ? ['Appeared', 'Always here', 'No items'] : ['Always here', 'No items'])
    expect(container.querySelector('input')?.closest('[role="listitem"]')).toBeNull()
    expect(container.querySelector('dialog')?.closest('[role="listitem"]')).toBeNull()
    expect(document.body.textContent).toContain('Portal content')
  }
})
function contact(element: HTMLButtonElement, type: string) {
  act(() =>
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 41,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerdown' ? 1 : 0,
        clientX: 10,
        clientY: 10,
      }),
    ),
  )
}
function prepareStepperButton() {
  const increase = container.querySelector<HTMLButtonElement>('button[aria-label^="Increase"]')!
  vi.spyOn(increase, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 100,
    bottom: 44,
  } as DOMRect)
  Object.defineProperty(increase, 'hasPointerCapture', { value: () => false, configurable: true })
  return increase
}
it('repeats a held Stepper and stops at its bound without another release increment', () => {
  vi.useFakeTimers()
  function Fixture() {
    const [value, setValue] = useState(0)
    return <StepperRow label="Reps" value={value} min={0} max={3} onChange={setValue} />
  }
  try {
    act(() => root.render(<Fixture />))
    const increase = prepareStepperButton()
    contact(increase, 'pointerdown')
    for (let step = 0; step < 4; step++) act(() => vi.advanceTimersByTime(500))
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Reps, 3')
    expect(increase.disabled).toBe(true)
    contact(increase, 'pointerup')
    act(() => vi.advanceTimersByTime(2000))
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Reps, 3')
  } finally {
    vi.useRealTimers()
    vi.restoreAllMocks()
  }
})
it('cancels Stepper repetition when WebKit takes the contact for scrolling', async () => {
  vi.useFakeTimers()
  function Fixture() {
    const [value, setValue] = useState(0)
    return <StepperRow label="Reps" value={value} onChange={setValue} />
  }
  try {
    act(() => root.render(<Fixture />))
    const increase = prepareStepperButton()
    contact(increase, 'pointerdown')
    act(() => vi.advanceTimersByTime(500))
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Reps, 1')
    contact(increase, 'pointercancel')
    act(() => vi.advanceTimersByTime(2000))
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Reps, 1')
    await act(async () => {})
    act(() => increase.click())
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Reps, 2')
  } finally {
    vi.useRealTimers()
    vi.restoreAllMocks()
  }
})

it('completes an action with feedback explicitly disabled', () => {
  function Fixture() {
    const [completed, setCompleted] = useState(false)
    return (
      <SensoryButton sensoryFeedback={false} onPress={() => setCompleted(true)}>
        {completed ? 'Saved' : 'Save'}
      </SensoryButton>
    )
  }
  act(() => root.render(<Fixture />))
  act(() => container.querySelector<HTMLElement>('[role="button"]')!.click())
  expect(container.textContent).toBe('Saved')
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
})

it('preserves accepted photos on cancel and accepts repeated choices of the same file', async () => {
  const file = new File(['image bytes'], 'photo.png', { type: 'image/png' })
  const accepted: File[] = []
  let clear: () => void = () => {}
  function Fixture() {
    const [value, setValue] = useState<File | null>(file)
    clear = () => setValue(null)
    return (
      <>
        <PhotosPicker
          label="Photo Library"
          selection={value}
          onSelectionChange={next => {
            accepted.push(next)
            setValue(next)
          }}
        />
        <output>{value?.name ?? 'No photo'}</output>
      </>
    )
  }
  act(() => root.render(<Fixture />))
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  expect(container.querySelectorAll('input, button, [tabindex]')).toHaveLength(1)
  expect(document.getElementById(input.getAttribute('aria-labelledby')!)?.textContent).toBe(
    'Photo Library',
  )
  act(() => input.dispatchEvent(new Event('cancel', { bubbles: true })))
  input.files = new DataTransfer().files
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  expect(container.querySelector('output')?.textContent).toBe('photo.png')
  expect(accepted).toEqual([])
  for (let choice = 0; choice < 2; choice += 1) {
    input.click()
    const selection = new DataTransfer()
    selection.items.add(file)
    input.files = selection.files
    expect(input.value).toContain('photo.png')
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(input.value).toBe('')
  }
  expect(accepted).toEqual([file, file])
  act(clear)
  expect(container.querySelector('output')?.textContent).toBe('No photo')
})

it('rejects stale photo delivery across disabled or replaced owners and reports activation errors', async () => {
  const file = new File(['image bytes'], 'photo.png', { type: 'image/png' })
  const accepted: File[] = []
  const errors: Error[] = []
  const renderPicker = (disabled: boolean, editor = 'first') =>
    root.render(
      <ControlStyleProvider disabled={disabled}>
        <PhotosPicker
          key={editor}
          label="Photo Library"
          selection={null}
          disabled={false}
          onSelectionChange={next => accepted.push(next)}
          onError={error => errors.push(error)}
        />
      </ControlStyleProvider>,
    )
  const input = () => container.querySelector<HTMLInputElement>('input[type="file"]')!
  const choose = () => {
    Object.defineProperty(input(), 'showPicker', { configurable: true, value: () => {} })
    input().click()
    const selection = new DataTransfer()
    selection.items.add(file)
    input().files = selection.files
    input().dispatchEvent(new Event('change', { bubbles: true }))
  }
  act(() => renderPicker(false))
  const failure = new DOMException('Activation unavailable', 'NotAllowedError')
  Object.defineProperty(input(), 'showPicker', {
    configurable: true,
    value: () => {
      throw failure
    },
  })
  act(() => input().click())
  expect(errors).toEqual([failure])
  act(choose)
  act(() => renderPicker(true))
  expect(input().disabled).toBe(true)
  await act(async () => {
    input().click()
    choose()
  })
  expect(accepted).toEqual([])
  act(() => renderPicker(false))
  act(choose)
  act(() => renderPicker(false, 'second'))
  await act(async () => {})
  expect(accepted).toEqual([])
  await act(async () => choose())
  expect(accepted).toEqual([file])
})

it('rejects a chooser opened before owner disable, coverage or a controlled draft replacement', async () => {
  const original = new File(['original'], 'original.png', { type: 'image/png' })
  const replacement = new File(['replacement'], 'replacement.png', { type: 'image/png' })
  const late = new File(['late'], 'late.png', { type: 'image/png' })
  const accepted: File[] = []
  const scrollRegistry = createScrollSurfaceRegistry()
  const renderPicker = (disabled: boolean, value: File | null, isCovered = false) =>
    root.render(
      <ScreenContext.Provider
        value={{
          key: 'draft',
          params: undefined,
          scrollRegistry,
          lifecycle: { isCovered, phase: 'settled' },
        }}
      >
        <PhotosPicker
          label="Photo Library"
          selection={value}
          disabled={disabled}
          onSelectionChange={file => accepted.push(file)}
        />
      </ScreenContext.Provider>,
    )
  act(() => renderPicker(false, original))
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'showPicker', { value: () => {} })
  const deliver = async () => {
    const selection = new DataTransfer()
    selection.items.add(late)
    input.files = selection.files
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  }
  act(() => input.click())
  act(() => renderPicker(true, original))
  act(() => renderPicker(false, original))
  await deliver()
  expect(accepted).toEqual([])
  act(() => input.click())
  act(() => renderPicker(false, replacement))
  await deliver()
  expect(accepted).toEqual([])
  act(() => input.click())
  act(() => renderPicker(false, replacement, true))
  act(() => renderPicker(false, replacement, false))
  await deliver()
  expect(accepted).toEqual([])
  act(() => input.click())
  await deliver()
  expect(accepted).toEqual([late])
})

it('imports multiple file bytes and gives PhotosPicker the requested media and capture preferences', async () => {
  const files: File[][] = []
  act(() =>
    root.render(
      <FileImporter
        selection={[]}
        allowedContentTypes={['text/plain', '.pdf']}
        allowsMultipleSelection
        onSelectionChange={next => files.push(next)}
      />,
    ),
  )
  const input = container.querySelector<HTMLInputElement>('input')!
  expect(input.accept).toBe('text/plain,.pdf')
  expect(input.multiple).toBe(true)
  input.click()
  const selection = new DataTransfer()
  const first = new File(['one'], 'one.txt', { type: 'text/plain' })
  const second = new File(['two'], 'two.txt', { type: 'text/plain' })
  selection.items.add(first)
  selection.items.add(second)
  input.files = selection.files
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  expect(files).toEqual([[first, second]])
  act(() =>
    root.render(
      <PhotosPicker
        selection={null}
        matching="videos"
        capture="environment"
        onSelectionChange={() => {}}
      />,
    ),
  )
  expect(container.querySelector('input')?.getAttribute('accept')).toBe('video/*')
  expect(container.querySelector('input')?.getAttribute('capture')).toBe('environment')
})

it('starts sharing in the press, preserves attachments, and reports dismissal without completion', async () => {
  const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share')
  const originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare')
  const file = new File(['note'], 'note.txt', { type: 'text/plain' })
  const item = { files: [file], text: 'Note' }
  const errors: Error[] = []
  let completed = false
  let rejectShare: (reason: Error) => void = () => {}
  let received: ShareData | undefined
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: (data: ShareData) => {
      received = data
      return new Promise<void>((_, reject) => {
        rejectShare = reject
      })
    },
  })
  try {
    act(() =>
      root.render(
        <ShareLink
          item={item}
          onCompletion={() => {
            completed = true
          }}
          onError={error => errors.push(error)}
        />,
      ),
    )
    act(() => {
      button('Share').click()
      expect(received).toEqual(item)
    })
    expect(button('Share').disabled).toBe(true)
    await act(async () => rejectShare(new DOMException('Dismissed', 'AbortError')))
    expect(errors[0]?.name).toBe('AbortError')
    expect(completed).toBe(false)
    expect(button('Share').disabled).toBe(false)
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false })
    received = undefined
    act(() => button('Share').click())
    expect(received).toBeUndefined()
    expect(errors[1]?.name).toBe('NotSupportedError')
  } finally {
    if (originalShare) Object.defineProperty(navigator, 'share', originalShare)
    else Reflect.deleteProperty(navigator, 'share')
    if (originalCanShare) Object.defineProperty(navigator, 'canShare', originalCanShare)
    else Reflect.deleteProperty(navigator, 'canShare')
  }
})

it('pastes only on activation and rejects delivery after the draft is replaced', async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  let deliver: (text: string) => void = () => {}
  let reading = false
  const pasted: string[] = []
  const errors: Error[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: () => {
        reading = true
        return new Promise<string>(resolve => {
          deliver = resolve
        })
      },
    },
  })
  const render = (key: string) =>
    root.render(
      <PasteButton
        key={key}
        onPaste={text => pasted.push(text)}
        onError={error => errors.push(error)}
      />,
    )
  try {
    act(() => render('first'))
    expect(reading).toBe(false)
    act(() => {
      button('Paste').click()
      expect(reading).toBe(true)
    })
    act(() => render('second'))
    await act(async () => deliver('old draft'))
    expect(pasted).toEqual([])
    act(() => button('Paste').click())
    await act(async () => deliver('new draft'))
    expect(pasted).toEqual(['new draft'])
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
      },
    })
    await act(async () => button('Paste').click())
    expect(errors[0]?.name).toBe('NotAllowedError')
    expect(pasted).toEqual(['new draft'])
  } finally {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
})
