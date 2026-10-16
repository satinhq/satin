# Slider

A control for choosing a number along a track.

```tsx
import { Slider, LabeledContent } from '@satinhq/kit'
```

## Example

Drag the Volume thumb to change the value.

<!-- example: slider open -->

```tsx
import { useState } from 'react'
import { LabeledContent, List, Screen, Section, Slider } from '@satinhq/kit'

function Example() {
  const [volume, setVolume] = useState(40)

  return (
    <Screen>
      <List id="example">
        <Section>
          <Slider label="Volume" value={volume} onChange={setVolume} min={0} max={100} />
          <LabeledContent label="Volume" value={Math.round(volume)} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Set the range

Use `min` and `max` for the track bounds. The default range is 0 to 1.

## Snap to values

Set `step` to snap values to an increment. Use `onEditingChange` when you need to distinguish dragging from the settled value.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `label` | `string` | The accessible name. |
| `value` | `number` | The current number. |
| `onChange` | `(value: number) => void` | Receives changes. |
| `min / max` | `number` | Track limits. |
| `step` | `number` | Optional snapping increment. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
