# Section

A group of rows with an optional heading and footer.

```tsx
import { Section } from '@satinhq/kit'
```

## Example

Read the example, then change its values in the code.

<!-- example: section open -->

```tsx
import { LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <List id="account">
        <Section header="Account" footer="Only you can change these details.">
          <LabeledContent label="Name" value="Alex Chen" />
          <LabeledContent label="Membership" value="Library member" />
        </Section>
      </List>
    </Screen>
  )
}
```

## Name the group

Pass plain text or a React node to `header`. The surrounding List or Form supplies its placement.

## Explain the setting

Put a short explanation in `footer`. It appears below the last row.

## Good to know

- The example places Account above the two rows and the explanatory footer below them.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `header` | `ReactNode` | Content above the rows. |
| `footer` | `ReactNode` | Content below the rows. |
| `children` | `ReactNode` | Rows in this group. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
