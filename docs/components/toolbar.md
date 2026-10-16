# Toolbar

Actions placed in the navigation bar or bottom bar.

```tsx
import { ToolbarItem, ToolbarItemGroup, ToolbarSpacer, Button, LabeledContent } from '@satinhq/kit'
```

## Example

Click Add Stop in the bottom bar, then Reset.

<!-- example: toolbar open -->

```tsx
import { useState } from 'react'
import {
  Button,
  LabeledContent,
  List,
  Screen,
  Section,
  ToolbarItem,
  ToolbarItemGroup,
  ToolbarSpacer,
} from '@satinhq/kit'

function Example() {
  const [stops, setStops] = useState(0)

  return (
    <Screen
      toolbar={
        <>
          <ToolbarItem placement="topBarTrailing">
            <Button
              symbol="plus"
              iconOnly
              aria-label="Add Stop"
              onPress={() => setStops(stops + 1)}
            />
          </ToolbarItem>
          <ToolbarItemGroup placement="bottomBar">
            <Button onPress={() => setStops(0)}>Reset</Button>
            <ToolbarSpacer />
            <Button onPress={() => setStops(stops + 1)}>Add Stop</Button>
          </ToolbarItemGroup>
        </>
      }
    >
      <List id="trip">
        <Section>
          <LabeledContent label="Stops" value={stops} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Place an action

Pass toolbar content through `Screen.toolbar`. Use ToolbarItem with `topBarTrailing`, `topBarLeading` or `bottomBar`. Its Button receives the contextual toolbar style.

## Group related actions

ToolbarItemGroup puts its children in the same placement. ToolbarSpacer separates groups with fixed or flexible spacing.

## Include search

Use `DefaultToolbarItem kind="search"` with a screen searchable configuration to share the bottom bar with search.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `placement` | `ToolbarItemProps[placement]` | Where actions appear. |
| `children` | `ReactNode` | Buttons and other controls. |
| `sizing` | `'fixed' \| `ToolbarSpacer` | Spacing behavior on ToolbarSpacer. |
| `kind` | `'search'` | The search item supplied by the framework. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
