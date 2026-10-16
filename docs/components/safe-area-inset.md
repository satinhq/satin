# SafeAreaInset

An accessory that reserves space at a safe edge of its content.

```tsx
import { SafeAreaInset, Button, LabeledContent } from '@satinhq/kit'
```

## Example

Click Save in the bottom accessory.

<!-- example: safe-area-inset open -->

```tsx
import { useState } from 'react'
import {
  Button,
  Glass,
  GlassEffect,
  LabeledContent,
  List,
  SafeAreaInset,
  Screen,
  Section,
} from '@satinhq/kit'

function Example() {
  const [saved, setSaved] = useState(false)

  return (
    <Screen>
      <SafeAreaInset
        edge="bottom"
        content={
          <GlassEffect glass={Glass.regular} style={{ margin: '8px 16px', padding: '12px 16px' }}>
            <Button onPress={() => setSaved(true)}>Save</Button>
          </GlassEffect>
        }
      >
        <List id="draft">
          <Section>
            <LabeledContent label="Draft" value={saved ? 'Saved' : 'Not saved'} />
          </Section>
        </List>
      </SafeAreaInset>
    </Screen>
  )
}
```

## Reserve an edge

Wrap the main content in SafeAreaInset. Pass the accessory to `content` and choose `top` or `bottom`.

## Adjust safe-area layout

Use SafeAreaPadding, ContentMargins, SafeAreaBar or IgnoresSafeArea to control content placement. Components consume framework geometry; they do not need viewport-height or raw safe-area CSS.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `edge` | `'top' \| `VerticalEdge` | The accessory edge. |
| `content` | `ReactNode` | The accessory. |
| `children` | `ReactNode` | The content whose safe area changes. |
| `spacing` | `number` | Optional gap between accessory and content. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
