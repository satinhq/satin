# Zoomable and Selectable

Content roles for a zoomable region or selectable text.

```tsx
import { Selectable, Zoomable, Image } from '@satinhq/kit'
```

## Example

Select the meeting point text. Try pinching the image on a device.

<!-- example: zoomable open -->

```tsx
import { Image, List, Screen, Section, Selectable, Zoomable } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <List id="content">
        <Section>
          <Selectable>
            <p>Meeting point: Kyoto Station, north entrance.</p>
          </Selectable>
          <Zoomable aria-label="Preview icon">
            <Image src="/preview/icon.svg" alt="Satin preview icon" width={180} height={180} />
          </Zoomable>
        </Section>
      </List>
    </Screen>
  )
}
```

## Allow text selection

Wrap readable text in Selectable. Text inputs own their editing behavior separately.

## Own a zoom region

Zoomable owns pinch zoom for its children. `maxScale` bounds the scale, and `onScaleChange` reports it. Try touch gestures in the installed app.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `children` | `ReactNode` | The owned content. |
| `maxScale` | `number` | Maximum zoom scale. |
| `onScaleChange` | `(scale: number) => void` | Receives scale changes. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
