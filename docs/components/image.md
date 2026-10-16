# Image and AsyncImage

An image loaded from an asset or URL.

```tsx
import { Image, AsyncImage } from '@satinhq/kit'
```

## Example

Read the example, then change its values in the code.

<!-- example: image open -->

```tsx
import { AsyncImage, Image, List, Screen, Section } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <List id="example">
        <Section>
          <Image src="/preview/icon.svg" alt="Satin preview icon" width={120} height={120} />
          <AsyncImage
            src="/preview/icon.svg"
            alt="The same icon loaded by URL"
            width={120}
            height={120}
          />
        </Section>
      </List>
    </Screen>
  )
}
```

## Load a local image

Use Image with a bundled asset or same-origin URL. Supply `alt` to describe meaningful content.

## Load a remote image

AsyncImage loads a URL and can render loading, success and failure phases. For an image under glass, the server must permit CORS pixel access. See [Glass limitations](../glass/limitations.md).

## Size the image box

`contentMode="fit"` contains the whole image inside its box. `"fill"` crops to
cover that box. Neither mode allocates the box for you. Set both dimensions when
the layout needs a fixed box, or supply explicit CSS width and height for a
responsive one. `aspectRatio` describes the box's ratio, not the fitting mode.

### Bounded photo viewer

This photo panel has a definite height and uses the available content width.
`GeometryReader` measures that panel; both `Zoomable` and `Image` receive its
dimensions. The image stays centered inside the box regardless of its own ratio.
Replace the source and description with your photo.

<!-- compile -->

```tsx
import {
  Divider,
  GeometryReader,
  Image,
  Screen,
  Text,
  VStack,
  Zoomable,
  semanticColor,
} from '@satinhq/kit'

export function PhotoViewer() {
  return (
    <Screen title="Photo">
      <VStack
        alignment="leading"
        spacing={12}
        padding
        frame={{ maxWidth: 'infinity' }}
      >
        <GeometryReader style={{ height: 280, flex: 'none' }}>
          {({ size }) => (
            <Zoomable
              aria-label="Photo viewer"
              maxScale={4}
              style={{
                width: size.width,
                height: size.height,
                background: semanticColor('secondarySystemBackground'),
              }}
            >
              <Image
                src="/photos/harbor.jpg"
                alt="Sailboats moored in the harbor at sunset"
                contentMode="fit"
                width={size.width}
                height={size.height}
                style={{ display: 'block', width: size.width, height: size.height }}
              />
            </Zoomable>
          )}
        </GeometryReader>
        <Divider />
        <Text font="caption" foregroundStyle="secondary">Harbor at sunset</Text>
      </VStack>
    </Screen>
  )
}
```

The 280-point panel is an app layout choice. `padding` supplies the default
16-point content inset; `spacing` separates the panel, divider and caption.
The background, separator and caption colors follow appearance. `Zoomable` owns
pinch and pan inside the panel.

For a full-height composition, give the viewer a definite parent height.
`GeometryReader` measures the space its parent allocates. Inside a ScrollView,
set an explicit height on the scrolling axis. A photo viewer does not need an
extra scroller.

## Good to know

- The first example loads the same icon through Image and AsyncImage in separate 120-by-120 boxes. The photo viewer recipe sizes both the image and its Zoomable container to the 280-point panel.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `src` on Image | `string \| ImageAsset` | A bundled asset or same-origin source. |
| `src` on AsyncImage | `string` | A URL to load. |
| `alt` | `string` | A required description. |
| `width / height` | `number \| string` | Optional image dimensions. CSS width and height can size the displayed box. |
| `contentMode` | `'fit' \| 'fill'` | Contain the whole image or crop to cover its box. Defaults to `fit`. |
| `aspectRatio` | `CSSProperties['aspectRatio']` | Optional CSS ratio for the image box. |
| `crossOrigin` | `'anonymous' \| 'use-credentials' \| ''` | CORS loading policy. Glass needs readable pixels. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
