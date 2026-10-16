# Using glass

Glass, drawn by Lumen behind controls and other content. It bends and tints whatever is underneath as the page moves.

```tsx
import { Glass, GlassEffect, GlassEffectContainer, Button, LabeledContent } from '@satinhq/kit'
```

## Example

Click Add Stop inside the glass effect.

<!-- example: using-glass open -->

```tsx
import { useState } from 'react'
import {
  Button,
  Glass,
  GlassEffect,
  GlassEffectContainer,
  LabeledContent,
  List,
  Screen,
  Section,
} from '@satinhq/kit'

function Example() {
  const [count, setCount] = useState(0)

  return (
    <Screen>
      <List id="glass">
        <Section>
          <GlassEffectContainer>
            <GlassEffect glass={Glass.regular.interactive()} shape="capsule">
              <Button onPress={() => setCount(count + 1)}>Add Stop</Button>
            </GlassEffect>
          </GlassEffectContainer>
          <LabeledContent label="Stops" value={count} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Choose the material

Use Glass.regular or Glass.clear. The value supports `.interactive()` and `.tintRGBA([r, g, b, a])` with normalized channels between 0 and 1.

## Group effects

Put related GlassEffect views in a GlassEffectContainer. Give effects a `glassEffectID` and `in={namespace}` from `useNamespace()` when they need shared transition identity. `id` remains the DOM id.

`glassEffectID` requires a `NamespaceID` passed through `in`. Give related effects the
same namespace and distinct identities. Retain each identity across renders;
use the same identity at two alternate locations only when they represent the
same effect. Omitting the namespace when supplying an identity is rejected.
An effect without shared identity, like the example above, needs neither prop.

<!-- compile -->

```tsx
import { GlassEffect, GlassEffectContainer, Text, useNamespace } from '@satinhq/kit'

export function JourneyControls() {
  const namespace = useNamespace()
  return (
    <GlassEffectContainer>
      <GlassEffect glassEffectID="departure" in={namespace}>
        <Text padding>Departure</Text>
      </GlassEffect>
      <GlassEffect glassEffectID="arrival" in={namespace}>
        <Text padding>Arrival</Text>
      </GlassEffect>
    </GlassEffectContainer>
  )
}
```

Glass, matched geometry and navigation transitions use the same `NamespaceID`
values returned by `useNamespace` or `defineNamespace`.

## Provide readable pixels

Cross-origin frames, images without CORS and DRM video cannot supply pixels to glass. Read [Known limitations](limitations.md) before overlapping those sources.


## API

| Prop | Type | Description |
| --- | --- | --- |
| `glass` | `Glass` | Regular by default. |
| `shape` | `GlassShape` | Capsule by default. |
| `glassEffectID` | `string` | Morph identity, separate from DOM id. |
| `glassEffectTransition` | `matchedGeometry \| identity` | `glassEffectTransition` | An optional transition policy. |
| `in` | `NamespaceID` | The shared identity namespace. |
| `glassEffectUnion` | `string` | An optional union group. |
| `spacing` | `number` | Grouping spacing on the container. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
