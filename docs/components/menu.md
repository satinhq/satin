# Menu

A button that opens a list of commands.

```tsx
import { Menu, LabeledContent } from '@satinhq/kit'
```

## Example

Click Sort Books, then Author to change the sort order.

<!-- example: menu open -->

```tsx
import { useState } from 'react'
import { LabeledContent, List, Menu, Screen, Section } from '@satinhq/kit'

function Example() {
  const [sort, setSort] = useState('Title')

  return (
    <Screen>
      <List id="example">
        <Section>
          <Menu
            label="Sort Books"
            actions={[
              {
                id: 'title',
                label: 'Title',
                checked: sort === 'Title',
                onPress: () => setSort('Title'),
              },
              {
                id: 'author',
                label: 'Author',
                checked: sort === 'Author',
                onPress: () => setSort('Author'),
              },
            ]}
          />
          <LabeledContent label="Sorted by" value={sort} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Declare commands

Each action needs a stable `id` and a `label`. Add `onPress` to run it.

## Show the current choice

Set `checked` on selection actions. Use `role="destructive"` for destructive commands and set `disabled` on an action to prevent choosing it.

`Menu` does not currently accept a top-level `disabled` prop. See [Known issues](../known-issues.md#working-on).

## Group commands

An action can contain a `section` or a `submenu` of actions. Keep each command tied to the current content.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `ReactNode` | The trigger content. |
| `actions` | `readonly Action[]` | Commands, groups and submenus. |
| `trigger` | `(props: MenuTriggerProps) => ReactNode` | Optional custom trigger. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
