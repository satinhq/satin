# Toggle

A control for a Boolean setting.

```tsx
import { Toggle } from '@satinhq/kit'
```

## Example

Click Download over Wi-Fi to turn it off and on.

<!-- example: toggle open -->

```tsx
import { useState } from 'react'
import { List, Screen, Section, Toggle } from '@satinhq/kit'

function Example() {
  const [enabled, setEnabled] = useState(true)

  return (
    <Screen>
      <List id="example">
        <Section>
          <Toggle label="Download over Wi-Fi" isOn={enabled} onChange={setEnabled} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Bind the value

Pass a Boolean to `isOn` and a setter to `onChange`.

## Place it in a row

Inside a List or Form, Toggle renders its label and switch as one row. Keep the label descriptive.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `string` | The setting name. |
| `isOn` | `boolean` | The current value. |
| `onChange` | `(isOn: boolean) => void` | Receives the new value. |
| `disabled` | `boolean` | Prevents changes. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
