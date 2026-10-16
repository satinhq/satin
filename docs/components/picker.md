# Picker

A control for choosing one option.

```tsx
import { Picker } from '@satinhq/kit'
```

## Example

Click Sort and choose Author.

<!-- example: picker open -->

```tsx
import { useState } from 'react'
import { List, Picker, Screen, Section } from '@satinhq/kit'

function Example() {
  const [sort, setSort] = useState('title')

  return (
    <Screen>
      <List id="example">
        <Section>
          <Picker
            label="Sort"
            selection={sort}
            onSelectionChange={setSort}
            options={[
              { id: 'title', label: 'Title' },
              { id: 'author', label: 'Author' },
            ]}
          />
        </Section>
      </List>
    </Screen>
  )
}
```

## Bind the selection

Each option has a stable `id` and `label`. Store an option id in `selection` and update it in `onSelectionChange`.

## Choose a picker style

`pickerStyle` accepts `menu`, `navigationLink`, `segmented` or `inline`. Omit it for the contextual default.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `string` | The setting name. |
| `options` | `readonly Choice[]` | The available choices. |
| `selection` | `string` | The selected option id. |
| `onSelectionChange` | `(id: string) => void` | Receives the selected id. |
| `pickerStyle` | `PickerStyle` | Optional presentation style. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
