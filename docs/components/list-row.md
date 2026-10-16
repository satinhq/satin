# ListRow

A row wrapper for content that needs row options.

```tsx
import { ListRow, Label } from '@satinhq/kit'
```

## Example

Read the example, then change its values in the code.

<!-- example: list-row open -->

```tsx
import { Label, List, ListRow, Screen, Section } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <List id="example">
        <Section>
          <ListRow listRowSeparator="hidden">
            <Label symbol="book">Reading this week</Label>
          </ListRow>
        </Section>
      </List>
    </Screen>
  )
}
```

## Control the separator

Use `listRowSeparator="hidden"` for this row. Other rows keep their separator.

## Set row options

`listRowInsets` accepts a number or top, leading, bottom and trailing values. Omit it to use the default row layout.

## Content width

A custom stack containing text can stay at its intrinsic width. Give the stack an explicit fill frame with `frame={{ maxWidth: 'infinity' }}` when it should fill the row. See [Known issues](../known-issues.md#working-on).

Stock intrinsic controls and media keep their own dimensions. A Button label can request the full width with `frame={{ maxWidth: 'infinity' }}`.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `children` | `ReactNode` | Row content. |
| `listRowSeparator` | `'visible' \| `listRowSeparator(_:)` | Separator visibility. |
| `listRowInsets` | `number \| `listRowInsets(_:)` | Optional content insets. |
| `contextMenu` | `readonly Action[]` | Commands shown on a held row. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
