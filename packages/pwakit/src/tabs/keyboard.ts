import type { KeyboardEvent } from 'react'

/** Shared roving focus for the floating tab bar and its sidebar representation. */
export function handleTabKeyDown(event: KeyboardEvent<HTMLElement>) {
  const enabled = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
  ].filter(button => !button.closest('[hidden], [inert]'))
  const current = enabled.indexOf(event.target as HTMLButtonElement)
  if (current < 0) return
  const next =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? (current + 1) % enabled.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? (current + enabled.length - 1) % enabled.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? enabled.length - 1
            : undefined
  if (next === undefined) return
  event.preventDefault()
  enabled[next]!.focus()
  enabled[next]!.click()
}
