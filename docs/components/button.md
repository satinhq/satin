# Button

A control that runs an action when pressed.

```tsx
import { Button, LabeledContent } from '@satinhq/kit'
```

## Example

Click Add Book to increase the count.

<!-- example: button open -->

```tsx
import { useState } from 'react'
import { Button, LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  const [count, setCount] = useState(0)

  return (
    <Screen>
      <List id="example">
        <Section>
          <Button symbol="plus" onPress={() => setCount(count + 1)}>
            Add Book
          </Button>
          <LabeledContent label="Books added" value={count} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Handle a press

Pass a function to `onPress`. Change state in that function to update the screen.

## Choose a role or style

Use `role="destructive"` for destructive actions. The automatic style adapts to a list or toolbar. Explicit `buttonStyle` values include `plain`, `bordered`, `borderedProminent` and `glass`.

## Use an icon alone

Set `iconOnly` and supply `aria-label`. The accessible label names the action.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `onPress` | `() => void` | Called after a press. |
| `symbol` | `SymbolName` | Optional icon. |
| `role` | `ButtonRole` | An optional semantic role. |
| `disabled` | `boolean` | Prevents activation. |
| `buttonStyle` | `BuiltInButtonStyle \| `buttonStyle(_:)` | Automatic contextual style by default. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).

Button and Pressable keep their intrinsic label width in rows, stacks and grid cells. To fill the available width, give the immediate label a content frame with `maxWidth: 'infinity'`. A row-style automatic Button in List retains the List row allocation.
