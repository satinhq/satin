# ContentUnavailableView

A message for a screen with no content to show.

```tsx
import { ContentUnavailableView, Button } from '@satinhq/kit'
```

## Example

Click New Note to replace the empty screen with a note.

<!-- example: empty-state open -->

```tsx
import { useState } from 'react'
import { Button, ContentUnavailableView, List, Screen, Section } from '@satinhq/kit'

function Example() {
  const [created, setCreated] = useState(false)

  return (
    <Screen>
      {created ? (
        <List id="notes">
          <Section>First note</Section>
        </List>
      ) : (
        <ContentUnavailableView title="No notes" description="Create your first note.">
          <Button onPress={() => setCreated(true)}>New Note</Button>
        </ContentUnavailableView>
      )}
    </Screen>
  )
}
```

## Explain the empty screen

Use `title` for the message and `description` for the next step.

## Offer an action

Put a Button in children if the person can create content or retry a request.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `title` | `string` | The heading. |
| `description` | `ReactNode` | Optional explanation. |
| `symbol` | `SymbolName` | Optional system symbol; defaults to tray. |
| `icon` | `ReactNode` | Optional custom icon, taking precedence over symbol. |
| `children` | `ReactNode` | Optional actions. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
