import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ScreenContext } from '../navigation/navigationContext.tsx'
import { Button } from './controls.tsx'
import { useControlStyle } from './controlStyle.tsx'

type DeviceActionProps<Result> = {
  children: ReactNode
  disabled?: boolean
  identity?: unknown
  start(): Promise<Result>
  onResult?(result: Result): void
  onError(error: Error): void
}

function DeviceAction<Result>({
  children,
  disabled,
  identity,
  start,
  onResult,
  onError,
}: DeviceActionProps<Result>) {
  const configuration = useControlStyle({ disabled })
  const screen = useContext(ScreenContext)
  const covered = screen?.lifecycle.isCovered ?? false
  const unavailable = configuration.disabled || covered
  const button = useRef<HTMLButtonElement>(null)
  const generation = useRef(0)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const callbacks = useRef({ onResult, onError })

  useLayoutEffect(() => {
    callbacks.current = { onResult, onError }
  })
  useLayoutEffect(() => {
    generation.current += 1
    return () => {
      generation.current += 1
    }
  }, [unavailable, screen?.key, identity])

  const activate = () => {
    const element = button.current
    if (pending.current || unavailable || !element?.isConnected) return
    if (element.closest('[inert], [aria-hidden="true"]')) return
    pending.current = true
    setBusy(true)
    const startedGeneration = generation.current
    const current = () =>
      startedGeneration === generation.current &&
      element.isConnected &&
      !element.closest('[inert], [aria-hidden="true"]')
    const finish = () => {
      pending.current = false
      if (element.isConnected) setBusy(false)
    }
    const failure = (reason: unknown) => {
      finish()
      if (current()) {
        callbacks.current.onError(reason instanceof Error ? reason : new Error(String(reason)))
      }
    }

    let operation: Promise<Result>
    try {
      // WebKit must see this call inside the original user gesture. No effect,
      // timer, file preparation or awaited work may precede it.
      operation = start()
    } catch (reason) {
      failure(reason)
      return
    }
    void operation.then(result => {
      finish()
      if (current()) callbacks.current.onResult?.(result)
    }, failure)
  }

  return (
    <Button ref={button} disabled={unavailable || busy} onPress={activate}>
      {children}
    </Button>
  )
}

/** The text, URL or files to share, the button content and the completion and error callbacks. */
export type ShareLinkProps = {
  item: ShareData
  children?: ReactNode
  disabled?: boolean
  /** Completion means the platform accepted the handoff, not that a recipient received it. */
  onCompletion?(): void
  /** Includes AbortError for dismissal or absence of a suitable share target. */
  onError(error: Error): void
}

/** A button that opens the system share sheet. Prepare file bytes before rendering, because the
 * sheet must open during the press. */
export function ShareLink({
  item,
  children = 'Share',
  disabled,
  onCompletion,
  onError,
}: ShareLinkProps) {
  return (
    <DeviceAction
      disabled={disabled}
      identity={item}
      onResult={onCompletion}
      onError={onError}
      start={() => {
        if (typeof navigator.share !== 'function') {
          throw new DOMException('System sharing is unavailable.', 'NotSupportedError')
        }
        if (
          item.files?.length &&
          (!navigator.canShare || !navigator.canShare({ files: item.files }))
        ) {
          throw new DOMException(
            'These files cannot be shared by this browser.',
            'NotSupportedError',
          )
        }
        return navigator.share(item)
      }}
    >
      {children}
    </DeviceAction>
  )
}

/** The button content and the callbacks that receive the pasted text or the error. */
export type PasteButtonProps = {
  children?: ReactNode
  disabled?: boolean
  onPaste(text: string): void
  /** Permission denial and dismissal are reported as browser errors. */
  onError(error: Error): void
}

/** A button that pastes plain text from the clipboard when pressed. It never reads the clipboard
 * before the press. The browser may ask the user to confirm. */
export function PasteButton({ children = 'Paste', disabled, onPaste, onError }: PasteButtonProps) {
  return (
    <DeviceAction
      disabled={disabled}
      onResult={onPaste}
      onError={onError}
      start={() => {
        if (typeof navigator.clipboard?.readText !== 'function') {
          throw new DOMException('Clipboard text reading is unavailable.', 'NotSupportedError')
        }
        return navigator.clipboard.readText()
      }}
    >
      {children}
    </DeviceAction>
  )
}
