# Stepper

A control that increases or decreases a number.

```tsx
import { Stepper } from '@satinhq/kit'
```

## Example

Click the plus button to increase the number of copies.

<!-- example: stepper open -->

```tsx
import { useState } from 'react'
import { List, Screen, Section, Stepper } from '@satinhq/kit'

function Example() {
  const [copies, setCopies] = useState(1)

  return (
    <Screen>
      <List id="example">
        <Section>
          <Stepper
            label={`Copies: ${copies}`}
            value={copies}
            onChange={setCopies}
            min={1}
            max={8}
          />
        </Section>
      </List>
    </Screen>
  )
}
```

## Set the range

Use `min` and `max` to bound the value. At a limit, the corresponding button becomes disabled.

## Choose the increment

`step` defaults to 1. Use a different positive step for the unit your field needs.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `string` | The visible label. |
| `value` | `number` | The current value. |
| `onChange` | `(value: number) => void` | Receives changes. |
| `min / max` | `number` | Optional limits. |
| `step` | `number` | The increment, 1 by default. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
