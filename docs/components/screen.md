# Screen

The title and toolbar configuration for the current screen.

```tsx
import { Screen } from '@satinhq/kit'
```

## Example

Read the example, then change its values in the code.

<!-- example: screen open -->

```tsx
import { LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  return (
    <Screen title="Trip" subtitle="April">
      <List id="example">
        <Section>
          <LabeledContent label="Destination" value="Kyoto" />
        </Section>
      </List>
    </Screen>
  )
}
```

## Set the title

Use `title` to override the route title. `subtitle` appears under it.

## Choose title display

Use `titleDisplay` for `large`, `inline`, `inlineLarge` or `none`. The route can set the initial value before the screen renders.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `title` | `string` | Overrides the route title. |
| `subtitle` | `string` | Optional subtitle. |
| `titleDisplay` | `TitleDisplayMode` | Title presentation. |
| `searchable` | `Searchable` | Optional screen search. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
