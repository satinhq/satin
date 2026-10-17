import { afterEach, describe, expect, it } from 'vitest'
import {
  POINTER_CLICK_SUPPRESSION_WINDOW_MS,
  armPointerClickSuppression,
  beginKeyboardActivation,
  consumePointerClickSuppression,
  releaseKeyboardActivation,
  resetPointerClickSuppression,
  resolveClickActivation,
} from './activation.ts'

afterEach(() => {
  resetPointerClickSuppression()
})

describe('Pressable activation sessions', () => {
  it('fires held Enter once and suppresses every synthesized repeat click', () => {
    const first = beginKeyboardActivation(undefined, 'Enter')
    const repeated = beginKeyboardActivation(first.session, 'Enter')
    const firstClick = resolveClickActivation(first.session)
    const repeatClick = resolveClickActivation(firstClick.session)
    const released = releaseKeyboardActivation(repeatClick.session, 'Enter')

    expect(first).toMatchObject({ fire: true, started: true })
    expect(repeated).toMatchObject({ fire: false, started: false })
    expect(firstClick).toMatchObject({ fire: false })
    expect(repeatClick).toMatchObject({ fire: false })
    expect(released).toMatchObject({ fire: false, session: { released: true } })
  })

  it('fires Space once on release and consumes its synthesized click', () => {
    const pressed = beginKeyboardActivation(undefined, ' ')
    const released = releaseKeyboardActivation(pressed.session, ' ')
    const click = resolveClickActivation(released?.session)

    expect(pressed.fire).toBe(false)
    expect(released?.fire).toBe(true)
    expect(click).toEqual({ fire: false, session: undefined })
  })

  it('honors an assistive-technology click with no session or pointer receipt', () => {
    expect(resolveClickActivation(undefined)).toEqual({
      fire: true,
      session: undefined,
    })
    expect(consumePointerClickSuppression(0)).toBe(false)
  })
})

describe('shared pointer click suppression', () => {
  it('consumes the synthesized click of an accepted release exactly once', () => {
    armPointerClickSuppression(1_000)
    expect(consumePointerClickSuppression(1_050)).toBe(true)
    expect(consumePointerClickSuppression(1_060)).toBe(false)
  })

  it('keeps a rejected release from falling through to click activation', () => {
    armPointerClickSuppression(2_000)
    expect(consumePointerClickSuppression(2_010)).toBe(true)
  })

  it('expires so a later sessionless click activates normally', () => {
    armPointerClickSuppression(1_000)
    expect(consumePointerClickSuppression(1_001 + POINTER_CLICK_SUPPRESSION_WINDOW_MS)).toBe(false)
  })

  it('re-arms per release for rapid sequential taps', () => {
    armPointerClickSuppression(1_000)
    expect(consumePointerClickSuppression(1_040)).toBe(true)
    armPointerClickSuppression(1_200)
    expect(consumePointerClickSuppression(1_240)).toBe(true)
  })
})

it('includes the Pressable 1000 ms release boundary and consumes only once', () => {
  armPointerClickSuppression(100)
  expect(consumePointerClickSuppression(1100)).toBe(true)
  expect(consumePointerClickSuppression(1100)).toBe(false)
})
