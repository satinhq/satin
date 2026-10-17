import type { InputHTMLAttributes } from 'react'

/** What a field holds, setting its keyboard, autofill and autocorrection together. */
export type TextFieldKind =
  | 'text'
  | 'name'
  | 'email'
  | 'url'
  | 'tel'
  | 'number'
  | 'decimal'
  | 'search'
  | 'username'
  | 'new-password'
  | 'current-password'
  | 'one-time-code'
/** The return key's title: `done`, `go`, `next`, `search` or `send`. */
export type SubmitLabel = 'done' | 'go' | 'next' | 'search' | 'send'
type Attributes = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | 'type'
  | 'inputMode'
  | 'autoComplete'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'spellCheck'
  | 'enterKeyHint'
>
const plain: Attributes = {
  type: 'text',
  inputMode: 'text',
  autoComplete: 'off',
  autoCapitalize: 'sentences',
  autoCorrect: 'on',
  spellCheck: true,
  enterKeyHint: 'done',
}
const literal: Attributes = {
  ...plain,
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
}
const kinds: Record<TextFieldKind, Attributes> = {
  text: plain,
  name: { ...plain, autoComplete: 'name', autoCapitalize: 'words', spellCheck: false },
  email: { ...literal, type: 'email', inputMode: 'email', autoComplete: 'email' },
  url: { ...literal, type: 'url', inputMode: 'url', autoComplete: 'url', enterKeyHint: 'go' },
  tel: { ...literal, type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
  // Strings preserve leading zeros and incomplete decimal entry. Numeric HTML
  // inputs sanitize values and do not support the normal selection API.
  number: { ...literal, inputMode: 'numeric' },
  decimal: { ...literal, inputMode: 'decimal' },
  search: { ...plain, type: 'search', inputMode: 'search', enterKeyHint: 'search' },
  username: { ...literal, autoComplete: 'username' },
  'new-password': { ...literal, type: 'password', autoComplete: 'new-password' },
  'current-password': { ...literal, type: 'password', autoComplete: 'current-password' },
  'one-time-code': { ...literal, inputMode: 'numeric', autoComplete: 'one-time-code' },
}
export function textFieldAttributes(
  kind: TextFieldKind = 'text',
  submitLabel?: SubmitLabel,
): Attributes {
  return { ...kinds[kind], ...(submitLabel ? { enterKeyHint: submitLabel } : {}) }
}
