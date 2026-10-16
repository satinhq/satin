export type PressKey = 'Enter' | ' '

export type KeyboardActivationSession = Readonly<{
  fired: boolean
  key: PressKey
  released: boolean
  source: 'keyboard'
}>

export type ClickDedupSession = KeyboardActivationSession

export type KeyboardActivationResult = Readonly<{
  fire: boolean
  session: KeyboardActivationSession
  started: boolean
}>

export function beginKeyboardActivation(
  current: KeyboardActivationSession | undefined,
  key: PressKey,
): KeyboardActivationResult {
  if (current && !current.released) {
    return { fire: false, session: current, started: false }
  }

  const fire = key === 'Enter'
  return {
    fire,
    session: { fired: fire, key, released: false, source: 'keyboard' },
    started: true,
  }
}

export function releaseKeyboardActivation(
  current: KeyboardActivationSession | undefined,
  key: PressKey,
): KeyboardActivationResult | undefined {
  if (!current || current.key !== key || current.released) return undefined

  return {
    fire: !current.fired,
    session: { ...current, fired: true, released: true },
    started: false,
  }
}

export function resolveClickActivation(
  session: ClickDedupSession | undefined,
): Readonly<{ fire: boolean; session: ClickDedupSession | undefined }> {
  if (!session) return { fire: true, session: undefined }
  if (!session.released) return { fire: false, session }
  return { fire: false, session: undefined }
}

export {
  PRESS_CONTACT_CLICK_WINDOW_MS as POINTER_CLICK_SUPPRESSION_WINDOW_MS,
  armPointerClickSuppression,
  consumePointerClickSuppression,
  resetPointerClickSuppression,
} from './contactReceipt.ts'
