# SecureField

A field that hides password characters.

```tsx
import { SecureField } from '@satinhq/kit'
```

## Example

Click the Password field and type. Try the system keyboard on a device.

<!-- example: secure-field open -->

```tsx
import { useState } from 'react'
import { List, Screen, Section, SecureField } from '@satinhq/kit'

function Example() {
  const [text, setText] = useState('')

  return (
    <Screen>
      <List id="example">
        <Section>
          <SecureField label="Password" value={text} onChange={setText} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Bind the text

Keep the text in React state. Pass the string to `value` and its setter to `onChange`.

## Name the field

Use `label` for its accessible name. A `prompt` supplies placeholder text when the field is empty.

## Choose password autofill

`kind="current-password"` is the default. Use `kind="new-password"` when creating a password. `submitLabel` supplies the Return-key hint; `onSubmit` handles Return.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `string` | The accessible name. |
| `value` | `string` | The current text. |
| `onChange` | `(value: string) => void` | Receives edited text. |
| `prompt` | `string` | Optional placeholder. |
| `kind` | `'current-password' \| 'new-password'` | Password autofill intent. |
| `submitLabel` | `SubmitLabel` | Return-key hint. |
| `onSubmit` | `() => void` | Return action. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
