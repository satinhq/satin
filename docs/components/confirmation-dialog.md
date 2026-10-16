# ConfirmationDialog

A set of choices presented for the current task.

```tsx
import { Button, LabeledContent, ConfirmationDialog } from '@satinhq/kit'
```

## Example

Click Remove Download, then Remove to confirm.

<!-- example: confirmation-dialog open -->

```tsx
import { useState } from 'react'
import { Button, ConfirmationDialog, LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  const [shown, setShown] = useState(false)
  const [removed, setRemoved] = useState(false)

  return (
    <Screen>
      <List id="presentation">
        <Section>
          <Button onPress={() => setShown(true)}>Remove Download</Button>
          <LabeledContent label="Downloaded" value={removed ? 'No' : 'Yes'} />
        </Section>
      </List>
      <ConfirmationDialog
        title="Remove download?"
        isPresented={shown}
        onPresentedChange={setShown}
        actions={[
          {
            id: 'remove',
            label: 'Remove',
            role: 'destructive',
            onPress: () => setRemoved(true),
          },
          { id: 'cancel', label: 'Cancel', role: 'cancel' },
        ]}
      />
    </Screen>
  )
}
```

## Bind presentation state

Keep `isPresented` in React state and pass its setter to `onPresentedChange`. The presentation updates the binding when it closes.

## Finish the task

Use a Done button inside a cover. For an alert or dialog, supply actions with labels and optional roles. Presentation state starts closed after an app relaunch.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `isPresented` | `boolean` | Whether it is open. |
| `onPresentedChange` | `(presented: boolean) => void` | Receives dismissal changes. |
| `title` | `string` | The accessible title. |
| `actions` | `readonly ActionItem[]` | Available commands. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
