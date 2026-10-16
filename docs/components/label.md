# Label

Text with a symbol or another icon beside it.

```tsx
import { Label } from '@satinhq/kit'
```

## Example

Read the example, then change its values in the code.

<!-- example: label open -->

```tsx
import { Label, List, Screen, Section } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <List id="example">
        <Section>
          <Label symbol="book">Books</Label>
          <Label symbol="star">Favorites</Label>
        </Section>
      </List>
    </Screen>
  )
}
```

## Choose a symbol

Use `symbol` with a name from the symbol catalog. See [SymbolImage](symbol.md).

## Supply another icon

Use `icon` for a React node when the icon is not a catalog symbol. Put the title in children.

## Good to know

- The example displays Books with a book symbol and Favorites with a star symbol, each beside its text.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `children` | `ReactNode` | The text. |
| `symbol` | `SymbolName` | Optional catalog symbol. |
| `icon` | `ReactNode` | Optional custom icon. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
