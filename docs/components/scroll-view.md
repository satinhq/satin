# ScrollView

A named scroll region for content that is not a list.

```tsx
import { ScrollView, ScrollTarget } from '@satinhq/kit'
```

## Example

Click Go to chapter in the toolbar to move to the declared target.

<!-- example: scroll-view open -->

```tsx
import { useRef } from 'react'
import {
  Button,
  ContentMargins,
  Screen,
  ScrollView,
  ScrollTarget,
  ToolbarItem,
  type ScrollViewHandle,
} from '@satinhq/kit'

const stops = [
  'Tokyo',
  'Shinagawa',
  'Shin-Yokohama',
  'Odawara',
  'Atami',
  'Mishima',
  'Shin-Fuji',
  'Shizuoka',
  'Kakegawa',
  'Hamamatsu',
  'Toyohashi',
  'Mikawa-Anjo',
  'Nagoya',
  'Gifu-Hashima',
  'Maibara',
]

function Example() {
  const scroll = useRef<ScrollViewHandle>(null)
  return (
    <Screen
      toolbar={
        <ToolbarItem placement="topBarTrailing">
          <Button onPress={() => scroll.current?.scrollTo('chapter', 'top')}>Go to chapter</Button>
        </ToolbarItem>
      }
    >
      <ContentMargins edges="horizontal" length={16}>
        <ScrollView id="reading" ref={scroll}>
          <h2>Before Kyoto</h2>
          {stops.map(stop => (
            <p key={stop}>{stop}</p>
          ))}
          <ScrollTarget id="chapter">
            <h2>Chapter one</h2>
            <p>The train leaves Kyoto at nine. Keep this note with your tickets.</p>
          </ScrollTarget>
          <p>The return journey leaves Osaka after lunch.</p>
        </ScrollView>
      </ContentMargins>
    </Screen>
  )
}
```

## Name the scroll region

Use a stable `id` for the ScrollView. Its position belongs to the current screen.

## Declare a target

Wrap normal-flow content in ScrollTarget with a stable `id`. A vertical ScrollView with a ref enables its handle without another positioning prop. You can also use a scrollPosition binding or observe VerticalScrollGeometry.

## Choose the axis

ScrollView scrolls vertically by default. Use `axis="horizontal"` for horizontal content. Target positioning, anchors, geometry callbacks and refresh are vertical-only.

## Center narrow content

For a narrow vertical stack, use an explicit full-width frame and center the
stack within it. Stack alignment arranges the stack's children; it does not
make the stack fill the scroll region.

<!-- compile -->

```tsx
import { ScrollView, Text, VStack } from '@satinhq/kit'

export function TimerSummary() {
  return (
    <ScrollView id="timer-summary">
      <VStack
        alignment="center"
        spacing={12}
        padding
        frame={{ maxWidth: 'infinity', alignment: 'center' }}
      >
        <Text font="title">24:00</Text>
        <Text foregroundStyle="secondary">Focus time</Text>
      </VStack>
    </ScrollView>
  )
}
```

The frame fills the available width and centers the narrow stack. For a
leading-aligned composition, set both frame and stack alignment to `leading`.
Use explicit width and alignment on nested timer or metric groups too; filling
the outer frame does not set text alignment inside those groups.

## Message appends

`defaultScrollAnchor="bottom"` supports insertion motion for a thread that stays
pinned to the bottom. This does not provide replacement or keyed `List` reorder
motion. See [Messaging scroll](../messaging-scroll.md) for the growing-composer
recipe, stable message identities and remaining motion limitations.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `id` | `string` | A stable region name. |
| `axis` | `'vertical' \| `Axis.Set` | The scroll axis. |
| `children` | `ReactNode` | Scrollable content. |
| `scrollPosition` | `ScrollPositionBinding` | Optional controlled target position. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
