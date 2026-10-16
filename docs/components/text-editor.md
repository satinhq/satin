# TextEditor

A field for editing multiple lines of text.

```tsx
import { TextEditor } from '@satinhq/kit'
```

## Example

Click the Notes field and type. Try the system keyboard on a device.

<!-- example: text-editor open -->

```tsx
import { useState } from 'react'
import { List, Screen, Section, TextEditor } from '@satinhq/kit'

function Example() {
  const [text, setText] = useState('')

  return (
    <Screen>
      <List id="example">
        <Section>
          <TextEditor label="Notes" value={text} onChange={setText} />
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

## Bound the editor's growth

Use `minLines` and `maxLines` to bound the editor's height. Return inserts a line break; use a separate Button for saving or sending the text.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `string` | The accessible name. |
| `value` | `string` | The current text. |
| `onChange` | `(value: string) => void` | Receives edited text. |
| `prompt` | `string` | Optional placeholder. |
| `minLines` | `number` | Minimum visible lines. |
| `maxLines` | `number` | Optional growth limit. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
