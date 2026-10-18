# TextField

A field for editing a line of text.

```tsx
import { TextField } from '@satinhq/kit'
```

## Example

Click the Name field and type. Try the system keyboard on a device.

<!-- example: text-field open -->

```tsx
import { useState } from 'react'
import { List, Screen, Section, TextField } from '@satinhq/kit'

function Example() {
  const [text, setText] = useState('')

  return (
    <Screen>
      <List id="example">
        <Section>
          <TextField label="Name" value={text} onChange={setText} />
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

## Choose keyboard and Return behavior

Set `kind` to describe the value, such as `name`, `email` or `decimal`. `kind="search"` supplies search semantics and the Search return key by default. Satin uses the standard text keyboard for search so iOS does not substitute the web-search keyboard's Go key. `submitLabel` overrides the Return-key hint; `onSubmit` handles Return in a single-line field.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `string` | The accessible name. |
| `value` | `string` | The current text. |
| `onChange` | `(value: string) => void` | Receives edited text. |
| `prompt` | `string` | Optional placeholder. |
| `kind` | `TextFieldKind` | Keyboard and autofill intent. |
| `submitLabel` | `SubmitLabel` | Return-key hint. |
| `onSubmit` | `() => void` | Single-line Return action. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
