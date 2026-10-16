# SymbolImage

An icon from the Satin symbol catalog.

```tsx
import { SymbolImage, Label } from '@satinhq/kit'
```

## Example

Read the example, then change its values in the code.

<!-- example: symbol open -->

```tsx
import { Label, List, Screen, Section, SymbolImage } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <List id="example">
        <Section>
          <Label icon={<SymbolImage name="star.fill" />}>Favorites</Label>
          <Label icon={<SymbolImage name="book" />}>Library</Label>
        </Section>
      </List>
    </Screen>
  )
}
```

## Choose a name

The `name` prop is typed as SymbolName. See Available symbols at `node_modules/@satinhq/kit/dist/docs/symbols.md` for supported names.

## Name meaningful icons

Use `label` on an icon that conveys information by itself. A Label or an icon-only Button can supply the accessible name instead.

## Good to know

- The example displays the filled star beside Favorites and the book beside Library.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `name` | `SymbolName` | The catalog name. |
| `label` | `string` | An optional accessible name. |
| `weight` | `SymbolWeight` | The symbol weight. |
| `scale` | `SymbolScale` | The symbol scale. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
