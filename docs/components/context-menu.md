# Context menu and swipe actions

Commands attached to a row through a context menu or an edge swipe.

```tsx
import { ListRow, Label, LabeledContent } from '@satinhq/kit'
```

## Example

Try holding or swiping the Persuasion row on a device.

<!-- example: context-menu open -->

```tsx
import { useState } from 'react'
import { Label, LabeledContent, List, ListRow, Screen, Section } from '@satinhq/kit'

function Example() {
  const [favorite, setFavorite] = useState(false)

  return (
    <Screen>
      <List id="example">
        <Section>
          <ListRow
            contextMenu={[
              {
                id: 'favorite',
                label: 'Favorite',
                onPress: () => setFavorite(true),
              },
            ]}
            swipeActions={{
              actions: [
                {
                  id: 'remove',
                  label: 'Remove',
                  role: 'destructive',
                  onPress: () => setFavorite(false),
                },
              ],
            }}
          >
            <Label symbol="book">Persuasion</Label>
          </ListRow>
          <LabeledContent label="Favorite" value={favorite ? 'Yes' : 'No'} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Attach a context menu

Pass an array of Action values to `contextMenu` on a supported row. Each action has an id, label and optional press handler.

## Declare edge actions

Pass `swipeActions` with an `actions` array. Use `edge` to select leading or trailing and `allowsFullSwipe` to control committing the first action. Try it on a device.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `contextMenu` | `readonly Action[]` | Commands for a held row. |
| `swipeActions` | `SwipeActions` | Edge action configuration. |
| `edge` | `'leading' \| `edge` | The swipe edge, trailing by default. |
| `allowsFullSwipe` | `boolean` | Whether a full swipe commits. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
