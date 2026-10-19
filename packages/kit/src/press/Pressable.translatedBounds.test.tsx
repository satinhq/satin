// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESSABLE_RETENTION_OFFSET_PX, ROW_HIGHLIGHT_DELAY_MS } from './tokens.ts'
import { Pressable } from './Pressable.tsx'
import { defineResource } from '../data/resource.ts'
import { resetPointerClickSuppression } from './activation.ts'
import { cancelPointerPressForOwnedGesture } from './gestureArbitration.ts'

const POINTER_ID = 7
const initialBounds = new DOMRect(20, 80, 120, 80)
const translatedBounds = new DOMRect(180, 80, 120, 80)
const releasePaths = [
  { path: 'without an intervening move', moveBeforeRelease: false },
  { path: 'after an intervening move', moveBeforeRelease: true },
]

let container: HTMLDivElement
let root: Root
let button: HTMLButtonElement
let currentBounds: DOMRect
let onPress: ReturnType<typeof vi.fn<() => void>>

function dispatchPointer(type: string, clientX: number) {
  act(() => {
    button.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: POINTER_ID,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX,
        clientY: 120,
      }),
    )
  })
}

function dispatchClick() {
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
}

function translateOwningScreen() {
  container.style.transform = 'translateX(160px)'
  currentBounds = translatedBounds
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(performance, 'now').mockReturnValue(1_000)
  resetPointerClickSuppression()
  currentBounds = initialBounds
  onPress = vi.fn<() => void>()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root.render(<Pressable onPress={onPress}>Save</Pressable>)
  })
  button = container.querySelector('button')!
  vi.spyOn(button, 'getBoundingClientRect').mockImplementation(() => currentBounds)
  // DOM emulation has no native implicit touch capture; dispatch to the captured control directly.
  Object.defineProperty(button, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  resetPointerClickSuppression()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Pressable release bounds when its owning screen moves', () => {
  it('activates once when released inside a stationary button, including the synthesized click', () => {
    dispatchPointer('pointerdown', 80)
    dispatchPointer('pointerup', 80)
    expect(onPress).toHaveBeenCalledTimes(1)

    dispatchClick()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it.each(releasePaths)(
    'activates exactly once inside the translated button $path',
    ({ moveBeforeRelease }) => {
      dispatchPointer('pointerdown', 80)
      translateOwningScreen()
      if (moveBeforeRelease) {
        dispatchPointer('pointermove', 240)
        expect(button.dataset.satinPressState).toBe('pressed')
      }
      dispatchPointer('pointerup', 240)

      expect(onPress).toHaveBeenCalledTimes(1)
      dispatchClick()
      expect(onPress).toHaveBeenCalledTimes(1)
    },
  )

  it.each(releasePaths)(
    "does not activate at the translated button's abandoned position $path",
    ({ moveBeforeRelease }) => {
      dispatchPointer('pointerdown', 80)
      translateOwningScreen()
      if (moveBeforeRelease) {
        dispatchPointer('pointermove', 80)
        expect(button.dataset.satinPressState).toBe('deactivated')
      }
      dispatchPointer('pointerup', 80)

      expect(onPress).not.toHaveBeenCalled()
      dispatchClick()
      expect(onPress).not.toHaveBeenCalled()
    },
  )

  it('remeasures on release when the target moves again after the last move', () => {
    dispatchPointer('pointerdown', 80)
    translateOwningScreen()
    dispatchPointer('pointermove', 240)
    currentBounds = initialBounds
    container.style.transform = ''
    dispatchPointer('pointerup', 240)
    dispatchClick()

    expect(onPress).not.toHaveBeenCalled()
  })

  it.each([
    { feedback: 'opacity', outsideBy: PRESSABLE_RETENTION_OFFSET_PX, fires: true },
    { feedback: 'opacity', outsideBy: PRESSABLE_RETENTION_OFFSET_PX + 1, fires: false },
    { feedback: 'row', outsideBy: 0, fires: true },
    { feedback: 'row', outsideBy: 1, fires: false },
  ] as const)(
    'preserves $feedback retention at $outsideBy points outside the current bounds',
    ({ feedback, outsideBy, fires }) => {
      act(() =>
        root.render(
          <Pressable feedback={feedback} onPress={onPress}>
            Save
          </Pressable>,
        ),
      )
      dispatchPointer('pointerdown', 80)
      translateOwningScreen()
      dispatchPointer('pointerup', translatedBounds.right + outsideBy)
      dispatchClick()

      expect(onPress).toHaveBeenCalledTimes(fires ? 1 : 0)
    },
  )

  it('does not activate after a scroll owner cancels the press on a translated screen', () => {
    dispatchPointer('pointerdown', 80)
    translateOwningScreen()
    act(() => {
      expect(cancelPointerPressForOwnedGesture(POINTER_ID)).toBe(true)
    })
    dispatchPointer('pointermove', 240)
    dispatchPointer('pointerup', 240)
    dispatchClick()

    expect(onPress).not.toHaveBeenCalled()
    expect(button.getAttribute('data-satin-press-state')).toBe('idle')
  })
})

describe('row feedback integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    act(() =>
      root.render(
        <Pressable feedback="row" onPress={onPress}>
          Save
        </Pressable>,
      ),
    )
  })
  afterEach(() => vi.useRealTimers())
  it('keeps a quick tap unhighlighted and activates once', () => {
    dispatchPointer('pointerdown', 80)
    expect(button.dataset.satinRowFeedback).toBe('pending')
    act(() => vi.advanceTimersByTime(70))
    dispatchPointer('pointerup', 80)
    expect(button.dataset.satinRowFeedback).toBe('idle')
    dispatchClick()
    expect(onPress).toHaveBeenCalledTimes(1)
  })
  it('highlights a hold after the delay and fades on release', () => {
    dispatchPointer('pointerdown', 80)
    act(() => vi.advanceTimersByTime(ROW_HIGHLIGHT_DELAY_MS - 1))
    expect(button.dataset.satinRowFeedback).toBe('pending')
    act(() => vi.advanceTimersByTime(1))
    expect(button.dataset.satinRowFeedback).toBe('pressed')
    dispatchPointer('pointerup', 80)
    expect(button.dataset.satinRowFeedback).toBe('releasing')
  })
  it('does not flash after scroll cancellation or leave a delayed timer alive', () => {
    dispatchPointer('pointerdown', 80)
    act(() => cancelPointerPressForOwnedGesture(POINTER_ID))
    expect(button.dataset.satinRowFeedback).toBe('idle')
    act(() => vi.advanceTimersByTime(300))
    dispatchPointer('pointerup', 80)
    expect(button.dataset.satinRowFeedback).toBe('idle')
    expect(onPress).not.toHaveBeenCalled()
  })
})

it('keeps a quick tap unhighlighted when the action temporarily disables the row', () => {
  act(() =>
    root.render(
      <Pressable feedback="row" onPress={onPress}>
        Save
      </Pressable>,
    ),
  )
  dispatchPointer('pointerdown', 80)
  dispatchPointer('pointerup', 80)
  act(() =>
    root.render(
      <Pressable feedback="row" disabled onPress={onPress}>
        Save
      </Pressable>,
    ),
  )
  expect(button.dataset.satinRowFeedback).toBe('idle')
})

function contact(control: HTMLButtonElement, type: string, pointerId: number, primary = true) {
  act(() =>
    control.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: primary,
        button: 0,
        clientX: 80,
        clientY: 120,
      }),
    ),
  )
}
function compatibility(control: HTMLButtonElement, pointerId: number) {
  act(() =>
    control.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
        pointerId,
        pointerType: 'touch',
      }),
    ),
  )
}
it.each([false, true])('counts each rapid tap once, same control = %s', same => {
  const secondPress = vi.fn()
  act(() =>
    root.render(
      <>
        <Pressable onPress={onPress}>First</Pressable>
        <Pressable onPress={secondPress}>Second</Pressable>
      </>,
    ),
  )
  const controls = [...container.querySelectorAll('button')]
  for (const control of controls) {
    vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(initialBounds)
    Object.defineProperty(control, 'hasPointerCapture', { value: () => false })
  }
  const second = controls[same ? 0 : 1]
  contact(controls[0], 'pointerdown', -7)
  contact(controls[0], 'pointerup', -7)
  contact(second, 'pointerdown', same ? -7 : -8)
  contact(second, 'pointerup', same ? -7 : -8)
  compatibility(controls[0], -7)
  compatibility(second, same ? -7 : -8)
  expect(onPress).toHaveBeenCalledTimes(same ? 2 : 1)
  expect(secondPress).toHaveBeenCalledTimes(same ? 0 : 1)
})
it('counts only the accepted contact when fingers overlap on a button', () => {
  contact(button, 'pointerdown', 1)
  contact(button, 'pointerdown', 2, false)
  contact(button, 'pointerup', 2, false)
  compatibility(button, 2)
  contact(button, 'pointerup', 1)
  compatibility(button, 1)
  expect(onPress).toHaveBeenCalledTimes(1)
})
it('keeps a late click from activating the control revealed by unmount', () => {
  const revealed = vi.fn()
  onPress.mockImplementation(() =>
    root.render(
      <Pressable key="revealed" onPress={revealed}>
        Revealed
      </Pressable>,
    ),
  )
  contact(button, 'pointerdown', 1)
  contact(button, 'pointerup', 1)
  const nextButton = container.querySelector('button')!
  vi.spyOn(nextButton, 'getBoundingClientRect').mockReturnValue(initialBounds)
  Object.defineProperty(nextButton, 'hasPointerCapture', { value: () => false })
  contact(nextButton, 'pointerdown', 2)
  compatibility(nextButton, 1)
  contact(nextButton, 'pointerup', 2)
  compatibility(nextButton, 2)
  expect(onPress).toHaveBeenCalledTimes(1)
  expect(revealed).toHaveBeenCalledTimes(1)
})

it('starts data on contact, abandons a scroll, and hands a released request to its destination', async () => {
  const requests: { signal: AbortSignal; resolve: (value: string) => void }[] = []
  const messages = defineResource(
    (_id: string, signal) =>
      new Promise<string>(resolve => {
        requests.push({ signal, resolve })
      }),
  )
  let destination: Promise<string> | undefined
  act(() =>
    root.render(
      <Pressable
        feedback="row"
        prefetch={signal => messages.prefetch('mail', signal)}
        onPress={() => {
          destination = messages.load('mail')
        }}
      >
        Read
      </Pressable>,
    ),
  )
  dispatchPointer('pointerdown', 60)
  await act(async () => {})
  expect(requests[0]!.signal.aborted).toBe(false)
  expect(destination).toBeUndefined()
  act(() => cancelPointerPressForOwnedGesture(POINTER_ID))
  expect(requests[0]!.signal.aborted).toBe(true)
  requests[0]!.resolve('Obsolete mail')
  await act(async () => {})
  expect(messages.getSnapshot('mail').hasData).toBe(false)
  dispatchPointer('pointerdown', 60)
  await act(async () => {})
  dispatchPointer('pointerup', 60)
  act(() => root.render(null))
  expect(requests[1]!.signal.aborted).toBe(false)
  requests[1]!.resolve('Full message')
  expect(await destination).toBe('Full message')
  expect(requests).toHaveLength(2)
})
