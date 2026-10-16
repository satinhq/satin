# LabeledContent

A label and its value on the same row.

```tsx
import { LabeledContent } from '@satinhq/kit'
```

## Example

Read the example, then change its values in the code.

<!-- example: labeled-content open -->

```tsx
import { LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <List id="example">
        <Section>
          <LabeledContent label="Author" value="Jane Austen" />
          <LabeledContent label="Published" value="1817" />
        </Section>
      </List>
    </Screen>
  )
}
```

## Show a value

Pass the row title to `label` and its current value to `value`.

## Place it in a list

A List or Form supplies the row spacing and separators. LabeledContent also accepts React nodes for its label and value.

## Good to know

- The example displays Author and Published as leading labels, with Jane Austen and 1817 as their trailing values.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `ReactNode` | The leading label. |
| `value` | `ReactNode` | The trailing value. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
