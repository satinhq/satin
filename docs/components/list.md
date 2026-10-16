# List

A scrollable collection of rows.

```tsx
import { LabeledContent } from '@satinhq/kit'
```

## Example

Read the three books. Each title and author occupy one row.

<!-- example: list open -->

```tsx
import { LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <List id="example">
        <Section>
          <LabeledContent label="Middlemarch" value="George Eliot" />
          <LabeledContent label="Persuasion" value="Jane Austen" />
          <LabeledContent label="The Left Hand of Darkness" value="Ursula K. Le Guin" />
        </Section>
      </List>
    </Screen>
  )
}
```

## Group related rows

Put rows in a `Section`. Use `header` and `footer` for text that describes the group.

## Choose a list style

The default is `insetGrouped`. Set `listStyle` to `plain`, `grouped` or `sidebar` when the list needs a different row layout.

## Restore the scroll position

Give each list a stable `id`. Satin uses it to identify that scroll region when you return to a screen.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `id` | `string` | A stable name for scroll restoration. |
| `listStyle` | `ListStyle` | Inset grouped by default. |
| `selection` | `ID \| ReadonlySet<ID>` | `List(selection:)` | Optional controlled selection for ForEach rows. |
| `searchable` | `Searchable` | Search configuration owned by the list. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
